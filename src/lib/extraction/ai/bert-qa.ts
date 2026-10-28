// Extractive question answering with BERT-SQuAD (ONNX Model Zoo, int8, Apache-2.0) on
// onnxruntime-node, entirely on the local machine. Extractive means the model can only point at
// a span of the given text: it cannot produce words that are not in the document.
import fs from "node:fs";
import { SPECIAL, type Token, type WordPieceTokenizer } from "./wordpiece";

const MAX_SEQ = 256; // fixed input length of the exported model
const MAX_QUERY = 64;
const DOC_STRIDE = 128;
const MAX_ANSWER_TOKENS = 30;
const N_BEST = 20;

export interface QaAnswer {
  /** Character span [start, end) of the answer in the context. */
  start: number;
  end: number;
  text: string;
  /** Probability-like score in 0..1: p(start) × p(end) within the window's context tokens. */
  score: number;
}

type Ort = typeof import("onnxruntime-node");
type Session = import("onnxruntime-node").InferenceSession;

export class BertQa {
  private constructor(
    private readonly ort: Ort,
    private readonly session: Session,
    private readonly tokenizer: WordPieceTokenizer,
  ) {}

  static async load(modelPath: string, tokenizer: WordPieceTokenizer): Promise<BertQa> {
    if (!fs.existsSync(modelPath)) throw new Error(`Model file not found: ${modelPath}`);
    const ort: Ort = await import("onnxruntime-node");
    const session = await ort.InferenceSession.create(modelPath, { graphOptimizationLevel: "all", intraOpNumThreads: 2 });
    return new BertQa(ort, session, tokenizer);
  }

  /** Answer each question over the context; returns the best span per question (or null). */
  async answer(questions: string[], context: string): Promise<(QaAnswer | null)[]> {
    const ctxTokens = this.tokenizer.tokenize(context);
    if (ctxTokens.length === 0) return questions.map(() => null);
    const features: { q: number; ids: number[]; ctxOffset: number; ctx: Token[] }[] = [];
    questions.forEach((question, q) => {
      const qIds = this.tokenizer.tokenize(question).slice(0, MAX_QUERY).map((t) => t.id);
      const span = MAX_SEQ - qIds.length - 3;
      for (let s = 0; ; s += DOC_STRIDE) {
        const ctx = ctxTokens.slice(s, s + span);
        features.push({ q, ids: [SPECIAL.CLS, ...qIds, SPECIAL.SEP, ...ctx.map((t) => t.id), SPECIAL.SEP], ctxOffset: qIds.length + 2, ctx });
        if (s + span >= ctxTokens.length) break;
      }
    });

    const n = features.length;
    const inputIds = new BigInt64Array(n * MAX_SEQ);
    const mask = new BigInt64Array(n * MAX_SEQ);
    const segments = new BigInt64Array(n * MAX_SEQ);
    features.forEach((f, i) => {
      f.ids.forEach((id, j) => {
        inputIds[i * MAX_SEQ + j] = BigInt(id);
        mask[i * MAX_SEQ + j] = 1n;
        if (j >= f.ctxOffset) segments[i * MAX_SEQ + j] = 1n;
      });
    });
    const T = this.ort.Tensor;
    const out = await this.session.run({
      "unique_ids_raw_output___9:0": new T("int64", BigInt64Array.from({ length: n }, (_, i) => BigInt(i)), [n]),
      "input_ids:0": new T("int64", inputIds, [n, MAX_SEQ]),
      "input_mask:0": new T("int64", mask, [n, MAX_SEQ]),
      "segment_ids:0": new T("int64", segments, [n, MAX_SEQ]),
    });
    // Outputs are [1, n, MAX_SEQ]: unstack:0 = start logits, unstack:1 = end logits.
    const startAll = out["unstack:0"].data as Float32Array;
    const endAll = out["unstack:1"].data as Float32Array;

    const best: (QaAnswer | null)[] = questions.map(() => null);
    features.forEach((f, i) => {
      const lo = f.ctxOffset;
      const hi = f.ctxOffset + f.ctx.length; // exclusive
      const startLogits = Array.from(startAll.subarray(i * MAX_SEQ + lo, i * MAX_SEQ + hi));
      const endLogits = Array.from(endAll.subarray(i * MAX_SEQ + lo, i * MAX_SEQ + hi));
      const pStart = softmax(startLogits);
      const pEnd = softmax(endLogits);
      const starts = topIndexes(startLogits, N_BEST);
      const ends = topIndexes(endLogits, N_BEST);
      for (const s of starts) {
        for (const e of ends) {
          if (e < s || e - s + 1 > MAX_ANSWER_TOKENS) continue;
          const score = pStart[s] * pEnd[e];
          const current = best[f.q];
          if (current && current.score >= score) continue;
          const start = f.ctx[s].start;
          const end = f.ctx[e].end;
          best[f.q] = { start, end, text: context.slice(start, end), score };
        }
      }
    });
    return best;
  }
}

function softmax(xs: number[]): number[] {
  const m = Math.max(...xs);
  const ex = xs.map((x) => Math.exp(x - m));
  const sum = ex.reduce((a, b) => a + b, 0);
  return ex.map((x) => x / sum);
}

function topIndexes(xs: number[], k: number): number[] {
  return xs
    .map((x, i) => [x, i] as const)
    .sort((a, b) => b[0] - a[0])
    .slice(0, k)
    .map(([, i]) => i);
}
