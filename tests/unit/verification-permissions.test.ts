import { describe, expect, it } from "vitest";
import { createInstitutionRegistryAdapter, createOfficialProviderAdapter, createSyntheticIssuerAdapter, executeVerification, type SyntheticRecord } from "@/lib/verification/adapters";
import type { IssuerAdapter, VerificationRequest } from "@/lib/verification/types";
import { canAccessInstitution, hasPermission, type Actor } from "@/lib/auth/permissions";
import { detectAnomalies } from "@/lib/anomaly/detect";
import { context, doc, field } from "../helpers/context";

const record: SyntheticRecord = {
  referenceNumber: "DAR/ACC/2024/0101",
  categoryCode: "ACCREDITATION",
  issuerName: "Demo Accreditation Registry",
  institutionName: "Sunrise Institute of Technology",
  institutionCode: "PRV-INST-1001",
  issueDate: "2024-06-15",
  expiryDate: "2029-06-14",
  recordStatus: "ACTIVE",
  behaviour: "NORMAL",
  extra: {},
};

function req(over: Partial<VerificationRequest["submitted"]> = {}, ref: string | null = record.referenceNumber): VerificationRequest {
  return {
    categoryCode: "ACCREDITATION",
    referenceNumber: ref,
    submitted: { institutionName: "Sunrise Institute of Technology", institutionCode: "PRV-INST-1001", issueDate: "2024-06-15", expiryDate: "2029-06-14", programmeName: null, approvedIntake: null, ...over },
    asOf: "2026-10-26",
  };
}

const adapter = (recs: SyntheticRecord[], outage = false) =>
  createSyntheticIssuerAdapter({ lookup: async (r) => recs.find((x) => x.referenceNumber === r) ?? null, categories: ["ACCREDITATION"], simulateOutage: outage });

const opts = { timeoutMs: 500, maxRetries: 2, backoffMs: 1 };

describe("synthetic issuer adapter", () => {
  it("is labelled as simulated", () => {
    expect(adapter([]).sourceType).toBe("SIMULATED");
  });
  it("verifies a matching record", async () => {
    const { response } = await executeVerification(adapter([record]), req(), opts);
    expect(response.status).toBe("VERIFIED");
    expect(response.comparisons.every((c) => c.match !== false)).toBe(true);
  });
  it("detects mismatches field-by-field", async () => {
    const { response } = await executeVerification(adapter([record]), req({ expiryDate: "2030-06-14" }), opts);
    expect(response.status).toBe("MISMATCH_DETECTED");
    expect(response.comparisons.find((c) => c.field === "expiryDate")!.match).toBe(false);
  });
  it("reports expiry at source, no record, pending and unavailable", async () => {
    expect((await executeVerification(adapter([{ ...record, expiryDate: "2025-01-01" }]), req({ expiryDate: "2025-01-01" }), opts)).response.status).toBe("EXPIRED");
    expect((await executeVerification(adapter([record]), req({}, "UNKNOWN-1"), opts)).response.status).toBe("MANUAL_REVIEW_REQUIRED");
    expect((await executeVerification(adapter([{ ...record, behaviour: "PENDING" }]), req(), opts)).response.status).toBe("VERIFICATION_PENDING");
    const unavailable = await executeVerification(adapter([{ ...record, behaviour: "UNAVAILABLE" }]), req(), opts);
    expect(unavailable.response.status).toBe("SOURCE_UNAVAILABLE");
    expect(unavailable.attempts).toBe(3); // bounded retries
    expect((await executeVerification(adapter([record]), req({}, null), opts)).response.status).toBe("MANUAL_REVIEW_REQUIRED");
  });
  it("times out a hanging adapter instead of waiting forever", async () => {
    const hanging: IssuerAdapter = { id: "h", name: "h", sourceType: "SIMULATED", description: "", supports: () => true, verify: (_r, signal) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(Object.assign(new Error("x"), { name: "AbortError" })))) };
    const { response, attempts } = await executeVerification(hanging, req(), { timeoutMs: 20, maxRetries: 1, backoffMs: 1 });
    expect(response.status).toBe("SOURCE_UNAVAILABLE");
    expect(response.error).toContain("timed out");
    expect(attempts).toBe(2);
  });
});

describe("registry and official adapters", () => {
  it("compares previous-approval details with institutional records", async () => {
    const reg = createInstitutionRegistryAdapter({ lookup: async () => ({ code: "PRV-INST-1001", name: "Sunrise Institute of Technology", programmes: [{ name: "B.Tech Computer Science and Engineering", approvedIntake: 120, lastApprovedYear: "2026-27" }] }), categories: ["PREVIOUS_APPROVAL"] });
    const ok = await executeVerification(reg, { ...req({ programmeName: "B.Tech CSE", approvedIntake: "120" }), categoryCode: "PREVIOUS_APPROVAL" }, opts);
    expect(ok.response.status).toBe("VERIFIED");
    const bad = await executeVerification(reg, { ...req({ programmeName: "B.Tech CSE", approvedIntake: "180" }), categoryCode: "PREVIOUS_APPROVAL" }, opts);
    expect(bad.response.status).toBe("MISMATCH_DETECTED");
  });
  it("official provider is inactive without configuration", async () => {
    const off = createOfficialProviderAdapter({ categories: [], sourceType: "SANDBOX" });
    expect(off.configured).toBe(false);
    expect(off.supports("ACCREDITATION")).toBe(false);
    expect((await off.verify(req(), new AbortController().signal)).status).toBe("NOT_SUPPORTED");
  });
});

describe("permissions", () => {
  const applicant: Actor = { userId: "u1", name: "A", email: "a@x", role: "APPLICANT", institutionId: "inst-1" };
  const officer: Actor = { userId: "u2", name: "O", email: "o@x", role: "SCRUTINY_OFFICER", institutionId: null };
  it("isolates institutions for applicants", () => {
    expect(canAccessInstitution(applicant, "inst-1", "region-s")).toBe(true);
    expect(canAccessInstitution(applicant, "inst-2", "region-s")).toBe(false);
    expect(canAccessInstitution(officer, "inst-2", "region-s")).toBe(true);
  });
  it("limits a Regional officer to their Region; Bureau officers see every Region", () => {
    const regional: Actor = { ...officer, regionId: "region-s" };
    const bureau: Actor = { userId: "u3", name: "B", email: "b@x", role: "BUREAU_OFFICER", institutionId: null, regionId: null };
    expect(canAccessInstitution(regional, "inst-1", "region-s")).toBe(true);
    expect(canAccessInstitution(regional, "inst-2", "region-w")).toBe(false);
    expect(canAccessInstitution(regional, "inst-3", null)).toBe(false);
    expect(canAccessInstitution(bureau, "inst-2", "region-w")).toBe(true);
  });
  it("gives the new workflow roles only their own powers", () => {
    expect(hasPermission("COMMITTEE_MEMBER", "evc.report")).toBe(true);
    expect(hasPermission("COMMITTEE_MEMBER", "application.decide")).toBe(false);
    expect(hasPermission("COMMITTEE_MEMBER", "evc.schedule")).toBe(false);
    expect(hasPermission("BUREAU_OFFICER", "evc.schedule")).toBe(true);
    expect(hasPermission("BUREAU_OFFICER", "application.decide")).toBe(false);
    expect(hasPermission("APPLICANT", "compliance.submit")).toBe(true);
    expect(hasPermission("APPLICANT", "compliance.verify")).toBe(false);
    expect(hasPermission("ADMIN", "workflow.configure")).toBe(true);
    expect(hasPermission("SCRUTINY_OFFICER", "workflow.configure")).toBe(false);
  });
  it("restricts privileged actions by role", () => {
    expect(hasPermission("APPLICANT", "rules.manage")).toBe(false);
    expect(hasPermission("APPLICANT", "application.decide")).toBe(false);
    expect(hasPermission("APPLICANT", "verification.manual")).toBe(false);
    expect(hasPermission("SCRUTINY_OFFICER", "rules.manage")).toBe(false);
    expect(hasPermission("SENIOR_OFFICIAL", "application.decide")).toBe(true);
    expect(hasPermission("ADMIN", "users.manage")).toBe(true);
    expect(hasPermission("ADMIN", "application.decide")).toBe(false);
  });
  it("gives one officer role both scrutiny and verification duties, but not the final decision", () => {
    for (const p of ["validation.run", "verification.run", "verification.manual", "finding.review", "application.forward"] as const) {
      expect(hasPermission("SCRUTINY_OFFICER", p)).toBe(true);
    }
    expect(hasPermission("SCRUTINY_OFFICER", "application.decide")).toBe(false);
    expect(hasPermission("APPLICANT", "verification.manual")).toBe(false);
  });
});

describe("anomaly detection", () => {
  it("flags cross-application duplicates and metadata indicators as investigative, not fraud", () => {
    const d = doc("FEE_RECEIPT", [field("referenceNumber", "DPL/TXN/2026/55001", "DPLTXN202655001"), field("issueDate", "10/09/2026", "2026-09-10")], {
      sha256: "abc",
      metadata: { creationDate: "2026-01-01T00:00:00.000Z", modificationDate: "2026-09-20T00:00:00.000Z", producer: "Adobe Photoshop" },
    });
    const findings = detectAnomalies(context({ documents: [d] }), [
      { applicationId: "app-2", applicationReference: "PRV-2", documentId: "x", categoryCode: "FEE_RECEIPT", sha256: "zzz", referenceNormalized: "DPLTXN202655001" },
    ]);
    const types = findings.map((f) => f.type).sort();
    expect(types).toEqual(["CROSS_APPLICATION_REPEATED_REFERENCE", "METADATA_CREATED_BEFORE_ISSUE", "METADATA_EDITING_SOFTWARE", "METADATA_MODIFIED_AFTER_CREATION"]);
    expect(findings.every((f) => f.isDeterministic === false)).toBe(true);
    expect(findings.map((f) => f.title).join(" ").toLowerCase()).not.toContain("fraud");
  });
});
