import type { Role } from "@/lib/domain";

/**
 * Visual identity per role: each user type gets its own colour, header gradient and portal name.
 * `band` is the solid role colour (stripes, dots); `header` is the translucent gradient top bar.
 */
export const ROLE_THEME: Record<Role, { portal: string; band: string; dot: string; header: string; purpose: string }> = {
  APPLICANT: { portal: "Institution Portal", band: "bg-green", dot: "bg-green", header: "bg-linear-to-r from-green-dark/80 via-green/62 to-teal/45", purpose: "Submit evidence, track checks and fix anything flagged." },
  SCRUTINY_OFFICER: { portal: "Scrutiny & Verification Desk", band: "bg-navy", dot: "bg-navy", header: "bg-linear-to-r from-navy-dark/80 via-navy/62 to-navy-light/45", purpose: "Review what the automated checks could not decide." },
  SENIOR_OFFICIAL: { portal: "Competent Authority Desk", band: "bg-saffron", dot: "bg-saffron", header: "bg-linear-to-r from-saffron-dark/80 via-saffron/62 to-saffron-light/45", purpose: "Record the authorised review outcome for forwarded applications." },
  ADMIN: { portal: "Administration Console", band: "bg-navy-dark", dot: "bg-navy-dark", header: "bg-linear-to-r from-navy-deep/80 via-navy-dark/62 to-navy/45", purpose: "Maintain rules, users, verification sources and settings." },
};
