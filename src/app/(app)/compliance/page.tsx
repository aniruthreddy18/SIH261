import { ShieldCheck } from "lucide-react";
import { json } from "@/server/db";
import { listApplications } from "@/server/applications";
import { getComplianceMatrix, listRequirements } from "@/server/compliance";
import { requireActor } from "@/server/session";
import { PageHeader, EmptyState, Notice } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ComplianceMatrix } from "@/components/app/compliance-matrix";

export const metadata = { title: "Compliance" };

export default async function CompliancePage({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const [reqs, apps] = await Promise.all([listRequirements(), listApplications(actor)]);
  const selected = sp.app ?? apps[0]?.id;
  const matrix = selected ? await getComplianceMatrix(actor, selected).catch(() => null) : null;
  return (
    <>
      <PageHeader title="Compliance" crumbs={[{ label: "Command Centre", href: "/" }, { label: "Compliance" }]} description="Configurable regulatory and infrastructure requirements evaluated against submitted evidence, extracted facts, linked rule results and issuer verification." />
      <div className="mb-4"><Notice tone="warn">All requirements below are <strong>sample requirements</strong> configured for the demo — no authoritative regulation, clause or effective date has been configured, and none is cited. Documentary evidence cannot establish physical infrastructure compliance; inspection remains necessary where required.</Notice></div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card className="mb-4">
            <form className="flex flex-wrap items-end gap-2 p-3">
              <p className="mr-2 text-sm font-semibold text-ink">Application</p>
              <Select name="app" defaultValue={selected} className="w-full sm:w-96" aria-label="Application">
                {apps.map((a) => <option key={a.id} value={a.id}>{a.reference} — {a.institutionName}</option>)}
              </Select>
              <Button type="submit" variant="secondary" size="sm">Show</Button>
            </form>
          </Card>
          {matrix ? <ComplianceMatrix matrix={matrix} actor={actor} /> : <Card><EmptyState icon={<ShieldCheck />} title="No application selected" /></Card>}
        </div>
        <Card className="self-start">
          <CardHeader title="Requirement catalogue" description={`${reqs.length} active requirement(s)`} />
          <Table>
            <THead><tr><TH>Requirement</TH><TH>Evidence</TH></tr></THead>
            <TBody>
              {reqs.map((r) => (
                <TR key={r.id}>
                  <TD><p className="font-mono text-[11px] text-muted">{r.code} · v{r.version}</p><p className="text-[13px] font-medium text-ink">{r.name}</p><p className="text-[11px] text-muted">{r.area}</p>{r.isSample && <Badge tone="warn" className="mt-1">Sample</Badge>}</TD>
                  <TD className="text-[11px]">{json<string[]>(r.evidenceCategoriesJson, []).join(", ")}<p className="mt-1 font-mono text-faint">{json<string[]>(r.linkedRuleCodesJson, []).join(" ")}</p></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
