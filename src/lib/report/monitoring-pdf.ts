// Consolidated monitoring report as a PDF (pdfkit, standard fonts, landscape tables).
import PDFDocument from "pdfkit";
import type { ReportTable } from "@/server/monitoring-reports";

const INK = "#0f172a", MUTED = "#64748b", LINE = "#e2e8f0", ACCENT = "#0b7a74";

export interface MonitoringPdfData {
  generatedAt: Date;
  generatedBy: string;
  scope: string;
  summary: { label: string; value: string | number }[];
  tables: ReportTable[];
}

export function renderMonitoringPdf(d: MonitoringPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margins: { top: 40, bottom: 44, left: 36, right: 36 }, bufferPages: true, info: { Title: "Pravah AI consolidated monitoring report", Author: "Pravah AI prototype" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const W = doc.page.width - 72;
    const bottom = () => doc.page.height - 56;

    doc.font("Helvetica-Bold").fontSize(9).fillColor(ACCENT).text("PRAVAH AI — APPROVAL WORKFLOW & COMPLIANCE MONITORING");
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text("Prototype · DEMO ENVIRONMENT with synthetic data · Not an official AICTE product");
    doc.moveDown(0.5).font("Helvetica-Bold").fontSize(16).fillColor(INK).text("Consolidated monitoring report");
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(`Generated ${d.generatedAt.toUTCString()} by ${d.generatedBy} · Scope: ${d.scope}`);
    doc.moveDown(0.5).rect(36, doc.y, W, 30).fillAndStroke("#fff7ed", "#fed7aa");
    doc.fillColor("#9a3412").font("Helvetica").fontSize(7.5).text("Alerts, timelines and routing support the approval process. They do not replace statutory scrutiny, verification, inspections or decisions of the competent authority. Timelines shown are sample configuration, not values from the Approval Process Handbook.", 44, doc.y + 6, { width: W - 16 });
    doc.x = 36;
    doc.moveDown(1.4);

    // Summary tiles
    const tileW = W / d.summary.length;
    const y0 = doc.y;
    d.summary.forEach((s, i) => {
      doc.font("Helvetica-Bold").fontSize(15).fillColor(INK).text(String(s.value), 36 + i * tileW, y0, { width: tileW - 8 });
      doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(s.label, 36 + i * tileW, y0 + 19, { width: tileW - 8 });
    });
    doc.x = 36;
    doc.y = y0 + 40;

    for (const t of d.tables) {
      if (doc.y > bottom() - 80) doc.addPage();
      doc.moveDown(0.6).font("Helvetica-Bold").fontSize(10.5).fillColor(ACCENT).text(`${t.title.toUpperCase()}  (${t.rows.length})`, 36, doc.y);
      doc.moveTo(36, doc.y + 2).lineTo(36 + W, doc.y + 2).strokeColor(LINE).stroke();
      doc.moveDown(0.4);
      if (!t.rows.length) {
        doc.font("Helvetica").fontSize(8).fillColor(MUTED).text("No records.", 36);
        continue;
      }
      const cols = t.columns;
      const colW = W / cols.length;
      const header = () => {
        const y = doc.y;
        cols.forEach((c, i) => doc.font("Helvetica-Bold").fontSize(6.8).fillColor(MUTED).text(c.label, 36 + i * colW, y, { width: colW - 4 }));
        doc.y = y + 18;
      };
      header();
      for (const r of t.rows.slice(0, 60)) {
        const y = doc.y;
        const h = Math.max(...cols.map((c) => doc.font("Helvetica").fontSize(7).heightOfString(String(r[c.key] ?? ""), { width: colW - 4 })));
        if (y + h > bottom()) {
          doc.addPage();
          header();
        }
        const yy = doc.y;
        cols.forEach((c, i) => doc.font("Helvetica").fontSize(7).fillColor(INK).text(String(r[c.key] ?? ""), 36 + i * colW, yy, { width: colW - 4 }));
        doc.y = yy + h + 3;
        doc.moveTo(36, doc.y - 1.5).lineTo(36 + W, doc.y - 1.5).strokeColor(LINE).lineWidth(0.5).stroke();
      }
      if (t.rows.length > 60) doc.font("Helvetica").fontSize(7).fillColor(MUTED).text(`… ${t.rows.length - 60} more row(s) in the CSV export.`, 36);
      if (t.note) doc.font("Helvetica").fontSize(7).fillColor(MUTED).text(t.note, 36);
    }

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.font("Helvetica").fontSize(7).fillColor(MUTED).text(`Pravah AI prototype · consolidated monitoring report · decision support only · page ${i + 1} of ${range.count}`, 36, doc.page.height - 30, { width: W, align: "center", lineBreak: false });
    }
    doc.end();
  });
}
