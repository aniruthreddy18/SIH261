// Local AI extraction fallback. Runs only for expected fields that label-anchored extraction
// could not locate, and only on this machine (no network). Safeguards, in order:
//   1. Extractive model: an answer is always a verbatim span of the document text.
//   2. Type validation: dates must parse, counts must be plain numbers, authorities must name an
//      organisation, etc. The SQuAD model always returns *some* span, so this is what rejects
//      answers to questions the document does not answer.
//   3. Distinctness: a span already used by another field is never reused for a second field.
//   4. Minimum score; confidence is capped below label-anchored extraction.
//   5. Every value is stored with method AI_QA, and validation rules treat it as unconfirmed
//      until a reviewer confirms it (see needsConfirmation in the validation engine).
import fs from "node:fs";
import path from "node:path";
import { findDate } from "../dates";
import { FIELD_BY_KEY, interpretValue } from "../fields";
import { normalizeWhitespace } from "../normalize";
import type { BBox, ExtractedFieldDraft, PageText } from "../types";
import { BertQa, type QaAnswer } from "./bert-qa";
import { WordPieceTokenizer } from "./wordpiece";

export const AI_MODEL = {
  name: "BERT-SQuAD int8",
  description: "BERT-base (uncased) fine-tuned for extractive question answering on SQuAD v1.1, int8-quantised.",
  file: "bertsquad-12-int8.onnx",
  url: "https://media.githubusercontent.com/media/onnx/models/main/validated/text/machine_comprehension/bert-squad/model/bertsquad-12-int8.onnx",
  source: "ONNX Model Zoo (github.com/onnx/models)",
  license: "Apache-2.0",
  sha256: "24325bdf732256859e07a385d2f363a6839b20b2bb4a57ac362b3982fc8ce121",
  sizeBytes: 124_565_601,
  runtime: "ONNX Runtime (onnxruntime-node), CPU, offline",
} as const;

/** Minimum model score for an answer to be considered at all. */
const MIN_SCORE = 0.25;
/** AI suggestions are never presented as more certain than this. */
const MAX_CONFIDENCE = 0.75;

const ORG_WORDS = /\b(authority|department|directorate|board|council|registry|commission|ministry|office|government|corporation|university|bureau|agency|services|municipal)\b/i;
const INSTITUTION_WORDS = /\b(institute|institution|college|university|polytechnic|school|academy)\b/i;
const PLAIN_COUNT = /^\s*(?:rs\.?|inr|₹)?\s*\d[\d,]*(?:\.\d+)?\s*(?:\/-|sq\.?\s*m|square metres?|sqm|seats|students|faculty|members)?\s*$/i;

interface AiFieldSpec {
  questions: string[];
  /** Returns a rejection reason, or null when the answer is acceptable for this field. */
  validate?: (text: string) => string | null;
}

const isCount = (t: string) => (PLAIN_COUNT.test(t) && !findDate(t) ? null : "not a plain number");

/** Questions per field (tuned on the synthetic samples) and field-specific plausibility checks. */
export const AI_FIELD_SPECS: Record<string, AiFieldSpec> = {
  referenceNumber: { questions: ["What is the certificate number?", "What is the reference number?"], validate: (t) => (/\d/.test(t) && t.length >= 4 && !findDate(t) && !/\s{2,}/.test(t) ? null : "not an identifier") },
  issueDate: { questions: ["On what date was it issued?", "When was the certificate granted?"] },
  expiryDate: { questions: ["Until what date is it valid?", "Until when does the certificate remain in force?"] },
  institutionName: { questions: ["What is the name of the institution?", "Which college or institute?"], validate: (t) => (INSTITUTION_WORDS.test(t) && t.length <= 120 ? null : "does not name an institution") },
  issuingAuthority: { questions: ["Which authority issued it?", "Who issued the certificate?"], validate: (t) => (ORG_WORDS.test(t) && t.length <= 120 ? null : "does not name an issuing organisation") },
  institutionCode: { questions: ["What is the institution ID?", "What is the institution code?"], validate: (t) => (/\d/.test(t) && /^[A-Za-z0-9/\-._]+$/.test(t.trim()) ? null : "not an identifier") },
  programmeName: { questions: ["Which programme or course is it for?"], validate: (t) => (/[a-z]/i.test(t) && t.length <= 120 && !INSTITUTION_WORDS.test(t) ? null : "not a programme name") },
  approvedIntake: { questions: ["What is the approved intake?", "How many seats are approved?"], validate: isCount },
  academicYear: { questions: ["Which academic year is it for?"] },
  accreditationStatus: { questions: ["What is the accreditation status or grade?"], validate: (t) => (t.length <= 80 ? null : "too long") },
  builtUpArea: { questions: ["What is the total built-up area?"], validate: isCount },
  facultyCount: { questions: ["How many faculty members are there?"], validate: isCount },
  amount: { questions: ["What amount was paid?"], validate: isCount },
};

export interface AiStatus {
  enabled: boolean;
  available: boolean;
  reason?: string;
  modelPath: string;
}

export interface AiExtractionResult {
  fields: ExtractedFieldDraft[];
  /** Human-readable notes on what was suggested or rejected (stored as processing warnings). */
  notes: string[];
}

function resolveModelPath(): string {
  return process.env.AI_MODEL_PATH || path.join(process.cwd(), "models", "bert-squad", AI_MODEL.file);
}

function resolveVocabPath(): string {
  return path.join(process.cwd(), "node_modules", "bert-tokenizer", "assets", "vocab.json");
}

/** The question-answering engine the extractor needs (BertQa in production, a stub in tests). */
export interface QaEngine {
  answer(questions: string[], context: string): Promise<(QaAnswer | null)[]>;
}

export class LocalAiExtractor {
  private qa: Promise<QaEngine> | null = null;

  /** `engine` replaces the ONNX model (tests); by default the model is loaded on first use. */
  constructor(engine?: QaEngine) {
    if (engine) this.qa = Promise.resolve(engine);
  }

  status(): AiStatus {
    const modelPath = resolveModelPath();
    if (process.env.AI_EXTRACTION_ENABLED === "false") return { enabled: false, available: false, reason: "Disabled (AI_EXTRACTION_ENABLED=false).", modelPath };
    if (this.qa && !fs.existsSync(modelPath)) return { enabled: true, available: true, modelPath }; // injected engine
    if (!fs.existsSync(modelPath)) return { enabled: true, available: false, reason: "Model not installed. Run `npm run ai:setup` once to download it.", modelPath };
    if (!fs.existsSync(resolveVocabPath())) return { enabled: true, available: false, reason: "Tokenizer vocabulary missing. Run `npm install`.", modelPath };
    return { enabled: true, available: true, modelPath };
  }

  private load(): Promise<QaEngine> {
    if (!this.qa) {
      this.qa = (async () => {
        const vocab = JSON.parse(fs.readFileSync(resolveVocabPath(), "utf8")) as string[];
        return BertQa.load(resolveModelPath(), new WordPieceTokenizer(vocab));
      })();
      this.qa.catch(() => (this.qa = null));
    }
    return this.qa;
  }

  /**
   * Suggest values for `keys` (fields the label extractor did not find). `existing` are the fields
   * already extracted from the same document; their values are never reused for another field.
   */
  async extract(pages: PageText[], keys: string[], existing: ExtractedFieldDraft[]): Promise<AiExtractionResult> {
    const wanted = keys.filter((k) => AI_FIELD_SPECS[k] && FIELD_BY_KEY.has(k));
    if (!wanted.length) return { fields: [], notes: [] };
    const { context, locate } = buildContext(pages);
    if (!context.trim()) return { fields: [], notes: [] };

    const qa = await this.load();
    const questions = wanted.flatMap((k) => AI_FIELD_SPECS[k].questions.map((q) => ({ key: k, q })));
    const answers = await qa.answer(questions.map((x) => x.q), context);

    const used: { start: number; end: number }[] = [];
    const takenValues = existing.filter((f) => f.value).map((f) => squash(f.value!));
    const fields: ExtractedFieldDraft[] = [];
    const notes: string[] = [];
    for (const key of wanted) {
      const def = FIELD_BY_KEY.get(key)!;
      const candidates = questions
        .map((x, i) => (x.key === key ? answers[i] : null))
        .filter((a): a is QaAnswer => a !== null)
        .sort((a, b) => b.score - a.score);
      let accepted: { a: QaAnswer; value: string; normalized: string | null; score: number } | null = null;
      let rejection: string | null = null;
      for (const a of candidates) {
        const text = normalizeWhitespace(a.text.replace(/^[\s:–\-|,;]+|[\s:–\-|,;.]+$/g, ""));
        if (a.score < MIN_SCORE) { rejection ??= `low model score (${Math.round(a.score * 100)}%)`; continue; }
        if (!text) continue;
        if (used.some((u) => a.start < u.end && u.start < a.end) || takenValues.some((v) => overlapsValue(v, squash(text)))) { rejection ??= "text already used by another field"; continue; }
        const interpreted = interpretValue(def.type, text);
        if (!interpreted) continue;
        if (["date", "integer", "academicYear"].includes(def.type) && interpreted.normalized === null) { rejection ??= `"${text}" is not a valid ${def.type === "date" ? "date" : def.type}`; continue; }
        const why = AI_FIELD_SPECS[key].validate?.(text) ?? null;
        if (why) { rejection ??= `"${text}" ${why}`; continue; }
        // Agreement between differently phrased questions raises the score (noisy-OR).
        const agreeing = candidates.filter((c) => c !== a && c.start === a.start && c.end === a.end);
        const score = agreeing.reduce((s, c) => 1 - (1 - s) * (1 - c.score), a.score);
        accepted = { a, value: interpreted.value, normalized: interpreted.normalized, score };
        break;
      }
      if (!accepted) {
        if (rejection) notes.push(`AI suggestion for ${def.label} rejected: ${rejection}.`);
        continue;
      }
      const loc = locate(accepted.a.start, accepted.a.end);
      used.push({ start: accepted.a.start, end: accepted.a.end });
      takenValues.push(squash(accepted.value));
      fields.push({
        key,
        label: def.label,
        value: accepted.value,
        normalizedValue: accepted.normalized,
        confidence: Math.round(Math.min(MAX_CONFIDENCE, accepted.score) * loc.lineConfidence * 100) / 100,
        page: loc.page,
        excerpt: loc.excerpt.slice(0, 300),
        bbox: loc.bbox,
        method: "AI_QA",
      });
    }
    if (fields.length) notes.unshift(`Local AI model suggested ${fields.map((f) => f.label).join(", ")}; a reviewer must confirm these before rules rely on them.`);
    return { fields, notes };
  }
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
/** Same value, or one long value containing the other (short numbers like "60" only match exactly). */
const overlapsValue = (a: string, b: string) => !!a && !!b && (a === b || (Math.min(a.length, b.length) >= 6 && (a.includes(b) || b.includes(a))));

/** Join page lines into one context string and map character offsets back to page/line/bbox. */
function buildContext(pages: PageText[]) {
  const spans: { start: number; end: number; page: number; text: string; bbox: BBox | null; confidence: number }[] = [];
  let context = "";
  for (const p of pages) {
    for (const line of p.lines) {
      if (!line.text.trim()) continue;
      if (context) context += "\n";
      spans.push({ start: context.length, end: context.length + line.text.length, page: p.page, text: line.text, bbox: line.bbox, confidence: p.method === "OCR" ? line.confidence : 1 });
      context += line.text;
    }
    context += "\n";
  }
  const locate = (start: number, end: number) => {
    const hit = spans.filter((s) => s.start < end && start < s.end);
    const first = hit[0] ?? spans[0];
    const onPage = hit.filter((s) => s.page === first.page);
    const bbox = onPage.reduce<BBox | null>((b, s) => (!s.bbox ? b : !b ? s.bbox : [Math.min(b[0], s.bbox[0]), Math.min(b[1], s.bbox[1]), Math.max(b[2], s.bbox[2]), Math.max(b[3], s.bbox[3])]), null);
    // Excerpt centred on the answer, so the suggested value is visible in the quoted source text.
    const from = Math.max(0, start - 60);
    const to = Math.min(context.length, end + 40);
    const excerpt = `${from > 0 ? "…" : ""}${normalizeWhitespace(context.slice(from, to))}${to < context.length ? "…" : ""}`;
    return { page: first.page, excerpt, bbox, lineConfidence: Math.min(...onPage.map((s) => s.confidence), 1) };
  };
  return { context, locate };
}

// One extractor per server process (survives dev hot-reload).
const g = globalThis as unknown as { __aegisAi?: LocalAiExtractor };
export function getAiExtractor(): LocalAiExtractor {
  return (g.__aegisAi ??= new LocalAiExtractor());
}
