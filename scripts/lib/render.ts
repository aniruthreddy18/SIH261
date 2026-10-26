// Renders clearly-labelled synthetic documents (PDF with a text layer, or scanned-style PNG)
// for the demo dataset. Nothing here resembles a real certificate format or authority.
import PDFDocument from "pdfkit";

export interface DocSpec {
  file: string;
  category: string;
  issuer: string;
  title: string;
  fields: [string, string][];
  body?: string;
  signedBy?: string;
  /** ISO timestamps for PDF metadata (deterministic output). */
  created?: string;
  modified?: string;
  producer?: string;
  format?: "pdf" | "png";
}

const DISCLAIMER = "SYNTHETIC DEMONSTRATION DOCUMENT — fictional data generated for the Aegis prototype. Not a real certificate.";

export function renderPdf(spec: DocSpec): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const created = spec.created ? new Date(spec.created) : new Date("2026-01-01T00:00:00Z");
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 56, bottom: 56, left: 64, right: 64 },
      info: {
        Title: spec.title,
        Author: spec.issuer,
        Producer: spec.producer ?? "Aegis Demo Document Generator",
        Creator: spec.producer ?? "Aegis Demo Document Generator",
        CreationDate: created,
        ...(spec.modified ? { ModDate: new Date(spec.modified) } : { ModDate: created }),
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(14).fillColor("#0f172a").text(spec.issuer, { align: "center" });
    doc.moveDown(0.2).font("Helvetica").fontSize(8).fillColor("#64748b").text(DISCLAIMER, { align: "center" });
    doc.moveDown(0.8).moveTo(64, doc.y).lineTo(531, doc.y).strokeColor("#cbd5e1").stroke();
    doc.moveDown(1).font("Helvetica-Bold").fontSize(16).fillColor("#0f172a").text(spec.title, { align: "center" });
    doc.moveDown(1.2);
    doc.font("Helvetica").fontSize(11).fillColor("#111827");
    for (const [label, value] of spec.fields) {
      doc.text(`${label}: ${value}`);
      doc.moveDown(0.45);
    }
    if (spec.body) {
      doc.moveDown(0.8).fontSize(10.5).fillColor("#1f2937").text(spec.body, { align: "justify", lineGap: 2 });
    }
    if (spec.signedBy) {
      doc.moveDown(2.5).fontSize(10.5).fillColor("#111827").text(`Digitally signed by: ${spec.signedBy}`);
    }
    doc.page.margins.bottom = 0; // footer sits below the content area; don't trigger a page break
    doc.fontSize(7.5).fillColor("#94a3b8").text(DISCLAIMER, 64, 790, { align: "center", width: 467, lineBreak: false });
    doc.end();
  });
}

/** A scanned-style image (slight rotation, paper noise) so OCR does real work. */
export async function renderPng(spec: DocSpec): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const W = 1240, H = 1754;
  const c = createCanvas(W, H);
  const g = c.getContext("2d");
  g.fillStyle = "#fbfaf7";
  g.fillRect(0, 0, W, H);
  // Deterministic speckle noise.
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = "rgba(60,60,60,0.10)";
  for (let i = 0; i < 2500; i++) g.fillRect(rnd() * W, rnd() * H, 1.5, 1.5);
  g.save();
  g.translate(W / 2, H / 2);
  g.rotate(0.004);
  g.translate(-W / 2, -H / 2);
  g.fillStyle = "#1a1a1a";
  g.textAlign = "center";
  g.font = "bold 34px sans-serif";
  g.fillText(spec.issuer, W / 2, 130);
  g.font = "18px sans-serif";
  g.fillStyle = "#555";
  g.fillText("SYNTHETIC DEMONSTRATION DOCUMENT - fictional data, not a real certificate", W / 2, 175);
  g.fillStyle = "#1a1a1a";
  g.font = "bold 38px sans-serif";
  g.fillText(spec.title, W / 2, 290);
  g.textAlign = "left";
  g.font = "30px sans-serif";
  let y = 410;
  for (const [label, value] of spec.fields) {
    g.fillText(`${label}: ${value}`, 110, y);
    y += 62;
  }
  if (spec.signedBy) {
    g.font = "28px sans-serif";
    g.fillText(`Signed: ${spec.signedBy}`, 110, y + 120);
  }
  g.restore();
  return c.toBuffer("image/png");
}

export async function renderDoc(spec: DocSpec): Promise<{ buffer: Buffer; mimeType: string }> {
  if (spec.format === "png") return { buffer: await renderPng(spec), mimeType: "image/png" };
  return { buffer: await renderPdf(spec), mimeType: "application/pdf" };
}
