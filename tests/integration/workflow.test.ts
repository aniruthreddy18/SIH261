import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { toActor } from "@/server/auth";
import { createApplication, getApplicationDetail, transitionStatus } from "@/server/applications";
import { correctField, uploadDocument } from "@/server/documents";
import { reviewFinding } from "@/server/findings";
import { runValidation, getRunComparison } from "@/server/validation";
import { recordManualVerification, runVerification } from "@/server/verification";
import { forwardForAuthorizedReview, recordDecision, requestRectification, submitRectification } from "@/server/workflow";
import { buildReportData } from "@/server/reports";
import { renderReportPdf } from "@/lib/report/pdf";
import { saveRuleVersion } from "@/server/rules";
import { updateSettings } from "@/server/admin";
import { login } from "@/server/auth";
import { AuthorizationError, DomainError, NotFoundError, type Actor } from "@/lib/auth/permissions";
import { renderDoc } from "../../scripts/lib/render";
import { SAMPLE_FILES } from "../../scripts/lib/demo-data";

const actors: Record<string, Actor> = {};
const ACTIVE = ["OPEN", "INFO_REQUESTED", "ESCALATED", "RECTIFICATION_REQUESTED"] as const;
const appByName = (n: string) => prisma.application.findFirstOrThrow({ where: { institutionName: { contains: n } } });
const openFindings = (applicationId: string) => prisma.finding.findMany({ where: { applicationId, status: { in: [...ACTIVE] } } });

beforeAll(async () => {
  for (const u of await prisma.user.findMany()) actors[u.email] = toActor(u);
});

const A = (e: string) => actors[e];

describe("seeded scenarios", () => {
  it("reproduces the expected status for each demo scenario", async () => {
    const statuses = Object.fromEntries((await prisma.application.findMany()).map((a) => [a.institutionName.split(" ")[0], a.status]));
    expect(statuses).toMatchObject({
      Sunrise: "AUTO_PASSED", Lakeview: "RECTIFICATION_REQUIRED", Meridian: "AUTO_FAILED", Coastal: "AUTO_FAILED",
      Northfield: "REVIEW_REQUIRED", Riverside: "REVIEW_REQUIRED", Highland: "REVIEW_REQUIRED", Greenfield: "DRAFT", Valley: "READY_FOR_AUTHORIZED_REVIEW",
    });
  });
  it("records rule versions on every run and persists evidence-linked results", async () => {
    const run = await prisma.validationRun.findFirstOrThrow({ where: { application: { institutionName: { contains: "Meridian" } } }, include: { results: true } });
    expect(JSON.parse(run.ruleVersionsJson)).toContainEqual(expect.objectContaining({ code: "DATE-VAL-001", version: 2 }));
    const fail = run.results.find((r) => r.ruleCode === "DATE-VAL-001" && r.status === "FAIL")!;
    const evidence = JSON.parse(fail.evidenceJson);
    expect(evidence[0]).toMatchObject({ kind: "FIELD", page: 1 });
    expect(fail.expected).toContain("01 Jul 2027");
  });
});

describe("authentication", () => {
  it("accepts valid credentials and rejects invalid ones without revealing which part failed", async () => {
    const ok = await login("scrutiny@aegis.demo", "Aegis@Demo2026", { ip: "t1" });
    expect(ok.ok).toBe(true);
    const bad = await login("scrutiny@aegis.demo", "nope", { ip: "t1" });
    const unknown = await login("nobody@aegis.demo", "nope", { ip: "t1" });
    expect(bad.ok || unknown.ok).toBe(false);
    if (!bad.ok && !unknown.ok) expect(bad.error).toBe(unknown.error);
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: "scrutiny@aegis.demo" } });
    expect(stored.passwordHash.startsWith("scrypt$")).toBe(true);
  });
  it("keeps institutions and AICTE staff on separate sign-in portals", async () => {
    const staffOnInstitution = await login("admin@aegis.demo", "Aegis@Demo2026", { ip: "p1", portal: "INSTITUTION" });
    expect(staffOnInstitution.ok).toBe(false);
    if (!staffOnInstitution.ok) expect(staffOnInstitution.error).toContain("AICTE official sign-in");
    const institutionOnOfficial = await login("applicant.valley@aegis.demo", "Aegis@Demo2026", { ip: "p1", portal: "OFFICIAL" });
    expect(institutionOnOfficial.ok).toBe(false);
    if (!institutionOnOfficial.ok) expect(institutionOnOfficial.error).toContain("Institution login");
    expect((await login("applicant.valley@aegis.demo", "Aegis@Demo2026", { ip: "p1", portal: "INSTITUTION" })).ok).toBe(true);
    expect((await login("admin@aegis.demo", "Aegis@Demo2026", { ip: "p1", portal: "OFFICIAL" })).ok).toBe(true);
    // A wrong password on the wrong portal still gives the generic error (portal is checked only after the password).
    const guess = await login("admin@aegis.demo", "wrong", { ip: "p2", portal: "INSTITUTION" });
    if (!guess.ok) expect(guess.error).toBe("Invalid email or password.");
    expect(await prisma.auditEvent.count({ where: { reason: "Wrong sign-in portal" } })).toBe(2);
  });
  it("sends institution notifications to portal links", async () => {
    const n = await prisma.notification.findFirstOrThrow({ where: { user: { role: "APPLICANT" }, link: { not: null } } });
    expect(n.link!.startsWith("/portal/")).toBe(true);
  });
  it("rate-limits repeated failures", async () => {
    let last;
    for (let i = 0; i < 7; i++) last = await login("senior@aegis.demo", "wrong", { ip: "rl" });
    expect(last && !last.ok && last.error).toContain("Too many");
  });
});

describe("access control and isolation", () => {
  it("prevents applicants from reading other institutions' applications", async () => {
    const sunrise = await appByName("Sunrise");
    await expect(getApplicationDetail(A("applicant.meridian@aegis.demo"), sunrise.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(buildReportData(A("applicant.meridian@aegis.demo"), sunrise.id)).rejects.toBeInstanceOf(NotFoundError);
  });
  it("blocks privileged actions for unauthorised roles", async () => {
    const meridian = await appByName("Meridian");
    const f = (await openFindings(meridian.id))[0];
    await expect(reviewFinding(A("applicant.meridian@aegis.demo"), f.id, "RESOLVE", "I resolve my own finding")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(saveRuleVersion(A("scrutiny@aegis.demo"), {} as never)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(recordDecision(A("scrutiny@aegis.demo"), meridian.id, "DEFICIENCIES_NOTED", "not allowed for this role", "X-1")).rejects.toBeInstanceOf(AuthorizationError);
  });
  it("prevents applicants creating applications for another institution", async () => {
    const other = await prisma.institution.findFirstOrThrow({ where: { name: { contains: "Sunrise" } } });
    await expect(createApplication(A("applicant.meridian@aegis.demo"), { institutionId: other.id, templateCode: "EOA", institutionName: "X Inst", institutionCategory: "Eng", academicYear: "2027-28", contactName: "A B", contactEmail: "a@b.co", programmes: [{ name: "B.Tech", level: "UG", intake: 10 }] })).rejects.toBeInstanceOf(DomainError);
  });
});

describe("application lifecycle on a new application", () => {
  let appId: string;
  const greenfield = "applicant.greenfield@aegis.demo";

  it("creates an application with a server-generated reference", async () => {
    const inst = await prisma.institution.findFirstOrThrow({ where: { name: { contains: "Greenfield" } } });
    const app = await createApplication(A(greenfield), { institutionId: inst.id, templateCode: "EOA", institutionName: inst.name, institutionCode: inst.code, institutionCategory: inst.category, academicYear: "2028-29", contactName: "Dr. S. Karthik", contactEmail: greenfield, programmes: [{ name: "B.Tech Artificial Intelligence and Data Science", level: "UG", intake: 60 }] });
    appId = app.id;
    expect(app.reference).toMatch(/^AEG-2028-\d{6}$/);
    expect(app.status).toBe("DRAFT");
    expect(await prisma.auditEvent.count({ where: { applicationId: appId, eventType: "APPLICATION_CREATED" } })).toBe(1);
  });

  it("rejects an upload whose content does not match its extension, and audits the rejection", async () => {
    await expect(uploadDocument(A(greenfield), { applicationId: appId, categoryCode: "AFFIDAVIT", fileName: "a.pdf", mimeType: "application/pdf", buffer: Buffer.from("not really a pdf") })).rejects.toThrow(/does not match/);
    expect(await prisma.auditEvent.count({ where: { applicationId: appId, eventType: "DOCUMENT_UPLOAD_REJECTED" } })).toBe(1);
  });

  it("processes a text PDF and a scanned image, saving fields with evidence locations", async () => {
    const pdfSpec = SAMPLE_FILES.find((s) => s.file === "greenfield-accreditation.pdf")!;
    const pdf = await renderDoc(pdfSpec);
    const v1 = await uploadDocument(A(greenfield), { applicationId: appId, categoryCode: "ACCREDITATION", fileName: pdfSpec.file, mimeType: pdf.mimeType, buffer: pdf.buffer });
    expect(v1.processingStatus).toBe("PROCESSED");
    expect(v1.extractionMethod).toBe("PDF_TEXT");
    const expiry = v1.fields.find((f) => f.key === "expiryDate")!;
    expect(expiry.normalizedValue).toBe("2031-08-31");
    expect(expiry.page).toBe(1);
    expect(expiry.bboxJson).not.toBeNull();

    const pngSpec = SAMPLE_FILES.find((s) => s.file === "scanned-noc-sample.png")!;
    const png = await renderDoc(pngSpec);
    const v2 = await uploadDocument(A(greenfield), { applicationId: appId, categoryCode: "NOC_PERMISSION", fileName: "scan.png", mimeType: "image/png", buffer: png.buffer });
    expect(v2.processingStatus).toBe("PROCESSED");
    expect(v2.extractionMethod).toBe("OCR");
    expect(v2.ocrConfidence).toBeGreaterThan(0.6);
    expect(v2.fields.find((f) => f.key === "referenceNumber")?.value).toBe("SFBA/NOC/2025/3301");
  });

  it("OCRs a scanned (image-only) PDF by rasterising its pages", async () => {
    const PDFDocument = (await import("pdfkit")).default;
    const png = await renderDoc(SAMPLE_FILES.find((s) => s.file === "scanned-noc-sample.png")!);
    const scannedPdf: Buffer = await new Promise((resolve) => {
      const d = new PDFDocument({ size: "A4", margin: 0 });
      const chunks: Buffer[] = [];
      d.on("data", (c: Buffer) => chunks.push(c));
      d.on("end", () => resolve(Buffer.concat(chunks)));
      d.image(png.buffer, 0, 0, { width: 595 });
      d.end();
    });
    const v = await uploadDocument(A(greenfield), { applicationId: appId, categoryCode: "OTHER", fileName: "scanned.pdf", mimeType: "application/pdf", buffer: scannedPdf });
    expect(v.processingStatus).toBe("PROCESSED");
    expect(v.extractionMethod).toBe("OCR");
    expect(v.fields.find((f) => f.key === "expiryDate")?.normalizedValue).toBe("2028-02-13");
  });

  it("runs validation, persists results and creates findings for missing documents", async () => {
    const r = await runValidation(A(greenfield), appId);
    expect(r.status).toBe("AUTO_FAILED");
    const results = await prisma.ruleResult.findMany({ where: { runId: r.runId } });
    expect(results.length).toBeGreaterThan(10);
    const missing = results.filter((x) => x.ruleCode === "COMP-DOC-001" && x.status === "FAIL");
    expect(missing.map((m) => m.categoryCode).sort()).toEqual(["AFFIDAVIT", "FACULTY_RECORD", "FEE_RECEIPT", "INFRASTRUCTURE", "PREVIOUS_APPROVAL"]);
    // The OCR'd NOC belongs to another institution → cross-document name mismatch is detected.
    expect(results.some((x) => x.ruleCode === "XDOC-NAME-001" && x.status === "FAIL")).toBe(true);
    expect((await openFindings(appId)).length).toBeGreaterThanOrEqual(6);
  });

  it("rejects invalid status transitions", async () => {
    await expect(prisma.$transaction((tx) => transitionStatus(tx, appId, "CLOSED", { actor: null }))).rejects.toBeInstanceOf(DomainError);
  });

  it("records an audited field correction without overwriting the machine value, and uses it on rerun", async () => {
    const field = await prisma.extractedField.findFirstOrThrow({ where: { key: "institutionName", version: { isCurrent: true, document: { applicationId: appId, categoryCode: "NOC_PERMISSION" } } }, include: { version: true } });
    await correctField(A("scrutiny@aegis.demo"), field.id, "Greenfield College of Engineering", "Confirmed against applicant's original during review");
    const after = await prisma.extractedField.findUniqueOrThrow({ where: { id: field.id } });
    expect(after.value).toBe("Sunrise Institute of Technology");
    expect(after.correctedValue).toBe("Greenfield College of Engineering");
    expect(await prisma.auditEvent.count({ where: { applicationId: appId, eventType: "FIELD_CORRECTED" } })).toBe(1);
    const r = await runValidation(A("scrutiny@aegis.demo"), appId);
    const res = await prisma.ruleResult.findMany({ where: { runId: r.runId, ruleCode: "XDOC-NAME-001", documentId: field.version.documentId } });
    expect(res.map((x) => x.status)).toEqual(["PASS"]);
    const cmp = await getRunComparison(appId, r.runId);
    expect(cmp?.changes.some((c) => c.ruleCode === "XDOC-NAME-001" && c.kind === "IMPROVED")).toBe(true);
  });
});

describe("issuer verification", () => {
  it("verifies documents through the simulated source and labels the source type", async () => {
    const sunrise = await appByName("Sunrise");
    const res = await runVerification(A("scrutiny@aegis.demo"), sunrise.id);
    expect(res.length).toBe(4);
    expect(res.every((r) => r.status === "VERIFIED")).toBe(true);
    const v = await prisma.issuerVerification.findFirstOrThrow({ where: { applicationId: sunrise.id }, orderBy: { requestedAt: "desc" } });
    expect(v.sourceType).toBe("SIMULATED");
  });
  it("handles an outage with bounded retries and routes it to review", async () => {
    const valley = await appByName("Valley");
    const northfield = await appByName("Northfield");
    await updateSettings(A("admin@aegis.demo"), { syntheticIssuerOutage: "true", issuerMaxRetries: "1" });
    try {
      const res = await runVerification(A("scrutiny@aegis.demo"), northfield.id);
      expect(res.some((r) => r.status === "SOURCE_UNAVAILABLE")).toBe(true);
      const v = await prisma.issuerVerification.findFirstOrThrow({ where: { applicationId: northfield.id, status: "SOURCE_UNAVAILABLE" }, orderBy: { requestedAt: "desc" } });
      expect(v.attempts).toBe(2);
      expect(await prisma.auditEvent.count({ where: { applicationId: northfield.id, eventType: "ISSUER_SOURCE_UNAVAILABLE" } })).toBeGreaterThan(0);
      expect(valley.status).toBe("READY_FOR_AUTHORIZED_REVIEW");
    } finally {
      await updateSettings(A("admin@aegis.demo"), { syntheticIssuerOutage: "false", issuerMaxRetries: "2" });
    }
  });
  it("records an unsupported category as NOT_SUPPORTED, never as verified", async () => {
    await prisma.issuerSource.update({ where: { id: "synthetic-demo-issuer" }, data: { enabled: false } });
    try {
      const sunrise = await appByName("Sunrise");
      const res = await runVerification(A("scrutiny@aegis.demo"), sunrise.id);
      expect(res.filter((r) => r.status === "NOT_SUPPORTED").length).toBe(3);
    } finally {
      await prisma.issuerSource.update({ where: { id: "synthetic-demo-issuer" }, data: { enabled: true } });
    }
  });
  it("accepts a manual confirmation only with a reason and reference", async () => {
    const riverside = await appByName("Riverside");
    const fee = await prisma.document.findFirstOrThrow({ where: { applicationId: riverside.id, categoryCode: "FEE_RECEIPT" } });
    await expect(recordManualVerification(A("scrutiny@aegis.demo"), fee.id, "VERIFIED", "ok", "")).rejects.toBeInstanceOf(DomainError);
    await recordManualVerification(A("scrutiny@aegis.demo"), fee.id, "VERIFIED", "Confirmed with ledger operations desk by email", "MAIL/2026/77");
    const f = await prisma.finding.findFirstOrThrow({ where: { applicationId: riverside.id, fingerprint: `VERIFY|${fee.id}` } });
    expect(f.status).toBe("RESOLVED");
    const v = await prisma.issuerVerification.findFirstOrThrow({ where: { documentId: fee.id, isManual: true } });
    expect(v.sourceType).toBe("MANUAL");
  });
});

describe("review, rectification and revalidation", () => {
  it("requires a reason for every review action", async () => {
    const highland = await appByName("Highland");
    const f = (await openFindings(highland.id))[0];
    await expect(reviewFinding(A("scrutiny@aegis.demo"), f.id, "DISMISS", "")).rejects.toBeInstanceOf(DomainError);
  });

  it("does not clear an unrelated finding when a different document is replaced", async () => {
    const coastal = await appByName("Coastal");
    const before = await openFindings(coastal.id);
    const idFinding = before.find((f) => f.ruleCode === "XDOC-ID-001")!;
    await requestRectification(A("scrutiny@aegis.demo"), coastal.id, before.map((f) => f.id), "Correct the identifier and intake discrepancies.");
    const noc = await prisma.document.findFirstOrThrow({ where: { applicationId: coastal.id, categoryCode: "NOC_PERMISSION" } });
    const nocBuf = await renderDoc(SAMPLE_FILES.find((s) => s.file === "lakeview-fire-noc.pdf")!);
    // Replace an unrelated document (the NOC) only.
    await uploadDocument(A("applicant.coastal@aegis.demo"), { applicationId: coastal.id, categoryCode: "NOC_PERMISSION", fileName: "noc.pdf", mimeType: "application/pdf", buffer: nocBuf.buffer, replaceDocumentId: noc.id, reason: "Re-uploaded" });
    await submitRectification(A("applicant.coastal@aegis.demo"), coastal.id, "Re-uploaded the NOC");
    const after = await prisma.finding.findUniqueOrThrow({ where: { id: idFinding.id } });
    expect(after.status).toBe("OPEN");
    // History is preserved: the earlier NOC version is retained.
    expect(await prisma.documentVersion.count({ where: { documentId: noc.id } })).toBe(2);
  });

  it("clears the finding when the corrected evidence is submitted, preserving history", async () => {
    const meridian = await appByName("Meridian");
    const expired = (await openFindings(meridian.id)).find((f) => f.ruleCode === "DATE-VAL-001")!;
    await requestRectification(A("scrutiny@aegis.demo"), meridian.id, [expired.id], "Upload a renewed fire NOC covering the academic year.");
    const noc = await prisma.document.findFirstOrThrow({ where: { applicationId: meridian.id, categoryCode: "NOC_PERMISSION" } });
    const renewed = await renderDoc(SAMPLE_FILES.find((s) => s.file === "meridian-fire-noc-renewed.pdf")!);
    await uploadDocument(A("applicant.meridian@aegis.demo"), { applicationId: meridian.id, categoryCode: "NOC_PERMISSION", fileName: "renewed.pdf", mimeType: "application/pdf", buffer: renewed.buffer, replaceDocumentId: noc.id, reason: "Renewed NOC" });
    const run = await submitRectification(A("applicant.meridian@aegis.demo"), meridian.id, "Renewed NOC uploaded");
    expect(run.status).toBe("AUTO_PASSED");
    const f = await prisma.finding.findUniqueOrThrow({ where: { id: expired.id } });
    expect(f.status).toBe("AUTO_CLEARED");
    expect(await prisma.ruleResult.count({ where: { run: { applicationId: meridian.id, runNumber: 1 }, ruleCode: "DATE-VAL-001", status: "FAIL" } })).toBe(1);

    // Forwarding requires verification of the new version, then a senior official records the outcome.
    await expect(forwardForAuthorizedReview(A("scrutiny@aegis.demo"), meridian.id, "Forwarding after rectification")).rejects.toThrow(/verification is incomplete/);
    await runVerification(A("scrutiny@aegis.demo"), meridian.id);
    await forwardForAuthorizedReview(A("scrutiny@aegis.demo"), meridian.id, "Forwarding after rectification");
    await recordDecision(A("senior@aegis.demo"), meridian.id, "SATISFACTORY_FOR_FURTHER_PROCESSING", "Documentary scrutiny satisfactory.", "AEG/SO/2026/9");
    const closed = await prisma.application.findUniqueOrThrow({ where: { id: meridian.id } });
    expect(closed.status).toBe("CLOSED");
    const decisionAudit = await prisma.auditEvent.findFirstOrThrow({ where: { applicationId: meridian.id, eventType: "HUMAN_DECISION_RECORDED" } });
    expect(decisionAudit.afterJson).toContain("not an automatically generated regulatory approval");
  });
});

describe("audit and reports", () => {
  it("keeps the audit log append-only at the database level", async () => {
    const e = await prisma.auditEvent.findFirstOrThrow();
    await expect(prisma.auditEvent.update({ where: { id: e.id }, data: { action: "tampered" } })).rejects.toThrow();
    await expect(prisma.auditEvent.delete({ where: { id: e.id } })).rejects.toThrow();
  });
  it("never stores passwords or tokens in the audit log", async () => {
    const events = await prisma.auditEvent.findMany();
    const blob = JSON.stringify(events);
    expect(blob).not.toContain("Aegis@Demo2026");
    expect(blob).not.toContain("scrypt$");
  });
  it("generates a PDF report and hides internal notes and other applications from applicants", async () => {
    const highland = await appByName("Highland");
    const f = (await openFindings(highland.id))[0];
    await reviewFinding(A("scrutiny@aegis.demo"), f.id, "NOTE", "Internal: compare with the other institution's receipt");
    const officer = await buildReportData(A("scrutiny@aegis.demo"), highland.id);
    const applicant = await buildReportData(A("applicant.highland@aegis.demo"), highland.id);
    expect(officer.reviewActions.some((r) => r.reason.startsWith("Internal:"))).toBe(true);
    expect(applicant.reviewActions.some((r) => r.reason.startsWith("Internal:"))).toBe(false);
    expect(applicant.verifications.every((v) => v.sourceType)).toBe(true);
    const pdf = await renderReportPdf(officer);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(officer.limitations.join(" ")).toContain("SIMULATED");
  });
});
