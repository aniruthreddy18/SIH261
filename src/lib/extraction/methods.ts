// Human-readable names for how a field value was obtained (shown next to values and evidence).
const LABELS: Record<string, string> = {
  PDF_TEXT_LABEL: "PDF text · label match",
  OCR_LABEL: "OCR · label match",
  PDF_TEXT_HEURISTIC: "PDF text · pattern",
  OCR_HEURISTIC: "OCR · pattern",
  PDF_STRUCTURE: "PDF structure",
  AI_QA: "Local AI suggestion",
  REVIEWER_CORRECTION: "Reviewer correction",
  NOT_FOUND: "Not located",
};

export const methodLabel = (method: string) => LABELS[method] ?? method.replace(/_/g, " ").toLowerCase();

/** True for values suggested by the local AI model (they need reviewer confirmation). */
export const isAiMethod = (method: string) => method.startsWith("AI_");
