import { prisma } from "./db";

/** Runtime-configurable settings (System Settings page). Values are stored as strings. */
export const SETTING_DEFS = {
  maxUploadMb: { label: "Maximum upload size (MB)", type: "number", min: 1, max: 50, default: () => Number(process.env.MAX_UPLOAD_MB ?? 15), help: "Per-file limit for document uploads." },
  lowConfidenceThreshold: { label: "Low-confidence threshold", type: "number", min: 0.1, max: 0.99, default: () => 0.6, help: "Extracted values below this confidence are routed to human review instead of being decided automatically." },
  academicYearStartMonth: { label: "Academic year start month", type: "number", min: 1, max: 12, default: () => 7, help: "Used by validity rules that reference the start of the academic year." },
  academicYearStartDay: { label: "Academic year start day", type: "number", min: 1, max: 31, default: () => 1, help: "Day of month for the academic year start." },
  issuerTimeoutMs: { label: "Issuer request timeout (ms)", type: "number", min: 500, max: 30000, default: () => 5000, help: "Per-attempt timeout for issuer verification requests." },
  issuerMaxRetries: { label: "Issuer max retries", type: "number", min: 0, max: 4, default: () => 2, help: "Bounded retries for transient source failures." },
  syntheticIssuerOutage: { label: "Simulate synthetic issuer outage", type: "boolean", default: () => false, help: "Makes the synthetic demo issuer return SOURCE_UNAVAILABLE, to demonstrate outage handling." },
  highSeverityAlertDays: { label: "High-severity ageing alert (days)", type: "number", min: 0, max: 60, default: () => 3, help: "Unresolved HIGH/CRITICAL findings older than this generate an alert." },
  rectificationDueDays: { label: "Default rectification window (days)", type: "number", min: 1, max: 90, default: () => 14, help: "Due date offset for rectification requests." },
  // Monitoring timelines (PS 26262). Sample values — configure per the applicable APH.
  evcScheduleWithinDays: { label: "EVC: schedule within (days)", type: "number", min: 1, max: 60, default: () => 7, help: "An application entering the EVC stage must have its visit scheduled within this many days." },
  evcVisitReminderDays: { label: "EVC: visit reminder (days before)", type: "number", min: 0, max: 30, default: () => 3, help: "Committee convenor and institution are reminded this many days before the visit." },
  evcReportWithinDays: { label: "EVC: report due after visit (days)", type: "number", min: 1, max: 30, default: () => 5, help: "The committee report is overdue this many days after the visit date." },
  undertakingReminderDays: { label: "Undertakings: first reminder (days before due)", type: "number", min: 1, max: 180, default: () => 30, help: "Institutions are reminded of an undertaking this many days before it falls due." },
  undertakingFinalReminderDays: { label: "Undertakings: final reminder (days before due)", type: "number", min: 0, max: 60, default: () => 7, help: "Second reminder, also sent to the Regional officer." },
  documentExpiryFirstAlertDays: { label: "Documents: first expiry alert (days before)", type: "number", min: 1, max: 365, default: () => 60, help: "Advance alert to the institution to renew a lease deed or other prescribed document." },
  documentExpirySecondAlertDays: { label: "Documents: second expiry alert (days before)", type: "number", min: 0, max: 120, default: () => 15, help: "Second alert, also sent to the Regional officer." },
  complianceVerifyWithinDays: { label: "Compliance: verify submissions within (days)", type: "number", min: 1, max: 60, default: () => 7, help: "Officials are reminded when submitted evidence has waited this long for verification." },
  complianceEscalateL2Days: { label: "Compliance: escalate to Bureau after (days overdue)", type: "number", min: 0, max: 180, default: () => 7, help: "Unfulfilled undertakings and expired documents escalate to the Approval Bureau." },
  complianceEscalateL3Days: { label: "Compliance: escalate to competent authority after (days overdue)", type: "number", min: 1, max: 365, default: () => 30, help: "Second escalation level for long-overdue compliance." },
} as const;

export type SettingKey = keyof typeof SETTING_DEFS;
export type Settings = { [K in SettingKey]: (typeof SETTING_DEFS)[K]["type"] extends "boolean" ? boolean : number };

export async function getSettings(): Promise<Settings> {
  const rows = await prisma.systemSetting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const out: Record<string, number | boolean> = {};
  for (const [key, def] of Object.entries(SETTING_DEFS)) {
    const raw = map.get(key);
    if (def.type === "boolean") out[key] = raw === undefined ? def.default() : raw === "true";
    else {
      const n = raw === undefined ? NaN : Number(raw);
      out[key] = Number.isFinite(n) ? n : (def.default() as number);
    }
  }
  return out as Settings;
}
