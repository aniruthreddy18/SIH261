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
