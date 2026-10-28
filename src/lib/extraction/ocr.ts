// OCR adapter. The default engine is Tesseract (tesseract.js, WebAssembly) using the English
// language data bundled via the @tesseract.js-data/eng npm package — no network access needed.
// If OCR cannot run, callers receive an explicit OcrUnavailableError; OCR success is never faked.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BBox, TextLine } from "./types";

export interface OcrResult {
  width: number;
  height: number;
  lines: TextLine[];
  confidence: number;
  engine: string;
}

export interface OcrEngine {
  readonly name: string;
  status(): { available: boolean; reason?: string };
  recognize(image: Buffer): Promise<OcrResult>;
}

export class OcrUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "OcrUnavailableError";
  }
}

const OCR_TIMEOUT_MS = 90_000;

function resolveLangPath(): string | null {
  if (process.env.OCR_LANG_PATH) return process.env.OCR_LANG_PATH;
  const dir = path.join(process.cwd(), "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int");
  return fs.existsSync(path.join(dir, "eng.traineddata.gz")) ? dir : null;
}

type TesseractWorker = {
  recognize: (img: Buffer, opts?: object, output?: object) => Promise<{ data: TesseractData }>;
  terminate: () => Promise<unknown>;
};
interface TesseractLine { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }
interface TesseractData { confidence: number; blocks: { paragraphs: { lines: TesseractLine[] }[] }[] | null }

class TesseractEngine implements OcrEngine {
  readonly name = "tesseract.js (eng)";
  private worker: Promise<TesseractWorker> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  status() {
    if (process.env.OCR_ENABLED === "false") return { available: false, reason: "OCR is disabled (OCR_ENABLED=false)." };
    if (!resolveLangPath()) {
      return { available: false, reason: "Tesseract language data not found. Run `npm install` (package @tesseract.js-data/eng) or set OCR_LANG_PATH." };
    }
    return { available: true };
  }

  private async getWorker(): Promise<TesseractWorker> {
    if (!this.worker) {
      this.worker = (async () => {
        const { createWorker } = await import("tesseract.js");
        const cachePath = path.join(os.tmpdir(), "pravah-tesseract-cache");
        fs.mkdirSync(cachePath, { recursive: true });
        return (await createWorker("eng", 1, { langPath: resolveLangPath()!, gzip: true, cachePath })) as unknown as TesseractWorker;
      })();
      this.worker.catch(() => {
        this.worker = null;
      });
    }
    return this.worker;
  }

  async shutdown(): Promise<void> {
    const w = this.worker;
    this.worker = null;
    if (w) await (await w).terminate();
  }

  async recognize(image: Buffer): Promise<OcrResult> {
    const st = this.status();
    if (!st.available) throw new OcrUnavailableError(st.reason!);
    const { loadImage } = await import("@napi-rs/canvas");
    const img = await loadImage(image);
    const width = img.width;
    const height = img.height;
    // Serialise calls through a single worker.
    const run = this.queue.then(async () => {
      const worker = await this.getWorker();
      return withTimeout(worker.recognize(image, {}, { blocks: true, text: true }), OCR_TIMEOUT_MS);
    });
    this.queue = run.catch(() => undefined);
    const { data } = await run;
    const lines: TextLine[] = [];
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs) {
        for (const l of para.lines) {
          const text = l.text.replace(/\s+$/, "");
          if (!text.trim()) continue;
          const bbox: BBox = [l.bbox.x0 / width, l.bbox.y0 / height, l.bbox.x1 / width, l.bbox.y1 / height].map((n) => Math.round(n * 10000) / 10000) as BBox;
          lines.push({ text, bbox, confidence: Math.round(l.confidence) / 100 });
        }
      }
    }
    return { width, height, lines, confidence: Math.round(data.confidence) / 100, engine: this.name };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`OCR timed out after ${ms / 1000}s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

const g = globalThis as unknown as { __pravahOcr?: OcrEngine };
export function getOcrEngine(): OcrEngine {
  if (!g.__pravahOcr) g.__pravahOcr = new TesseractEngine();
  return g.__pravahOcr;
}

/** Terminate the OCR worker thread (for scripts and tests that must exit cleanly). */
export async function shutdownOcr(): Promise<void> {
  const e = g.__pravahOcr as (OcrEngine & { shutdown?: () => Promise<void> }) | undefined;
  await e?.shutdown?.();
}
