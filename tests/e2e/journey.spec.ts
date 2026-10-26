import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasourceUrl: "file:./e2e.db" });
const PASSWORD = "Aegis@Demo2026";
const sample = (f: string) => path.resolve(__dirname, "../../samples", f);

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
}

async function appId(name: string) {
  return (await db.application.findFirstOrThrow({ where: { institutionName: { contains: name } } })).id;
}

async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible({ timeout: 90_000 });
}

test.afterAll(async () => db.$disconnect());

test("rejects bad credentials and requires authentication", async ({ page, request }) => {
  await page.goto("/applications");
  await expect(page).toHaveURL(/\/login/);
  await page.fill("#email", "scrutiny@aegis.demo");
  await page.fill("#password", "wrong-password");
  await page.click("button[type=submit]");
  await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password" })).toBeVisible();
  const res = await request.get("/api/exports/applications");
  expect(res.status()).toBe(401);
});

test("enforces role permissions and cross-institution isolation on the server", async ({ page }) => {
  const sunrise = await appId("Sunrise");
  await signIn(page, "applicant.meridian@aegis.demo");
  await page.goto("/applications");
  await expect(page.getByText("Meridian Institute of Management").first()).toBeVisible();
  await expect(page.getByText("Sunrise Institute of Technology")).toHaveCount(0);
  await page.goto(`/applications/${sunrise}`);
  await expect(page.getByText("Record not found")).toBeVisible();
  expect((await page.request.get(`/api/applications/${sunrise}/report`)).status()).toBe(404);
  expect((await page.request.get(`/api/exports/audit`)).status()).toBe(403);
  await page.goto("/admin/users");
  await expect(page.getByText("You do not have access to this page")).toBeVisible();
});

test("rejects a renamed non-PDF upload with a clear message", async ({ page }) => {
  await signIn(page, "applicant.greenfield@aegis.demo");
  await page.goto(`/applications/${await appId("Greenfield")}?tab=documents`);
  await page.getByTestId("upload-input").first().setInputFiles(sample("invalid-renamed-file.pdf"));
  await page.getByTestId("upload-submit").first().click();
  await expect(page.getByRole("alert").filter({ hasText: "does not match its .pdf extension" })).toBeVisible();
});

test("full journey: findings → rectification → revalidation → verification → forward → recorded decision → audit", async ({ page }) => {
  const id = await appId("Meridian");

  // 1. Scrutiny officer reviews the expired-certificate finding and returns the application.
  await signIn(page, "scrutiny@aegis.demo");
  await page.goto(`/applications/${id}?tab=findings`);
  await expect(page.getByText("Validity does not cover the required date").first()).toBeVisible();
  await expect(page.getByText("page 1").first()).toBeVisible();
  await page.goto(`/applications/${id}?tab=rectification`);
  await page.fill("#rect-msg", "The fire NOC expires before the academic year starts. Upload a renewed NOC.");
  await page.getByRole("button", { name: "Return for rectification" }).click();
  await expectToast(page, "returned for rectification");
  await expect(page.getByText("Rectification required").first()).toBeVisible();

  // 2. Institution replaces the NOC and submits the rectification (revalidation runs).
  await signIn(page, "applicant.meridian@aegis.demo");
  await page.goto(`/applications/${id}?tab=rectification`);
  await page.getByRole("button", { name: "Upload replacement" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("upload-input").setInputFiles(sample("meridian-fire-noc-renewed.pdf"));
  await dialog.locator("#replace-reason").fill("Renewed fire NOC issued in October 2026");
  await dialog.getByTestId("upload-submit").click();
  await expect(dialog.getByText("Uploaded and processed")).toBeVisible({ timeout: 90_000 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Submit corrections and revalidate" }).click();
  await page.getByRole("dialog").locator("textarea").fill("Renewed NOC uploaded as requested.");
  await page.getByRole("dialog").getByRole("button", { name: "Submit corrections and revalidate" }).click();
  await expectToast(page, "Corrections submitted");
  await page.goto(`/applications/${id}?tab=validation`);
  await expect(page.getByText("What changed since run #1")).toBeVisible();
  await expect(page.getByText("improved").first()).toBeVisible();
  await expect(page.getByText("Automated checks passed").first()).toBeVisible();

  // 3. The scrutiny & verification officer verifies the new NOC against the (simulated) issuer.
  await signIn(page, "scrutiny@aegis.demo");
  await page.goto(`/applications/${id}?tab=verification`);
  await page.getByRole("button", { name: "Run issuer verification" }).click();
  await expectToast(page, "Verification attempted");
  await expect(page.getByText("SFBA/NOC/2026/7712").first()).toBeVisible();
  await expect(page.getByText("Simulated response from a demo source").first()).toBeVisible();

  // 4. Scrutiny officer forwards for authorised review.
  await signIn(page, "scrutiny@aegis.demo");
  await page.goto(`/applications/${id}`);
  await page.getByRole("button", { name: "Forward for authorised review" }).click();
  await page.getByRole("dialog").locator("textarea").fill("All checks pass after rectification; NOC verified with simulated issuer.");
  await page.getByRole("dialog").getByRole("button", { name: "Forward for authorised review" }).click();
  await expectToast(page, "Forwarded for authorised review");

  // 5. Senior official records a human review outcome with reason and reference.
  await signIn(page, "senior@aegis.demo");
  await page.goto(`/applications/${id}`);
  await page.getByRole("button", { name: "Record review outcome" }).click();
  const d = page.getByRole("dialog");
  await d.locator("select").selectOption("SATISFACTORY_FOR_FURTHER_PROCESSING");
  await d.locator("textarea").fill("Scrutiny satisfactory on documentary evidence; forward for statutory processing.");
  await d.locator("input[name=reference]").fill("AEG/SO/2026/118");
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
