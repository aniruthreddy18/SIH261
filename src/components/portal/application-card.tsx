import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { APPLICANT_GUIDANCE, PORTAL_STEPS } from "@/lib/applicant-guidance";
import type { ApplicationStatus } from "@/lib/domain";
import { ApplicationStatusBadge } from "@/components/status";
import { cn, formatDate } from "@/lib/utils";

export interface PortalAppRow {
  id: string;
  reference: string;
  templateName: string;
  academicYear: string;
  status: ApplicationStatus;
  submittedAt: Date;
  openFindings: number;
}

/** Five-step tracker shown to institutions (status-based, so it is always consistent). */
export function StepTracker({ status, compact = false }: { status: ApplicationStatus; compact?: boolean }) {
  const current = APPLICANT_GUIDANCE[status].step;
  return (
    <ol className="flex items-center gap-1" aria-label={`Progress: step ${current} of ${PORTAL_STEPS.length}`}>
      {PORTAL_STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current || status === "CLOSED";
        const here = n === current && status !== "CLOSED";
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-1">
            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold", done ? "bg-green text-white" : here ? "border-2 border-green-bright text-green-bright" : "border border-border-strong text-faint")}>
              {done ? <Check className="size-3" /> : n}
            </span>
            {!compact && <span className={cn("hidden truncate text-[11px] sm:inline", here ? "font-semibold text-ink" : done ? "text-ink-2" : "text-faint")}>{label}</span>}
            {n < PORTAL_STEPS.length && <span className={cn("h-px min-w-2 flex-1", done ? "bg-green-bright" : "bg-border")} />}
          </li>
        );
      })}
    </ol>
  );
}

export function ApplicationCard({ a }: { a: PortalAppRow }) {
  const g = APPLICANT_GUIDANCE[a.status];
  return (
    <Link href={`/portal/applications/${a.id}`} className="glass-card block rounded-2xl border p-4 transition-colors hover:border-accent-line">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted">{a.reference}</p>
          <p className="text-[14px] font-semibold text-ink">{a.templateName.replace(" (Demo template)", "")} · AY {a.academicYear}</p>
          <p className="text-xs text-muted">Submitted {formatDate(a.submittedAt)}</p>
        </div>
        <ApplicationStatusBadge status={a.status} />
      </div>
      <div className="mt-3"><StepTracker status={a.status} /></div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs">
        <span className={g.action ? "font-medium text-warn" : "text-muted"}>{g.action ?? g.title}{a.openFindings > 0 ? ` · ${a.openFindings} open issue(s)` : ""}</span>
        <span className="flex items-center gap-1 font-medium text-accent">Open <ArrowRight className="size-3.5" /></span>
      </div>
    </Link>
  );
}
