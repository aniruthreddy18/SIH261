import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SeverityBadge, VerificationStatusBadge } from "@/components/status";
import { SEVERITIES } from "@/lib/domain";
import { formatDateTime } from "@/lib/utils";
import { json } from "@/server/db";
import { normalizeProgramme } from "@/lib/extraction/normalize";
import type { Coverage, Detail } from "./types";

const ACTIVE = ["OPEN", "INFO_REQUESTED", "ESCALATED", "RECTIFICATION_REQUESTED"];

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-2 py-1.5 text-[13px]">
      <dt className="text-muted">{k}</dt>
      <dd className="text-ink">{v}</dd>
    </div>
  );
}

export function OverviewTab({ detail, coverage, isApplicant }: { detail: Detail; coverage: Coverage; isApplicant: boolean }) {
  const { app, checklist, documents, runs, findings } = detail;
  const open = findings.filter((f) => ACTIVE.includes(f.status));
  const lastRun = runs.find((r) => r.status === "COMPLETED");
  const summary = lastRun ? json<Record<string, number>>(lastRun.summaryJson, {}) : null;
  const active = documents.filter((d) => d.state === "ACTIVE");
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <Card>
          <CardHeader title="Application summary" />
          <CardBody className="grid gap-x-8 md:grid-cols-2">
            <dl>
              <Row k="Application ID" v={<span className="font-mono text-xs">{app.reference}</span>} />
              <Row k="Institution (declared)" v={app.institutionName} />
              <Row k="Identifier (declared)" v={app.institutionCode ?? "—"} />
              <Row k="Category" v={app.institutionCategory} />
              <Row k="Application type" v={app.template.name} />
              <Row k="Academic year" v={app.academicYear} />
            </dl>
            <dl>
              <Row k="Contact" v={<>{app.contactName}<br /><span className="text-xs text-muted">{app.contactEmail}</span></>} />
              <Row k="Submitted" v={formatDateTime(app.submittedAt ?? app.createdAt)} />
              <Row k="Institutional record" v={<>{app.institution.name}<br /><span className="text-xs text-muted">{app.institution.code} · {app.institution.city}, {app.institution.state}</span></>} />
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Programmes and intake applied for" />
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-border">
              {app.programmes.map((p) => {
                const rec = app.institution.programmes.find((r) => normalizeProgramme(r.name) === normalizeProgramme(p.name));
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-2 text-ink">{p.name}</td>
                    <td className="px-4 py-2 text-muted">{p.level}</td>
                    <td className="px-4 py-2 text-right tabular text-ink">Intake {p.intake}{rec ? <span className="text-muted"> (record {rec.approvedIntake})</span> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <Card>
          <CardHeader title="Required document checklist" description="From the application template; optional items are not required." actions={<Link href={`?tab=documents`} className="text-xs font-medium text-accent hover:underline">Manage documents</Link>} />
          <ul className="divide-y divide-border">
            {checklist.map((c) => {
              const docs = active.filter((d) => d.categoryCode === c.categoryCode);
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2 text-[13px]">
                  <span className="text-ink">{c.label} {!c.mandatory && <span className="text-xs text-muted">(optional)</span>}</span>
                  <span className={docs.length ? "text-xs font-medium text-ok" : c.mandatory ? "text-xs font-medium text-bad" : "text-xs text-faint"}>{docs.length ? `${docs.length} submitted` : c.mandatory ? "Missing" : "Not submitted"}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Findings summary" actions={<Link href={`?tab=findings`} className="text-xs font-medium text-accent hover:underline">View</Link>} />
          <CardBody className="space-y-2">
            <p className="text-2xl font-semibold tabular text-ink">{open.length} <span className="text-sm font-normal text-muted">open</span></p>
            <div className="flex flex-wrap gap-2">
              {SEVERITIES.slice().reverse().map((s) => {
                const n = open.filter((f) => f.severity === s).length;
                return n ? <span key={s} className="flex items-center gap-1"><SeverityBadge severity={s} /><span className="text-xs tabular text-ink-2">{n}</span></span> : null;
              })}
            </div>
            <p className="text-xs text-muted">{open.filter((f) => f.outcomeClass === "FAIL").length} deterministic failure(s) · {open.filter((f) => f.outcomeClass !== "FAIL").length} need human judgement · {findings.length - open.length} closed/historical</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Last validation run" actions={<Link href={`?tab=validation`} className="text-xs font-medium text-accent hover:underline">Details</Link>} />
          <CardBody className="text-[13px]">
            {lastRun && summary ? (
              <>
                <p className="text-ink">Run #{lastRun.runNumber} · {formatDateTime(lastRun.completedAt)}</p>
                <p className="mt-1 text-xs text-muted">Machine outcome: {lastRun.machineOutcome?.replace(/_/g, " ").toLowerCase()}</p>
                <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                  {[["Pass", summary.pass, "text-ok"], ["Fail", summary.fail, "text-bad"], ["Review", summary.review, "text-warn"], ["N/A", summary.notApplicable, "text-muted"]].map(([l, n, c]) => (
                    <div key={l as string} className="rounded border border-border py-1.5"><p className={`text-base font-semibold tabular ${c}`}>{n as number}</p><p className="text-[10.5px] text-muted">{l}</p></div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-muted">Validation has not been run yet.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Issuer verification" actions={<Link href={`?tab=verification`} className="text-xs font-medium text-accent hover:underline">Details</Link>} />
          <ul className="divide-y divide-border">
            {coverage.length === 0 && <li className="px-4 py-3 text-xs text-muted">No documents requiring verification.</li>}
            {coverage.map((c) => (
              <li key={c.documentId} className="flex items-center justify-between gap-2 px-4 py-2 text-[13px]">
                <span className="text-ink-2">{c.categoryName}</span>
                {c.latestStatus ? <VerificationStatusBadge status={c.latestStatus} /> : <span className="text-xs text-faint">Not run</span>}
              </li>
            ))}
          </ul>
          {!isApplicant && <p className="border-t border-border px-4 py-2 text-[11px] text-muted">Demo sources are simulated; see source labels on the verification tab.</p>}
        </Card>
      </div>
    </div>
  );
}
