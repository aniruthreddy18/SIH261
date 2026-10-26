// PDF text-layer extraction (pdf.js via unpdf) with line grouping and bounding boxes,
// metadata extraction, and page rendering for OCR / previews.
import { getDocumentProxy, renderPageAsImage } from "unpdf";
import { parsePdfDate } from "./dates";
import { ProcessingError, type BBox, type PageText, type TextLine } from "./types";

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export interface PdfExtraction {
  pageCount: number;
  pages: PageText[];
  metadata: Record<string, unknown>;
}

async function openPdf(buffer: Buffer) {
  try {
    // pdf.js may detach the buffer it is given, so always pass a copy.
    return await getDocumentProxy(new Uint8Array(buffer));
  } catch (err) {
    const name = (err as { name?: string })?.name ?? "";
    if (name === "PasswordException") {
      throw new ProcessingError("The PDF is password-protected. Upload an unprotected copy.");
    }
    throw new ProcessingError("The PDF could not be parsed. It may be corrupt or not a valid PDF file.");
  }
}

function groupLines(items: PdfTextItem[], pageWidth: number, pageHeight: number): TextLine[] {
  const rows: { y: number; items: PdfTextItem[] }[] = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const y = it.transform[5];
    const row = rows.find((r) => Math.abs(r.y - y) <= 2);
    if (row) row.items.push(it);
    else rows.push({ y, items: [it] });
  }
  rows.sort((a, b) => b.y - a.y); // PDF origin is bottom-left → top of page first
  return rows.map((row) => {
    row.items.sort((a, b) => a.transform[4] - b.transform[4]);
    let text = "";
    let lastEnd: number | null = null;
    let x0 = Infinity, x1 = -Infinity, top = -Infinity, bottom = Infinity;
    for (const it of row.items) {
      const x = it.transform[4];
      const h = it.height || Math.abs(it.transform[3]) || 10;
      if (lastEnd !== null) {
        const gap = x - lastEnd;
        text += gap > h * 1.5 ? "    " : gap > h * 0.15 && !text.endsWith(" ") && !it.str.startsWith(" ") ? " " : "";
      }
      text += it.str;
      lastEnd = x + it.width;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x + it.width);
      top = Math.max(top, it.transform[5] + h);
      bottom = Math.min(bottom, it.transform[5] - h * 0.2);
    }
    const bbox: BBox = [
      clamp(x0 / pageWidth),
      clamp((pageHeight - top) / pageHeight),
      clamp(x1 / pageWidth),
      clamp((pageHeight - bottom) / pageHeight),
    ];
    return { text: text.replace(/\s+$/, ""), bbox, confidence: 1 };
  });
}

const clamp = (n: number) => Math.max(0, Math.min(1, Math.round(n * 10000) / 10000));

export async function extractPdf(buffer: Buffer): Promise<PdfExtraction> {
  const pdf = await openPdf(buffer);
  const pages: PageText[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const lines = groupLines(content.items as PdfTextItem[], viewport.width, viewport.height);
    pages.push({
      page: i,
      method: lines.length ? "PDF_TEXT" : "NONE",
      width: Math.round(viewport.width),
      height: Math.round(viewport.height),
      lines,
      confidence: lines.length ? 1 : 0,
    });
  }
  let info: Record<string, unknown> = {};
  try {
    const meta = await pdf.getMetadata();
    info = (meta.info ?? {}) as Record<string, unknown>;
  } catch {
    // Metadata is optional.
  }
  const metadata: Record<string, unknown> = {
    format: "PDF",
    pdfVersion: info.PDFFormatVersion ?? null,
    producer: info.Producer ?? null,
    creator: info.Creator ?? null,
    title: info.Title ?? null,
    creationDate: parsePdfDate(info.CreationDate),
    modificationDate: parsePdfDate(info.ModDate),
    IsSignaturesPresent: info.IsSignaturesPresent === true,
    IsAcroFormPresent: info.IsAcroFormPresent === true,
  };
  const pageCount = pdf.numPages;
  await pdf.destroy();
  return { pageCount, pages, metadata };
}

/** Render one PDF page to PNG. Used for OCR of scanned pages and for safe previews. */
export async function renderPdfPage(buffer: Buffer, pageNumber: number, scale = 2): Promise<Buffer> {
  const img = await renderPageAsImage(new Uint8Array(buffer), pageNumber, {
    canvasImport: () => import("@napi-rs/canvas"),
    scale,
  });
  return Buffer.from(img);
}
