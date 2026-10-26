// Declarative rule definitions. Administrators configure rules by choosing a supported check
// type and its parameters; no user-supplied code or regular expressions are ever executed.
import { z } from "zod";

const categories = z.array(z.string().min(1)).default([]);
const outcome = z.enum(["FAIL", "REVIEW_REQUIRED"]);

export const CROSS_FIELDS = ["institutionName", "institutionCode", "academicYear", "programmeName", "approvedIntake"] as const;
export const DATE_FIELDS = ["issueDate", "expiryDate"] as const;
export const CONDITION_OPERATORS = ["exists", "equals", "not_equals", "contains", "gte", "lte", "one_of"] as const;

export const CHECK_SCHEMAS = {
  REQUIRED_DOCUMENTS: z.object({ includeOptional: z.boolean().default(false) }),
  REQUIRED_FIELDS: z.object({
    documentCategories: categories,
    fields: z.array(z.string().min(1)).min(1),
    missingOutcome: outcome.default("REVIEW_REQUIRED"),
  }),
  DATE_VALID_ON: z.object({
    documentCategories: categories,
    field: z.enum(DATE_FIELDS).default("expiryDate"),
    reference: z.enum(["ACADEMIC_YEAR_START", "RUN_DATE", "FIXED"]),
    fixedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    offsetDays: z.number().int().min(-3650).max(3650).default(0),
  }),
  DATE_ORDER: z.object({
    documentCategories: categories,
    earlierField: z.enum(DATE_FIELDS).default("issueDate"),
    laterField: z.enum(DATE_FIELDS).default("expiryDate"),
  }),
  DATE_NOT_FUTURE: z.object({ documentCategories: categories, field: z.enum(DATE_FIELDS).default("issueDate") }),
  CROSS_DOCUMENT_MATCH: z.object({ field: z.enum(CROSS_FIELDS), documentCategories: categories }),
  RECORD_MATCH: z.object({ aspect: z.enum(["INSTITUTION_IDENTITY", "PROGRAMME_INTAKE"]) }),
  DUPLICATE_FILE: z.object({ outcome: outcome.default("REVIEW_REQUIRED") }),
  DUPLICATE_REFERENCE: z.object({ documentCategories: categories, outcome: outcome.default("REVIEW_REQUIRED") }),
  FIELD_CONDITION: z.object({
    documentCategories: categories,
    field: z.string().min(1),
    operator: z.enum(CONDITION_OPERATORS),
    value: z.string().max(200).optional(),
    missingOutcome: outcome.default("REVIEW_REQUIRED"),
  }),
} as const;

export type CheckType = keyof typeof CHECK_SCHEMAS;
export const CHECK_TYPES = Object.keys(CHECK_SCHEMAS) as CheckType[];

export const CHECK_TYPE_LABELS: Record<CheckType, string> = {
  REQUIRED_DOCUMENTS: "Required documents present",
  REQUIRED_FIELDS: "Mandatory fields present",
  DATE_VALID_ON: "Validity covers a reference date",
  DATE_ORDER: "Date order (e.g. issue before expiry)",
  DATE_NOT_FUTURE: "Date is not in the future",
  CROSS_DOCUMENT_MATCH: "Cross-document consistency",
  RECORD_MATCH: "Match against institutional records",
  DUPLICATE_FILE: "Duplicate file detection",
  DUPLICATE_REFERENCE: "Repeated reference number",
  FIELD_CONDITION: "Field condition (rule builder)",
};

export type Definition<T extends CheckType> = z.infer<(typeof CHECK_SCHEMAS)[T]>;

export function parseDefinition(checkType: string, raw: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  const schema = CHECK_SCHEMAS[checkType as CheckType];
  if (!schema) return { ok: false, error: `Unsupported check type "${checkType}".` };
  const r = schema.safeParse(raw);
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".") || "definition"}: ${i.message}`).join("; ") };
  if (checkType === "DATE_VALID_ON") {
    const d = r.data as Definition<"DATE_VALID_ON">;
    if (d.reference === "FIXED" && !d.fixedDate) return { ok: false, error: "fixedDate is required when reference is FIXED." };
  }
  if (checkType === "FIELD_CONDITION") {
    const d = r.data as Definition<"FIELD_CONDITION">;
    if (d.operator !== "exists" && !d.value) return { ok: false, error: "A comparison value is required for this operator." };
    if ((d.operator === "gte" || d.operator === "lte") && Number.isNaN(Number(d.value))) return { ok: false, error: "gte/lte require a numeric value." };
  }
  return { ok: true, value: r.data };
}

/** Human-readable summary of a definition, used in the rule catalogue and reports. */
export function describeDefinition(checkType: string, def: Record<string, unknown>, categoryName: (c: string) => string = (c) => c): string {
  const cats = (def.documentCategories as string[] | undefined)?.length ? (def.documentCategories as string[]).map(categoryName).join(", ") : "all document categories";
  switch (checkType) {
    case "REQUIRED_DOCUMENTS":
      return `Every ${def.includeOptional ? "" : "mandatory "}checklist item for the application template must have an uploaded document.`;
    case "REQUIRED_FIELDS":
      return `For ${cats}: fields ${(def.fields as string[]).join(", ")} must be extractable. Missing → ${def.missingOutcome}.`;
    case "DATE_VALID_ON": {
      const ref = def.reference === "ACADEMIC_YEAR_START" ? "the start of the academic year" : def.reference === "RUN_DATE" ? "the validation date" : `${def.fixedDate}`;
      const off = def.offsetDays ? ` (${Number(def.offsetDays) > 0 ? "+" : ""}${def.offsetDays} days)` : "";
      return `For ${cats}: ${def.field} must be on or after ${ref}${off}.`;
    }
    case "DATE_ORDER":
      return `For ${cats}: ${def.earlierField} must not be later than ${def.laterField}.`;
    case "DATE_NOT_FUTURE":
      return `For ${cats}: ${def.field} must not be later than the validation date.`;
    case "CROSS_DOCUMENT_MATCH":
      return `For ${cats}: ${def.field} stated on documents must match the application (after normalisation).`;
    case "RECORD_MATCH":
      return def.aspect === "INSTITUTION_IDENTITY"
        ? "Institution name and identifier in the application must match the institutional record."
        : "Programmes and intake applied for must not exceed the institutional record.";
    case "DUPLICATE_FILE":
      return `The same file (identical SHA-256) must not be submitted as more than one document. Duplicate → ${def.outcome}.`;
    case "DUPLICATE_REFERENCE":
      return `For ${cats}: a reference number must not be repeated across different documents. Repeat → ${def.outcome}.`;
    case "FIELD_CONDITION":
      return `For ${cats}: ${def.field} ${String(def.operator).replace("_", " ")}${def.value !== undefined ? ` ${def.value}` : ""}.`;
    default:
      return checkType;
  }
}
