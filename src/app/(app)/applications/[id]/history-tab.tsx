import Link from "next/link";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { listApplicationHistory } from "@/server/audit-log";
import { Card, CardHeader } from "@/components/ui/card";
import { ApplicationStatusBadge } from "@/components/status";
import { formatDateTime } from "@/lib/utils";
import type { Detail } from "./types";

export async function HistoryTab({ detail, actor }: { detail: Detail; actor: Actor }) {
  const events = await listApplicationHistory(detail.app.id);
  const hidden = actor.role === "APPLICANT" ? new Set(["FINDING_NOTE_ADDED", "COMPLIANCE_NOTE_ADDED"]) : new Set<string>();
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="self-start">
        <CardHeader title="Status timeline" />
        <ol className="relative space-y-0 px-4 py-3">
          {detail.statusChanges.map((s) => (
            <li key={s.id} className="relative border-l border-border pb-4 pl-4 last:pb-0">
              <span className="absolute -left-[5px] top-1 size-2.5 rounded-full border-2 border-surface bg-accent" />
              <ApplicationStatusBadge status={s.toStatus} />
              <p className="mt-1 text-[11px] text-muted">{formatDateTime(s.createdAt)} · {s.actorLabel}</p>
              {s.reason && <p className="mt-0.5 text-xs text-ink-2">{s.reason}</p>}
            </li>
          ))}
        </ol>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader title="Audit trail for this application" description="Append-only. Shows who acted, what changed, which rule version ran and which source was consulted." actions={hasPermission(actor.role, "audit.view") ? <Link href={`/audit?applicationId=${detail.app.id}`} className="text-xs font-medium text-accent hover:underline">Open in Reports &amp; Audit</Link> : undefined} />
        <ul className="divide-y divide-border">
          {events.filter((e) => !hidden.has(e.eventType)).map((e) => (
            <li key={e.id} className="px-4 py-2 text-[13px]">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-[10.5px] text-muted">{e.eventType}</span>
                <span className="text-ink">{e.action}</span>
                <span className="ml-auto text-[11px] text-faint">{formatDateTime(e.createdAt)}</span>
              </div>
              <p className="text-[11px] text-muted">
                {e.actorLabel}{e.actorRole ? ` [${e.actorRole}]` : ""}
                {e.ruleVersion && ` · rule ${e.ruleVersion}`}
                {e.validationRunId && ` · run ${e.validationRunId.slice(-6)}`}
                {e.verificationRef && ` · verification ${e.verificationRef.slice(-6)}`}
                {e.correlationId && ` · corr ${e.correlationId.slice(0, 8)}`}
              </p>
              {e.reason && <p className="text-xs text-ink-2">Reason: {e.reason}</p>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
