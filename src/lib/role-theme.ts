import type { Role } from "@/lib/domain";

/** Visual identity per role: each user type gets its own colour and portal name. */
export const ROLE_THEME: Record<Role, { portal: string; band: string; dot: string; purpose: string }> = {
  APPLICANT: { portal: "Institution Portal", band: "bg-green", dot: "bg-green", purpose: "Submit evidence, track checks and fix anything flagged." },
  SCRUTINY_OFFICER: { portal: "Scrutiny & Verification Desk", band: "bg-navy", dot: "bg-navy", purpose: "Review what the automated checks could not decide." },
  SENIOR_OFFICIAL: { portal: "Competent Authority Desk", band: "bg-saffron", dot: "bg-saffron", purpose: "Record the authorised review outcome for forwarded applications." },
  ADMIN: { portal: "Administration Console", band: "bg-navy-dark", dot: "bg-navy-dark", purpose: "Maintain rules, users, verification sources and settings." },
};
