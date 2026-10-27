import type { ApplicationStatus } from "@/lib/domain";

/** Plain-language status explanations for institutions, with the next step they should take. */
export const APPLICANT_GUIDANCE: Record<ApplicationStatus, { title: string; text: string; tone: "info" | "ok" | "warn" | "bad"; action: string | null; step: number }> = {
  DRAFT: { title: "Draft — not checked yet", text: "Upload every mandatory document, then run the automatic checks.", tone: "info", action: "Upload documents and run the checks", step: 2 },
  PROCESSING: { title: "Checks running", text: "Your documents are being checked. This takes a few seconds.", tone: "info", action: null, step: 3 },
  AUTO_FAILED: { title: "Issues found", text: "One or more automatic checks failed. Open “Issues to fix”, correct or replace the documents concerned, then run the checks again.", tone: "bad", action: "Fix the issues listed below", step: 3 },
  PROCESSING_FAILED: { title: "A document could not be read", text: "Replace the unreadable document with a clearer scan or the original PDF, then run the checks again.", tone: "bad", action: "Replace the document that failed", step: 3 },
  REVIEW_REQUIRED: { title: "Under review by AICTE", text: "Some items need a decision by an official. You will be notified if anything is needed from you.", tone: "warn", action: null, step: 4 },
  AUTO_PASSED: { title: "Automatic checks passed", text: "Your documents passed the automatic checks. Officials now verify them and review the application. This is not an approval.", tone: "ok", action: null, step: 4 },
  RECTIFICATION_REQUIRED: { title: "Correction requested by AICTE", text: "Fix the deficiencies listed below before the due date, then submit your corrections. The checks run again automatically.", tone: "warn", action: "Submit your corrections", step: 3 },
  READY_FOR_AUTHORIZED_REVIEW: { title: "With the competent authority", text: "Your application has been forwarded for the authorised review. No action is needed from you.", tone: "info", action: null, step: 5 },
  CLOSED: { title: "Review outcome recorded", text: "A review outcome has been recorded by the competent authority. See the outcome on the application page.", tone: "ok", action: null, step: 5 },
};

export const PORTAL_STEPS = ["Submitted", "Documents", "Automatic checks", "AICTE review", "Outcome"] as const;
