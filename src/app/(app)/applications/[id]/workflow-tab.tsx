import Link from "next/link";
import { CalendarClock, FilePlus2, FileCheck2, Gavel, History, Undo2, RotateCcw } from "lucide-react";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import {
  applicationTypeLabel, COMMITTEE_OUTCOMES, complianceTypeLabel, daysBetween, dueState, EVC_RECOMMENDATIONS, EVC_STATUS_LABELS, revertTargets, stageLabel, UNDERTAKING_TYPES,
  type EvcRecommendation, type StageCode,
} from "@/lib/workflow/stages";
import { committeeOutcomeAction, createUndertakingAction, returnForDeficienciesAction, revertToStageAction, scheduleEvcAction, submitEvcReportAction } from "@/app/actions/monitoring";
import { prisma, json } from "@/server/db";
import { listCommitteeMembers } from "@/server/evc";
import { getStageHistory } from "@/server/pendency";
import { getSettings } from "@/server/settings";
import { stagesOf } from "@/server/stage-engine";
import { ActionDialog } from "@/components/action-dialog";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState, Notice } from "@/components/page-header";
import { DueBadge, EscalationBadge, StageTracker, trackerSteps } from "@/components/workflow/stage-ui";
import { ComplianceTiming } from "@/components/workflow/compliance-ui";
import { formatDate, formatDateTime } from "@/lib/utils";

type App = { id: string; institutionId: string; applicationType: string; pathwayCode: string | null; pathwayStagesJson: string | null; currentStage: string | null; status: string; institution: { regionId: string | null } };

const OUTCOME_LABELS: Record<string, string> = {
  FORWARDED: "Forwarded", AUTO_ROUTED: "Routed automatically", RETURNED_FOR_DEFICIENCY: "Returned to institution", REVERTED: "Reverted",
  EVC_SATISFACTORY: "EVC: satisfactory", EVC_NOT_SATISFACTORY: "EVC: not satisfactory", SAC_RECOMMENDED: "SAC/SHC: recommended", SAC_NOT_RECOMMENDED: "SAC/SHC: not recommended",
};

export async function WorkflowTab({ app, actor }: { app: App; actor: Actor }) {
  const [{ instances, visits, configs }, settings, members, items, pathway, region] = await Promise.all([
    getStageHistory(app.id),
    getSettings(),
    listCommitteeMembers(),
    prisma.complianceItem.findMany({ where: { institutionId: app.institutionId }, orderBy: { dueDate: "asc" }, include: { submissions: { take: 1, orderBy: { submittedAt: "desc" } } } }),
    app.pathwayCode ? prisma.pathwayConfig.findUnique({ where: { code: app.pathwayCode } }) : Promise.resolve(null),
    app.institution.regionId ? prisma.region.findUnique({ where: { id: app.institution.regionId } }) : Promise.resolve(null),
  ]);
  const now = new Date();
  const stages = stagesOf(app);
  const active = instances.find((i) => i.status === "ACTIVE");
  const activeCfg = active ? configs.get(active.stageCode as StageCode) : undefined;
  const visit = active?.stageCode === "EVC" ? visits.find((v) => v.stageInstanceId === active.id) : undefined;
  const canReturn = hasPermission(actor.role, "application.requestRectification") && !!active && ["EVC", "SAC_SHC", "DECISION"].includes(active.stageCode);
  const targets = hasPermission(actor.role, "workflow.revert") && active ? revertTargets(stages, active.stageCode) : [];
  const canCommittee = hasPermission(actor.role, "committee.record") && active?.stageCode === "SAC_SHC";
  const canSchedule = hasPermission(actor.role, "evc.schedule");
  const memberOptions = members.map((m) => ({ value: m.id, label: m.name }));

  if (!app.currentStage) {
    return <Card><EmptyState icon={<History />} title="Not yet in a processing pathway" description="The pathway is assigned when the application is submitted and its first automated checks complete." /></Card>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={`Pathway: ${pathway?.name ?? app.pathwayCode}`}
          description={`${applicationTypeLabel(app.applicationType)} · ${region?.name ?? "Region not set"} · stages move on automatically when the current stage is completed by an authorised action.`}
          actions={<div className="flex flex-wrap gap-2">
            {canReturn && <ActionDialog label="Return to institution" icon={<Undo2 />} size="xs" title="Return for deficiencies" description="The institution is asked to correct the deficiencies you record; when it resubmits, the application returns to scrutiny (re-scrutiny) and then resumes the pathway." fields={[{ name: "message", label: "Deficiencies and what to submit", type: "textarea", minLength: 10 }]} action={returnForDeficienciesAction.bind(null, app.id)} />}
            {targets.length > 0 && <ActionDialog label="Revert to earlier stage" icon={<RotateCcw />} size="xs" title="Revert for further verification" description="Closes the current stage and reopens the stage you choose. The reason is recorded." fields={[{ name: "target", label: "Revert to", type: "select", options: targets.map((t) => ({ value: t, label: stageLabel(t) })) }, { name: "reason", label: "Reason", type: "textarea", minLength: 10 }]} action={revertToStageAction.bind(null, app.id)} />}
          </div>}
        />
        <CardBody className="space-y-3">
          <StageTracker steps={trackerSteps(stages, instances, app.currentStage, now)} />
          {app.currentStage === "RETURNED" && <Notice tone="warn" title="With the institution">Returned for rectification. The stage clock is paused; it restarts at re-scrutiny when the institution resubmits.</Notice>}
          {active && activeCfg && (
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
              <span>At <strong className="text-ink">{stageLabel(active.stageCode, active.attempt)}</strong> since {formatDate(active.enteredAt)} ({daysBetween(active.enteredAt, now)} d) · due {formatDate(active.dueAt)}</span>
              <DueBadge state={dueState(active.dueAt, now, activeCfg.reminderDaysBefore)} daysLeft={daysBetween(now, active.dueAt)} />
              <EscalationBadge level={active.escalationLevel} />
            </div>
          )}
        </CardBody>
      </Card>

      {visit && (
        <Card>
          <CardHeader title="Expert Visit Committee" description={`Schedule by ${formatDate(visit.scheduleBy)} · ${EVC_STATUS_LABELS[visit.status]}`}
            actions={<div className="flex gap-2">
              {canSchedule && visit.status !== "REPORT_SUBMITTED" && (
                <ActionDialog label={visit.status === "SCHEDULED" ? "Reschedule" : "Schedule visit"} icon={<CalendarClock />} size="xs" variant={visit.status === "SCHEDULED" ? "outline" : "default"} title="Schedule expert visit" description="The convenor and the institution are notified."
                  fields={[{ name: "visitDate", label: "Visit date", type: "date", defaultValue: now.toISOString().slice(0, 10) }, { name: "convenorId", label: "Convenor", type: "select", options: memberOptions }, { name: "members", label: "Other members (optional)", required: false }, ...(visit.status === "SCHEDULED" ? [{ name: "reason", label: "Reason for rescheduling", type: "textarea" as const, minLength: 10 }] : [])]}
                  action={scheduleEvcAction.bind(null, visit.id)} />
              )}
              {visit.status === "SCHEDULED" && visit.convenorId === actor.userId && visit.visitDate && visit.visitDate <= now && (
                <ActionDialog label="Submit report" icon={<FileCheck2 />} size="xs" variant="default" title="EVC report"
                  fields={[{ name: "recommendation", label: "Recommendation", type: "select", options: Object.entries(EVC_RECOMMENDATIONS).map(([value, label]) => ({ value, label })) }, { name: "summary", label: "Observations", type: "textarea", minLength: 20 }, { name: "reference", label: "Report reference", minLength: 3 }]}
                  action={submitEvcReportAction.bind(null, visit.id)} />
              )}
            </div>} />
          <CardBody className="text-[13px] text-ink-2">
            {visit.status === "AWAITING_SCHEDULE" ? <p>In the EVC queue{now > visit.scheduleBy ? <> — <span className="font-medium text-bad">scheduling is {daysBetween(visit.scheduleBy, now)} day(s) late</span></> : ""}.</p> : (
              <p>Visit on <strong className="text-ink">{formatDate(visit.visitDate)}</strong> · convenor {visit.convenorName} · committee: {json<string[]>(visit.committeeJson, []).join(", ")}{visit.rescheduleCount ? ` · rescheduled ${visit.rescheduleCount}×` : ""}</p>
            )}
          </CardBody>
        </Card>
      )}

      {canCommittee && (
        <Notice title="SAC/SHC consideration">
          <div className="flex flex-wrap items-center gap-3">
            <span>Record the committee&apos;s outcome with the meeting date and minutes reference. A recommendation moves the application to the competent authority; a return sends it back to the institution.</span>
            <ActionDialog label="Record committee outcome" icon={<Gavel />} size="xs" variant="default" title="SAC/SHC outcome"
              fields={[{ name: "outcome", label: "Outcome", type: "select", options: Object.entries(COMMITTEE_OUTCOMES).map(([value, label]) => ({ value, label })) }, { name: "meetingDate", label: "Meeting date", type: "date", defaultValue: now.toISOString().slice(0, 10) }, { name: "remarks", label: "Reasons", type: "textarea", minLength: 20 }, { name: "reference", label: "Minutes reference", minLength: 3 }]}
              action={committeeOutcomeAction.bind(null, app.id)} />
          </div>
        </Notice>
      )}

      <Card>
        <CardHeader title="Stage history" description="Every stage visit with its timeline, who completed it and the outcome. Nothing is overwritten." />
        <Table>
          <THead><tr><TH>Stage</TH><TH>Entered</TH><TH>Due</TH><TH>Completed</TH><TH className="text-right">Days</TH><TH>Outcome</TH><TH className="hidden lg:table-cell">Remarks</TH></tr></THead>
          <TBody>
            {instances.map((i) => {
              const end = i.completedAt ?? now;
              const days = daysBetween(i.enteredAt, end);
              const late = (i.completedAt ?? now) > i.dueAt;
              return (
                <TR key={i.id}>
                  <TD className="font-medium text-ink">{stageLabel(i.stageCode, i.attempt)}</TD>
                  <TD className="text-xs tabular">{formatDateTime(i.enteredAt)}</TD>
                  <TD className="text-xs tabular">{formatDate(i.dueAt)}</TD>
                  <TD className="text-xs">{i.completedAt ? <>{formatDateTime(i.completedAt)}<p className="text-[11px] text-muted">{i.completedByName}</p></> : <Badge tone="accent">In progress</Badge>}</TD>
                  <TD className={late ? "text-right text-xs tabular font-semibold text-bad" : "text-right text-xs tabular"}>{days}</TD>
                  <TD className="text-xs">{i.status === "ACTIVE" ? "—" : OUTCOME_LABELS[i.outcome ?? ""] ?? i.outcome?.replace(/_/g, " ").toLowerCase()}{i.reference ? <p className="font-mono text-[11px] text-muted">{i.reference}</p> : null}</TD>
                  <TD className="hidden lg:table-cell max-w-md text-xs"><p className="line-clamp-2" title={i.remarks ?? ""}>{i.remarks}</p></TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        {visits.filter((v) => v.status === "REPORT_SUBMITTED").map((v) => (
          <div key={v.id} className="border-t border-border px-4 py-3 text-[13px]">
            <p className="font-medium text-ink">EVC report {v.reportReference} · {formatDate(v.visitDate)} · {EVC_RECOMMENDATIONS[v.recommendation as EvcRecommendation] ?? v.recommendation}</p>
            <p className="text-xs text-ink-2">{v.reportSummary}</p>
          </div>
        ))}
      </Card>

      <Card>
        <CardHeader title="Institutional compliance" description="Undertakings and document validity tracked for this institution."
          actions={hasPermission(actor.role, "compliance.manage") ? (
            <ActionDialog label="Record undertaking" icon={<FilePlus2 />} size="xs" title="Record a time-bound undertaking" fields={[{ name: "typeCode", label: "Type", type: "select", options: Object.entries(UNDERTAKING_TYPES).map(([value, label]) => ({ value, label })) }, { name: "title", label: "Undertaking", minLength: 5 }, { name: "description", label: "Condition and evidence expected", type: "textarea" }, { name: "dueDate", label: "Due date", type: "date" }]} action={createUndertakingAction.bind(null, app.institutionId, app.id)} />
          ) : null} />
        {items.length === 0 ? <p className="px-4 py-5 text-center text-xs text-muted">Nothing tracked yet. Time-bound conditions recorded with the outcome, and the validity of documents such as the fire NOC, are tracked once the application is decided.</p> : (
          <ul className="divide-y divide-border">
            {items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
                <div className="min-w-0 flex-1"><Link href={`/compliance-monitor/${i.id}`} className="font-medium text-ink hover:underline">{i.title}</Link><p className="text-[11px] text-muted">{i.kind === "UNDERTAKING" ? "Undertaking" : "Document validity"} · {complianceTypeLabel(i.typeCode)}{i.reference ? ` · ${i.reference}` : ""} · {i.kind === "UNDERTAKING" ? "due" : "valid until"} {formatDate(i.dueDate)}</p></div>
                <ComplianceTiming status={i.status} dueDate={i.dueDate} kind={i.kind} warnDays={i.kind === "UNDERTAKING" ? settings.undertakingReminderDays : settings.documentExpiryFirstAlertDays} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
