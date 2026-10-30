import fs from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasourceUrl: "file:./e2e.db" });
const PASSWORD = "Pravah@Demo2026";
const sample = (f: string) => path.resolve(__dirname, "../../samples", f);

/** Institutions use the Institution login; AICTE staff use the official sign-in. */
async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto(email.startsWith("applicant.") ? "/institution/login" : "/login");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.includes("login")), page.click("button[type=submit]")]);
}

/**
 * Headless Chromium renders the frosted-glass backdrop blur in software, which keeps a CPU core
 * busy and starves the app server on small machines (uploads then take a minute instead of
 * seconds). The blur is purely visual, so the tests switch it off.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const css = "*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}";
    document.addEventListener("DOMContentLoaded", () => document.head.append(Object.assign(document.createElement("style"), { textContent: css })));
  });
});

async function appId(name: string) {
  return (await db.application.findFirstOrThrow({ where: { institutionName: { contains: name } } })).id;
}

/**
 * Click a button that opens a dialog and wait until the dialog is open. Retries the click if it
 * landed before the page finished hydrating (a click on server-rendered HTML does nothing yet).
 */
async function openDialog(page: Page, trigger: Locator): Promise<Locator> {
  const dialog = page.getByRole("dialog");
  await expect(async () => {
    if (!(await dialog.isVisible())) await trigger.click({ timeout: 5_000 });
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  return dialog;
}

async function expectToast(page: Page, text: string | RegExp, timeout = 90_000) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible({ timeout });
}

test.afterAll(async () => db.$disconnect());

test("rejects bad credentials and requires authentication", async ({ page, request }) => {
  await page.goto("/applications");
  await expect(page).toHaveURL(/\/login/);
  await page.fill("#email", "scrutiny@pravah.demo");
  await page.fill("#password", "wrong-password");
  await page.click("button[type=submit]");
  await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password" })).toBeVisible();
  const res = await request.get("/api/exports/applications");
  expect(res.status()).toBe(401);
});

test("keeps institutions and AICTE staff on separate sign-in portals", async ({ page }) => {
  // An institution account is refused on the AICTE sign-in…
  await page.goto("/login");
  await page.fill("#email", "applicant.meridian@pravah.demo");
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await expect(page.getByRole("alert").filter({ hasText: "Please use the Institution login" })).toBeVisible();
  // …and a staff account is refused on the Institution login.
  await page.goto("/institution/login");
  await page.fill("#email", "scrutiny@pravah.demo");
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await expect(page.getByRole("alert").filter({ hasText: "Please use the AICTE official sign-in" })).toBeVisible();
  // Visiting the portal while signed out leads to the Institution login.
  await page.goto("/portal/help");
  await expect(page).toHaveURL(/\/institution\/login/);
  // Officials cannot enter the portal.
  await signIn(page, "scrutiny@pravah.demo");
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/$/);
});

/**
 * Section tabs change only the query string. With route-level loading.tsx boundaries, the
 * production build dropped about half of these client navigations, so click every tab for real.
 */
test("section tabs navigate on click in both portals", async ({ page }) => {
  const sections = page.locator("nav[aria-label='Application sections'] a");
  // One click per tab, no retries: a dropped navigation must fail the test.
  const clickTab = async (label: string, url: RegExp) => {
    await sections.filter({ hasText: label }).first().click();
    await expect(page).toHaveURL(url, { timeout: 8_000 });
    await page.waitForLoadState("networkidle");
  };
  const hydrated = () => page.waitForFunction(() => {
    const a = document.querySelector("nav[aria-label='Application sections'] a");
    return !!a && Object.keys(a).some((k) => k.startsWith("__reactFiber"));
  });

  await signIn(page, "applicant.greenfield@pravah.demo");
  await page.goto(`/portal/applications/${await appId("Greenfield")}`);
  await hydrated();
  for (const [label, view] of [["Documents", "documents"], ["Check results", "results"], ["History", "history"], ["Overview", "overview"], ["Documents", "documents"]]) {
    await clickTab(label, new RegExp(`view=${view}$`));
  }
  await expect(page.getByText("Required documents")).toBeVisible();

  await signIn(page, "scrutiny@pravah.demo");
  await page.goto(`/applications/${await appId("Meridian")}`);
  await hydrated();
  for (const [label, tab] of [["Documents", "documents"], ["Validation", "validation"], ["Findings", "findings"], ["Issuer verification", "verification"], ["History", "history"], ["Overview", "overview"]]) {
    await clickTab(label, new RegExp(`tab=${tab}$`));
  }
});

test("enforces role permissions and cross-institution isolation on the server", async ({ page }) => {
  const sunrise = await appId("Sunrise");
  await signIn(page, "applicant.meridian@pravah.demo");
  await expect(page).toHaveURL(/\/portal$/);
  await page.goto("/portal/applications");
  await expect(page.getByText("Meridian Institute of Management").first()).toBeVisible();
  await expect(page.getByText("Sunrise Institute of Technology")).toHaveCount(0);
  await page.goto(`/portal/applications/${sunrise}`);
  await expect(page.getByText("Record not found")).toBeVisible();
  expect((await page.request.get(`/api/applications/${sunrise}/report`)).status()).toBe(404);
  expect((await page.request.get(`/api/exports/audit`)).status()).toBe(403);
  // Official pages send institution users back into their portal.
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/portal$/);
  await page.goto(`/applications/${sunrise}`);
  await expect(page).toHaveURL(new RegExp(`/portal/applications/${sunrise}$`));
  await expect(page.getByText("Record not found")).toBeVisible();
});

test("rejects a renamed non-PDF upload with a clear message", async ({ page }) => {
  await signIn(page, "applicant.greenfield@pravah.demo");
  await page.goto(`/portal/applications/${await appId("Greenfield")}?view=documents`);
  // Re-select the file until the hydrated form has registered it (the button enables). A selection
  // made before hydration is lost, and Chromium fires no change event for an identical file list,
  // so clear the input before each attempt.
  const input = page.getByTestId("upload-input").first();
  await expect(async () => {
    await input.setInputFiles([]);
    await input.setInputFiles(sample("invalid-renamed-file.pdf"));
    await expect(page.getByTestId("upload-submit").first()).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByTestId("upload-submit").first().click();
  await expect(page.getByRole("alert").filter({ hasText: "does not match its .pdf extension" })).toBeVisible();
});

test("full journey: findings → rectification → revalidation → verification → forward → recorded decision → audit", async ({ page }) => {
  const id = await appId("Meridian");

  // 1. Scrutiny officer reviews the expired-certificate finding and returns the application.
  await signIn(page, "scrutiny@pravah.demo");
  await page.goto(`/applications/${id}?tab=findings`);
  await expect(page.getByText("Validity does not cover the required date").first()).toBeVisible();
  await expect(page.getByText("page 1").first()).toBeVisible();
  await page.goto(`/applications/${id}?tab=rectification`);
  await page.fill("#rect-msg", "The fire NOC expires before the academic year starts. Upload a renewed NOC.");
  await page.getByRole("button", { name: "Return for rectification" }).click();
  await expectToast(page, "returned for rectification");
  await expect(page.getByText("Rectification required").first()).toBeVisible();

  // 2. In the Institution Portal, the institution replaces the NOC and submits the
  //    rectification (revalidation runs).
  await signIn(page, "applicant.meridian@pravah.demo");
  await expect(page.getByText("Correction requested").first()).toBeVisible();
  await page.goto(`/portal/applications/${id}`);
  await openDialog(page, page.getByRole("button", { name: "Upload replacement" }).first());
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("upload-input").setInputFiles(sample("meridian-fire-noc-renewed.pdf"));
  await dialog.locator("#replace-reason").fill("Renewed fire NOC issued in October 2026");
  await dialog.getByTestId("upload-submit").click();
  await expectToast(page, "Uploaded and processed"); // the dialog closes itself once the slot refreshes
  await page.keyboard.press("Escape");
  await openDialog(page, page.getByRole("button", { name: "Submit corrections and revalidate" }));
  await page.getByRole("dialog").locator("textarea").fill("Renewed NOC uploaded as requested.");
  await page.getByRole("dialog").getByRole("button", { name: "Submit corrections and revalidate" }).click();
  await expectToast(page, "Corrections submitted");
  await page.goto(`/portal/applications/${id}?view=results`);
  await expect(page.getByText("What changed since run #1")).toBeVisible();
  await expect(page.getByText("improved").first()).toBeVisible();
  await expect(page.getByTestId("app-status")).toHaveText("Automated checks passed");

  // 3. The scrutiny & verification officer verifies the new NOC against the (simulated) issuer.
  await signIn(page, "scrutiny@pravah.demo");
  await page.goto(`/applications/${id}?tab=verification`);
  await page.getByRole("button", { name: "Run issuer verification" }).click();
  await expectToast(page, "Verification attempted");
  await expect(page.getByText("SFBA/NOC/2026/7712").first()).toBeVisible();
  await expect(page.getByText("Simulated response from a demo source").first()).toBeVisible();

  // 4. Scrutiny officer forwards for authorised review.
  await signIn(page, "scrutiny@pravah.demo");
  await page.goto(`/applications/${id}`);
  await openDialog(page, page.getByRole("button", { name: "Forward for authorised review" }));
  await page.getByRole("dialog").locator("textarea").fill("All checks pass after rectification; NOC verified with simulated issuer.");
  await page.getByRole("dialog").getByRole("button", { name: "Forward for authorised review" }).click();
  await expectToast(page, "Forwarded for authorised review");

  // 5. Senior official records a human review outcome with reason and reference.
  await signIn(page, "senior@pravah.demo");
  await page.goto(`/applications/${id}`);
  await openDialog(page, page.getByRole("button", { name: "Record review outcome" }));
  const d = page.getByRole("dialog");
  await d.locator("select[name=outcome]").selectOption("SATISFACTORY_FOR_FURTHER_PROCESSING");
  await d.locator("textarea").fill("Scrutiny satisfactory on documentary evidence; forward for statutory processing.");
  await d.locator("input[name=reference]").fill("PRV/SO/2026/118");
  await d.getByRole("button", { name: "Record outcome" }).click();
  await expectToast(page, "Human review outcome recorded");
  await page.goto(`/applications/${id}?tab=review`);
  await expect(page.getByRole("heading", { name: "Recorded human review outcome" })).toBeVisible();
  await expect(page.getByText("Closed").first()).toBeVisible();

  // 6. The audit trail shows the chain of actions; the report downloads as a PDF.
  await page.goto(`/audit?applicationId=${id}`);
  for (const evt of ["HUMAN_DECISION_RECORDED", "FORWARDED_FOR_AUTHORIZED_REVIEW", "ISSUER_VERIFICATION_ATTEMPTED", "RECTIFICATION_SUBMITTED", "DOCUMENT_REPLACED", "RECTIFICATION_REQUESTED", "RULE_FAILED"]) {
    await expect(page.locator("table").getByText(evt, { exact: true }).first()).toBeVisible();
  }
  const report = await page.request.get(`/api/applications/${id}/report`);
  expect(report.status()).toBe(200);
  expect(report.headers()["content-type"]).toBe("application/pdf");
  expect((await report.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("upload to closing: an institution completes its draft and it is checked, verified, forwarded and decided", async ({ page }) => {
  const id = await appId("Greenfield");
  const status = async () => (await db.application.findUniqueOrThrow({ where: { id } })).status;
  expect(await status()).toBe("DRAFT");

  // 1. The institution uploads the two missing mandatory documents and runs the checks.
  await signIn(page, "applicant.greenfield@pravah.demo");
  for (const [slot, file] of [["Faculty strength statement", "greenfield-faculty-statement.pdf"], ["Built-up area / infrastructure evidence", "greenfield-built-up-area.pdf"]]) {
    await page.goto(`/portal/applications/${id}?view=documents`);
    await openDialog(page, page.locator("li").filter({ hasText: slot }).first().getByRole("button", { name: "Upload" }));
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("upload-input").setInputFiles(sample(file));
    await dialog.getByTestId("upload-submit").click();
    await expectToast(page, "Uploaded and processed"); // the dialog closes itself once the slot refreshes
  }
  await page.goto(`/portal/applications/${id}`);
  await page.getByRole("button", { name: "Run checks" }).click();
  await expect.poll(status, { timeout: 60_000 }).toBe("AUTO_PASSED");

  // 2. The officer sees exactly what blocks forwarding, runs issuer verification, then forwards.
  await signIn(page, "scrutiny@pravah.demo");
  await page.goto(`/applications/${id}`);
  await expect(page.getByText("Before this application can be forwarded")).toBeVisible();
  await expect(page.getByRole("button", { name: "Forward for authorised review" })).toBeDisabled();
  await page.getByRole("button", { name: "Run issuer verification" }).click();
  await expectToast(page, "Verification attempted");
  await page.goto(`/applications/${id}`);
  await expect(page.getByText("Ready to forward")).toBeVisible();
  await openDialog(page, page.getByRole("button", { name: "Forward for authorised review" }));
  await page.getByRole("dialog").locator("textarea").fill("All automated checks passed and every verifiable document was verified.");
  await page.getByRole("dialog").getByRole("button", { name: "Forward for authorised review" }).click();
  await expectToast(page, "Forwarded for authorised review");
  expect(await status()).toBe("READY_FOR_AUTHORIZED_REVIEW");

  // 3. The senior official records the outcome; the application closes and the institution sees it.
  await signIn(page, "senior@pravah.demo");
  await page.goto(`/applications/${id}`);
  await openDialog(page, page.getByRole("button", { name: "Record review outcome" }));
  const d = page.getByRole("dialog");
  await d.locator("select[name=outcome]").selectOption("SATISFACTORY_FOR_FURTHER_PROCESSING");
  await d.locator("textarea").fill("Documentary scrutiny satisfactory; proceed to statutory processing.");
  await d.locator("input[name=reference]").fill("PRV/SO/2026/201");
  await d.getByRole("button", { name: "Record outcome" }).click();
  await expectToast(page, "Human review outcome recorded");
  expect(await status()).toBe("CLOSED");
  await signIn(page, "applicant.greenfield@pravah.demo");
  await page.goto(`/portal/applications/${id}`);
  await expect(page.getByTestId("app-status")).toContainText(/closed|outcome/i);
});

test("issuer mismatch: resolving the finding is not enough; a manual confirmation unblocks forwarding", async ({ page }) => {
  const id = await appId("Northfield");
  const status = async () => (await db.application.findUniqueOrThrow({ where: { id } })).status;

  // 1. The officer resolves the open mismatch finding and revalidates.
  await signIn(page, "scrutiny@pravah.demo");
  await page.goto(`/applications/${id}?tab=findings`);
  await openDialog(page, page.getByRole("button", { name: "Resolve" }).first());
  await page.getByRole("dialog").locator("textarea").fill("Reviewed against the submitted certificate; to be confirmed with the registry.");
  await page.getByRole("dialog").getByRole("button", { name: "Resolve" }).click();
  await expectToast(page, /resolved|recorded/i);
  // Resolving already reconciles the status, so wait for a new completed run, not for a status.
  const runs = async () => db.validationRun.count({ where: { applicationId: id, status: "COMPLETED" } });
  const before = await runs();
  await page.goto(`/applications/${id}`);
  await page.getByRole("button", { name: "Run validation" }).first().click();
  await expect.poll(runs, { timeout: 60_000 }).toBeGreaterThan(before);
  expect(await status()).toBe("AUTO_PASSED");

  // 2. Forwarding stays blocked, and the page says why and where to fix it.
  await page.goto(`/applications/${id}`);
  await expect(page.getByText("Accreditation / Certification: issuer verification result is “Mismatch detected”")).toBeVisible();
  await expect(page.getByRole("button", { name: "Forward for authorised review" })).toBeDisabled();

  // 3. A manual confirmation with a reference clears it.
  await expect(page.getByRole("link", { name: "Open issuer verification" }).first()).toHaveAttribute("href", /tab=verification/);
  await page.goto(`/applications/${id}?tab=verification`);
  const acc = page.locator("div").filter({ has: page.getByRole("heading", { name: /^Accreditation \/ Certification/ }) }).filter({ has: page.getByRole("button", { name: "Manual confirmation" }) }).last();
  await openDialog(page, acc.getByRole("button", { name: "Manual confirmation" }));
  const m = page.getByRole("dialog");
  await m.locator("select").selectOption("VERIFIED");
  await m.locator("input[name=reference]").fill("DNAR/EMAIL/2026/77");
  await m.locator("textarea").fill("Confirmed with the accreditation registry by official email.");
  await m.getByRole("button").filter({ hasText: /record|confirm|save|submit/i }).last().click();
  await expectToast(page, /manual/i);

  // 4. Now it forwards and closes.
  await page.goto(`/applications/${id}`);
  await expect(page.getByText("Ready to forward")).toBeVisible();
  await openDialog(page, page.getByRole("button", { name: "Forward for authorised review" }));
  await page.getByRole("dialog").locator("textarea").fill("Mismatch reviewed and accreditation confirmed manually with the registry.");
  await page.getByRole("dialog").getByRole("button", { name: "Forward for authorised review" }).click();
  await expectToast(page, "Forwarded for authorised review");
  await signIn(page, "senior@pravah.demo");
  await page.goto(`/applications/${id}`);
  await openDialog(page, page.getByRole("button", { name: "Record review outcome" }));
  const d = page.getByRole("dialog");
  await d.locator("select[name=outcome]").selectOption("SATISFACTORY_FOR_FURTHER_PROCESSING");
  await d.locator("textarea").fill("Satisfactory on documentary evidence after manual confirmation of accreditation.");
  await d.locator("input[name=reference]").fill("PRV/SO/2026/202");
  await d.getByRole("button", { name: "Record outcome" }).click();
  await expectToast(page, "Human review outcome recorded");
  expect(await status()).toBe("CLOSED");
});

test("local AI suggests fields from a prose certificate; rules wait for an officer to confirm them", async ({ page }) => {
  test.skip(!fs.existsSync(path.resolve(__dirname, "../../models/bert-squad/bertsquad-12-int8.onnx")), "Local AI model not installed (run npm run ai:setup)");
  // Loads the ONNX model and compiles several pages on a cold dev server: allow extra time.
  test.setTimeout(300_000);
  // 1. The institution starts a new application and uploads a certificate written as prose
  //    (no "Label: value" lines).
  await signIn(page, "applicant.greenfield@pravah.demo");
  await page.goto("/portal/applications/new");
  await Promise.all([page.waitForURL(/\/portal\/applications\/(?!new)[^/?]+/), page.getByRole("button", { name: "Create application" }).click()]);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await page.goto(`/portal/applications/${id}?view=documents`);
  await openDialog(page, page.locator("li").filter({ hasText: "Fire & building safety NOC" }).first().getByRole("button", { name: "Upload" }));
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("upload-input").setInputFiles(sample("ai-demo-noc-prose.pdf"));
  await dialog.getByTestId("upload-submit").click();
  await expectToast(page, "Uploaded and processed", 120_000);
  const noc = await db.document.findFirstOrThrow({ where: { applicationId: id, categoryCode: "NOC_PERMISSION", state: "ACTIVE" } });
  const validityResult = async () => {
    const run = await db.validationRun.findFirstOrThrow({ where: { applicationId: id }, orderBy: { runNumber: "desc" }, include: { results: true } });
    return run.results.find((r) => r.ruleCode === "DATE-VAL-001" && r.documentId === noc.id)!;
  };
  const latestRun = async () => (await db.validationRun.findFirst({ where: { applicationId: id, status: "COMPLETED" }, orderBy: { runNumber: "desc" } }))?.runNumber ?? 0;
  const runValidation = async () => {
    const before = await latestRun();
    await page.goto(`/applications/${id}`);
    await page.getByRole("button", { name: "Run validation" }).first().click();
    await expect.poll(latestRun, { timeout: 60_000 }).toBeGreaterThan(before);
  };

  // 2. The officer sees the AI suggestions; validation routes them to review instead of deciding.
  await signIn(page, "scrutiny@pravah.demo");
  await page.goto(`/documents/${noc.id}`);
  const expiry = page.locator("li").filter({ has: page.getByRole("button", { name: "Confirm AI suggestion" }) }).filter({ hasText: "Expiry date" }).first();
  await expect(expiry).toContainText("2 March 2029");
  await expect(expiry.getByText("AI suggestion · needs your confirmation")).toBeVisible();
  await runValidation();
  expect((await validityResult()).status).toBe("REVIEW_REQUIRED");
  expect((await validityResult()).explanation).toContain("suggested by the local AI model");

  // 3. After the officer confirms the value, the rule decides on it.
  await page.goto(`/documents/${noc.id}`);
  await openDialog(page, expiry.getByRole("button", { name: "Confirm AI suggestion" }));
  await page.getByRole("dialog").getByRole("button", { name: "Confirm AI suggestion" }).click();
  await expectToast(page, "AI suggestion confirmed");
  await runValidation();
  const after = await validityResult();
  expect(after.status).toBe("PASS");
  expect(after.explanation).toContain("Valid until 02 Mar 2029");
  const audit = await db.auditEvent.findFirst({ where: { applicationId: id, action: "Confirmed AI suggestion for Expiry date" } });
  expect(audit).not.toBeNull();
});

test("approval workflow monitoring: Bureau schedules an EVC, the convenor reports, and the institution renews a lease deed online", async ({ page }) => {
  const godavari = await appId("Godavari");
  const today = new Date().toISOString().slice(0, 10);

  // 1. The Approval Bureau sees pendency across Regions and schedules a visit from the EVC queue.
  await signIn(page, "bureau@pravah.demo");
  await expect(page.getByText("Region × stage pendency")).toBeVisible();
  await page.goto("/pendency");
  await expect(page.getByText("Overdue at their stage")).toBeVisible();
  await expect(page.getByText("Brahmaputra College of Engineering").first()).toBeVisible();
  await page.goto("/evc");
  const row = page.locator("tr").filter({ hasText: "Konkan Institute of Technology" }).first();
  const dialog = await openDialog(page, row.getByRole("button", { name: "Schedule visit" }));
  await dialog.locator("input[name=visitDate]").fill(today);
  const convenor = await db.user.findUniqueOrThrow({ where: { email: "committee@pravah.demo" } });
  await dialog.locator("select[name=convenorId]").selectOption(convenor.id);
  await dialog.getByRole("button", { name: "Schedule visit" }).click();
  await expectToast(page, "Expert visit scheduled");

  // 2. The escalation for the late scheduling is visible and can be acknowledged.
  await page.goto("/alerts");
  await expect(page.getByText(/Escalated.*PRV-2027/).first()).toBeVisible();

  // 3. The EVC convenor submits the report for a visit already held; the application moves on by itself.
  await signIn(page, "committee@pravah.demo");
  await expect(page.getByRole("heading", { name: "My expert visits" })).toBeVisible();
  await page.goto(`/applications/${godavari}?tab=workflow`);
  const report = await openDialog(page, page.getByRole("button", { name: "Submit report" }));
  await report.locator("select[name=recommendation]").selectOption("SATISFACTORY");
  await report.locator("textarea[name=summary]").fill("Infrastructure, laboratories and faculty records verified against the application.");
  await report.locator("input[name=reference]").fill("EVC/E2E/2026/1");
  await report.getByRole("button", { name: "Submit report" }).click();
  await expectToast(page, "EVC report submitted");
  await expect.poll(async () => (await db.application.findUniqueOrThrow({ where: { id: godavari } })).currentStage).toBe("DECISION");

  // 4. The institution sees its compliance deadline and uploads the renewed lease deed.
  await signIn(page, "applicant.greenfield@pravah.demo");
  await expect(page.getByText("Document renewal due").first()).toBeVisible();
  await page.goto("/portal/compliance");
  await page.getByRole("link", { name: /Lease deed — campus land/ }).first().click();
  await expect(page.getByRole("heading", { name: "Submit the renewed document" })).toBeVisible();
  const input = page.locator("#evidence-file");
  await expect(async () => {
    await input.setInputFiles([]);
    await input.setInputFiles(sample("meridian-fire-noc-renewed.pdf"));
    await expect(page.getByText("meridian-fire-noc-renewed.pdf")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await page.fill("#evidence-valid", "2056-12-31");
  await page.fill("#evidence-note", "Lease extended by 30 years; registered deed attached.");
  await page.getByRole("button", { name: "Submit for verification" }).click();
  await expectToast(page, "Evidence submitted");
  const item = await db.complianceItem.findFirstOrThrow({ where: { typeCode: "LEASE_DEED", institution: { name: { contains: "Greenfield" } } } });
  await expect.poll(async () => (await db.complianceItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("SUBMITTED");

  // 5. The Bureau verifies it; the register moves to the new validity date.
  await signIn(page, "bureau@pravah.demo");
  await page.goto(`/compliance-monitor/${item.id}`);
  const verify = await openDialog(page, page.getByRole("button", { name: "Verify" }));
  await verify.locator("textarea").fill("Registered deed checked against the sub-registrar record.");
  await verify.getByRole("button", { name: "Verify" }).click();
  await expectToast(page, "Evidence verified");
  const after = await db.complianceItem.findUniqueOrThrow({ where: { id: item.id } });
  expect([after.status, after.dueDate.toISOString().slice(0, 10)]).toEqual(["OPEN", "2056-12-31"]);
});
