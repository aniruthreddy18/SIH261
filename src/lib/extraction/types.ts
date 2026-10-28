/** Normalised bounding box: [x0, y0, x1, y1] as fractions (0..1) of the page width/height. */
export type BBox = [number, number, number, number];

export interface TextLine {
  text: string;
  bbox: BBox | null;
  /** 0..1 — 1 for embedded PDF text, OCR line confidence otherwise. */
  confidence: number;
}

export type PageMethod = "PDF_TEXT" | "OCR" | "NONE";

export interface PageText {
  page: number;
  method: PageMethod;
  width: number;
  height: number;
  lines: TextLine[];
  /** Mean confidence for the page (0..1). */
  confidence: number;
}

export type ExtractionMethod =
  | "PDF_TEXT_LABEL"
  | "OCR_LABEL"
  | "PDF_TEXT_HEURISTIC"
  | "OCR_HEURISTIC"
  | "PDF_STRUCTURE"
  /** Suggested by the local AI model (extractive question answering); needs reviewer confirmation. */
  | "AI_QA"
  | "NOT_FOUND";

export interface ExtractedFieldDraft {
  key: string;
  label: string;
  value: string | null;
  normalizedValue: string | null;
  confidence: number;
  page: number | null;
  excerpt: string | null;
  bbox: BBox | null;
  method: ExtractionMethod;
}

export interface ProcessingOutput {
  method: "PDF_TEXT" | "OCR" | "MIXED";
  pageCount: number;
  pages: PageText[];
  text: string;
  metadata: Record<string, unknown>;
  warnings: string[];
  fields: ExtractedFieldDraft[];
  ocrConfidence: number | null;
}

/** A failure whose message is safe and actionable for end users. */
export class ProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProcessingError";
  }
}
