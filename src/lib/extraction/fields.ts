// Configurable field schema and the label-anchored field extractor.
// Extraction never invents values: a field that cannot be located is recorded as NOT_FOUND
// with a null value and zero confidence.
import { findDate } from "./dates";
import { normalizeAcademicYear, normalizeIdentifier, normalizeName, normalizeProgramme, normalizeWhitespace, parseInteger } from "./normalize";
import type { BBox, ExtractedFieldDraft, ExtractionMethod, PageText, TextLine } from "./types";

export type FieldType = "text" | "name" | "date" | "integer" | "identifier" | "academicYear" | "programme" | "indicator";

export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  /** Label aliases as they appear on documents. Matched case-insensitively, followed by ":" or "-". */
  labels: string[];
  description: string;
}

export const FIELD_DEFINITIONS: FieldDefinition[] = [
  {
    key: "institutionName",
    label: "Institution name",
    type: "name",
    labels: ["Name of the Institution", "Name of Institution", "Institution Name", "Name of the Institute", "Institute Name", "Institution"],
    description: "Name of the institution the document refers to.",
  },
  {
    key: "institutionCode",
    label: "Institution identifier",
    type: "identifier",
    labels: ["Institution ID", "Institution Code", "Institute ID", "Institute Code", "Permanent ID", "Institution Identifier"],
    description: "Institution identifier stated on the document.",
  },
  {
    key: "issuingAuthority",
    label: "Issuing authority",
    type: "text",
    labels: ["Issuing Authority", "Issued by", "Issuer"],
    description: "Authority that issued the document.",
  },
  {
    key: "referenceNumber",
    label: "Document reference number",
    type: "identifier",
    labels: ["Certificate No", "Certificate Number", "Reference No", "Reference Number", "Ref No", "Ref. No", "Permission No", "NOC No", "Receipt No", "Receipt Number", "Letter No", "Approval No", "Affidavit No", "Transaction ID"],
    description: "Reference or serial number of the document.",
  },
  {
    key: "issueDate",
    label: "Issue date",
    type: "date",
    labels: ["Date of Issue", "Issue Date", "Issued on", "Date of Payment", "Payment Date", "Dated", "Date"],
    description: "Date on which the document was issued.",
  },
  {
    key: "expiryDate",
    label: "Expiry date",
    type: "date",
    labels: ["Valid Until", "Valid Upto", "Valid up to", "Valid till", "Expiry Date", "Date of Expiry", "Validity"],
    description: "Date until which the document is valid.",
  },
  {
    key: "programmeName",
    label: "Programme name",
    type: "programme",
    labels: ["Programme", "Program", "Course", "Programme Name"],
    description: "Programme/course the document relates to.",
  },
  {
    key: "approvedIntake",
    label: "Approved intake",
    type: "integer",
    labels: ["Approved Intake", "Sanctioned Intake", "Intake"],
    description: "Approved/sanctioned intake for the programme.",
  },
  {
    key: "academicYear",
    label: "Academic year",
    type: "academicYear",
    labels: ["Academic Year", "Academic Session", "Session"],
    description: "Academic year the document applies to.",
  },
  {
    key: "accreditationStatus",
    label: "Accreditation details",
    type: "text",
    labels: ["Accreditation Status", "Accreditation Grade", "Grade", "Accreditation"],
    description: "Accreditation grade/status stated on the certificate.",
  },
  {
    key: "builtUpArea",
    label: "Built-up area (sq m)",
    type: "integer",
    labels: ["Total Built-up Area", "Built-up Area", "Built up Area", "Total Built up Area"],
    description: "Built-up area stated on infrastructure evidence.",
  },
  {
    key: "facultyCount",
    label: "Faculty count",
    type: "integer",
    labels: ["Total Faculty", "Number of Faculty", "Faculty Count", "Regular Faculty"],
    description: "Number of faculty stated on the faculty record.",
  },
  {
    key: "amount",
    label: "Amount (INR)",
    type: "integer",
    labels: ["Amount Paid", "Amount", "Fee Amount"],
    description: "Amount stated on a payment receipt.",
  },
  {
    key: "signatureIndicator",
    label: "Signature / seal indicator",
    type: "indicator",
    labels: [],
    description: "Observable cue that a signature or seal is present. Not a cryptographic verification.",
  },
];

export const FIELD_BY_KEY = new Map(FIELD_DEFINITIONS.map((f) => [f.key, f]));
export const fieldLabel = (key: string) => FIELD_BY_KEY.get(key)?.label ?? key;

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface Candidate {
  value: string;
  normalized: string | null;
  confidence: number;
  page: number | null;
  excerpt: string;
  bbox: BBox | null;
  method: ExtractionMethod;
  warning?: string;
}

/** Interpret a raw value string according to the field type. */
export function interpretValue(type: FieldType, raw: string): { value: string; normalized: string | null } | null {
  const v = normalizeWhitespace(raw.replace(/^[\s:–\-|]+/, ""));
  if (!v) return null;
  switch (type) {
    case "date": {
      const d = findDate(v);
      if (!d) return { value: v, normalized: null };
      return { value: d.raw, normalized: d.iso };
    }
    case "integer": {
      const n = parseInteger(v);
      return n === null ? { value: v, normalized: null } : { value: v.match(/-?\d[\d,]*/)![0], normalized: String(n) };
    }
    case "academicYear": {
      const m = /\d{4}\s*[-–/]\s*\d{2,4}/.exec(v);
      if (!m) return { value: v, normalized: null };
      return { value: m[0], normalized: normalizeAcademicYear(m[0]) };
    }
    case "identifier": {
      const m = /[A-Za-z0-9][A-Za-z0-9/\-._]*[A-Za-z0-9]/.exec(v);
      if (!m) return { value: v, normalized: null };
      return { value: m[0], normalized: normalizeIdentifier(m[0]) };
    }
    case "name":
      return { value: v, normalized: normalizeName(v) };
    case "programme":
      return { value: v, normalized: normalizeProgramme(v) };
    default:
      return { value: v, normalized: normalizeWhitespace(v.toLowerCase()) };
  }
}

function lineMethod(page: PageText, labelled: boolean): ExtractionMethod {
  if (page.method === "OCR") return labelled ? "OCR_LABEL" : "OCR_HEURISTIC";
  return labelled ? "PDF_TEXT_LABEL" : "PDF_TEXT_HEURISTIC";
}

function mergeBBox(a: BBox | null, b: BBox | null): BBox | null {
  if (!a) return b;
  if (!b) return a;
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

function findLabelled(def: FieldDefinition, pages: PageText[]): Candidate | null {
  // Longer aliases first so "Date of Issue" wins over "Date".
  const aliases = [...def.labels].sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    const re = new RegExp(`(?:^|[\\s|•])${escapeRe(alias).replace(/\\ /g, "\\s+")}\\.?\\s*[:：\\-–]\\s*(.*)$`, "i");
    for (const page of pages) {
      for (let i = 0; i < page.lines.length; i++) {
        const line: TextLine = page.lines[i];
        const m = re.exec(line.text);
        if (!m) continue;
        let raw = m[1].split(/\s{3,}|\s\|\s/)[0];
        let bbox = line.bbox;
        let confidence = page.method === "OCR" ? 0.9 * line.confidence : 0.95;
        let excerpt = line.text;
        // Label on one line, value on the next.
        if (!raw.trim() && i + 1 < page.lines.length) {
          const next = page.lines[i + 1];
          raw = next.text;
          bbox = mergeBBox(bbox, next.bbox);
          confidence *= 0.85;
          excerpt = `${line.text} ${next.text}`;
        }
        const interpreted = interpretValue(def.type, raw);
        if (!interpreted) continue;
        let warning: string | undefined;
        const typed = ["date", "integer", "academicYear"].includes(def.type);
        if (typed && interpreted.normalized === null) {
          confidence = Math.min(confidence, 0.3);
          warning = `${def.label}: value "${interpreted.value}" could not be parsed as ${def.type === "date" ? "a valid date" : def.type}.`;
        }
        return {
          value: interpreted.value,
          normalized: interpreted.normalized,
          confidence: round(confidence),
          page: page.page,
          excerpt: excerpt.slice(0, 300),
          bbox,
          method: lineMethod(page, true),
          warning,
        };
      }
    }
  }
  return null;
}

const INSTITUTION_HEURISTIC = /\b([A-Z][A-Za-z.&'\- ]{2,80}?\b(?:Institute|College|University|Polytechnic|School|Academy)\b(?:\s+of\s+[A-Z][A-Za-z&\- ]{2,60})?)/;

function findHeuristic(def: FieldDefinition, pages: PageText[], meta: Record<string, unknown>): Candidate | null {
  if (def.key === "institutionName") {
    for (const page of pages) {
      for (const line of page.lines) {
        const m = INSTITUTION_HEURISTIC.exec(line.text);
        if (m && !/council|authority|department|board/i.test(m[1])) {
          const value = normalizeWhitespace(m[1]);
          return { value, normalized: normalizeName(value), confidence: round(0.5 * (page.method === "OCR" ? line.confidence : 1)), page: page.page, excerpt: line.text.slice(0, 300), bbox: line.bbox, method: lineMethod(page, false) };
        }
      }
    }
  }
  if (def.key === "academicYear") {
    for (const page of pages) {
      for (const line of page.lines) {
        const m = /\b(20\d{2})\s*[-–/]\s*(\d{2}|20\d{2})\b/.exec(line.text);
        const norm = m ? normalizeAcademicYear(m[0]) : null;
        if (m && norm) {
          return { value: m[0], normalized: norm, confidence: round(0.5 * (page.method === "OCR" ? line.confidence : 1)), page: page.page, excerpt: line.text.slice(0, 300), bbox: line.bbox, method: lineMethod(page, false) };
        }
      }
    }
  }
  if (def.key === "signatureIndicator") {
    if (meta.IsSignaturesPresent === true) {
      return { value: "PDF signature field present (not cryptographically validated)", normalized: "pdf_signature_field", confidence: 0.7, page: null, excerpt: "PDF document structure reports a signature field.", bbox: null, method: "PDF_STRUCTURE" };
    }
    for (const page of pages) {
      for (const line of page.lines) {
        if (/digitally signed by|\bsignature\b|\bsigned\b|\bseal\b|\bstamp\b/i.test(line.text)) {
          return { value: `Text cue present: "${normalizeWhitespace(line.text).slice(0, 80)}"`, normalized: "text_cue", confidence: round(0.5 * (page.method === "OCR" ? line.confidence : 1)), page: page.page, excerpt: line.text.slice(0, 300), bbox: line.bbox, method: lineMethod(page, false) };
        }
      }
    }
  }
  return null;
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Extract structured fields from page text. Every field in `expectedKeys` produces a draft —
 * NOT_FOUND when absent — and any other defined field found on the document is included too.
 */
export function extractFields(
  pages: PageText[],
  expectedKeys: string[],
  meta: Record<string, unknown> = {},
): { fields: ExtractedFieldDraft[]; warnings: string[] } {
  const fields: ExtractedFieldDraft[] = [];
  const warnings: string[] = [];
  for (const def of FIELD_DEFINITIONS) {
    const candidate = (def.labels.length ? findLabelled(def, pages) : null) ?? findHeuristic(def, pages, meta);
    const expected = expectedKeys.includes(def.key);
    if (!candidate) {
      if (expected) {
        fields.push({ key: def.key, label: def.label, value: null, normalizedValue: null, confidence: 0, page: null, excerpt: null, bbox: null, method: "NOT_FOUND" });
      }
      continue;
    }
    if (candidate.warning) warnings.push(candidate.warning);
    fields.push({
      key: def.key,
      label: def.label,
      value: candidate.value,
      normalizedValue: candidate.normalized,
      confidence: candidate.confidence,
      page: candidate.page ?? null,
      excerpt: candidate.excerpt,
      bbox: candidate.bbox,
      method: candidate.method,
    });
  }
  const missing = fields.filter((f) => f.method === "NOT_FOUND").map((f) => f.label);
  if (missing.length) warnings.push(`Expected field(s) not located: ${missing.join(", ")}.`);
  return { fields, warnings };
}
