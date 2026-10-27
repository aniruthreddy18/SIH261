import Link from "next/link";
import { FilePlus2, FolderOpen } from "lucide-react";
import { listApplications } from "@/server/applications";
import { requireActor } from "@/server/session";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApplicationCard } from "@/components/portal/application-card";

export const metadata = { title: "My applications" };

export default async function PortalApplications() {
  const actor = await requireActor();
  const apps = await listApplications(actor);
  return (
    <>
      <PageHeader
        title="My applications"
        crumbs={[{ label: "Home", href: "/portal" }, { label: "My applications" }]}
        description="Every application your institution has started, with where it is in the process."
        actions={<Button asChild size="sm"><Link href="/portal/applications/new"><FilePlus2 /> New application</Link></Button>}
      />
      {apps.length === 0 ? (
        <Card><EmptyState icon={<FolderOpen />} title="No applications yet" /></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{apps.map((a) => <ApplicationCard key={a.id} a={a} />)}</div>
      )}
    </>
  );
}
