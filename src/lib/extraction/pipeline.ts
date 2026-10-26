// Layer 1 — document extraction. Receives a validated file buffer and returns page text with
// source locations, structured fields with confidence, metadata and processing warnings.
import { extractFields } from "./fields";
import { getOcrEngine, OcrUnavailableError, type OcrEngine } from "./ocr";
import { extractPdf, renderPdfPage } from "./pdf";
import { ProcessingError, type PageText, type ProcessingOutput } from "./types";

/** Pages with fewer meaningful characters than this are treated as scanned images. */
const MIN_TEXT_CHARS = 25;
const MAX_OCR_PAGES = 10;

export interface PipelineInput {
  buffer: Buffer;
  mimeType: string;
  expectedFields: string[];
  ocr?: OcrEngine;
}

export async function runExtractionPipeline({ buffer, mimeType, expectedFields, ocr = getOcrEngine() }: PipelineInput): Promise<ProcessingOutput> {
  const warnings: string[] = [];
  let pages: PageText[] = [];
  let metadata: Record<string, unknown> = {};
  let pageCount = 1;

  if (mimeType === "application/pdf") {
    const pdf = await extractPdf(buffer);
    pages = pdf.pages;
    metadata = pdf.metadata;
    pageCount = pdf.pageCount;
    const scanned = pages.filter((p) => p.lines.map((l) => l.text).join("").replace(/\s/g, "").length < MIN_TEXT_CHARS);
    if (scanned.length) {
      const st = ocr.status();
      if (!st.available) {
        warnings.push(`${scanned.length} page(s) contain no embedded text and OCR is unavailable: ${st.reason}`);
      } else {
        const toOcr = scanned.slice(0, MAX_OCR_PAGES);
        if (scanned.length > MAX_OCR_PAGES) warnings.push(`Only the first ${MAX_OCR_PAGES} scanned pages were OCR-processed.`);
        for (const p of toOcr) {
          try {
            const png = await renderPdfPage(buffer, p.page, 2);
            const r = await ocr.recognize(png);
            const idx = pages.findIndex((x) => x.page === p.page);
            pages[idx] = { page: p.page, method: "OCR", width: p.width, height: p.height, lines: r.lines, confidence: r.confidence };
          } catch (err) {
            warnings.push(`OCR failed on page ${p.page}: ${err instanceof Error ? err.message : "unknown error"}`);
          }
        }
        metadata.ocrEngine = ocr.name;
      }
    }
  } else if (mimeType === "image/png" || mimeType === "image/jpeg") {
    try {
      const r = await ocr.recognize(buffer);
      pages = [{ page: 1, method: "OCR", width: r.width, height: r.height, lines: r.lines, confidence: r.confidence }];
      metadata = { format: mimeType === "image/png" ? "PNG" : "JPEG", width: r.width, height: r.height, ocrEngine: r.engine };
      if (r.width < 800 || r.height < 600) warnings.push(`Low image resolution (${r.width}×${r.height}); OCR accuracy may be reduced.`);
    } catch (err) {
      if (err instanceof OcrUnavailableError) {
        throw new ProcessingError(`Image documents require OCR, which is unavailable: ${err.message}`);
      }
      throw new ProcessingError(`OCR could not process this image: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  } else {
    throw new ProcessingError(`Unsupported content type ${mimeType}.`);
  }

  const textPages = pages.filter((p) => p.lines.length > 0);
  if (textPages.length === 0) {
    throw new ProcessingError(
      "No text could be extracted. The document appears to be scanned and OCR did not produce text. Check the scan quality or OCR configuration, then retry.",
    );
  }

  const ocrPages = pages.filter((p) => p.method === "OCR");
  const ocrConfidence = ocrPages.length ? Math.round((ocrPages.reduce((s, p) => s + p.confidence, 0) / ocrPages.length) * 100) / 100 : null;
  if (ocrConfidence !== null && ocrConfidence < 0.6) warnings.push(`Low OCR confidence (${Math.round(ocrConfidence * 100)}%). Extracted values should be confirmed by a reviewer.`);

  const method: ProcessingOutput["method"] = ocrPages.length === 0 ? "PDF_TEXT" : ocrPages.length === textPages.length ? "OCR" : "MIXED";
  const { fields, warnings: fieldWarnings } = extractFields(pages, expectedFields, metadata);
  warnings.push(...fieldWarnings);
  const text = pages.map((p) => p.lines.map((l) => l.text).join("\n")).join("\n\f\n");

  return { method, pageCount, pages, text, metadata, warnings, fields, ocrConfidence };
}
