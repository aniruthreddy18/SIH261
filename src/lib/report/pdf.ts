// Renders the application validation report as a PDF (pdfkit, standard fonts).
import PDFDocument from "pdfkit";
import type { ReportData } from "@/server/reports";

const INK = "#0f172a", MUTED = "#64748b", LINE = "#e2e8f0", ACCENT = "#1d4ed8";
const STATUS_COLOR: Record<string, string> = { PASS: "#15803d", VERIFIED: "#15803d", FAIL: "#b91c1c", MISMATCH_DETECTED: "#b91c1c", EXPIRED: "#b91c1c", REVIEW_REQUIRED: "#b45309", PROCESSING_FAILED: "#7c2d12" };

export function renderReportPdf(d: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 64, left: 50, right: 50 }, bufferPages: true, info: { Title: `Aegis validation report ${d.app.reference}`, Author: "Aegis prototype", Producer: "Aegis" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const W = 495;

    const h1 = (t: string) => doc.font("Helvetica-Bold").fontSize(17).fillColor(INK).text(t);
    const h2 = (t: string) => {
      if (doc.y > 700) doc.addPage();
      doc.moveDown(0.9).font("Helvetica-Bold").fontSize(12).fillColor(ACCENT).text(t.toUpperCase(), { characterSpacing: 0.4 });
      doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor(LINE).stroke();
      doc.moveDown(0.5);
    };
    const kv = (k: string, v: string) => {
      doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text(`${k}: `, { continued: true }).font("Helvetica").fillColor(INK).text(v);
    };
    const para = (t: string, opts: { color?: string; size?: number; indent?: number } = {}) => doc.font("Helvetica").fontSize(opts.size ?? 9).fillColor(opts.color ?? INK).text(t, { width: W - (opts.indent ?? 0), indent: opts.indent ?? 0 });
    const tag = (status: string) => doc.font("Helvetica-Bold").fontSize(9).fillColor(STATUS_COLOR[status] ?? MUTED).text(`[${status}] `, { continued: true });

    // Header
    doc.font("Helvetica-Bold").fontSize(10).fillColor(ACCENT).text("AEGIS — APPLICATION VALIDATION & COMPLIANCE INTELLIGENCE");
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text("Prototype · DEMO ENVIRONMENT · Not an official AICTE product");
    doc.moveDown(0.8);
    h1(`Validation report — ${d.app.reference}`);
    doc.moveDown(0.3);
    para(`Generated ${new Date(d.generatedAt).toUTCString()} by ${d.generatedBy}`, { color: MUTED, size: 8.5 });
    doc.moveDown(0.6).rect(50, doc.y, W, 46).fillAndStroke("#fff7ed", "#fed7aa");
    doc.fillColor("#9a3412").font("Helvetica-Bold").fontSize(8.5).text("DECISION-SUPPORT OUTPUT — NOT AN APPROVAL", 58, doc.y + 6, { width: W - 16 });
    doc.font("Helvetica").fontSize(8).text(d.disclaimer, { width: W - 16 });
    doc.x = 50;
    doc.moveDown(1.2);

    h2("Application");
    kv("Institution", `${d.app.institutionName} (${d.app.institutionCode ?? "identifier not stated"})`);
    kv("Category / template", `${d.app.category} · ${d.app.template}`);
    kv("Academic year", d.app.academicYear);
    kv("Current status", `${d.app.statusLabel} (${d.app.status})`);
    kv("Contact", d.app.contact);
    kv("Submitted", new Date(d.app.submittedAt).toUTCString());
    kv("Programmes", d.app.programmes.map((p) => `${p.name} (${p.level}, intake ${p.intake})`).join("; "));
    kv("Institutional record", `${d.institutionRecord.name} · ${d.institutionRecord.code} · ${d.institutionRecord.city}, ${d.institutionRecord.state}`);

    h2("Document checklist");
    for (const c of d.checklist) {
      const ok = c.documents.length > 0;
      doc.font("Helvetica-Bold").fontSize(9).fillColor(ok ? "#15803d" : c.mandatory ? "#b91c1c" : MUTED).text(ok ? "[PRESENT] " : c.mandatory ? "[MISSING] " : "[NOT SUBMITTED] ", { continued: true });
      doc.font("Helvetica").fillColor(INK).text(`${c.label}${c.mandatory ? "" : " (optional)"}${ok ? ` — ${c.documents.join(", ")}` : ""}`);
    }

    h2("Extraction summary");
    for (const x of d.documents) {
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK).text(`${x.category} — ${x.file} (v${x.version})`);
      para(`Status ${x.status} · method ${x.method ?? "—"} · ${x.pages ?? "?"} page(s)${x.ocrConfidence !== null ? ` · OCR confidence ${Math.round(x.ocrConfidence * 100)}%` : ""} · SHA-256 ${x.sha256.slice(0, 16)}…`, { color: MUTED, size: 8 });
      for (const f of x.fields) {
        para(`${f.label}: ${f.value ?? "unknown (not located)"}${f.value ? ` — ${Math.round(f.confidence * 100)}%${f.page ? `, page ${f.page}` : ""}${f.corrected ? ", reviewer-corrected" : ""}${f.aiSuggestion ? ", AI suggestion (unconfirmed)" : ""}` : ""}`, { size: 8.5, indent: 10 });
      }
      doc.moveDown(0.4);
    }

    h2("Rule results");
    if (!d.lastRun) para("No completed validation run.", { color: MUTED });
    else {
      para(`Run #${d.lastRun.runNumber} completed ${d.lastRun.completedAt ? new Date(d.lastRun.completedAt).toUTCString() : "—"} · machine outcome ${d.lastRun.machineOutcome}`, { color: MUTED, size: 8.5 });
      para(`Rule versions: ${d.lastRun.ruleVersions.map((r) => `${r.code}@v${r.version}`).join(", ")}`, { color: MUTED, size: 7.5 });
      doc.moveDown(0.4);
      for (const r of d.results.filter((x) => x.status !== "NOT_APPLICABLE")) {
        if (doc.y > 740) doc.addPage();
        tag(r.status);
        doc.font("Helvetica-Bold").fillColor(INK).text(`${r.ruleCode} v${r.version} — ${r.subject}`);
        para(r.explanation, { indent: 10, size: 8.5 });
        if (r.status !== "PASS") {
          if (r.expected) para(`Expected: ${r.expected}`, { indent: 10, size: 8, color: MUTED });
          if (r.observed) para(`Observed: ${r.observed}`, { indent: 10, size: 8, color: MUTED });
          for (const e of r.evidence.slice(0, 4)) para(`Evidence: ${e}`, { indent: 10, size: 7.5, color: MUTED });
        }
        doc.moveDown(0.25);
      }
    }

    h2("Findings (including cross-document and anomaly indicators)");
    if (!d.findings.length) para("No findings.", { color: MUTED });
    for (const f of d.findings) {
      if (doc.y > 740) doc.addPage();
      doc.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(`${f.severity} · ${f.status} · ${f.source}${f.deterministic ? " · deterministic failure" : " · requires human judgement"}`);
      para(f.title, { indent: 10, size: 8.5 });
      para(`Next action: ${f.recommendedAction}`, { indent: 10, size: 8, color: MUTED });
      if (f.resolution) para(`Resolution: ${f.resolution}`, { indent: 10, size: 8, color: MUTED });
      doc.moveDown(0.25);
    }

    h2("Issuer verification (current document versions)");
    if (!d.verifications.length) para("No verification attempts recorded.", { color: MUTED });
    for (const v of d.verifications) {
      if (doc.y > 740) doc.addPage();
      tag(v.status);
      doc.font("Helvetica-Bold").fillColor(INK).text(`${v.category} — ${v.source}`);
      doc.font("Helvetica-Bold").fontSize(8).fillColor(v.sourceType === "SIMULATED" ? "#b45309" : MUTED).text(`SOURCE TYPE: ${v.sourceType}${v.sourceType === "SIMULATED" ? " — simulated response, not an official verification" : ""}`, { indent: 10 });
      para(`${new Date(v.at).toUTCString()}${v.reference ? ` · response ref ${v.reference}` : ""}`, { indent: 10, size: 8, color: MUTED });
      for (const c of v.comparisons) para(`${c.match === true ? "match" : c.match === false ? "MISMATCH" : "n/a"} — ${c.label}: submitted "${c.submitted ?? "—"}" / source "${c.returned ?? "—"}"`, { indent: 10, size: 8 });
      if (v.limitation) para(`Limitation: ${v.limitation}`, { indent: 10, size: 8, color: MUTED });
      doc.moveDown(0.25);
    }

    h2("Recorded human review actions");
    if (!d.reviewActions.length) para("No human review actions recorded.", { color: MUTED });
    for (const r of d.reviewActions) {
      para(`${new Date(r.at).toUTCString()} — ${r.action}${r.outcome ? ` (${r.outcome})` : ""} by ${r.actor} [${r.role}]`, { size: 8.5 });
      para(`Reason: ${r.reason}${r.reference ? ` · Ref: ${r.reference}` : ""}`, { indent: 10, size: 8, color: MUTED });
    }

    h2("Limitations & recommended next actions");
    for (const l of d.limitations) para(`• ${l}`, { size: 8.5 });
    const open = d.findings.filter((f) => ["OPEN", "INFO_REQUESTED", "ESCALATED", "RECTIFICATION_REQUESTED"].includes(f.status));
    doc.moveDown(0.4);
    para(open.length ? `${open.length} finding(s) remain outstanding and require action before an authorised review outcome is recorded.` : "No outstanding findings at the time of this report.", { size: 9 });

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      doc.font("Helvetica").fontSize(7).fillColor(MUTED).text(`Aegis prototype · ${d.app.reference} · decision-support output, not an official approval · page ${i + 1} of ${range.count}`, 50, 800, { width: W, align: "center", lineBreak: false });
    }
    doc.end();
  });
}
