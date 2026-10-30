import type { Role } from "@/lib/domain";

/**
 * Visual identity per role: each user type gets its own colour, header gradient and portal name.
 * `band` is the solid role colour (stripes, dots); `header` is the translucent gradient top bar.
 */
export const ROLE_THEME: Record<Role, { portal: string; band: string; dot: string; header: string; purpose: string }> = {
  APPLICANT: { portal: "Institution Portal", band: "bg-green", dot: "bg-green", header: "bg-linear-to-r from-green-dark/85 via-green/72 to-teal/58", purpose: "Submit evidence, track checks and fix anything flagged." },
  SCRUTINY_OFFICER: { portal: "Regional Office · Scrutiny Desk", band: "bg-navy", dot: "bg-navy", header: "bg-linear-to-r from-navy-dark/85 via-navy/72 to-navy-light/58", purpose: "Review what the automated checks could not decide." },
  BUREAU_OFFICER: { portal: "Approval Bureau · Monitoring", band: "bg-teal", dot: "bg-teal", header: "bg-linear-to-r from-navy-dark/85 via-teal/72 to-teal-bright/50", purpose: "Monitor pendency across Regions, schedule Expert Visits, verify compliance and act on escalations." },
  COMMITTEE_MEMBER: { portal: "Committee Desk (EVC · SAC/SHC)", band: "bg-navy-light", dot: "bg-navy-light", header: "bg-linear-to-r from-navy/85 via-navy-light/72 to-teal/55", purpose: "Record expert visit reports and committee outcomes for the cases assigned to you." },
  SENIOR_OFFICIAL: { portal: "Competent Authority Desk", band: "bg-saffron", dot: "bg-saffron", header: "bg-linear-to-r from-saffron-dark/85 via-saffron/72 to-saffron-light/58", purpose: "Record the authorised review outcome for forwarded applications." },
  ADMIN: { portal: "Administration Console", band: "bg-navy-dark", dot: "bg-navy-dark", header: "bg-linear-to-r from-navy-deep/85 via-navy-dark/72 to-navy/58", purpose: "Maintain rules, users, verification sources and settings." },
};
