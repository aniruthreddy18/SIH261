// Deterministic demo seed. Creates configuration (taxonomy, templates, versioned sample rules,
// compliance requirements, issuer sources), fictional institutions and users, then builds every
// demo application through the real services: upload → extraction/OCR → validation →
// issuer verification → workflow actions. Run via `npm run db:reset` for a clean database.
import fs from "node:fs";
import path from "node:path";

try {
  process.loadEnvFile?.(path.resolve(process.cwd(), ".env"));
} catch {
  // .env is optional when variables are provided by the environment.
}

import { prisma } from "../src/server/db";
import { hashPassword } from "../src/lib/auth/password";
import { toActor } from "../src/server/auth";
import { createApplication } from "../src/server/applications";
import { uploadDocument } from "../src/server/documents";
import { runValidation } from "../src/server/validation";
import { runVerification } from "../src/server/verification";
import { forwardForAuthorizedReview, requestRectification } from "../src/server/workflow";
import type { Actor } from "../src/lib/auth/permissions";
import { ACTIVE_FINDING_STATUSES } from "../src/lib/domain";
import { ACADEMIC_YEAR, APPLICATIONS, DEMO_PASSWORD, INSTITUTIONS, ISSUER_RECORDS, STAFF } from "./lib/demo-data";
import { renderDoc } from "./lib/render";
import { shutdownOcr } from "../src/lib/extraction/ocr";

const CATEGORIES = [
  { code: "PREVIOUS_APPROVAL", name: "Previous Approval / EoA Letter", description: "Most recent approval or extension-of-approval letter for the institution.", fields: ["referenceNumber", "institutionName", "institutionCode", "programmeName", "approvedIntake", "academicYear", "issueDate"], verificationRequired: true },
  { code: "AFFIDAVIT", name: "Affidavit / Undertaking", description: "Affidavit or undertaking executed by the institution.", fields: ["institutionName", "institutionCode", "academicYear", "issueDate", "signatureIndicator"], verificationRequired: false },
  { code: "NOC_PERMISSION", name: "NOC / Permission", description: "No-objection certificates and permissions, including building and fire safety.", fields: ["referenceNumber", "institutionName", "issuingAuthority", "issueDate", "expiryDate"], verificationRequired: true },
  { code: "ACCREDITATION", name: "Accreditation / Certification", description: "Accreditation or certification of programmes or the institution.", fields: ["referenceNumber", "institutionName", "programmeName", "accreditationStatus", "issueDate", "expiryDate"], verificationRequired: true },
  { code: "FACULTY_RECORD", name: "Faculty / Institutional Record", description: "Faculty strength statements and institutional records.", fields: ["institutionName", "academicYear", "facultyCount"], verificationRequired: false },
  { code: "INFRASTRUCTURE", name: "Infrastructure Evidence", description: "Built-up area certificates, floor plans and facility photographs.", fields: ["institutionName", "builtUpArea"], verificationRequired: false },
  { code: "FEE_RECEIPT", name: "Payment Receipt / TER-related Evidence", description: "Processing-fee receipts and related payment evidence.", fields: ["referenceNumber", "institutionName", "amount", "issueDate"], verificationRequired: true },
  { code: "OTHER", name: "Other Supporting Document", description: "Any other supporting document.", fields: [], verificationRequired: false },
];

const TEMPLATES = [
  {
    code: "EOA", name: "Extension of Approval (Demo template)",
    description: "Sample checklist for an existing institution seeking extension of approval. Configurable demo template — not an official AICTE checklist.",
    items: [
      ["PREVIOUS_APPROVAL", "Previous approval / EoA letter", true, "Upload the most recent approval letter."],
      ["AFFIDAVIT", "Affidavit cum undertaking", true, "Signed affidavit for the academic year applied for."],
      ["NOC_PERMISSION", "Fire & building safety NOC", true, "Valid NOC covering the academic year applied for."],
      ["ACCREDITATION", "Accreditation certificate (if accredited)", false, "Only if any programme is accredited."],
      ["FACULTY_RECORD", "Faculty strength statement", true, null],
      ["INFRASTRUCTURE", "Built-up area / infrastructure evidence", true, null],
      ["FEE_RECEIPT", "Processing fee receipt", true, null],
      ["OTHER", "Other supporting documents", false, null],
    ] as [string, string, boolean, string | null][],
  },
  {
    code: "NEW_INSTITUTION", name: "New Institution Approval (Demo template)",
    description: "Sample checklist illustrating a second, configurable application type.",
    items: [
      ["AFFIDAVIT", "Affidavit cum undertaking", true, null],
      ["NOC_PERMISSION", "Land / building / fire NOCs", true, null],
      ["INFRASTRUCTURE", "Infrastructure evidence", true, null],
      ["FEE_RECEIPT", "Processing fee receipt", true, null],
      ["FACULTY_RECORD", "Proposed faculty statement", false, null],
    ] as [string, string, boolean, string | null][],
  },
];

type RuleSeed = { code: string; name: string; description: string; category: string; versions: { checkType: string; definition: object; severity: string; effectiveFrom: string; remediation: string; changeNote: string; appliesTo?: string[] }[] };
const EFFECTIVE = "2026-01-01";
const RULES: RuleSeed[] = [
  { code: "COMP-DOC-001", name: "Mandatory documents submitted", category: "COMPLETENESS", description: "Every mandatory checklist item of the application template has at least one uploaded document.", versions: [{ checkType: "REQUIRED_DOCUMENTS", definition: {}, severity: "HIGH", effectiveFrom: EFFECTIVE, remediation: "Upload the missing mandatory document.", changeNote: "Initial sample rule" }] },
  { code: "COMP-FLD-001", name: "Certificate identifiers and dates extractable", category: "COMPLETENESS", description: "NOCs and accreditation certificates must state a reference number, issue date and validity date.", versions: [{ checkType: "REQUIRED_FIELDS", definition: { documentCategories: ["NOC_PERMISSION", "ACCREDITATION"], fields: ["referenceNumber", "issueDate", "expiryDate"], missingOutcome: "REVIEW_REQUIRED" }, severity: "MEDIUM", effectiveFrom: EFFECTIVE, remediation: "Submit a legible copy that shows the reference number and validity dates.", changeNote: "Initial sample rule" }] },
  { code: "COMP-FLD-002", name: "Previous approval details extractable", category: "COMPLETENESS", description: "The previous approval letter must state a reference number, programme and approved intake.", versions: [{ checkType: "REQUIRED_FIELDS", definition: { documentCategories: ["PREVIOUS_APPROVAL"], fields: ["referenceNumber", "programmeName", "approvedIntake"], missingOutcome: "REVIEW_REQUIRED" }, severity: "MEDIUM", effectiveFrom: EFFECTIVE, remediation: "Submit the complete previous approval letter.", changeNote: "Initial sample rule" }] },
  { code: "COMP-FLD-003", name: "Fee receipt details extractable", category: "COMPLETENESS", description: "Fee receipts must state a transaction/receipt number and the amount paid.", versions: [{ checkType: "REQUIRED_FIELDS", definition: { documentCategories: ["FEE_RECEIPT"], fields: ["referenceNumber", "amount"], missingOutcome: "REVIEW_REQUIRED" }, severity: "MEDIUM", effectiveFrom: EFFECTIVE, remediation: "Submit the system-generated payment receipt.", changeNote: "Initial sample rule" }] },
  {
    code: "DATE-VAL-001", name: "Certificate valid for the academic year", category: "DATE_VALIDITY", description: "Demonstration rule: NOCs and accreditation certificates must remain valid on the first day of the academic year applied for.",
    versions: [
      { checkType: "DATE_VALID_ON", definition: { documentCategories: ["NOC_PERMISSION", "ACCREDITATION"], field: "expiryDate", reference: "RUN_DATE", offsetDays: 0 }, severity: "HIGH", effectiveFrom: EFFECTIVE, remediation: "Submit a renewed certificate.", changeNote: "Initial sample rule: not expired on the validation date." },
      { checkType: "DATE_VALID_ON", definition: { documentCategories: ["NOC_PERMISSION", "ACCREDITATION"], field: "expiryDate", reference: "ACADEMIC_YEAR_START", offsetDays: 0 }, severity: "HIGH", effectiveFrom: "2026-06-01", remediation: "Submit a renewed certificate whose validity covers the start of the academic year.", changeNote: "Tightened: validity must cover the start of the academic year applied for (demo policy)." },
    ],
  },
  { code: "DATE-ORD-001", name: "Issue date precedes expiry date", category: "DATE_VALIDITY", description: "A document's issue date must not be later than its validity date.", versions: [{ checkType: "DATE_ORDER", definition: { documentCategories: [], earlierField: "issueDate", laterField: "expiryDate" }, severity: "MEDIUM", effectiveFrom: EFFECTIVE, remediation: "Submit a correctly dated document.", changeNote: "Initial sample rule" }] },
  { code: "DATE-FUT-001", name: "Issue date not in the future", category: "DATE_VALIDITY", description: "A document cannot be issued after the validation date.", versions: [{ checkType: "DATE_NOT_FUTURE", definition: { documentCategories: [], field: "issueDate" }, severity: "MEDIUM", effectiveFrom: EFFECTIVE, remediation: "Submit a correctly dated document.", changeNote: "Initial sample rule" }] },
  { code: "XDOC-NAME-001", name: "Institution name consistent", category: "CONSISTENCY", description: "The institution name on each document must match the application, ignoring formatting and common abbreviations.", versions: [{ checkType: "CROSS_DOCUMENT_MATCH", definition: { field: "institutionName", documentCategories: [] }, severity: "HIGH", effectiveFrom: EFFECTIVE, remediation: "Submit documents issued in the institution's registered name, or explain the difference.", changeNote: "Initial sample rule" }] },
  { code: "XDOC-ID-001", name: "Institution identifier consistent", category: "CONSISTENCY", description: "Any institution identifier stated on a document must match the application.", versions: [{ checkType: "CROSS_DOCUMENT_MATCH", definition: { field: "institutionCode", documentCategories: [] }, severity: "HIGH", effectiveFrom: EFFECTIVE, remediation: "Correct the identifier on the document or the application.", changeNote: "Initial sample rule" }] },
  { code: "XDOC-AY-001", name: "Academic year consistent", category: "CONSISTENCY", description: "Affidavits and faculty statements must refer to the academic year applied for.", versions: [{ checkType: "CROSS_DOCUMENT_MATCH", definition: { field: "academicYear", documentCategories: ["AFFIDAVIT", "FACULTY_RECORD"] }, severity: "MEDIUM", effectiveFrom: EFFECTIVE, remediation: "Submit documents for the correct academic year.", changeNote: "Initial sample rule" }] },
  { code: "XDOC-PRG-001", name: "Programme listed in the application", category: "CONSISTENCY", description: "Programmes named on approval and accreditation documents must be programmes in the application.", versions: [{ checkType: "CROSS_DOCUMENT_MATCH", definition: { field: "programmeName", documentCategories: ["PREVIOUS_APPROVAL", "ACCREDITATION"] }, severity: "MEDIUM", effectiveFrom: EFFECTIVE, remediation: "Ensure the programme matches the application.", changeNote: "Initial sample rule" }] },
  { code: "XDOC-INT-001", name: "Approved intake matches application", category: "CONSISTENCY", description: "The intake on the previous approval letter must equal the intake applied for (extension, not increase).", versions: [{ checkType: "CROSS_DOCUMENT_MATCH", definition: { field: "approvedIntake", documentCategories: ["PREVIOUS_APPROVAL"] }, severity: "HIGH", effectiveFrom: EFFECTIVE, remediation: "Apply for the previously approved intake, or use the appropriate application type for an intake change.", changeNote: "Initial sample rule" }] },
  { code: "REC-ID-001", name: "Application matches institutional record", category: "RECORDS", description: "Institution name and identifier in the application must match the institutional record held in Aegis.", versions: [{ checkType: "RECORD_MATCH", definition: { aspect: "INSTITUTION_IDENTITY" }, severity: "HIGH", effectiveFrom: EFFECTIVE, remediation: "Correct the application details or update the institutional record through the authorised process.", changeNote: "Initial sample rule" }] },
  { code: "REC-INT-001", name: "Intake within institutional record", category: "RECORDS", description: "Intake applied for must not exceed the approved intake in the institutional record.", versions: [{ checkType: "RECORD_MATCH", definition: { aspect: "PROGRAMME_INTAKE" }, severity: "HIGH", effectiveFrom: EFFECTIVE, remediation: "Apply within the approved intake.", changeNote: "Initial sample rule" }] },
  { code: "DUP-FILE-001", name: "Distinct evidence per document", category: "DUPLICATE", description: "The same file should not be submitted for more than one checklist item.", versions: [{ checkType: "DUPLICATE_FILE", definition: { outcome: "REVIEW_REQUIRED" }, severity: "MEDIUM", effectiveFrom: EFFECTIVE, remediation: "Upload the correct, distinct document for each checklist item.", changeNote: "Initial sample rule" }] },
  { code: "DUP-REF-001", name: "Reference numbers not repeated", category: "DUPLICATE", description: "A reference number should appear on only one document within the application.", versions: [{ checkType: "DUPLICATE_REFERENCE", definition: { documentCategories: [], outcome: "REVIEW_REQUIRED" }, severity: "MEDIUM", effectiveFrom: EFFECTIVE, remediation: "Check the documents and submit the correct versions.", changeNote: "Initial sample rule" }] },
  { code: "POL-INF-001", name: "Built-up area meets sample threshold", category: "POLICY", description: "SAMPLE THRESHOLD (4,000 sq m) for demonstrating the rule builder. Not an AICTE norm.", versions: [{ checkType: "FIELD_CONDITION", definition: { documentCategories: ["INFRASTRUCTURE"], field: "builtUpArea", operator: "gte", value: "4000", missingOutcome: "REVIEW_REQUIRED" }, severity: "MEDIUM", effectiveFrom: EFFECTIVE, remediation: "Submit evidence of additional built-up area or route for inspection.", changeNote: "Initial sample rule", appliesTo: ["EOA", "NEW_INSTITUTION"] }] },
  { code: "POL-SIG-001", name: "Affidavit signature indicator present", category: "POLICY", description: "The affidavit should carry an observable signature cue (text cue or PDF signature field). This does not validate a signature.", versions: [{ checkType: "FIELD_CONDITION", definition: { documentCategories: ["AFFIDAVIT"], field: "signatureIndicator", operator: "exists", missingOutcome: "REVIEW_REQUIRED" }, severity: "LOW", effectiveFrom: EFFECTIVE, remediation: "Submit a signed affidavit.", changeNote: "Initial sample rule" }] },
];

const COMPLIANCE = [
  { code: "CMP-PERM-01", name: "Valid building & fire-safety permission", area: "Permissions", description: "Evidence of a currently valid fire and building safety NOC covering the academic year.", evidence: ["NOC_PERMISSION"], rules: ["COMP-DOC-001", "COMP-FLD-001", "DATE-VAL-001"] },
  { code: "CMP-ACC-01", name: "Accreditation evidence (where claimed)", area: "Accreditation", description: "Where accreditation is claimed, a valid certificate for the programme concerned.", evidence: ["ACCREDITATION"], rules: ["DATE-VAL-001", "XDOC-PRG-001"], optional: true },
  { code: "CMP-INF-01", name: "Infrastructure evidence — built-up area", area: "Infrastructure", description: "Documentary evidence of built-up area. Physical adequacy can only be established by inspection.", evidence: ["INFRASTRUCTURE"], rules: ["COMP-DOC-001", "POL-INF-001", "DUP-FILE-001"] },
  { code: "CMP-UND-01", name: "Institutional undertaking", area: "Undertakings", description: "Signed affidavit/undertaking for the academic year applied for.", evidence: ["AFFIDAVIT"], rules: ["COMP-DOC-001", "POL-SIG-001", "XDOC-AY-001", "XDOC-ID-001"] },
  { code: "CMP-FAC-01", name: "Faculty records", area: "Academic", description: "Faculty strength statement for the academic year.", evidence: ["FACULTY_RECORD"], rules: ["COMP-DOC-001", "XDOC-AY-001"] },
  { code: "CMP-FIN-01", name: "Processing fee evidence", area: "Financial", description: "Receipt for the processing fee, verifiable with the payment source.", evidence: ["FEE_RECEIPT"], rules: ["COMP-DOC-001", "COMP-FLD-003", "DUP-REF-001"] },
  { code: "CMP-REC-01", name: "Consistency with institutional records", area: "Records", description: "Application details, previous approval and intake consistent with institutional records.", evidence: ["PREVIOUS_APPROVAL"], rules: ["REC-ID-001", "REC-INT-001", "XDOC-INT-001", "XDOC-NAME-001"] },
];

async function main() {
  if ((await prisma.user.count()) > 0) {
    console.error("Database already contains data. Run `npm run db:reset` to rebuild the demo dataset from scratch.");
    process.exit(1);
  }
  const storage = path.resolve(process.cwd(), process.env.STORAGE_DIR || "./storage");
  for (const sub of ["documents", "previews"]) fs.rmSync(path.join(storage, sub), { recursive: true, force: true });

  console.log("Seeding configuration…");
  for (const [i, c] of CATEGORIES.entries()) {
    await prisma.documentCategory.create({ data: { code: c.code, name: c.name, description: c.description, expectedFieldsJson: JSON.stringify(c.fields), verificationRequired: c.verificationRequired, sortOrder: i } });
  }
  for (const t of TEMPLATES) {
    await prisma.applicationTemplate.create({
      data: { code: t.code, name: t.name, description: t.description, requiredDocuments: { create: t.items.map(([categoryCode, label, mandatory, guidance], i) => ({ categoryCode, label, mandatory, guidance, sortOrder: i })) } },
    });
  }
  for (const r of RULES) {
    const rule = await prisma.validationRule.create({ data: { code: r.code, name: r.name, description: r.description, category: r.category, currentVersion: r.versions.length, isSample: true } });
    for (const [i, v] of r.versions.entries()) {
      await prisma.ruleVersion.create({ data: { ruleId: rule.id, version: i + 1, checkType: v.checkType, definitionJson: JSON.stringify(v.definition), severity: v.severity as "HIGH", appliesToJson: JSON.stringify(v.appliesTo ?? []), effectiveFrom: new Date(`${v.effectiveFrom}T00:00:00Z`), remediation: v.remediation, changeNote: v.changeNote, sourceReference: null } });
    }
  }
  for (const c of COMPLIANCE) {
    await prisma.complianceRequirement.create({
      data: { code: c.code, name: c.name, area: c.area, description: c.description, appliesToJson: JSON.stringify(c.optional ? [] : []), evidenceCategoriesJson: JSON.stringify(c.evidence), linkedRuleCodesJson: JSON.stringify(c.rules), ruleSource: "Sample requirement configured for the Aegis demo. No authoritative regulation has been configured.", sourceReference: null, isSample: true, remediation: "See linked rule guidance.", effectiveFrom: new Date(`${EFFECTIVE}T00:00:00Z`) },
    });
  }
  await prisma.issuerSource.createMany({
    data: [
      { id: "synthetic-demo-issuer", name: "Synthetic Demo Issuer Registry", sourceType: "SIMULATED", description: "Fictional records for fire-safety NOCs, accreditation certificates and fee receipts. Responses are simulated and are not from any real authority.", categoriesJson: JSON.stringify(["NOC_PERMISSION", "ACCREDITATION", "FEE_RECEIPT"]), configJson: JSON.stringify({ latencyMs: 120 }) },
      { id: "demo-institution-registry", name: "Demo Institutional Records Registry", sourceType: "SIMULATED", description: "Compares previous-approval letters with the synthetic institutional records seeded in Aegis. Not an AICTE system.", categoriesJson: JSON.stringify(["PREVIOUS_APPROVAL"]) },
      { id: "official-provider", name: "Official verification provider", sourceType: "SANDBOX", description: "Placeholder adapter for an authorised issuing-authority API. Inactive until OFFICIAL_ISSUER_* environment variables are configured.", categoriesJson: JSON.stringify([]), enabled: true },
    ],
  });
  for (const r of ISSUER_RECORDS) {
    await prisma.syntheticIssuerRecord.create({ data: { referenceNumber: r.referenceNumber, categoryCode: r.categoryCode, issuerName: r.issuerName, institutionName: r.institutionName, institutionCode: r.institutionCode, issueDate: r.issueDate, expiryDate: r.expiryDate, behaviour: r.behaviour, note: (r as { note?: string }).note ?? null } });
  }

  console.log("Seeding institutions and users…");
  const instIds = new Map<string, string>();
  for (const i of INSTITUTIONS) {
    const created = await prisma.institution.create({ data: { code: i.code, name: i.name, category: i.category, state: i.state, city: i.city, establishedYear: i.established, programmes: { create: i.programmes } } });
    instIds.set(i.slug, created.id);
  }
  const actors = new Map<string, Actor>();
  for (const s of STAFF) {
    const u = await prisma.user.create({ data: { email: s.email, name: s.name, role: s.role, designation: s.designation, passwordHash: await hashPassword(DEMO_PASSWORD) } });
    actors.set(s.role, toActor(u));
  }
  for (const i of INSTITUTIONS) {
    const u = await prisma.user.create({ data: { email: `applicant.${i.slug}@aegis.demo`, name: i.contact, role: "APPLICANT", designation: `Authorised contact, ${i.name}`, institutionId: instIds.get(i.slug)!, passwordHash: await hashPassword(DEMO_PASSWORD) } });
    actors.set(`applicant:${i.slug}`, toActor(u));
  }
  const scrutiny = actors.get("SCRUTINY_OFFICER")!;
  const verifier = scrutiny;

  for (const spec of APPLICATIONS) {
    const i = INSTITUTIONS.find((x) => x.slug === spec.slug)!;
    const applicant = actors.get(`applicant:${i.slug}`)!;
    process.stdout.write(`• ${spec.scenario.padEnd(32)} ${i.name} … `);
    const app = await createApplication(applicant, {
      institutionId: instIds.get(i.slug)!,
      templateCode: "EOA",
      institutionName: i.name,
      institutionCode: i.code,
      institutionCategory: i.category,
      academicYear: ACADEMIC_YEAR,
      contactName: i.contact,
      contactEmail: `applicant.${i.slug}@aegis.demo`,
      programmes: spec.programmes,
    }, { createdAt: new Date(spec.submittedAt) });
    const rendered = new Map<string, Buffer>();
    for (const d of spec.documents) {
      const { buffer, mimeType } = await renderDoc(d);
      rendered.set(d.file, buffer);
      const v = await uploadDocument(applicant, { applicationId: app.id, categoryCode: d.category, fileName: d.file, mimeType, buffer });
      if (v.processingStatus !== "PROCESSED") throw new Error(`Processing failed for ${d.file}: ${v.processingError}`);
    }
    for (const dup of spec.duplicateAs ?? []) {
      await uploadDocument(applicant, { applicationId: app.id, categoryCode: dup.category, fileName: dup.from, mimeType: "application/pdf", buffer: rendered.get(dup.from)! });
    }
    if (spec.validate) await runValidation(scrutiny, app.id, "SEED");
    if (spec.verify) await runVerification(verifier, app.id);
    if (spec.after === "REQUEST_RECTIFICATION") {
      const open = await prisma.finding.findMany({ where: { applicationId: app.id, status: { in: ACTIVE_FINDING_STATUSES } } });
      await requestRectification(scrutiny, app.id, open.map((f) => f.id), "The mandatory fire & building safety NOC has not been submitted. Upload a valid NOC covering the academic year 2027-28 and resubmit.");
    }
    if (spec.after === "FORWARD") {
      await forwardForAuthorizedReview(scrutiny, app.id, "All automated checks passed and simulated issuer verification matched for every verifiable document. Forwarded for authorised review.");
    }
    const final = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    const open = await prisma.finding.count({ where: { applicationId: app.id, status: { in: ACTIVE_FINDING_STATUSES } } });
    console.log(`${final.reference}  ${final.status}  (${open} open finding${open === 1 ? "" : "s"})`);
  }

  console.log(`\nDone. Sign in at http://localhost:3000 with any demo account; password: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await shutdownOcr();
    await prisma.$disconnect();
  });
