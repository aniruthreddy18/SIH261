import type { Role } from "@/lib/domain";

/**
 * Visual identity per role: each user type gets its own colour, header gradient and portal name.
 * `band` is the solid role colour (stripes, dots); `header` is the gradient top bar.
 */
export const ROLE_THEME: Record<Role, { portal: string; band: string; dot: string; header: string; purpose: string }> = {
  APPLICANT: { portal: "Institution Portal", band: "bg-green", dot: "bg-green", header: "bg-linear-to-r from-green-dark via-green to-teal", purpose: "Submit evidence, track checks and fix anything flagged." },
  SCRUTINY_OFFICER: { portal: "Scrutiny & Verification Desk", band: "bg-navy", dot: "bg-navy", header: "bg-linear-to-r from-navy-dark via-navy to-navy-light", purpose: "Review what the automated checks could not decide." },
  SENIOR_OFFICIAL: { portal: "Competent Authority Desk", band: "bg-saffron", dot: "bg-saffron", header: "bg-linear-to-r from-saffron-dark via-saffron to-saffron-light", purpose: "Record the authorised review outcome for forwarded applications." },
  ADMIN: { portal: "Administration Console", band: "bg-navy-dark", dot: "bg-navy-dark", header: "bg-linear-to-r from-navy-deep via-navy-dark to-navy", purpose: "Maintain rules, users, verification sources and settings." },
};
