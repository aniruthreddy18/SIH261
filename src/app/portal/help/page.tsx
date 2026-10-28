import { CheckCircle2 } from "lucide-react";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { requireActor } from "@/server/session";
import { APPLICANT_GUIDANCE, PORTAL_STEPS } from "@/lib/applicant-guidance";
import { APPLICATION_STATUSES, DECISION_SUPPORT_DISCLAIMER } from "@/lib/domain";
import { PageHeader, Notice } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ApplicationStatusBadge } from "@/components/status";

export const metadata = { title: "Help" };

const FAQ = [
  { q: "Which files can I upload?", a: "PDF, PNG or JPEG. The file's content must match its type — a renamed file is rejected. Scanned documents are read with OCR, so upload clear, upright scans." },
  { q: "What happens after I upload?", a: "The document is read immediately. Open it to see exactly which values were read and where they appear on the page. Then press “Run checks”." },
  { q: "An issue says a value could not be read. What should I do?", a: "Replace the document with a clearer copy or the original digital PDF. Low-confidence values are never decided automatically — an official checks them." },
  { q: "Does “Automatic checks passed” mean my application is approved?", a: "No. It means the machine-checkable rules passed. Officials still verify documents with the issuing authorities, and the competent authority records the outcome." },
  { q: "What if I replace a document by mistake?", a: "Earlier versions are never deleted; they stay on record. Upload the correct file as a new replacement." },
  { q: "Who can see my documents?", a: "Only your institution's accounts and authorised AICTE officials. Other institutions cannot see your applications." },
];

export default async function PortalHelp() {
  await requireActor();
  const [templates, settings] = await Promise.all([
    prisma.applicationTemplate.findMany({ where: { active: true }, include: { requiredDocuments: { orderBy: { sortOrder: "asc" } } }, orderBy: { name: "asc" } }),
    getSettings(),
  ]);
  return (
    <>
      <PageHeader title="Help" crumbs={[{ label: "Home", href: "/portal" }, { label: "Help" }]} description="How the process works, what each status means, and which documents are required." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="How it works" />
          <CardBody>
            <ol className="space-y-3">
              {PORTAL_STEPS.map((s, i) => (
                <li key={s} className="flex gap-3 text-[13px]">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-green text-[11px] font-semibold text-white">{i + 1}</span>
                  <span>
                    <span className="font-medium text-ink">{s}</span>
                    <span className="block text-xs text-muted">
                      {["Create an application for your institution and academic year.", `Upload each required document (PDF, PNG or JPEG, up to ${settings.maxUploadMb} MB).`, "Run the automatic checks; fix anything flagged and run them again.", "Officials verify documents with issuing authorities and review anything the checks could not decide. They may ask you for corrections.", "The competent authority records the review outcome."][i]}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="What each status means" />
          <ul className="divide-y divide-border">
            {APPLICATION_STATUSES.filter((s) => s !== "PROCESSING").map((s) => (
              <li key={s} className="px-4 py-2.5 text-xs">
                <ApplicationStatusBadge status={s} />
                <p className="mt-1 text-ink-2">{APPLICANT_GUIDANCE[s].text}</p>
              </li>
            ))}
          </ul>
        </Card>
        {templates.map((t) => (
          <Card key={t.id}>
            <CardHeader title={`Required documents — ${t.name}`} description={t.description} />
            <ul className="divide-y divide-border">
              {t.requiredDocuments.map((r) => (
                <li key={r.id} className="flex items-start gap-2 px-4 py-2 text-[13px]">
                  <CheckCircle2 className={`mt-0.5 size-4 shrink-0 ${r.mandatory ? "text-green-bright" : "text-faint"}`} />
                  <span><span className="text-ink">{r.label}</span> {!r.mandatory && <span className="text-xs text-muted">(optional)</span>}{r.guidance && <span className="block text-xs text-muted">{r.guidance}</span>}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
        <Card className="lg:col-span-2">
          <CardHeader title="Frequently asked questions" />
          <div className="divide-y divide-border">
            {FAQ.map((f) => (
              <details key={f.q} className="px-4 py-3">
                <summary className="cursor-pointer text-[13px] font-medium text-ink">{f.q}</summary>
                <p className="mt-1 text-xs text-ink-2">{f.a}</p>
              </details>
            ))}
          </div>
        </Card>
      </div>
      <div className="mt-4"><Notice tone="info">{DECISION_SUPPORT_DISCLAIMER}</Notice></div>
    </>
  );
}
