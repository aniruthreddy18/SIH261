// Anomaly analysis — a separate, investigative layer on top of extraction and deterministic
// validation. Deterministic heuristics only. Every output is an *indicator* for human review,
// never a finding of fraud.
import { normalizeIdentifier, shingleSimilarity } from "@/lib/extraction/normalize";
import type { Severity } from "@/lib/domain";
import type { ApplicationContext, DocumentContext, Evidence } from "@/lib/validation/types";

export interface CrossApplicationDocument {
  applicationId: string;
  applicationReference: string;
  documentId: string;
  categoryCode: string;
  sha256: string;
  referenceNormalized: string | null;
}

export interface AnomalyFinding {
  fingerprint: string;
  type: string;
  title: string;
  description: string;
  severity: Severity;
  confidence: number | null;
  method: string;
  evidence: Evidence[];
  reason: string;
  isDeterministic: false;
  recommendedAction: string;
  documentId: string | null;
}

const EDITING_SOFTWARE = /photoshop|gimp|paint\.net|\bpaint\b|canva|illustrator|inkscape|pdf ?editor|ilovepdf|smallpdf|sejda|phantompdf|pdfescape|pdf-xchange editor/i;
const DAY = 86_400_000;

const docEv = (d: DocumentContext, value?: string): Evidence => ({ kind: "DOCUMENT", label: `${d.categoryName} — ${d.fileName} (v${d.versionNo})`, documentId: d.documentId, versionId: d.versionId, fileName: d.fileName, value: value ?? null });

export function detectAnomalies(ctx: ApplicationContext, others: CrossApplicationDocument[]): AnomalyFinding[] {
  const findings: AnomalyFinding[] = [];
  const docs = ctx.documents.filter((d) => d.processingStatus === "PROCESSED");

  for (const d of ctx.documents) {
    // 1. Identical file submitted in another application.
    const sameFile = others.filter((o) => o.sha256 === d.sha256 && o.applicationId !== ctx.applicationId);
    if (sameFile.length) {
      findings.push({
        fingerprint: `ANOMALY|XAPP_FILE|${d.documentId}`,
        type: "CROSS_APPLICATION_DUPLICATE_FILE",
        title: "Identical file found in another application",
        description: `The file "${d.fileName}" is byte-for-byte identical (SHA-256) to a document submitted in ${sameFile.length} other application(s).`,
        severity: "HIGH",
        confidence: 1,
        method: "SHA-256 content hash comparison across applications",
        evidence: [docEv(d, `SHA-256 ${d.sha256}`), ...sameFile.map((o) => ({ kind: "OTHER_APPLICATION" as const, label: "Matching document in another application", applicationId: o.applicationId, applicationReference: o.applicationReference, value: o.categoryCode }))],
        reason: "Institution-specific evidence is normally unique to one institution. Re-use may be legitimate (e.g. shared group documents) but should be explained.",
        isDeterministic: false,
        recommendedAction: "Compare both submissions and confirm with the institution whether the shared document is legitimate.",
        documentId: d.documentId,
      });
    }
  }

  for (const d of docs) {
    const ref = d.fields.referenceNumber?.value;
    // 2. Reference number repeated in another application.
    if (ref) {
      const norm = normalizeIdentifier(ref);
      const repeated = others.filter((o) => o.referenceNormalized === norm && o.applicationId !== ctx.applicationId && o.sha256 !== d.sha256);
      if (norm.length >= 4 && repeated.length) {
        findings.push({
          fingerprint: `ANOMALY|XAPP_REF|${d.documentId}`,
          type: "CROSS_APPLICATION_REPEATED_REFERENCE",
          title: "Suspicious repeated reference number",
          description: `Reference number "${ref}" also appears on a different document submitted in ${repeated.length} other application(s).`,
          severity: "HIGH",
          confidence: Math.min(1, d.fields.referenceNumber.confidence),
          method: "Normalised reference-number comparison across applications",
          evidence: [{ kind: "FIELD", label: "Document reference number", value: ref, documentId: d.documentId, versionId: d.versionId, fileName: d.fileName, page: d.fields.referenceNumber.page, excerpt: d.fields.referenceNumber.excerpt, confidence: d.fields.referenceNumber.confidence }, ...repeated.map((o) => ({ kind: "OTHER_APPLICATION" as const, label: "Same reference in another application", applicationId: o.applicationId, applicationReference: o.applicationReference, value: o.categoryCode }))],
          reason: "A certificate or receipt reference number should identify a single document issued to a single institution.",
          isDeterministic: false,
          recommendedAction: "Verify the reference with the issuing authority before relying on this document.",
          documentId: d.documentId,
        });
      }
    }

    // 3. Metadata indicators (PDF only).
    const meta = d.metadata ?? {};
    const created = typeof meta.creationDate === "string" ? Date.parse(meta.creationDate) : NaN;
    const modified = typeof meta.modificationDate === "string" ? Date.parse(meta.modificationDate) : NaN;
    if (!Number.isNaN(created) && !Number.isNaN(modified) && modified - created > DAY) {
      findings.push({
        fingerprint: `ANOMALY|META_MODIFIED|${d.documentId}`,
        type: "METADATA_MODIFIED_AFTER_CREATION",
        title: "Metadata inconsistency detected",
        description: `The PDF reports a modification date (${new Date(modified).toISOString().slice(0, 10)}) ${Math.round((modified - created) / DAY)} days after its creation date (${new Date(created).toISOString().slice(0, 10)}).`,
        severity: "LOW",
        confidence: 0.5,
        method: "PDF document-information dictionary comparison",
        evidence: [docEv(d), { kind: "METADATA", label: "PDF CreationDate", value: String(meta.creationDate) }, { kind: "METADATA", label: "PDF ModDate", value: String(meta.modificationDate) }],
        reason: "Later modification can be benign (e.g. re-saving or adding a signature) but may also indicate content was edited after issue.",
        isDeterministic: false,
        recommendedAction: "Compare against the issuer's copy if the document is material to the decision.",
        documentId: d.documentId,
      });
    }
    const issue = d.fields.issueDate?.normalized;
    if (!Number.isNaN(created) && issue && created < Date.parse(`${issue}T00:00:00Z`) - DAY) {
      findings.push({
        fingerprint: `ANOMALY|META_BEFORE_ISSUE|${d.documentId}`,
        type: "METADATA_CREATED_BEFORE_ISSUE",
        title: "File created before stated issue date",
        description: `The file's creation timestamp (${new Date(created).toISOString().slice(0, 10)}) precedes the issue date printed on the document (${issue}).`,
        severity: "MEDIUM",
        confidence: 0.6,
        method: "PDF CreationDate compared with extracted issue date",
        evidence: [docEv(d), { kind: "METADATA", label: "PDF CreationDate", value: String(meta.creationDate) }, { kind: "FIELD", label: "Issue date", value: d.fields.issueDate.value, documentId: d.documentId, versionId: d.versionId, page: d.fields.issueDate.page, excerpt: d.fields.issueDate.excerpt, confidence: d.fields.issueDate.confidence }],
        reason: "A document normally cannot exist before the date on which it was issued.",
        isDeterministic: false,
        recommendedAction: "Request the issuer's original or verify with the issuing authority.",
        documentId: d.documentId,
      });
    }
    const producer = [meta.producer, meta.creator].filter((x) => typeof x === "string").join(" / ");
    if (producer && EDITING_SOFTWARE.test(producer)) {
      findings.push({
        fingerprint: `ANOMALY|META_EDITOR|${d.documentId}`,
        type: "METADATA_EDITING_SOFTWARE",
        title: "Potential alteration indicator",
        description: `The PDF producer/creator metadata ("${producer}") indicates image- or PDF-editing software.`,
        severity: "LOW",
        confidence: 0.4,
        method: "PDF Producer/Creator metadata pattern match",
        evidence: [docEv(d), { kind: "METADATA", label: "Producer / Creator", value: producer }],
        reason: "Editing software is often used legitimately (e.g. to scan or compress), so this is a weak indicator only.",
        isDeterministic: false,
        recommendedAction: "Consider alongside other indicators; no action needed on its own.",
        documentId: d.documentId,
      });
    }
  }

  // 4. Near-duplicate content with materially different identifiers (within the application).
  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const a = docs[i], b = docs[j];
      if (a.sha256 === b.sha256 || !a.textContent || !b.textContent) continue;
      const sim = shingleSimilarity(a.textContent, b.textContent);
      if (sim < 0.75) continue;
      const diffs = ["referenceNumber", "issueDate", "expiryDate", "institutionCode"].filter((k) => {
        const va = a.fields[k]?.normalized, vb = b.fields[k]?.normalized;
        return va && vb && va !== vb;
      });
      if (!diffs.length) continue;
      findings.push({
        fingerprint: `ANOMALY|NEAR_DUP|${[a.documentId, b.documentId].sort().join("|")}`,
        type: "NEAR_DUPLICATE_DIFFERENT_IDENTIFIERS",
        title: "Similar documents with materially different content",
        description: `"${a.fileName}" and "${b.fileName}" share ${Math.round(sim * 100)}% of their text but differ in: ${diffs.join(", ")}.`,
        severity: "MEDIUM",
        confidence: Math.round(sim * 100) / 100,
        method: "3-word shingle Jaccard similarity with identifier comparison",
        evidence: [docEv(a), docEv(b), ...diffs.map((k) => ({ kind: "FIELD" as const, label: k, value: `${a.fields[k].value} vs ${b.fields[k].value}` }))],
        reason: "Near-identical text with changed identifiers or dates can indicate a template re-used with altered details.",
        isDeterministic: false,
        recommendedAction: "Review both documents side by side and confirm each with its issuer.",
        documentId: a.documentId,
      });
    }
  }
  return findings;
}
