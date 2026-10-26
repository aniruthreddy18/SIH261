import { CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import { SourceTypeBadge, VerificationStatusBadge } from "@/components/status";
import { formatDateTime } from "@/lib/utils";

export interface VerificationView {
  id: string;
  sourceName: string;
  sourceType: string;
  status: string;
  referenceNumber: string | null;
  requestedAt: Date;
  respondedAt: Date | null;
  attempts: number;
  comparisonJson: string;
  returnedJson: string | null;
  limitation: string | null;
  errorMessage: string | null;
  responseRef: string | null;
  actorLabel: string;
  isManual: boolean;
  manualReason: string | null;
}

export function VerificationCard({ v, title }: { v: VerificationView; title?: string }) {
  const comparisons = JSON.parse(v.comparisonJson || "[]") as { label: string; submitted: string | null; returned: string | null; match: boolean | null; note?: string }[];
  return (
    <div className="rounded-md border border-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-subtle/40 px-3 py-2">
        <VerificationStatusBadge status={v.status} />
        <SourceTypeBadge type={v.sourceType} />
        <span className="text-[13px] font-medium text-ink">{title ?? v.sourceName}</span>
        <span className="ml-auto text-[11px] text-muted">{formatDateTime(v.requestedAt)} · {v.isManual ? `recorded by ${v.actorLabel}` : `${v.attempts} attempt(s) · requested by ${v.actorLabel}`}</span>
      </div>
      <div className="space-y-2 px-3 py-2.5 text-xs">
        {v.sourceType === "SIMULATED" && <p className="font-medium text-warn">Simulated response from a demo source with fictional records — not a response from AICTE, an issuing authority or a government portal.</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted">
          <span>Source: {v.sourceName}</span>
          {v.referenceNumber && <span>Reference queried: <span className="font-mono text-ink-2">{v.referenceNumber}</span></span>}
          {v.respondedAt && <span>Source timestamp: {formatDateTime(v.respondedAt)}</span>}
          {v.responseRef && <span>Response ref: <span className="font-mono text-ink-2">{v.responseRef}</span></span>}
        </div>
        {comparisons.length > 0 && (
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[10.5px] uppercase tracking-wide text-muted"><th className="py-1 pr-2">Field</th><th className="py-1 pr-2">Submitted (extracted)</th><th className="py-1 pr-2">Returned by source</th><th className="py-1">Result</th></tr></thead>
            <tbody className="divide-y divide-border">
              {comparisons.map((c, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-2 text-ink-2">{c.label}</td>
                  <td className="py-1.5 pr-2 font-mono text-[11px]">{c.submitted ?? "—"}</td>
                  <td className="py-1.5 pr-2 font-mono text-[11px]">{c.returned ?? "—"}</td>
                  <td className="py-1.5">
                    {c.match === true ? <span className="inline-flex items-center gap-1 text-ok"><CheckCircle2 className="size-3.5" /> Match</span> : c.match === false ? <span className="inline-flex items-center gap-1 font-medium text-bad"><XCircle className="size-3.5" /> Mismatch</span> : <span className="inline-flex items-center gap-1 text-muted"><MinusCircle className="size-3.5" /> {c.note ?? "Not compared"}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {v.manualReason && <p className="text-ink-2"><span className="font-medium">Officer&rsquo;s reason: </span>{v.manualReason}</p>}
        {(v.limitation || v.errorMessage) && <p className="text-muted"><span className="font-medium text-ink-2">{v.errorMessage ? "Error: " : "Limitation: "}</span>{v.errorMessage ?? v.limitation}</p>}
        {v.returnedJson && (
          <details>
            <summary className="cursor-pointer text-muted">Source response details</summary>
            <pre className="mt-1 overflow-x-auto rounded bg-subtle p-2 font-mono text-[11px] text-ink-2">{JSON.stringify(JSON.parse(v.returnedJson), null, 2)}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
