import Link from "next/link";
import { Inbox } from "lucide-react";
import { ROLE_LABELS, SEVERITIES, SEVERITY_RANK, type Role, type Severity } from "@/lib/domain";
import { FINDING_TYPE_LABELS, findingTypeLabel } from "@/lib/findings";
import { listReviewQueue } from "@/server/findings";
import { pageGuard } from "@/server/session";
import { PageHeader, EmptyState } from "@/components/page-header";
import { AccessDenied } from "@/components/access-denied";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FindingStatusBadge, OutcomeClassBadge, SeverityBadge } from "@/components/status";
import { relativeAge } from "@/lib/utils";

export const metadata = { title: "Review Queue" };

export default async function ReviewQueuePage({ searchParams }: { searchParams: Promise<{ severity?: string; role?: string; type?: string; source?: string; mine?: string }> }) {
  const { actor, denied } = await pageGuard("finding.review");
  const crumbs = [{ label: "Command Centre", href: "/" }, { label: "Review Queue" }];
  if (denied) return (<><PageHeader title="Review Queue" crumbs={crumbs} /><AccessDenied /></>);
  const sp = await searchParams;
  const role = sp.mine === "1" ? actor.role : sp.role;
  const items = (await listReviewQueue(actor, { ...sp, role })).sort((a, b) => SEVERITY_RANK[b.severity as Severity] - SEVERITY_RANK[a.severity as Severity] || a.createdAt.getTime() - b.createdAt.getTime());
  return (
    <>
      <PageHeader title="Review Queue" crumbs={crumbs} description="Unresolved checks routed to human reviewers. Every decision requires a reason and is recorded in the audit trail." />
      <Card>
        <form className="flex flex-wrap items-end gap-2 border-b border-border p-3">
          <Select name="severity" defaultValue={sp.severity ?? ""} className="w-40" aria-label="Severity"><option value="">All severities</option>{SEVERITIES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</Select>
          <Select name="role" defaultValue={sp.role ?? ""} className="w-64" aria-label="Assigned role"><option value="">Any assigned role</option>{(["SCRUTINY_OFFICER", "VERIFICATION_OFFICER", "SENIOR_OFFICIAL"] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select>
          <Select name="source" defaultValue={sp.source ?? ""} className="w-48" aria-label="Source"><option value="">All sources</option><option value="RULE">Deterministic rules</option><option value="ANOMALY">Anomaly indicators</option><option value="VERIFICATION">Issuer verification</option></Select>
          <Select name="type" defaultValue={sp.type ?? ""} className="w-64" aria-label="Finding type"><option value="">All finding types</option>{Object.entries(FINDING_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Button type="submit" variant="secondary" size="sm">Apply</Button>
          <Link href="/review?mine=1" className="text-xs text-accent hover:underline">Assigned to my role</Link>
          <span className="ml-auto text-xs text-muted">{items.length} open item(s)</span>
        </form>
        {items.length === 0 ? (
          <EmptyState icon={<Inbox />} title="The queue is clear" description="No unresolved findings match these filters." />
        ) : (
          <Table>
            <THead><tr><TH>Application</TH><TH>Finding</TH><TH>Severity</TH><TH className="hidden lg:table-cell">Assigned to</TH><TH className="text-right">Age</TH><TH>Status</TH><TH className="hidden xl:table-cell">Next action</TH><TH /></tr></THead>
            <TBody>
              {items.map((f) => (
                <TR key={f.id}>
                  <TD><Link href={`/applications/${f.application.id}?tab=findings`} className="font-mono text-xs hover:underline">{f.application.reference}</Link><p className="text-[11px] text-muted">{f.application.institutionName}</p></TD>
                  <TD className="max-w-md"><p className="font-medium text-ink">{findingTypeLabel(f.type)}</p><p className="truncate text-xs text-muted" title={f.title}>{f.title}</p><div className="mt-1"><OutcomeClassBadge outcomeClass={f.outcomeClass} deterministic={f.isDeterministic} /></div></TD>
                  <TD><SeverityBadge severity={f.severity} /></TD>
                  <TD className="hidden lg:table-cell text-xs">{f.assignedRole ? ROLE_LABELS[f.assignedRole as Role] : "—"}</TD>
                  <TD className="text-right tabular text-xs">{relativeAge(f.createdAt)}</TD>
                  <TD><FindingStatusBadge status={f.status} /></TD>
                  <TD className="hidden xl:table-cell max-w-xs text-xs"><p className="line-clamp-2">{f.recommendedAction}</p></TD>
                  <TD className="text-right"><Button asChild size="xs"><Link href={`/review/${f.id}`}>Review</Link></Button></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
