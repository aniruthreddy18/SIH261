import { notFound } from "next/navigation";
import { Power } from "lucide-react";
import { hasPermission, NotFoundError } from "@/lib/auth/permissions";
import { CHECK_TYPE_LABELS, describeDefinition, type CheckType } from "@/lib/validation/definitions";
import { RULE_CATEGORY_LABELS, type RuleCategory } from "@/lib/domain";
import { getRule } from "@/server/rules";
import { prisma, json } from "@/server/db";
import { requireActor } from "@/server/session";
import { setRuleActiveAction } from "@/app/actions/admin";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionDialog } from "@/components/action-dialog";
import { RuleStatusBadge, SeverityBadge } from "@/components/status";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/utils";
import { RuleForm } from "../rule-form";

export const metadata = { title: "Rule" };

export default async function RulePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  let data;
  try {
    data = await getRule(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { rule, usage } = data;
  const [cats, templates] = await Promise.all([prisma.documentCategory.findMany({ orderBy: { sortOrder: "asc" } }), prisma.applicationTemplate.findMany()]);
  const catName = (c: string) => cats.find((x) => x.code === c)?.name ?? c;
  const latest = rule.versions[0];
  const canManage = hasPermission(actor.role, "rules.manage");
  const now = new Date();
  return (
    <>
      <PageHeader
        title={rule.name}
        crumbs={[{ label: "Validation Rules", href: "/rules" }, { label: rule.code }]}
        meta={<><span className="font-mono text-xs">{rule.code}</span><Badge tone="outline">{RULE_CATEGORY_LABELS[rule.category as RuleCategory]}</Badge>{rule.isSample && <Badge tone="warn">Sample rule</Badge>}{rule.active ? <Badge tone="ok">Active</Badge> : <Badge tone="bad">Inactive</Badge>}</>}
        description={rule.description}
        actions={canManage ? <ActionDialog label={rule.active ? "Deactivate" : "Activate"} icon={<Power />} variant={rule.active ? "destructive" : "default"} title={rule.active ? "Deactivate rule" : "Activate rule"} description="Deactivated rules are skipped by future validation runs. Past runs keep their results." fields={[{ name: "reason", label: "Reason", type: "textarea" }]} action={setRuleActiveAction.bind(null, rule.id, !rule.active)} /> : undefined}
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Version history" description="Versions are immutable. The version in effect is the latest one whose effective date has passed." />
          <Table>
            <THead><tr><TH>Version</TH><TH>Condition</TH><TH>Severity</TH><TH>Effective</TH><TH className="hidden lg:table-cell">Change note</TH></tr></THead>
            <TBody>
              {rule.versions.map((v) => {
                const inEffect = rule.versions.find((x) => x.effectiveFrom <= now)?.id === v.id;
                return (
                  <TR key={v.id}>
                    <TD><span className="font-mono">v{v.version}</span>{inEffect && <Badge tone="ok" className="ml-1">in effect</Badge>}</TD>
                    <TD className="max-w-md text-xs"><p className="font-medium text-ink">{CHECK_TYPE_LABELS[v.checkType as CheckType]}</p><p className="text-muted">{describeDefinition(v.checkType, json(v.definitionJson, {}), catName)}</p><p className="mt-1 text-[11px] text-muted">Applies to: {json<string[]>(v.appliesToJson, []).join(", ") || "all templates"}</p></TD>
                    <TD><SeverityBadge severity={v.severity} /></TD>
                    <TD className="text-xs whitespace-nowrap">{formatDate(v.effectiveFrom)}<p className="text-[11px] text-faint">created {formatDateTime(v.createdAt)}</p></TD>
                    <TD className="hidden lg:table-cell text-xs">{v.changeNote}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Governance" />
            <CardBody className="space-y-1.5 text-xs">
              <p><span className="text-muted">Remediation guidance:</span> {latest.remediation}</p>
              <p><span className="text-muted">Regulatory source:</span> {latest.sourceReference ?? "None recorded — sample/demonstration rule."}</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Results produced" description="Across all stored validation runs." />
            <ul className="divide-y divide-border">
              {usage.length === 0 && <li className="px-4 py-3 text-xs text-muted">Not used in any run yet.</li>}
              {usage.sort((a, b) => b.ruleVersionNo - a.ruleVersionNo).map((u, i) => (
                <li key={i} className="flex items-center justify-between px-4 py-1.5 text-xs"><span className="font-mono text-muted">v{u.ruleVersionNo}</span><RuleStatusBadge status={u.status} /><span className="tabular text-ink">{u._count}</span></li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
      {canManage && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-ink">Create a new version</h2>
          <RuleForm
            categories={cats.map((c) => ({ code: c.code, name: c.name }))}
            templates={templates.map((t) => ({ code: t.code, name: t.name }))}
            initial={{ ruleId: rule.id, code: rule.code, name: rule.name, description: rule.description, category: rule.category, checkType: latest.checkType, definition: json(latest.definitionJson, {}), severity: latest.severity, appliesTo: json(latest.appliesToJson, []), remediation: latest.remediation, sourceReference: latest.sourceReference ?? "", isSample: rule.isSample }}
          />
        </div>
      )}
    </>
  );
}
