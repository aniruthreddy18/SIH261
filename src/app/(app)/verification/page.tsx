import Link from "next/link";
import { RadioTower } from "lucide-react";
import { VERIFICATION_STATUSES, VERIFICATION_STATUS_LABELS } from "@/lib/domain";
import { listVerifications, getAdapters } from "@/server/verification";
import { prisma, json } from "@/server/db";
import { pageGuard } from "@/server/session";
import { PageHeader, Notice, EmptyState } from "@/components/page-header";
import { AccessDenied } from "@/components/access-denied";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { SourceTypeBadge, VerificationStatusBadge } from "@/components/status";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Issuer Verification" };

export default async function VerificationPage({ searchParams }: { searchParams: Promise<{ status?: string; sourceType?: string }> }) {
  const { actor, denied } = await pageGuard("application.viewAll");
  const crumbs = [{ label: "Command Centre", href: "/" }, { label: "Issuer Verification" }];
  if (denied) return (<><PageHeader title="Issuer Verification" crumbs={crumbs} /><AccessDenied /></>);
  const sp = await searchParams;
  const [items, sources, active, records, cats] = await Promise.all([listVerifications(actor, sp), prisma.issuerSource.findMany({ orderBy: { name: "asc" } }), getAdapters(), prisma.syntheticIssuerRecord.findMany({ orderBy: { referenceNumber: "asc" } }), prisma.documentCategory.findMany()]);
  const catName = (c: string) => cats.find((x) => x.code === c)?.name ?? c;
  const activeIds = new Set(active.map((a) => a.id));
  return (
    <>
      <PageHeader title="Issuer Verification" crumbs={crumbs} description="Pluggable verification adapters compare submitted details with an issuing-authority source. Every result records the source, its type (real / sandbox / simulated / manual) and the compared fields." />
      <div className="mb-4"><Notice tone="warn" title="No official source is connected in this environment">Results from the synthetic demo sources are simulated and must never be read as responses from AICTE, an issuing authority or a government portal. The official-provider adapter activates only when authorised credentials are configured (see README → Issuer adapters).</Notice></div>
      <Card className="mb-4">
        <CardHeader title="Verification sources" description="Configured adapters and their current state." />
        <Table>
          <THead><tr><TH>Source</TH><TH>Type</TH><TH>Document categories</TH><TH>State</TH></tr></THead>
          <TBody>
            {sources.map((s) => (
              <TR key={s.id}>
                <TD><p className="font-medium text-ink">{s.name}</p><p className="max-w-lg text-xs text-muted">{s.description}</p></TD>
                <TD><SourceTypeBadge type={s.sourceType} /></TD>
                <TD className="text-xs">{json<string[]>(s.categoriesJson, []).map(catName).join(", ") || (s.id === "official-provider" ? process.env.OFFICIAL_ISSUER_CATEGORIES || "— (not configured)" : "—")}</TD>
                <TD>{activeIds.has(s.id) ? <Badge tone="ok">Active</Badge> : s.enabled ? <Badge tone="neutral">Inactive — not configured</Badge> : <Badge tone="bad">Disabled</Badge>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <p className="border-t border-border px-4 py-2 text-[11px] text-muted">Document categories that require verification but have no active adapter are recorded as <em>Not supported</em> and routed to manual confirmation. Administrators can enable/disable sources and simulate an outage in System Settings.</p>
      </Card>
      <Card className="mb-4">
        <form className="flex flex-wrap items-end gap-2 border-b border-border p-3">
          <p className="mr-2 text-sm font-semibold text-ink">Verification attempts</p>
          <Select name="status" defaultValue={sp.status ?? ""} className="w-56" aria-label="Status"><option value="">All results</option>{VERIFICATION_STATUSES.map((s) => <option key={s} value={s}>{VERIFICATION_STATUS_LABELS[s]}</option>)}</Select>
          <Select name="sourceType" defaultValue={sp.sourceType ?? ""} className="w-48" aria-label="Source type"><option value="">All source types</option>{["SIMULATED", "SANDBOX", "REAL", "MANUAL"].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</Select>
          <Button type="submit" variant="secondary" size="sm">Apply</Button>
          <span className="ml-auto text-xs text-muted">{items.length} attempt(s)</span>
        </form>
        {items.length === 0 ? <EmptyState icon={<RadioTower />} title="No verification attempts" /> : (
          <Table>
            <THead><tr><TH>Requested</TH><TH>Application</TH><TH>Source</TH><TH>Reference</TH><TH>Result</TH><TH className="hidden lg:table-cell">Mismatches / limitation</TH></tr></THead>
            <TBody>
              {items.map((v) => {
                const mism = (json<{ label: string; match: boolean | null }[]>(v.comparisonJson, [])).filter((c) => c.match === false).map((c) => c.label);
                return (
                  <TR key={v.id}>
                    <TD className="text-xs whitespace-nowrap">{formatDateTime(v.requestedAt)}<p className="text-[11px] text-muted">{v.actorLabel}</p></TD>
                    <TD><Link className="font-mono text-xs hover:underline" href={`/applications/${v.application.id}?tab=verification`}>{v.application.reference}</Link><p className="text-[11px] text-muted">{v.application.institutionName}</p></TD>
                    <TD className="text-xs"><p>{v.sourceName}</p><SourceTypeBadge type={v.sourceType} /></TD>
                    <TD className="font-mono text-[11px]">{v.referenceNumber ?? "—"}</TD>
                    <TD><VerificationStatusBadge status={v.status} /></TD>
                    <TD className="hidden lg:table-cell max-w-xs text-xs">{mism.length ? <span className="text-bad">{mism.join(", ")}</span> : <span className="text-muted">{v.limitation ?? v.errorMessage ?? "—"}</span>}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Synthetic demo issuer records" description="Fictional records answered by the simulated source. Behaviour controls demonstrate pending and unavailable responses." />
        <Table>
          <THead><tr><TH>Reference</TH><TH>Category</TH><TH>Issuer (fictional)</TH><TH>Institution</TH><TH>Validity</TH><TH>Behaviour</TH></tr></THead>
          <TBody>
            {records.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono text-[11px]">{r.referenceNumber}</TD>
                <TD className="text-xs">{catName(r.categoryCode)}</TD>
                <TD className="text-xs">{r.issuerName}</TD>
                <TD className="text-xs">{r.institutionName}<p className="text-[11px] text-muted">{r.institutionCode}</p></TD>
                <TD className="text-xs whitespace-nowrap">{r.issueDate ? formatDate(r.issueDate) : "—"} → {r.expiryDate ? formatDate(r.expiryDate) : "—"}</TD>
                <TD><Badge tone={r.behaviour === "NORMAL" ? "neutral" : "warn"}>{r.behaviour.toLowerCase()}</Badge>{r.note && <p className="mt-1 max-w-[220px] text-[11px] text-muted">{r.note}</p>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
