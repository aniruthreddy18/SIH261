import Link from "next/link";
import { Plus } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { RULE_CATEGORY_LABELS, type RuleCategory } from "@/lib/domain";
import { CHECK_TYPE_LABELS, describeDefinition, type CheckType } from "@/lib/validation/definitions";
import { listRules } from "@/server/rules";
import { prisma, json } from "@/server/db";
import { requireActor } from "@/server/session";
import { PageHeader, Notice } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge } from "@/components/status";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Validation Rules" };

export default async function RulesPage() {
  const actor = await requireActor();
  const [rules, cats] = await Promise.all([listRules(), prisma.documentCategory.findMany()]);
  const catName = (c: string) => cats.find((x) => x.code === c)?.name ?? c;
  const now = new Date();
  const grouped = Object.entries(RULE_CATEGORY_LABELS).map(([k, label]) => ({ key: k, label, rules: rules.filter((r) => r.category === k) })).filter((g) => g.rules.length);
  return (
    <>
      <PageHeader
        title="Validation Rules"
        crumbs={[{ label: "Command Centre", href: "/" }, { label: "Validation Rules" }]}
        description="Deterministic, versioned rules executed by the validation engine. Every validation run records the exact rule versions it used."
        actions={hasPermission(actor.role, "rules.manage") ? <Button asChild size="sm"><Link href="/rules/new"><Plus /> New rule</Link></Button> : undefined}
      />
      <div className="mb-4"><Notice tone="warn">Rules marked <strong>Sample</strong> are demonstration policies configured for this prototype. They are not verified AICTE regulations; no regulatory citation is claimed unless a source reference is recorded.</Notice></div>
      <div className="space-y-4">
        {grouped.map((g) => (
          <Card key={g.key}>
            <CardHeader title={g.label} description={`${g.rules.length} rule(s)`} />
            <ul className="divide-y divide-border">
              {g.rules.map((r) => {
                const inEffect = r.versions.find((v) => v.effectiveFrom <= now) ?? r.versions[0];
                return (
                  <li key={r.id}>
                    <Link href={`/rules/${r.id}`} className="flex flex-wrap items-start gap-3 px-4 py-3 hover:bg-subtle/60">
                      <span className="w-28 shrink-0 font-mono text-xs text-ink-2">{r.code}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-ink">{r.name}</p>
                        <p className="mt-0.5 text-xs text-muted">{describeDefinition(inEffect.checkType, json(inEffect.definitionJson, {}), catName)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="outline">{CHECK_TYPE_LABELS[inEffect.checkType as CheckType] ?? inEffect.checkType}</Badge>
                        <SeverityBadge severity={inEffect.severity} />
                        <Badge tone="neutral">v{inEffect.version}{r.versions.length > 1 ? ` of ${r.versions.length}` : ""}</Badge>
                        {r.isSample && <Badge tone="warn">Sample</Badge>}
                        {r.active ? <Badge tone="ok">Active</Badge> : <Badge tone="bad">Inactive</Badge>}
                        <span className="text-[11px] text-faint">since {formatDate(inEffect.effectiveFrom)}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted">Category list: {Object.keys(RULE_CATEGORY_LABELS).map((k) => RULE_CATEGORY_LABELS[k as RuleCategory]).join(" · ")}</p>
    </>
  );
}
