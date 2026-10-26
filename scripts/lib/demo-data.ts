// Coherent, fictional demo dataset. All institutions, identifiers, reference numbers, issuers
// and people are invented. Nothing here is AICTE data.
import type { DocSpec } from "./render";

export const DEMO_PASSWORD = "Aegis@Demo2026";
export const ACADEMIC_YEAR = "2027-28";

export interface DemoInstitution {
  slug: string;
  code: string;
  name: string;
  category: string;
  state: string;
  city: string;
  established: number;
  programmes: { name: string; level: string; approvedIntake: number; lastApprovedYear: string }[];
  contact: string;
}

export const INSTITUTIONS: DemoInstitution[] = [
  { slug: "sunrise", code: "AEG-INST-1001", name: "Sunrise Institute of Technology", category: "Engineering & Technology", state: "Karnataka", city: "Mysuru", established: 2004, contact: "Dr. Priya Raman", programmes: [{ name: "B.Tech Computer Science and Engineering", level: "UG", approvedIntake: 120, lastApprovedYear: "2026-27" }, { name: "B.Tech Electronics and Communication Engineering", level: "UG", approvedIntake: 60, lastApprovedYear: "2026-27" }] },
  { slug: "lakeview", code: "AEG-INST-1012", name: "Lakeview College of Engineering", category: "Engineering & Technology", state: "Maharashtra", city: "Nashik", established: 2009, contact: "Prof. Anil Deshmukh", programmes: [{ name: "B.Tech Civil Engineering", level: "UG", approvedIntake: 60, lastApprovedYear: "2026-27" }] },
  { slug: "meridian", code: "AEG-INST-1027", name: "Meridian Institute of Management", category: "Management", state: "Gujarat", city: "Vadodara", established: 2011, contact: "Dr. Kavita Shah", programmes: [{ name: "Master of Business Administration", level: "PG", approvedIntake: 120, lastApprovedYear: "2026-27" }] },
  { slug: "coastal", code: "AEG-INST-1040", name: "Coastal Institute of Pharmacy", category: "Pharmacy", state: "Kerala", city: "Kozhikode", established: 2013, contact: "Dr. Thomas Varghese", programmes: [{ name: "Bachelor of Pharmacy", level: "UG", approvedIntake: 100, lastApprovedYear: "2026-27" }] },
  { slug: "northfield", code: "AEG-INST-1055", name: "Northfield School of Architecture", category: "Architecture", state: "Punjab", city: "Ludhiana", established: 2015, contact: "Ar. Simran Gill", programmes: [{ name: "Bachelor of Architecture", level: "UG", approvedIntake: 40, lastApprovedYear: "2026-27" }] },
  { slug: "riverside", code: "AEG-INST-1063", name: "Riverside Polytechnic Institute", category: "Engineering & Technology (Diploma)", state: "Odisha", city: "Cuttack", established: 2001, contact: "Sri. Bikash Mohanty", programmes: [{ name: "Diploma in Civil Engineering", level: "Diploma", approvedIntake: 60, lastApprovedYear: "2026-27" }] },
  { slug: "highland", code: "AEG-INST-1078", name: "Highland Institute of Technology", category: "Engineering & Technology", state: "Uttarakhand", city: "Dehradun", established: 2010, contact: "Dr. Neha Joshi", programmes: [{ name: "B.Tech Mechanical Engineering", level: "UG", approvedIntake: 60, lastApprovedYear: "2026-27" }] },
  { slug: "greenfield", code: "AEG-INST-1081", name: "Greenfield College of Engineering", category: "Engineering & Technology", state: "Tamil Nadu", city: "Coimbatore", established: 2017, contact: "Dr. S. Karthik", programmes: [{ name: "B.Tech Artificial Intelligence and Data Science", level: "UG", approvedIntake: 60, lastApprovedYear: "2026-27" }] },
  { slug: "valley", code: "AEG-INST-1094", name: "Valley Institute of Technology", category: "Engineering & Technology", state: "Telangana", city: "Warangal", established: 2008, contact: "Dr. Ravi Kumar", programmes: [{ name: "B.Tech Information Technology", level: "UG", approvedIntake: 60, lastApprovedYear: "2026-27" }] },
];

export const STAFF = [
  { email: "admin@aegis.demo", name: "Asha Verma", role: "ADMIN" as const, designation: "Rules & Systems Administrator" },
  { email: "scrutiny@aegis.demo", name: "Vikram Iyer", role: "SCRUTINY_OFFICER" as const, designation: "Scrutiny & Verification Officer" },
  { email: "senior@aegis.demo", name: "Dr. Arjun Menon", role: "SENIOR_OFFICIAL" as const, designation: "Competent Authority (Demo)" },
];

// --- Issuers (fictional) ---------------------------------------------------
const APPROVALS = "Demo Regulatory Approvals Office (Synthetic)";
const FIRE = "Demo State Fire & Building Safety Authority (Synthetic)";
const ACCRED = "Demo National Accreditation Registry (Synthetic)";
const PAY = "Demo Payments Ledger (Synthetic)";

type I = DemoInstitution;
const prevApproval = (i: I, ref: string, prog: string, intake: number, extra: Partial<DocSpec> = {}): DocSpec => ({
  file: `${i.slug}-previous-approval.pdf`, category: "PREVIOUS_APPROVAL", issuer: APPROVALS, title: "Extension of Approval Letter — Academic Year 2026-27",
  fields: [["Letter No", ref], ["Name of the Institution", i.name], ["Institution ID", i.code], ["Programme", prog], ["Approved Intake", String(intake)], ["Academic Year", "2026-27"], ["Date of Issue", "20/06/2026"]],
  body: "This synthetic letter records that the institution named above was granted extension of approval for the programme and intake stated, for the academic year indicated, subject to the conditions applicable at the time. Generated for demonstration only.",
  signedBy: "Deputy Director, Demo Regulatory Approvals Office", created: "2026-06-20T10:00:00Z", ...extra,
});
const affidavit = (i: I, ref: string, extra: Partial<DocSpec> = {}, code = i.code): DocSpec => ({
  file: `${i.slug}-affidavit.pdf`, category: "AFFIDAVIT", issuer: i.name, title: "Affidavit cum Undertaking",
  fields: [["Affidavit No", ref], ["Name of the Institution", i.name], ["Institution ID", code], ["Academic Year", ACADEMIC_YEAR], ["Date of Issue", "05/10/2026"]],
  body: "We solemnly affirm that the information furnished in the application and its supporting documents is true and correct to the best of our knowledge, and undertake to comply with the applicable norms. (Synthetic text for demonstration.)",
  signedBy: `Principal, ${i.name}`, created: "2026-10-05T09:00:00Z", ...extra,
});
const fireNoc = (i: I, ref: string, issue: string, until: string, extra: Partial<DocSpec> = {}): DocSpec => ({
  file: `${i.slug}-fire-noc.pdf`, category: "NOC_PERMISSION", issuer: FIRE, title: "Fire Safety No Objection Certificate",
  fields: [["Certificate No", ref], ["Name of the Institution", i.name], ["Issuing Authority", "Demo State Fire & Building Safety Authority"], ["Date of Issue", issue], ["Valid Until", until]],
  body: "Certified that the premises of the institution named above were inspected and found to comply with the fire-safety requirements applicable at the time of inspection, subject to periodic renewal. (Synthetic.)",
  signedBy: "Divisional Fire Officer (Demo)", created: `${issue.split("/").reverse().join("-")}T08:00:00Z`, ...extra,
});
const accreditation = (i: I, ref: string, prog: string, issue: string, until: string, extra: Partial<DocSpec> = {}): DocSpec => ({
  file: `${i.slug}-accreditation.pdf`, category: "ACCREDITATION", issuer: ACCRED, title: "Programme Accreditation Certificate",
  fields: [["Certificate No", ref], ["Name of the Institution", i.name], ["Programme", prog], ["Accreditation Status", "Accredited - Tier I (Demo scale)"], ["Date of Issue", issue], ["Valid Until", until]],
  body: "The programme named above has been accredited under the demonstration accreditation scale for the period stated. (Synthetic.)",
  signedBy: "Member Secretary, Demo National Accreditation Registry", created: `${issue.split("/").reverse().join("-")}T08:00:00Z`, ...extra,
});
const faculty = (i: I, count: number, extra: Partial<DocSpec> = {}): DocSpec => ({
  file: `${i.slug}-faculty-statement.pdf`, category: "FACULTY_RECORD", issuer: i.name, title: "Faculty Strength Statement",
  fields: [["Name of the Institution", i.name], ["Institution ID", i.code], ["Academic Year", ACADEMIC_YEAR], ["Total Faculty", String(count)], ["Date of Issue", "01/10/2026"]],
  body: "Statement of regular faculty on roll as on the date of issue. Faculty-wise details are maintained by the institution. (Synthetic.)",
  signedBy: `Registrar, ${i.name}`, created: "2026-10-01T09:00:00Z", ...extra,
});
const infra = (i: I, area: string, extra: Partial<DocSpec> = {}): DocSpec => ({
  file: `${i.slug}-built-up-area.pdf`, category: "INFRASTRUCTURE", issuer: "Registered Architect (Demo)", title: "Built-up Area Certificate",
  fields: [["Certificate No", `ARC/BUA/2026/${i.code.slice(-4)}`], ["Name of the Institution", i.name], ["Total Built-up Area", `${area} sq m`], ["Date of Issue", "10/09/2026"]],
  body: "Certified that the total built-up area available to the institution, as measured from approved drawings, is as stated above. Physical verification is outside the scope of this certificate. (Synthetic.)",
  signedBy: "Ar. Demo Consultant, Reg. No. DEMO-0001", created: "2026-09-10T09:00:00Z", ...extra,
});
const fee = (i: I, ref: string, extra: Partial<DocSpec> = {}): DocSpec => ({
  file: `${i.slug}-fee-receipt.pdf`, category: "FEE_RECEIPT", issuer: PAY, title: "Processing Fee Receipt",
  fields: [["Receipt No", ref], ["Name of the Institution", i.name], ["Institution ID", i.code], ["Amount Paid", "INR 1,50,000"], ["Date of Payment", "02/10/2026"]],
  body: "Receipt for the processing fee paid online. (Synthetic transaction — no real payment.)",
  created: "2026-10-02T11:00:00Z", ...extra,
});

const inst = (slug: string) => INSTITUTIONS.find((i) => i.slug === slug)!;

export interface DemoApplication {
  slug: string;
  scenario: string;
  explanation: string;
  submittedAt: string;
  programmes: { name: string; level: string; intake: number }[];
  documents: DocSpec[];
  /** Upload the same file again under another category (duplicate scenario). */
  duplicateAs?: { from: string; category: string }[];
  validate: boolean;
  verify: boolean;
  after?: "REQUEST_RECTIFICATION" | "FORWARD";
}

const sunrise = inst("sunrise"), lakeview = inst("lakeview"), meridian = inst("meridian"), coastal = inst("coastal"), northfield = inst("northfield"), riverside = inst("riverside"), highland = inst("highland"), greenfield = inst("greenfield"), valley = inst("valley");

export const APPLICATIONS: DemoApplication[] = [
  {
    slug: "sunrise", scenario: "Clean application",
    explanation: "All mandatory evidence present, fields consistent with the application and institutional records, and every simulated issuer check returns a match. Status: automated checks passed (not an approval).",
    submittedAt: "2026-10-06T09:30:00Z",
    programmes: sunrise.programmes.map((p) => ({ name: p.name, level: p.level, intake: p.approvedIntake })),
    documents: [prevApproval(sunrise, "DRA/EOA/2026/1001", "B.Tech Computer Science and Engineering", 120), affidavit(sunrise, "SIT/AFF/2027/014"), fireNoc(sunrise, "SFBA/NOC/2025/3301", "14/02/2025", "13/02/2028"), accreditation(sunrise, "DNAR/ACC/2024/0101", "B.Tech Computer Science and Engineering", "15/06/2024", "14/06/2029"), faculty(sunrise, 64), infra(sunrise, "18,500"), fee(sunrise, "DPL/TXN/2026/55001")],
    validate: true, verify: true,
  },
  {
    slug: "lakeview", scenario: "Missing mandatory document",
    explanation: "The fire-safety NOC (a mandatory checklist item) was not submitted. Validation failed and the scrutiny officer returned the application for rectification. A corrected NOC is available in samples/.",
    submittedAt: "2026-10-08T11:00:00Z",
    programmes: lakeview.programmes.map((p) => ({ name: p.name, level: p.level, intake: p.approvedIntake })),
    documents: [prevApproval(lakeview, "DRA/EOA/2026/1012", "B.Tech Civil Engineering", 60), affidavit(lakeview, "LCE/AFF/2027/021"), faculty(lakeview, 28), infra(lakeview, "9,200"), fee(lakeview, "DPL/TXN/2026/55012")],
    validate: true, verify: true, after: "REQUEST_RECTIFICATION",
  },
  {
    slug: "meridian", scenario: "Expired certificate",
    explanation: "The fire-safety NOC is valid only until 31/03/2027, which does not cover the start of academic year 2027-28 (01/07/2027) under demo rule DATE-VAL-001. The simulated issuer confirms the certificate itself is authentic. Upload samples/meridian-fire-noc-renewed.pdf as a replacement to demonstrate rectification.",
    submittedAt: "2026-10-12T10:15:00Z",
    programmes: meridian.programmes.map((p) => ({ name: p.name, level: p.level, intake: p.approvedIntake })),
    documents: [prevApproval(meridian, "DRA/EOA/2026/1027", "MBA", 120), affidavit(meridian, "MIM/AFF/2027/007"), fireNoc(meridian, "SFBA/NOC/2024/2207", "01/04/2024", "31/03/2027"), faculty(meridian, 22), infra(meridian, "6,400"), fee(meridian, "DPL/TXN/2026/55027")],
    validate: true, verify: true,
  },
  {
    slug: "coastal", scenario: "Cross-document mismatch",
    explanation: "The affidavit states institution ID AEG-INST-1044 while the application states AEG-INST-1040, and the previous approval letter states an intake of 60 against 100 applied for. The NOC abbreviates the name (\"Coastal Inst. of Pharmacy\") — normalisation correctly treats that as consistent.",
    submittedAt: "2026-10-14T14:40:00Z",
    programmes: coastal.programmes.map((p) => ({ name: p.name, level: p.level, intake: p.approvedIntake })),
    documents: [
      prevApproval(coastal, "DRA/EOA/2026/1040", "B.Pharm", 60),
      affidavit(coastal, "CIP/AFF/2027/011", {}, "AEG-INST-1044"),
      fireNoc(coastal, "SFBA/NOC/2025/3940", "03/03/2025", "02/03/2028", { fields: [["Certificate No", "SFBA/NOC/2025/3940"], ["Name of the Institution", "Coastal Inst. of Pharmacy"], ["Issuing Authority", "Demo State Fire & Building Safety Authority"], ["Date of Issue", "03/03/2025"], ["Valid Until", "02/03/2028"]] }),
      faculty(coastal, 31), infra(coastal, "7,800"), fee(coastal, "DPL/TXN/2026/55040"),
    ],
    validate: true, verify: true,
  },
  {
    slug: "northfield", scenario: "Issuer verification mismatch",
    explanation: "All automated rules pass, but the simulated accreditation registry holds a validity date of 09/01/2028 for the certificate while the submitted document states 09/01/2031. The mismatch is routed to the scrutiny & verification officer for human review.",
    submittedAt: "2026-10-16T09:05:00Z",
    programmes: northfield.programmes.map((p) => ({ name: p.name, level: p.level, intake: p.approvedIntake })),
    documents: [prevApproval(northfield, "DRA/EOA/2026/1055", "Bachelor of Architecture", 40), affidavit(northfield, "NSA/AFF/2027/002"), fireNoc(northfield, "SFBA/NOC/2025/4120", "20/05/2025", "19/05/2028"), accreditation(northfield, "DNAR/ACC/2025/0455", "Bachelor of Architecture", "10/01/2025", "09/01/2031"), faculty(northfield, 18), infra(northfield, "5,100"), fee(northfield, "DPL/TXN/2026/55055")],
    validate: true, verify: true,
  },
  {
    slug: "riverside", scenario: "Manual review required",
    explanation: "The fire-safety NOC is a scanned image processed by OCR; the simulated fire authority reports the verification as pending, the accreditation registry is unavailable, and the fee receipt has no matching record at the simulated ledger. None of these can be decided automatically.",
    submittedAt: "2026-10-19T12:20:00Z",
    programmes: riverside.programmes.map((p) => ({ name: p.name, level: p.level, intake: p.approvedIntake })),
    documents: [
      prevApproval(riverside, "DRA/EOA/2026/1063", "Diploma in Civil Engineering", 60),
      affidavit(riverside, "RPI/AFF/2027/019"),
      { ...fireNoc(riverside, "SFBA/NOC/2025/4480", "11/07/2025", "10/07/2028"), file: "riverside-fire-noc-scan.png", format: "png" },
      accreditation(riverside, "DNAR/ACC/2023/0630", "Diploma in Civil Engineering", "01/08/2023", "31/07/2028"),
      faculty(riverside, 24), infra(riverside, "8,300"), fee(riverside, "DPL/TXN/2026/55063"),
    ],
    validate: true, verify: true,
  },
  {
    slug: "highland", scenario: "Duplicate & suspicious metadata",
    explanation: "The same file was submitted as both the faculty statement and the infrastructure evidence. The fee receipt re-uses a transaction reference already submitted by another institution, its PDF metadata shows creation before the printed payment date and later modification with editing software, and the simulated ledger attributes that reference to a different institution. These are investigative indicators for human review — not a finding of fraud.",
    submittedAt: "2026-10-21T15:45:00Z",
    programmes: highland.programmes.map((p) => ({ name: p.name, level: p.level, intake: p.approvedIntake })),
    documents: [
      prevApproval(highland, "DRA/EOA/2026/1078", "B.Tech Mechanical Engineering", 60), affidavit(highland, "HIT/AFF/2027/005"), fireNoc(highland, "SFBA/NOC/2025/4602", "02/06/2025", "01/06/2028"), faculty(highland, 26),
      fee(highland, "DPL/TXN/2026/55001", { fields: [["Receipt No", "DPL/TXN/2026/55001"], ["Name of the Institution", highland.name], ["Institution ID", highland.code], ["Amount Paid", "INR 1,50,000"], ["Date of Payment", "15/10/2026"]], created: "2026-09-01T10:00:00Z", modified: "2026-10-16T18:30:00Z", producer: "PDF Editor Pro 9.2" }),
    ],
    duplicateAs: [{ from: "highland-faculty-statement.pdf", category: "INFRASTRUCTURE" }],
    validate: true, verify: true,
  },
  {
    slug: "greenfield", scenario: "Awaiting validation (draft)",
    explanation: "Documents have been uploaded and processed, but automated validation has not been run yet.",
    submittedAt: "2026-10-24T10:00:00Z",
    programmes: greenfield.programmes.map((p) => ({ name: p.name, level: p.level, intake: p.approvedIntake })),
    documents: [prevApproval(greenfield, "DRA/EOA/2026/1081", "B.Tech Artificial Intelligence and Data Science", 60), affidavit(greenfield, "GCE/AFF/2027/001"), fireNoc(greenfield, "SFBA/NOC/2026/5081", "12/01/2026", "11/01/2029"), fee(greenfield, "DPL/TXN/2026/55081")],
    validate: false, verify: false,
  },
  {
    slug: "valley", scenario: "Ready for authorised review",
    explanation: "Clean application whose automated checks and simulated issuer verification passed; the scrutiny officer forwarded it for authorised review. A senior official can record a review outcome.",
    submittedAt: "2026-10-03T08:45:00Z",
    programmes: valley.programmes.map((p) => ({ name: p.name, level: p.level, intake: p.approvedIntake })),
    documents: [prevApproval(valley, "DRA/EOA/2026/1094", "B.Tech Information Technology", 60), affidavit(valley, "VIT/AFF/2027/003"), fireNoc(valley, "SFBA/NOC/2026/5120", "05/01/2026", "04/01/2029"), faculty(valley, 30), infra(valley, "11,000"), fee(valley, "DPL/TXN/2026/55094")],
    validate: true, verify: true, after: "FORWARD",
  },
];

/** Synthetic issuer registry records. behaviour: NORMAL | PENDING | UNAVAILABLE. */
export const ISSUER_RECORDS = [
  // Fire / building safety
  ...[
    ["SFBA/NOC/2025/3301", sunrise, "2025-02-14", "2028-02-13"],
    ["SFBA/NOC/2024/2207", meridian, "2024-04-01", "2027-03-31"],
    ["SFBA/NOC/2026/7712", meridian, "2026-10-15", "2029-10-14"],
    ["SFBA/NOC/2025/3940", coastal, "2025-03-03", "2028-03-02"],
    ["SFBA/NOC/2025/4120", northfield, "2025-05-20", "2028-05-19"],
    ["SFBA/NOC/2025/4602", highland, "2025-06-02", "2028-06-01"],
    ["SFBA/NOC/2026/5081", greenfield, "2026-01-12", "2029-01-11"],
    ["SFBA/NOC/2026/5120", valley, "2026-01-05", "2029-01-04"],
    ["SFBA/NOC/2026/6012", lakeview, "2026-10-20", "2029-10-19"],
  ].map(([ref, i, issue, exp]) => ({ referenceNumber: ref as string, categoryCode: "NOC_PERMISSION", issuerName: FIRE, institutionName: (i as I).name, institutionCode: (i as I).code, issueDate: issue as string, expiryDate: exp as string, behaviour: "NORMAL" })),
  { referenceNumber: "SFBA/NOC/2025/4480", categoryCode: "NOC_PERMISSION", issuerName: FIRE, institutionName: riverside.name, institutionCode: riverside.code, issueDate: "2025-07-11", expiryDate: "2028-07-10", behaviour: "PENDING", note: "Simulates an issuer that has accepted the request but not yet responded." },
  // Accreditation
  { referenceNumber: "DNAR/ACC/2024/0101", categoryCode: "ACCREDITATION", issuerName: ACCRED, institutionName: sunrise.name, institutionCode: sunrise.code, issueDate: "2024-06-15", expiryDate: "2029-06-14", behaviour: "NORMAL" },
  { referenceNumber: "DNAR/ACC/2025/0455", categoryCode: "ACCREDITATION", issuerName: ACCRED, institutionName: northfield.name, institutionCode: northfield.code, issueDate: "2025-01-10", expiryDate: "2028-01-09", behaviour: "NORMAL", note: "Validity at source differs from the submitted certificate (mismatch scenario)." },
  { referenceNumber: "DNAR/ACC/2023/0630", categoryCode: "ACCREDITATION", issuerName: ACCRED, institutionName: riverside.name, institutionCode: riverside.code, issueDate: "2023-08-01", expiryDate: "2028-07-31", behaviour: "UNAVAILABLE", note: "Simulates a source outage for this record." },
  // Payments
  ...[["DPL/TXN/2026/55001", sunrise], ["DPL/TXN/2026/55012", lakeview], ["DPL/TXN/2026/55027", meridian], ["DPL/TXN/2026/55040", coastal], ["DPL/TXN/2026/55055", northfield], ["DPL/TXN/2026/55081", greenfield], ["DPL/TXN/2026/55094", valley]].map(([ref, i]) => ({
    referenceNumber: ref as string, categoryCode: "FEE_RECEIPT", issuerName: PAY, institutionName: (i as I).name, institutionCode: (i as I).code, issueDate: "2026-10-02", expiryDate: null, behaviour: "NORMAL",
  })),
];

/** Files written to samples/ for live demonstration uploads. */
export const SAMPLE_FILES: DocSpec[] = [
  fireNoc(meridian, "SFBA/NOC/2026/7712", "15/10/2026", "14/10/2029", { file: "meridian-fire-noc-renewed.pdf" }),
  fireNoc(lakeview, "SFBA/NOC/2026/6012", "20/10/2026", "19/10/2029", { file: "lakeview-fire-noc.pdf" }),
  affidavit(coastal, "CIP/AFF/2027/011-R", { file: "coastal-affidavit-corrected.pdf" }),
  { ...fireNoc(sunrise, "SFBA/NOC/2025/3301", "14/02/2025", "13/02/2028"), file: "scanned-noc-sample.png", format: "png" },
  accreditation(greenfield, "DNAR/ACC/2026/0810", "B.Tech Artificial Intelligence and Data Science", "01/09/2026", "31/08/2031", { file: "greenfield-accreditation.pdf" }),
  faculty(greenfield, 21, { file: "greenfield-faculty-statement.pdf" }),
  infra(greenfield, "7,200", { file: "greenfield-built-up-area.pdf" }),
];
