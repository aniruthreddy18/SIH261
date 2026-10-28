import type { Role } from "@/lib/domain";

/**
 * Visual identity per role: each user type gets its own colour, header gradient and portal name.
 * `band`/`dot` are bright solid colours (stripes, dots); `header` is the gradient bar class
 * defined in globals.css (night navy flowing into the role's glow colour).
 */
export const ROLE_THEME: Record<Role, { portal: string; band: string; dot: string; header: string; purpose: string }> = {
  APPLICANT: { portal: "Institution Portal", band: "bg-green-bright", dot: "bg-green-bright", header: "hdr-applicant", purpose: "Submit evidence, track checks and fix anything flagged." },
  SCRUTINY_OFFICER: { portal: "Scrutiny & Verification Desk", band: "bg-navy-light", dot: "bg-navy-light", header: "hdr-officer", purpose: "Review what the automated checks could not decide." },
  SENIOR_OFFICIAL: { portal: "Competent Authority Desk", band: "bg-saffron-bright", dot: "bg-saffron-bright", header: "hdr-senior", purpose: "Record the authorised review outcome for forwarded applications." },
  ADMIN: { portal: "Administration Console", band: "bg-teal-bright", dot: "bg-teal-bright", header: "hdr-admin", purpose: "Maintain rules, users, verification sources and settings." },
};
