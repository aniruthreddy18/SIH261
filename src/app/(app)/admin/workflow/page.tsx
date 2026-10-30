import Link from "next/link";
import { ArrowRight, Pencil, Route } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/lib/domain";
import { effectiveStages, stageLabel } from "@/lib/workflow/stages";
import { updateStageConfigAction, updateTypeRouteAction } from "@/app/actions/monitoring";
import { getWorkflowConfig } from "@/server/workflow-config";
import { pageGuard } from "@/server/session";
import { PageHeader, Notice } from "@/components/page-header";
import { AccessDenied } from "@/components/access-denied";
import { ActionDialog } from "@/components/action-dialog";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Workflow & Timelines" };

export default async function WorkflowConfigPage() {
  const { denied } = await pageGuard("workflow.configure");
  const crumbs = [{ label: "Admin Dashboard", href: "/" }, { label: "Workflow & Timelines" }];
  if (denied) return (<><PageHeader title="Workflow & Timelines" crumbs={crumbs} /><AccessDenied /></>);
  const { stages, pathways, routes } = await getWorkflowConfig();
  const pathwayName = new Map(pathways.map((p) => [p.code, p.name]));
  return (
    <>
      <PageHeader title="Workflow & Timelines" crumbs={crumbs} description="Processing pathways, how application types are routed to them, and the timelines that drive reminders and escalations. Changes apply to applications and stages from now on, and are recorded in the audit trail." />
      <div className="mb-4"><Notice tone="warn" title="Sample configuration">These pathways and timelines are demonstration values. They are not taken from the AICTE Approval Process Handbook (APH); configure them per the applicable APH and regulations before any real use.</Notice></div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Processing pathways" description="Stage combinations. Pathways without a scrutiny desk begin with automated preliminary checks." />
          <ul className="divide-y divide-border">
            {pathways.map((p) => (
              <li key={p.code} className="px-4 py-3">
                <p className="text-[13px] font-semibold text-ink">{p.name} <span className="font-mono text-[11px] font-normal text-muted">{p.code}</span></p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {effectiveStages(p.stages).map((s, i, all) => (
                    <span key={s} className="flex items-center gap-1"><Badge tone={s === "PRELIMINARY" ? "neutral" : "accent"}>{stageLabel(s)}</Badge>{i < all.length - 1 && <ArrowRight className="size-3 text-faint" />}</span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Routing by application type" description="Which pathway a newly submitted application follows. Applications already in process keep their pathway." />
          <Table>
            <THead><tr><TH>Application type</TH><TH>Pathway</TH><TH /></tr></THead>
            <TBody>
              {routes.map((r) => (
                <TR key={r.applicationType}>
                  <TD className="text-ink">{r.name}{r.isNewInstitution && <Badge tone="info" className="ml-2">new-institution timelines</Badge>}</TD>
                  <TD>{pathwayName.get(r.pathwayCode) ?? r.pathwayCode}</TD>
                  <TD className="text-right">
                    <ActionDialog label="Change" icon={<Route />} size="xs" title={`Route “${r.name}”`} fields={[{ name: "pathwayCode", label: "Pathway", type: "select", defaultValue: r.pathwayCode, options: pathways.map((p) => ({ value: p.code, label: p.name })) }]} action={updateTypeRouteAction.bind(null, r.applicationType)} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Stage timelines and escalation" description="Days allowed per stage visit; reminder before the due date; escalation to the Approval Bureau (level 2) and the competent authority (level 3) after the stated days overdue." />
        <Table>
          <THead><tr><TH>Stage</TH><TH>Responsible</TH><TH className="text-right">Timeline</TH><TH className="text-right">New institutions</TH><TH className="text-right">Reminder</TH><TH className="text-right">Escalate L2</TH><TH className="text-right">Escalate L3</TH><TH /></tr></THead>
          <TBody>
            {stages.map((s) => (
              <TR key={s.code}>
                <TD><p className="font-medium text-ink">{s.name}</p><p className="max-w-md text-[11px] text-muted">{s.description}</p></TD>
                <TD className="text-xs">{ROLE_LABELS[s.responsibleRole as Role]}</TD>
                <TD className="text-right tabular">{s.slaDays} d</TD>
                <TD className="text-right tabular">{s.newInstitutionSlaDays ? `${s.newInstitutionSlaDays} d` : "—"}</TD>
                <TD className="text-right tabular">{s.reminderDaysBefore} d before</TD>
                <TD className="text-right tabular">+{s.escalateL2AfterDays} d</TD>
                <TD className="text-right tabular">+{s.escalateL3AfterDays} d</TD>
                <TD className="text-right">
                  <ActionDialog label="Edit" icon={<Pencil />} size="xs" title={`Timeline: ${s.name}`} description="Applies to stage visits opened from now on."
                    fields={[
                      { name: "slaDays", label: "Timeline (days)", type: "number", defaultValue: String(s.slaDays) },
                      { name: "newInstitutionSlaDays", label: "Timeline for new institutions (days, optional)", type: "number", required: false, defaultValue: s.newInstitutionSlaDays ? String(s.newInstitutionSlaDays) : "" },
                      { name: "reminderDaysBefore", label: "Reminder (days before due)", type: "number", defaultValue: String(s.reminderDaysBefore) },
                      { name: "escalateL2AfterDays", label: "Escalate to the Bureau after (days overdue)", type: "number", defaultValue: String(s.escalateL2AfterDays) },
                      { name: "escalateL3AfterDays", label: "Escalate to the competent authority after (days overdue)", type: "number", defaultValue: String(s.escalateL3AfterDays) },
                    ]}
                    action={updateStageConfigAction.bind(null, s.code)} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <p className="mt-3 text-xs text-muted">EVC scheduling and report timelines, undertaking reminders, document-expiry alerts and compliance escalation are in <Link href="/admin/settings" className="text-accent hover:underline">System Settings</Link>.</p>
    </>
  );
}
