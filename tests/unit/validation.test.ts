import { describe, expect, it } from "vitest";
import { evaluateRules } from "@/lib/validation/engine";
import { parseDefinition } from "@/lib/validation/definitions";
import { deriveApplicationStatus, machineOutcome, summarize } from "@/lib/validation/status";
import { diffRuns } from "@/lib/validation/diff";
import { canTransition } from "@/lib/workflow/transitions";
import { context, doc, field, rule } from "../helpers/context";

describe("required documents", () => {
  const r = rule("DOC-REQ", "REQUIRED_DOCUMENTS", {});
  it("fails when a mandatory document is missing and ignores optional ones", () => {
    const ctx = context({ documents: [doc("AFFIDAVIT", [])] });
    const res = evaluateRules(ctx, [r]);
    expect(res.find((x) => x.categoryCode === "AFFIDAVIT")!.status).toBe("PASS");
    const noc = res.find((x) => x.categoryCode === "NOC_PERMISSION")!;
    expect(noc.status).toBe("FAIL");
    expect(noc.explanation).toContain("has not been submitted");
    expect(noc.nextAction).toContain("Upload");
    expect(res.find((x) => x.categoryCode === "ACCREDITATION")).toBeUndefined();
  });
});

describe("expiry / validity", () => {
  const r = rule("DATE-VAL", "DATE_VALID_ON", { documentCategories: ["NOC_PERMISSION"], field: "expiryDate", reference: "ACADEMIC_YEAR_START" });
  it("fails when validity ends before the academic year starts (worked example)", () => {
    const ctx = context({ academicYear: "2026-27", documents: [doc("NOC_PERMISSION", [field("expiryDate", "31/03/2026", "2026-03-31", 0.95, 2)])] });
    const [res] = evaluateRules(ctx, [r]);
    expect(res.status).toBe("FAIL");
    expect(res.explanation).toContain("does not cover the required date");
    expect(res.observed).toContain("page 2");
    expect(res.evidence[0].page).toBe(2);
    expect(res.ruleVersionNo).toBe(1);
  });
  it("passes when validity covers the date", () => {
    const ctx = context({ documents: [doc("NOC_PERMISSION", [field("expiryDate", "30/06/2030", "2030-06-30")])] });
    expect(evaluateRules(ctx, [r])[0].status).toBe("PASS");
  });
  it("routes to review when the date is missing or low-confidence (insufficient evidence ≠ failure)", () => {
    const missing = context({ documents: [doc("NOC_PERMISSION", [])] });
    expect(evaluateRules(missing, [r])[0].status).toBe("REVIEW_REQUIRED");
    const low = context({ documents: [doc("NOC_PERMISSION", [field("expiryDate", "31/03/2026", "2026-03-31", 0.4)])] });
    expect(evaluateRules(low, [r])[0].status).toBe("REVIEW_REQUIRED");
  });
  it("reports a processing failure distinctly", () => {
    const ctx = context({ documents: [doc("NOC_PERMISSION", [], { processingStatus: "FAILED", processingError: "OCR unavailable" })] });
    expect(evaluateRules(ctx, [r])[0].status).toBe("PROCESSING_FAILED");
  });
  it("detects issue date after expiry and future issue dates", () => {
    const d = doc("NOC_PERMISSION", [field("issueDate", "01/01/2028", "2028-01-01"), field("expiryDate", "01/01/2027", "2027-01-01")]);
    const ctx = context({ documents: [d] });
    const [order, future] = evaluateRules(ctx, [
      rule("ORD", "DATE_ORDER", { documentCategories: [] }),
      rule("FUT", "DATE_NOT_FUTURE", { documentCategories: [] }),
    ]);
    expect(order.status).toBe("FAIL");
    expect(future.status).toBe("FAIL");
  });
});

describe("cross-document consistency", () => {
  it("tolerates formatting differences but fails substantive mismatches", () => {
    const ctx = context({
      documents: [
        doc("AFFIDAVIT", [field("institutionName", "SUNRISE INST. OF TECHNOLOGY")]),
        doc("NOC_PERMISSION", [field("institutionName", "Sunset College of Engineering")]),
      ],
    });
    const res = evaluateRules(ctx, [rule("X-NAME", "CROSS_DOCUMENT_MATCH", { field: "institutionName" })]);
    expect(res[0].status).toBe("PASS");
    expect(res[1].status).toBe("FAIL");
    expect(res[1].explanation).toContain("mismatch");
    expect(res[1].evidence.map((e) => e.kind)).toEqual(["APPLICATION", "FIELD"]);
  });
  it("compares identifiers and intake against the matching programme", () => {
    const ctx = context({
      documents: [
        doc("AFFIDAVIT", [field("institutionCode", "AEG-INST-1044", "AEGINST1044")]),
        doc("PREVIOUS_APPROVAL", [field("programmeName", "B.Tech CSE"), field("approvedIntake", "90", "90")]),
      ],
    });
    const [code] = evaluateRules(ctx, [rule("X-ID", "CROSS_DOCUMENT_MATCH", { field: "institutionCode" })]);
    expect(code.status).toBe("FAIL");
    const [intake] = evaluateRules(ctx, [rule("X-INT", "CROSS_DOCUMENT_MATCH", { field: "approvedIntake", documentCategories: ["PREVIOUS_APPROVAL"] })]);
    expect(intake.status).toBe("FAIL");
    expect(intake.expected).toContain("120");
  });
  it("routes similar-but-different names to review", () => {
    const ctx = context({ documents: [doc("AFFIDAVIT", [field("institutionName", "Sunrise Institute of Technology and Research")])] });
    const [res] = evaluateRules(ctx, [rule("X-NAME", "CROSS_DOCUMENT_MATCH", { field: "institutionName" })]);
    expect(res.status).toBe("REVIEW_REQUIRED");
  });
});

describe("institutional records", () => {
  it("fails when intake exceeds the record and when identifier differs", () => {
    const ctx = context({ institutionCode: "AEG-INST-9999", programmes: [{ name: "B.Tech Computer Science and Engineering", level: "UG", intake: 180 }] });
    const id = evaluateRules(ctx, [rule("REC-ID", "RECORD_MATCH", { aspect: "INSTITUTION_IDENTITY" })]);
    expect(id.find((x) => x.subjectKey.endsWith("code"))!.status).toBe("FAIL");
    expect(id.find((x) => x.subjectKey.endsWith("name"))!.status).toBe("PASS");
    const [intake] = evaluateRules(ctx, [rule("REC-INT", "RECORD_MATCH", { aspect: "PROGRAMME_INTAKE" })]);
    expect(intake.status).toBe("FAIL");
  });
});

describe("duplicate detection", () => {
  it("flags identical files and repeated reference numbers for review", () => {
    const a = doc("FACULTY_RECORD", [field("referenceNumber", "REF-2025-1", "REF20251")], { sha256: "same" });
    const b = doc("INFRASTRUCTURE", [], { sha256: "same" });
    const c = doc("FEE_RECEIPT", [field("referenceNumber", "REF/2025/1", "REF20251")]);
    const ctx = context({ documents: [a, b, c] });
    const [file] = evaluateRules(ctx, [rule("DUP-F", "DUPLICATE_FILE", {})]);
    expect(file.status).toBe("REVIEW_REQUIRED");
    expect(file.evidence).toHaveLength(2);
    const [ref] = evaluateRules(ctx, [rule("DUP-R", "DUPLICATE_REFERENCE", { documentCategories: [] })]);
    expect(ref.status).toBe("REVIEW_REQUIRED");
  });
  it("passes when there are no duplicates", () => {
    const ctx = context({ documents: [doc("AFFIDAVIT", []), doc("NOC_PERMISSION", [])] });
    expect(evaluateRules(ctx, [rule("DUP-F", "DUPLICATE_FILE", {})])[0].status).toBe("PASS");
  });
});

describe("field conditions (rule builder)", () => {
  const ctx = context({ documents: [doc("INFRASTRUCTURE", [field("builtUpArea", "3,500", "3500")])] });
  it("evaluates numeric thresholds", () => {
    expect(evaluateRules(ctx, [rule("P1", "FIELD_CONDITION", { documentCategories: ["INFRASTRUCTURE"], field: "builtUpArea", operator: "gte", value: "4000" })])[0].status).toBe("FAIL");
    expect(evaluateRules(ctx, [rule("P2", "FIELD_CONDITION", { documentCategories: ["INFRASTRUCTURE"], field: "builtUpArea", operator: "lte", value: "4000" })])[0].status).toBe("PASS");
  });
  it("validates definitions and rejects unsafe/incomplete ones", () => {
    expect(parseDefinition("FIELD_CONDITION", { field: "x", operator: "gte", value: "abc" }).ok).toBe(false);
    expect(parseDefinition("FIELD_CONDITION", { field: "x", operator: "equals" }).ok).toBe(false);
    expect(parseDefinition("EVAL_JS", { code: "process.exit()" }).ok).toBe(false);
    expect(parseDefinition("DATE_VALID_ON", { reference: "FIXED" }).ok).toBe(false);
  });
  it("records an invalid stored definition as a processing failure instead of throwing", () => {
    const res = evaluateRules(ctx, [rule("BAD", "FIELD_CONDITION", { nonsense: true })]);
    expect(res[0].status).toBe("PROCESSING_FAILED");
  });
  it("marks rules for other templates as not applicable", () => {
    const res = evaluateRules(ctx, [rule("T", "DUPLICATE_FILE", {}, { appliesTo: ["NEW_INSTITUTION"] })]);
    expect(res[0].status).toBe("NOT_APPLICABLE");
  });
});

describe("status derivation and transitions", () => {
  it("computes machine outcome with technical failure precedence", () => {
    expect(machineOutcome(["PASS", "NOT_APPLICABLE"])).toBe("AUTO_PASSED");
    expect(machineOutcome(["PASS", "REVIEW_REQUIRED"])).toBe("REVIEW_REQUIRED");
    expect(machineOutcome(["FAIL", "REVIEW_REQUIRED"])).toBe("AUTO_FAILED");
    expect(machineOutcome(["FAIL", "PROCESSING_FAILED"])).toBe("PROCESSING_FAILED");
    expect(machineOutcome(["PASS"], 1)).toBe("REVIEW_REQUIRED");
    expect(summarize(["PASS", "FAIL", "FAIL"]).fail).toBe(2);
  });
  it("derives application status from open findings", () => {
    expect(deriveApplicationStatus([], "AUTO_PASSED")).toBe("AUTO_PASSED");
    expect(deriveApplicationStatus([{ outcomeClass: "REVIEW_REQUIRED" }], "AUTO_PASSED")).toBe("REVIEW_REQUIRED");
    expect(deriveApplicationStatus([{ outcomeClass: "FAIL" }, { outcomeClass: "REVIEW_REQUIRED" }], "AUTO_FAILED")).toBe("AUTO_FAILED");
    // All exceptions human-resolved: never reported as an automated pass.
    expect(deriveApplicationStatus([], "AUTO_FAILED")).toBe("REVIEW_REQUIRED");
  });
  it("rejects invalid transitions", () => {
    expect(canTransition("DRAFT", "PROCESSING")).toBe(true);
    expect(canTransition("DRAFT", "CLOSED")).toBe(false);
    expect(canTransition("AUTO_FAILED", "READY_FOR_AUTHORIZED_REVIEW")).toBe(false);
    expect(canTransition("CLOSED", "PROCESSING")).toBe(false);
    expect(canTransition("READY_FOR_AUTHORIZED_REVIEW", "CLOSED")).toBe(true);
  });
  it("diffs runs result-by-result", () => {
    const changes = diffRuns(
      [{ subjectKey: "a", ruleCode: "R", ruleName: "R", subjectLabel: "x", status: "FAIL", observed: "2026-03-31" }],
      [{ subjectKey: "a", ruleCode: "R", ruleName: "R", subjectLabel: "x", status: "PASS", observed: "2028-03-31" }, { subjectKey: "b", ruleCode: "R", ruleName: "R", subjectLabel: "y", status: "FAIL", observed: null }],
    );
    expect(changes.map((c) => c.kind).sort()).toEqual(["IMPROVED", "NEW"]);
  });
});
