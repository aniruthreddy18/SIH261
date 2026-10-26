// Normalisation used before comparing values across documents. The goal is to ignore
// formatting noise (case, punctuation, common abbreviations) without hiding substantive
// differences.

const NAME_ABBREVIATIONS: Record<string, string> = {
  inst: "institute",
  instt: "institute",
  insti: "institute",
  tech: "technology",
  techn: "technology",
  engg: "engineering",
  engineerng: "engineering",
  coll: "college",
  clg: "college",
  univ: "university",
  mgmt: "management",
  mgt: "management",
  sci: "science",
  sch: "school",
  poly: "polytechnic",
  pharm: "pharmacy",
  arch: "architecture",
  dept: "department",
  govt: "government",
  natl: "national",
  intl: "international",
};

const NAME_STOPWORDS = new Set(["the"]);

export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function normalizeName(input: string): string {
  const s = input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.,'"`’()\[\]{}:;]/g, " ")
    .replace(/[-–—/]/g, " ");
  return normalizeWhitespace(s)
    .split(" ")
    .filter((t) => t && !NAME_STOPWORDS.has(t))
    .map((t) => NAME_ABBREVIATIONS[t] ?? t)
    .join(" ");
}

export function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (ta.size === 0 && tb.size === 0) return 1;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export type ComparisonOutcome = "EXACT" | "EQUIVALENT" | "SIMILAR" | "DIFFERENT";

export interface Comparison {
  outcome: ComparisonOutcome;
  similarity: number;
  normalizedA: string;
  normalizedB: string;
}

export type NormalizationKind = "name" | "identifier" | "academicYear" | "programme" | "integer" | "date" | "text";

export function normalizeIdentifier(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeAcademicYear(s: string): string | null {
  const m = /(\d{4})\s*[-–/]\s*(\d{2,4})/.exec(s);
  if (!m) return null;
  const start = +m[1];
  let end = +m[2];
  if (m[2].length === 2) end = Math.floor(start / 100) * 100 + end;
  if (end !== start + 1) return null;
  return `${start}-${end}`;
}

const PROGRAMME_PHRASES: [RegExp, string][] = [
  [/\bbachelor of technology\b/g, "btech"],
  [/\bmaster of technology\b/g, "mtech"],
  [/\bbachelor of engineering\b/g, "be"],
  [/\bmaster of business administration\b/g, "mba"],
  [/\bbachelor of pharmacy\b/g, "bpharm"],
  [/\bbachelor of architecture\b/g, "barch"],
  [/\bmaster of computer applications\b/g, "mca"],
  [/\bb\s*\.?\s*tech\b/g, "btech"],
  [/\bm\s*\.?\s*tech\b/g, "mtech"],
  [/\bb\s*\.?\s*pharm(a|acy)?\b/g, "bpharm"],
  [/\bb\s*\.?\s*arch\b/g, "barch"],
  [/\bb\s*\.\s*e\b\.?/g, "be"],
  [/\bcse\b/g, "computer science and engineering"],
  [/\bece\b/g, "electronics and communication engineering"],
  [/\bme\b/g, "mechanical engineering"],
];

export function normalizeProgramme(input: string): string {
  let s = input.toLowerCase().replace(/&/g, " and ");
  for (const [re, rep] of PROGRAMME_PHRASES) s = s.replace(re, rep);
  s = s.replace(/[.,'"()\-–/:]/g, " ");
  return normalizeWhitespace(s)
    .split(" ")
    .filter((t) => t && t !== "in" && t !== "of" && t !== "the")
    .map((t) => NAME_ABBREVIATIONS[t] ?? t)
    .join(" ");
}

export function parseInteger(s: string): number | null {
  const m = /-?\d[\d,]*/.exec(s);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function normalizeValue(kind: NormalizationKind, value: string): string {
  switch (kind) {
    case "name":
      return normalizeName(value);
    case "identifier":
      return normalizeIdentifier(value);
    case "academicYear":
      return normalizeAcademicYear(value) ?? normalizeWhitespace(value.toLowerCase());
    case "programme":
      return normalizeProgramme(value);
    case "integer": {
      const n = parseInteger(value);
      return n === null ? normalizeWhitespace(value) : String(n);
    }
    default:
      return normalizeWhitespace(value.toLowerCase());
  }
}

/** Compare two values after normalisation appropriate to `kind`. */
export function compareValues(kind: NormalizationKind, a: string, b: string): Comparison {
  const normalizedA = normalizeValue(kind, a);
  const normalizedB = normalizeValue(kind, b);
  if (a.trim() === b.trim()) return { outcome: "EXACT", similarity: 1, normalizedA, normalizedB };
  if (normalizedA === normalizedB) return { outcome: "EQUIVALENT", similarity: 1, normalizedA, normalizedB };
  if (kind === "name" || kind === "programme" || kind === "text") {
    const similarity = tokenSimilarity(normalizedA, normalizedB);
    // One name fully contained in the other (e.g. an added "and Research") is a variation a
    // human should judge, not an automatic mismatch.
    const ta = normalizedA.split(" "), tb = normalizedB.split(" ");
    const [small, large] = ta.length <= tb.length ? [ta, new Set(tb)] : [tb, new Set(ta)];
    const contained = small.length >= 3 && small.every((t) => large.has(t));
    return { outcome: similarity >= 0.8 || contained ? "SIMILAR" : "DIFFERENT", similarity, normalizedA, normalizedB };
  }
  return { outcome: "DIFFERENT", similarity: 0, normalizedA, normalizedB };
}

/** Word-shingle Jaccard similarity used for near-duplicate content detection. */
export function shingleSimilarity(a: string, b: string, size = 3): number {
  const shingles = (s: string) => {
    const words = normalizeWhitespace(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ")).split(" ").filter(Boolean);
    const out = new Set<string>();
    for (let i = 0; i + size <= words.length; i++) out.add(words.slice(i, i + size).join(" "));
    return out;
  };
  const sa = shingles(a);
  const sb = shingles(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}
