// Consolidated monitoring reports (PS 26262 §F): application pendency, overdue cases, EVC
// status, undertaking compliance, document validity, Region-wise performance and the alert log.
// Each report is a plain table so it can be shown on screen, exported as CSV, or combined into
// the consolidated PDF.
import { assertPermission, type Actor } from "@/lib/auth/permissions";
import { applicationTypeLabel, complianceTypeLabel, COMPLIANCE_STATUS_LABELS, daysBetween, DUE_STATE_LABELS, EVC_RECOMMENDATIONS, EVC_STATUS_LABELS, stageLabel, ALERT_KIND_LABELS, ALERT_SUBJECT_LABELS } from "@/lib/workflow/stages";
import { listAlerts } from "./alerts";
import { listComplianceItems } from "./compliance-monitor";
import { listEvcVisits } from "./evc";
import { getPendency } from "./pendency";

export const REPORT_KINDS = {
  pendency: "Application pendency (stage-wise)",
  overdue: "Overdue cases",
  evc: "EVC status",
  undertakings: "Undertaking compliance",
  documents: "Document validity",
  regions: "Region-wise processing performance",
  alerts: "Alerts and escalations",
} as const;
export type ReportKind = keyof typeof REPORT_KINDS;

export interface ReportTable { kind: ReportKind; title: string; columns: { key: string; label: string }[]; rows: Record<string, string | number>[]; note?: string }

const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : "");

export async function buildMonitoringReport(actor: Actor, kind: ReportKind, now: Date = new Date()): Promise<ReportTable> {
  assertPermission(actor, "reports.view");
  const title = REPORT_KINDS[kind];
  if (kind === "pendency" || kind === "overdue") {
    const p = await getPendency(actor, kind === "overdue" ? { state: "OVERDUE" } : {}, now);
    return {
      kind, title,
      columns: [
        { key: "reference", label: "Application" }, { key: "institution", label: "Institution" }, { key: "region", label: "Region" }, { key: "type", label: "Type" },
        { key: "stage", label: "Stage" }, { key: "desk", label: "Desk" }, { key: "entered", label: "In stage since" }, { key: "due", label: "Due" },
        { key: "daysInStage", label: "Days in stage" }, { key: "daysLeft", label: "Days left (−overdue)" }, { key: "state", label: "State" }, { key: "escalation", label: "Escalation level" },
      ],
      rows: p.cases.map((c) => ({ reference: c.reference, institution: c.institutionName, region: c.regionName, type: applicationTypeLabel(c.applicationType), stage: c.stageLabel, desk: c.desk, entered: d(c.enteredAt), due: d(c.dueAt), daysInStage: c.daysInStage, daysLeft: c.daysLeft, state: DUE_STATE_LABELS[c.state], escalation: c.escalationLevel })),
    };
  }
  if (kind === "regions") {
    const p = await getPendency(actor, {}, now);
    return {
      kind, title,
      columns: [{ key: "region", label: "Region" }, { key: "office", label: "Office (demo)" }, { key: "pending", label: "In process" }, { key: "overdue", label: "Overdue" }, { key: "avgAge", label: "Avg days in stage" }, { key: "completed", label: "Stage visits completed" }, { key: "within", label: "Completed within timeline" }],
      rows: p.regionPerformance.map((r) => ({ region: r.regionName, office: r.office, pending: r.pending, overdue: r.overdue, avgAge: r.avgAge, completed: r.completedStages, within: r.withinTimeline === null ? "—" : `${r.withinTimeline}%` })),
    };
  }
  if (kind === "evc") {
    const visits = await listEvcVisits(actor);
    return {
      kind, title,
      columns: [{ key: "reference", label: "Application" }, { key: "institution", label: "Institution" }, { key: "region", label: "Region" }, { key: "status", label: "Status" }, { key: "scheduleBy", label: "Schedule by" }, { key: "visitDate", label: "Visit date" }, { key: "convenor", label: "Convenor" }, { key: "stageDue", label: "EVC stage due" }, { key: "report", label: "Report" }, { key: "recommendation", label: "Recommendation" }],
      rows: visits.map((v) => ({ reference: v.application.reference, institution: v.application.institutionName, region: v.application.institution.region?.name ?? "", status: EVC_STATUS_LABELS[v.status] ?? v.status, scheduleBy: d(v.scheduleBy), visitDate: d(v.visitDate), convenor: v.convenorName ?? "", stageDue: d(v.stageInstance.dueAt), report: v.reportReference ?? (v.status === "SCHEDULED" && v.visitDate && v.visitDate < now ? "Pending" : ""), recommendation: v.recommendation ? EVC_RECOMMENDATIONS[v.recommendation as keyof typeof EVC_RECOMMENDATIONS] ?? v.recommendation : "" })),
    };
  }
  if (kind === "undertakings" || kind === "documents") {
    const items = await listComplianceItems(actor, { kind: kind === "undertakings" ? "UNDERTAKING" : "DOCUMENT_VALIDITY" });
    return {
      kind, title,
      columns: [{ key: "institution", label: "Institution" }, { key: "region", label: "Region" }, { key: "type", label: "Type" }, { key: "title", label: kind === "documents" ? "Document" : "Undertaking" }, { key: "reference", label: "Reference" }, { key: "due", label: kind === "documents" ? "Valid until" : "Due" }, { key: "days", label: "Days left (−overdue)" }, { key: "status", label: "Status" }, { key: "lastSubmission", label: "Last submission" }, { key: "escalation", label: "Escalation level" }],
      rows: items.map((i) => ({ institution: i.institution.name, region: i.institution.region?.name ?? "", type: complianceTypeLabel(i.typeCode), title: i.title, reference: i.reference ?? "", due: d(i.dueDate), days: i.status === "FULFILLED" || i.status === "WAIVED" ? "" : daysBetween(now, i.dueDate), status: COMPLIANCE_STATUS_LABELS[i.status] ?? i.status, lastSubmission: i.submissions[0] ? `${d(i.submissions[0].submittedAt)} (${i.submissions[0].review.toLowerCase()})` : "", escalation: i.escalationLevel })),
    };
  }
  const alerts = await listAlerts(actor);
  return {
    kind, title,
    columns: [{ key: "raised", label: "Raised" }, { key: "kind", label: "Kind" }, { key: "level", label: "Level" }, { key: "subject", label: "Subject" }, { key: "title", label: "Alert" }, { key: "recipients", label: "Recipients" }, { key: "status", label: "Status" }, { key: "acknowledged", label: "Acknowledged" }],
    rows: alerts.map((a) => ({ raised: a.createdAt.toISOString().slice(0, 16).replace("T", " "), kind: ALERT_KIND_LABELS[a.kind] ?? a.kind, level: a.level, subject: ALERT_SUBJECT_LABELS[a.subjectType] ?? a.subjectType, title: a.title, recipients: `${a.recipients} (${a.recipientRoles.toLowerCase().replace(/_/g, " ") || "—"})`, status: a.resolvedAt ? `Resolved ${d(a.resolvedAt)}` : "Open", acknowledged: a.acknowledgedAt ? `${a.acknowledgedBy} · ${d(a.acknowledgedAt)} · ${a.acknowledgeNote}` : "" })),
    note: "In-app notifications only. No e-mail or SMS is sent by this prototype.",
  };
}

/** Download path for a report's CSV export. */
export const reportCsvPath = (kind: ReportKind) => `/api/exports/monitoring/${kind}`;

export function isReportKind(k: string): k is ReportKind {
  return k in REPORT_KINDS;
}

export function stageText(code: string, attempt: number) {
  return stageLabel(code, attempt);
}
