import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalAiExtractor, type QaEngine } from "@/lib/extraction/ai/extractor";
import type { QaAnswer } from "@/lib/extraction/ai/bert-qa";
import { WordPieceTokenizer } from "@/lib/extraction/ai/wordpiece";
import { runExtractionPipeline } from "@/lib/extraction/pipeline";
import type { ExtractedFieldDraft, PageText } from "@/lib/extraction/types";
import { evaluateRules } from "@/lib/validation/engine";
import { context, doc, field, rule } from "../helpers/context";

const root = path.resolve(__dirname, "../..");
const vocab = JSON.parse(fs.readFileSync(path.join(root, "node_modules/bert-tokenizer/assets/vocab.json"), "utf8")) as string[];
const modelInstalled = fs.existsSync(path.join(root, "models/bert-squad/bertsquad-12-int8.onnx"));

describe("WordPiece tokenizer", () => {
  const tok = new WordPieceTokenizer(vocab);
  it("produces the original BERT-base-uncased ids", () => {
    expect(tok.tokenize("i like strawberries").map((t) => t.id)).toEqual([1045, 2066, 13137, 20968]);
    expect(tok.tokenize("The").map((t) => t.id)).toEqual([1996]);
  });
  it("splits punctuation and keeps offsets that map back to the source text", () => {
    const text = "Certificate No: SFBA/NOC/2026/9124";
    const tokens = tok.tokenize(text);
    const words = [...new Set(tokens.map((t) => text.slice(t.start, t.end)))];
    expect(words).toEqual(["Certificate", "No", ":", "SFBA", "/", "NOC", "2026", "9124"]);
  });
});

/** Stub engine: answers each question with a fixed span of the context (or nothing). */
function stub(answers: Record<string, { text: string; score: number } | null>): QaEngine {
  return {
    async answer(questions: string[], ctx: string): Promise<(QaAnswer | null)[]> {
      return questions.map((q) => {
        const a = answers[q];
        if (!a) return null;
        const start = ctx.indexOf(a.text);
        return start < 0 ? null : { start, end: start + a.text.length, text: a.text, score: a.score };
      });
    },
  };
}

const page = (lines: string[], method: PageText["method"] = "PDF_TEXT", confidence = 1): PageText => ({
  page: 1, method, width: 600, height: 800, confidence,
  lines: lines.map((text, i) => ({ text, bbox: [0.1, 0.1 + i * 0.05, 0.9, 0.14 + i * 0.05], confidence })),
});
const prose = page([
  "This clearance bears the number SFBA/NOC/2026/9124 and was granted on 3 March 2026",
  "by the Demo State Fire & Building Safety Authority. It shall remain in force until 2 March 2029.",
]);

describe("AI extraction safeguards", () => {
  beforeAll(() => { process.env.AI_EXTRACTION_ENABLED = "true"; });
  afterAll(() => { process.env.AI_EXTRACTION_ENABLED = "false"; });

  it("accepts a grounded, well-typed answer and links it to its source line", async () => {
    const ai = new LocalAiExtractor(stub({ "Until what date is it valid?": { text: "2 March 2029", score: 0.9 } }));
    const { fields, notes } = await ai.extract([prose], ["expiryDate"], []);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ key: "expiryDate", value: "2 March 2029", normalizedValue: "2029-03-02", method: "AI_QA", page: 1 });
    expect(fields[0].confidence).toBe(0.75); // capped below label-anchored extraction
    expect(fields[0].excerpt).toContain("in force until 2 March 2029");
    expect(fields[0].bbox).toEqual(prose.lines[1].bbox);
    expect(notes[0]).toContain("a reviewer must confirm");
  });

  it("rejects answers of the wrong type (the model always returns some span)", async () => {
    const ai = new LocalAiExtractor(stub({
      "Until what date is it valid?": { text: "Demo State Fire & Building Safety Authority", score: 0.9 },
      "What is the approved intake?": { text: "2 March 2029", score: 0.8 },
    }));
    const { fields, notes } = await ai.extract([prose], ["expiryDate", "approvedIntake"], []);
    expect(fields).toHaveLength(0);
    expect(notes.join(" ")).toMatch(/Expiry date rejected.*not a valid date/);
    expect(notes.join(" ")).toMatch(/Approved intake rejected.*not a plain number/);
  });

  it("never reuses text another field already holds", async () => {
    const existing: ExtractedFieldDraft[] = [{ key: "referenceNumber", label: "Document reference number", value: "SFBA/NOC/2026/9124", normalizedValue: "SFBANOC20269124", confidence: 0.95, page: 1, excerpt: null, bbox: null, method: "PDF_TEXT_LABEL" }];
    const ai = new LocalAiExtractor(stub({ "What is the institution ID?": { text: "SFBA/NOC/2026/9124", score: 0.6 } }));
    const { fields, notes } = await ai.extract([prose], ["institutionCode"], existing);
    expect(fields).toHaveLength(0);
    expect(notes[0]).toContain("already used by another field");
  });

  it("rejects low-score answers and scales confidence by OCR line confidence", async () => {
    const low = new LocalAiExtractor(stub({ "What is the certificate number?": { text: "SFBA/NOC/2026/9124", score: 0.1 } }));
    expect((await low.extract([prose], ["referenceNumber"], [])).fields).toHaveLength(0);
    const scanned = page(prose.lines.map((l) => l.text), "OCR", 0.8);
    const ok = new LocalAiExtractor(stub({ "What is the certificate number?": { text: "SFBA/NOC/2026/9124", score: 0.95 } }));
    expect((await ok.extract([scanned], ["referenceNumber"], [])).fields[0].confidence).toBe(0.6);
  });

  it("is used by the pipeline only for expected fields that labels could not locate", async () => {
    const asked: string[] = [];
    const ai = new LocalAiExtractor({ async answer(q) { asked.push(...q); return q.map(() => null); } });
    const pdf = fs.readFileSync(path.join(root, "samples/meridian-fire-noc-renewed.pdf"));
    const out = await runExtractionPipeline({ buffer: pdf, mimeType: "application/pdf", expectedFields: ["referenceNumber", "issueDate", "expiryDate", "institutionCode"], ai });
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((q) => /institution (ID|code)/.test(q))).toBe(true); // only the missing field
    expect(out.fields.find((f) => f.key === "expiryDate")?.method).toBe("PDF_TEXT_LABEL");
    expect(out.warnings.join(" ")).toContain("not located: Institution identifier");
  });
});

describe("validation rules treat AI suggestions as unconfirmed", () => {
  const ai = (key: string, value: string, normalized: string) => ({ ...field(key, value, normalized, 0.75), method: "AI_QA" });
  const validity = rule("DATE-VAL", "DATE_VALID_ON", { documentCategories: ["NOC_PERMISSION"], field: "expiryDate", reference: "ACADEMIC_YEAR_START" });

  it("routes to review instead of passing or failing", () => {
    const passing = context({ documents: [doc("NOC_PERMISSION", [ai("expiryDate", "2 March 2029", "2029-03-02")])] });
    const [p] = evaluateRules(passing, [validity]);
    expect(p.status).toBe("REVIEW_REQUIRED");
    expect(p.explanation).toContain("suggested by the local AI model");
    expect(p.evidence[0].label).toContain("AI suggestion");
    const failing = context({ documents: [doc("NOC_PERMISSION", [ai("expiryDate", "1 March 2026", "2026-03-01")])] });
    expect(evaluateRules(failing, [validity])[0].status).toBe("REVIEW_REQUIRED");
  });

  it("decides normally once a reviewer has confirmed the value", () => {
    const confirmed = { ...ai("expiryDate", "2 March 2029", "2029-03-02"), method: "REVIEWER_CORRECTION", corrected: true, confidence: 1 };
    expect(evaluateRules(context({ documents: [doc("NOC_PERMISSION", [confirmed])] }), [validity])[0].status).toBe("PASS");
  });

  it("does not fail a cross-document mismatch on an unconfirmed AI value", () => {
    const r = rule("XDOC", "CROSS_DOCUMENT_MATCH", { field: "institutionName", documentCategories: [] });
    const ctx = context({ documents: [doc("NOC_PERMISSION", [ai("institutionName", "Riverside Polytechnic Institute", "riverside polytechnic institute")])] });
    const [res] = evaluateRules(ctx, [r]);
    expect(res.status).toBe("REVIEW_REQUIRED");
  });
});

describe.skipIf(!modelInstalled)("local AI model (BERT-SQuAD) on sample documents", () => {
  beforeAll(() => { process.env.AI_EXTRACTION_ENABLED = "true"; });
  afterAll(() => { process.env.AI_EXTRACTION_ENABLED = "false"; });
  const expected = ["referenceNumber", "institutionName", "issuingAuthority", "issueDate", "expiryDate"];

  it("reads the certificate number and dates from a prose-only certificate", async () => {
    const pdf = fs.readFileSync(path.join(root, "samples/ai-demo-noc-prose.pdf"));
    const out = await runExtractionPipeline({ buffer: pdf, mimeType: "application/pdf", expectedFields: expected, ai: new LocalAiExtractor() });
    const f = Object.fromEntries(out.fields.map((x) => [x.key, x]));
    expect(f.referenceNumber).toMatchObject({ value: "SFBA/NOC/2026/9124", method: "AI_QA" });
    expect(f.issueDate).toMatchObject({ normalizedValue: "2026-03-03", method: "AI_QA" }); // not the 2 March inspection date
    expect(f.expiryDate).toMatchObject({ normalizedValue: "2029-03-02", method: "AI_QA" });
    expect(f.issuingAuthority).toMatchObject({ value: "Demo State Fire & Building Safety Authority", method: "AI_QA" });
    expect(f.institutionName).toMatchObject({ value: "Greenfield College of Engineering" });
  }, 120_000);

  it("is not used when labels already provide every expected field", async () => {
    const pdf = fs.readFileSync(path.join(root, "samples/meridian-fire-noc-renewed.pdf"));
    const out = await runExtractionPipeline({ buffer: pdf, mimeType: "application/pdf", expectedFields: expected, ai: new LocalAiExtractor() });
    expect(out.fields.some((x) => x.method === "AI_QA")).toBe(false);
  });
});
