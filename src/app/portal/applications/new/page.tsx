import { listFormOptions } from "@/server/applications";
import { requireActor } from "@/server/session";
import { PageHeader } from "@/components/page-header";
import { NewApplicationForm } from "@/components/app/new-application-form";

export const metadata = { title: "New application" };

export default async function PortalNewApplication() {
  const actor = await requireActor();
  const { institutions, templates } = await listFormOptions(actor);
  return (
    <>
      <PageHeader
        title="New application"
        crumbs={[{ label: "Home", href: "/portal" }, { label: "New application" }]}
        description="Your institution's details are pre-filled from the institutional record. After creating the application you will upload the required documents."
      />
      <NewApplicationForm
        portal
        institutions={institutions.map((i) => ({ id: i.id, code: i.code, name: i.name, category: i.category, programmes: i.programmes.map((p) => ({ name: p.name, level: p.level, intake: p.approvedIntake })) }))}
        templates={templates.map((t) => ({ code: t.code, name: t.name, description: t.description }))}
        defaultContact={{ name: actor.name, email: actor.email }}
      />
    </>
  );
}
