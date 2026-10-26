import Link from "next/link";
import { Download, FilePlus2, FolderOpen } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS } from "@/lib/domain";
import { listApplications } from "@/server/applications";
import { prisma } from "@/server/db";
import { requireActor } from "@/server/session";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ApplicationsTable } from "@/components/app/applications-table";

export const metadata = { title: "Applications" };

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; template?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const [rows, templates] = await Promise.all([listApplications(actor, sp), prisma.applicationTemplate.findMany({ orderBy: { name: "asc" } })]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <>
      <PageHeader
        title="Applications"
        crumbs={[{ label: "Command Centre", href: "/" }, { label: "Applications" }]}
        description={actor.role === "APPLICANT" ? "Applications submitted by your institution." : "Institutional applications and their automated validation status."}
        actions={
          <>
            <Button asChild variant="outline" size="sm"><a href={`/api/exports/applications${qs ? `?${qs}` : ""}`}><Download /> Export CSV</a></Button>
            {hasPermission(actor.role, "application.create") && <Button asChild size="sm"><Link href="/applications/new"><FilePlus2 /> Create application</Link></Button>}
          </>
        }
      />
      <Card>
        <form className="flex flex-wrap items-end gap-2 border-b border-border p-3" role="search">
          <Input name="q" defaultValue={sp.q} placeholder="Search ID, institution or code" className="w-64" aria-label="Search" />
          <Select name="status" defaultValue={sp.status ?? ""} className="w-60" aria-label="Status">
            <option value="">All statuses</option>
            {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{APPLICATION_STATUS_LABELS[s]}</option>)}
          </Select>
          <Select name="template" defaultValue={sp.template ?? ""} className="w-64" aria-label="Application type">
            <option value="">All application types</option>
            {templates.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
          </Select>
          <Button type="submit" variant="secondary" size="sm">Apply</Button>
          {qs && <Link href="/applications" className="text-xs text-accent hover:underline">Clear filters</Link>}
          <span className="ml-auto text-xs text-muted">{rows.length} application(s)</span>
        </form>
        {rows.length ? <ApplicationsTable rows={rows} /> : <EmptyState icon={<FolderOpen />} title="No applications match" description="Adjust the filters or create a new application." />}
      </Card>
    </>
  );
}
