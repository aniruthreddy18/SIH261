import Link from "next/link";
import { CalendarCheck2, CalendarClock, ClipboardList, Download, FileCheck2 } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { applicationTypeLabel, daysBetween, EVC_RECOMMENDATIONS, type EvcRecommendation } from "@/lib/workflow/stages";
import { scheduleEvcAction, submitEvcReportAction } from "@/app/actions/monitoring";
import { listCommitteeMembers, listEvcVisits } from "@/server/evc";
import { getSettings } from "@/server/settings";
import { pageGuard } from "@/server/session";
import { PageHeader, EmptyState, Notice } from "@/components/page-header";
import { AccessDenied } from "@/components/access-denied";
import { ActionDialog } from "@/components/action-dialog";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { json } from "@/server/db";
import { formatDate } from "@/lib/utils";
import { reportCsvPath } from "@/server/monitoring-reports";

export const metadata = { title: "EVC Scheduling" };

const REC_TONE: Record<string, "ok" | "warn" | "bad"> = { SATISFACTORY: "ok", DEFICIENCIES: "warn", NOT_SATISFACTORY: "bad" };

export default async function EvcPage() {
  const { actor, denied } = await pageGuard(["evc.schedule", "evc.report"]);
  const crumbs = [{ label: "Command Centre", href: "/" }, { label: "EVC Scheduling" }];
  if (denied) return (<><PageHeader title="EVC Scheduling" crumbs={crumbs} /><AccessDenied /></>);
  const [visits, members, settings] = await Promise.all([listEvcVisits(actor), listCommitteeMembers(), getSettings()]);
  const now = new Date();
  const canSchedule = hasPermission(actor.role, "evc.schedule");
  const isCommittee = actor.role === "COMMITTEE_MEMBER";
  const awaiting = visits.filter((v) => v.status === "AWAITING_SCHEDULE" && v.stageInstance.status === "ACTIVE");
  const scheduled = visits.filter((v) => v.status === "SCHEDULED").sort((a, b) => (isCommittee ? Number(b.convenorId === actor.userId) - Number(a.convenorId === actor.userId) : 0) || (a.visitDate?.getTime() ?? 0) - (b.visitDate?.getTime() ?? 0));
  const reported = visits.filter((v) => v.status === "REPORT_SUBMITTED").sort((a, b) => (b.reportSubmittedAt?.getTime() ?? 0) - (a.reportSubmittedAt?.getTime() ?? 0));
  const memberOptions = members.map((m) => ({ value: m.id, label: `${m.name}${m.designation ? ` — ${m.designation}` : ""}` }));
  const today = now.toISOString().slice(0, 10);

  const scheduleDialog = (visitId: string, re: boolean) => (
    <ActionDialog
      label={re ? "Reschedule" : "Schedule visit"}
      icon={<CalendarClock />}
      size="xs"
      variant={re ? "outline" : "default"}
      title={re ? "Reschedule expert visit" : "Schedule expert visit"}
      description="The convenor and the institution are notified (standard visit intimation). Recorded in the audit trail."
      fields={[
        { name: "visitDate", label: "Visit date", type: "date", defaultValue: today },
        { name: "convenorId", label: "Convenor (committee member)", type: "select", options: memberOptions },
        { name: "members", label: "Other committee members (optional)", required: false, placeholder: "Names, separated by commas", hint: "Experts nominated for this visit." },
        ...(re ? [{ name: "reason", label: "Reason for rescheduling", type: "textarea" as const, minLength: 10 }] : []),
      ]}
      action={scheduleEvcAction.bind(null, visitId)}
    />
  );

  return (
    <>
      <PageHeader
        title="EVC Scheduling"
        crumbs={crumbs}
        description={`Applications whose pathway requires an Expert Visit Committee join this queue when their preliminary processing is complete. A visit must be scheduled within ${settings.evcScheduleWithinDays} days and the report filed within ${settings.evcReportWithinDays} days of the visit (sample timelines). Overdue scheduling and reports are escalated automatically.`}
        actions={<Button asChild size="sm" variant="outline"><a href={reportCsvPath("evc")}><Download /> CSV</a></Button>}
      />
      {isCommittee && <div className="mb-4"><Notice title="Your committee assignments">Visits where you are the convenor are marked “You”. File the report after the visit; your recommendation routes the application — the decision stays with the competent authority.</Notice></div>}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title={`Awaiting scheduling (${awaiting.length})`} description="Queue in order of the scheduling deadline." />
          {awaiting.length === 0 ? <EmptyState icon={<ClipboardList />} title="The EVC queue is empty" /> : (
            <Table>
              <THead><tr><TH>Application</TH><TH>Schedule by</TH><TH>EVC stage due</TH><TH /></tr></THead>
              <TBody>
                {awaiting.map((v) => {
                  const left = daysBetween(now, v.scheduleBy);
                  return (
                    <TR key={v.id}>
                      <TD><Link href={`/applications/${v.application.id}?tab=workflow`} className="font-mono text-xs hover:underline">{v.application.reference}</Link><p className="text-[11px] text-muted">{v.application.institutionName} · {v.application.institution.region?.name} · {applicationTypeLabel(v.application.applicationType)}</p></TD>
                      <TD className="text-xs tabular">{formatDate(v.scheduleBy)}<div className="mt-0.5">{left < 0 ? <Badge tone="bad">{Math.abs(left)} d late</Badge> : left <= 2 ? <Badge tone="warn">{left} d left</Badge> : <Badge tone="ok">{left} d left</Badge>}</div></TD>
                      <TD className="text-xs tabular">{formatDate(v.stageInstance.dueAt)}</TD>
                      <TD className="text-right">{canSchedule ? scheduleDialog(v.id, false) : null}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title={`Scheduled visits (${scheduled.length})`} description="Upcoming visits and reports still to be filed." />
          {scheduled.length === 0 ? <EmptyState icon={<CalendarCheck2 />} title="No visits scheduled" /> : (
            <Table>
              <THead><tr><TH>Application</TH><TH>Visit</TH><TH>Committee</TH><TH /></tr></THead>
              <TBody>
                {scheduled.map((v) => {
                  const mine = v.convenorId === actor.userId;
                  const visited = v.visitDate && v.visitDate <= now;
                  const reportDue = v.visitDate ? new Date(v.visitDate.getTime() + settings.evcReportWithinDays * 86_400_000) : null;
                  return (
                    <TR key={v.id}>
                      <TD><Link href={`/applications/${v.application.id}?tab=workflow`} className="font-mono text-xs hover:underline">{v.application.reference}</Link><p className="text-[11px] text-muted">{v.application.institutionName} · {v.application.institution.city}</p></TD>
                      <TD className="text-xs tabular">
                        {formatDate(v.visitDate)}
                        <div className="mt-0.5">{!visited ? <Badge tone="info">in {daysBetween(now, v.visitDate!)} d</Badge> : reportDue && now > reportDue ? <Badge tone="bad">Report {daysBetween(reportDue, now)} d late</Badge> : <Badge tone="warn">Report due {formatDate(reportDue)}</Badge>}</div>
                      </TD>
                      <TD className="text-xs">{v.convenorName}{mine && <Badge tone="accent" className="ml-1">You</Badge>}<p className="text-[11px] text-muted">{json<string[]>(v.committeeJson, []).slice(1).join(", ")}</p></TD>
                      <TD className="space-y-1 text-right">
                        {mine && visited && (
                          <ActionDialog
                            label="Submit report"
                            icon={<FileCheck2 />}
                            size="xs"
                            variant="default"
                            title="EVC report"
                            description="Satisfactory or not-satisfactory reports move the application to the next stage; deficiencies return it to the institution with your observations. The regulatory decision stays with the competent authority."
                            fields={[
                              { name: "recommendation", label: "Recommendation", type: "select", options: Object.entries(EVC_RECOMMENDATIONS).map(([value, label]) => ({ value, label })) },
                              { name: "summary", label: "Observations", type: "textarea", minLength: 20, placeholder: "Facilities, documents verified on site, deficiencies observed…" },
                              { name: "reference", label: "Report reference", minLength: 3, placeholder: "e.g. EVC/2027/SR/014" },
                            ]}
                            action={submitEvcReportAction.bind(null, v.id)}
                          />
                        )}
                        {canSchedule && scheduleDialog(v.id, true)}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title={`Reports submitted (${reported.length})`} description="Committee recommendations recorded in Pravah AI." />
        {reported.length === 0 ? <EmptyState icon={<FileCheck2 />} title="No reports yet" /> : (
          <Table>
            <THead><tr><TH>Application</TH><TH>Visit</TH><TH>Convenor</TH><TH>Recommendation</TH><TH className="hidden lg:table-cell">Observations</TH><TH>Reference</TH></tr></THead>
            <TBody>
              {reported.map((v) => (
                <TR key={v.id}>
                  <TD><Link href={`/applications/${v.application.id}?tab=workflow`} className="font-mono text-xs hover:underline">{v.application.reference}</Link><p className="text-[11px] text-muted">{v.application.institutionName}</p></TD>
                  <TD className="text-xs tabular">{formatDate(v.visitDate)}<p className="text-[11px] text-muted">filed {formatDate(v.reportSubmittedAt)}</p></TD>
                  <TD className="text-xs">{v.convenorName}</TD>
                  <TD><Badge tone={REC_TONE[v.recommendation ?? ""] ?? "neutral"}>{EVC_RECOMMENDATIONS[v.recommendation as EvcRecommendation] ?? v.recommendation}</Badge></TD>
                  <TD className="hidden lg:table-cell max-w-md text-xs"><p className="line-clamp-2">{v.reportSummary}</p></TD>
                  <TD className="font-mono text-[11px]">{v.reportReference}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
