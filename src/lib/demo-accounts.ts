// Demo accounts listed on the sign-in pages while DEMO_MODE is on (the default for the
// prototype). One-click access still signs in through the normal password check, so it only
// works for these synthetic accounts and only with their published demo password.
import type { Role } from "@/lib/domain";

export const DEMO_PASSWORD = "Pravah@Demo2026";

export const isDemoMode = () => process.env.DEMO_MODE !== "false";

export interface DemoOfficial { email: string; role: Role; title: string; note: string; scope?: string }
export interface DemoInstitution { email: string; institution: string; note: string }

export const DEMO_OFFICIALS: DemoOfficial[] = [
  { email: "bureau@pravah.demo", title: "Approval Bureau Officer", role: "BUREAU_OFFICER", note: "Pendency across Regions, EVC scheduling, compliance verification, escalations and reports." },
  { email: "scrutiny@pravah.demo", title: "Regional Officer", role: "SCRUTINY_OFFICER", scope: "All Regions", note: "Document scrutiny, issuer verification, findings, return for rectification, forwarding." },
  { email: "ro.south@pravah.demo", title: "Regional Officer", role: "SCRUTINY_OFFICER", scope: "Southern Region", note: "The same desk, limited to one Region's institutions, pendency and alerts." },
  { email: "committee@pravah.demo", title: "EVC / Committee Member", role: "COMMITTEE_MEMBER", note: "Convenor of assigned expert visits: files reports and records SAC/SHC outcomes." },
  { email: "senior@pravah.demo", title: "Competent Authority", role: "SENIOR_OFFICIAL", note: "Records outcomes, reverts stages and acknowledges escalations." },
  { email: "admin@pravah.demo", title: "Administrator", role: "ADMIN", note: "Users, Regions, workflow pathways and timelines, rules and settings." },
];

export const DEMO_INSTITUTIONS: DemoInstitution[] = [
  { email: "applicant.greenfield@pravah.demo", institution: "Greenfield College of Engineering", note: "Draft to complete · lease deed renewal due · change-of-site visit pending" },
  { email: "applicant.meridian@pravah.demo", institution: "Meridian Institute of Management", note: "Expired fire NOC to fix · last year's undertaking overdue" },
  { email: "applicant.northfield@pravah.demo", institution: "Northfield School of Architecture", note: "Issuer mismatch under review · intake visit done, report due" },
  { email: "applicant.lakeview@pravah.demo", institution: "Lakeview College of Engineering", note: "Returned for rectification — missing NOC" },
  { email: "applicant.coastal@pravah.demo", institution: "Coastal Institute of Pharmacy", note: "Mismatched identifier and intake" },
  { email: "applicant.sunrise@pravah.demo", institution: "Sunrise Institute of Technology", note: "All automated checks passed" },
  { email: "applicant.valley@pravah.demo", institution: "Valley Institute of Technology", note: "Forwarded to the competent authority" },
  { email: "applicant.riverside@pravah.demo", institution: "Riverside Polytechnic Institute", note: "Scanned document, issuer pending" },
  { email: "applicant.highland@pravah.demo", institution: "Highland Institute of Technology", note: "Duplicate evidence indicators" },
];

export function isDemoAccount(email: string, portal: "INSTITUTION" | "OFFICIAL") {
  const list = portal === "INSTITUTION" ? DEMO_INSTITUTIONS : DEMO_OFFICIALS;
  return list.some((a) => a.email === email);
}
