import Link from "next/link";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApplicationStatusBadge } from "@/components/status";
import { formatDate } from "@/lib/utils";

export interface AppRow {
  id: string;
  reference: string;
  institutionName: string;
  templateName: string;
  submittedAt: Date;
  status: string;
  openFindings: number;
  lastRun: { runNumber: number; passRatio: number; total: number; passed: number } | null;
}

export function ApplicationsTable({ rows }: { rows: AppRow[] }) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Application ID</TH>
          <TH>Institution</TH>
          <TH className="hidden md:table-cell">Category</TH>
          <TH className="hidden lg:table-cell">Submitted</TH>
          <TH>Validation progress</TH>
          <TH className="text-right">Outstanding</TH>
          <TH>Status</TH>
          <TH className="text-right">Action</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((a) => (
          <TR key={a.id}>
            <TD className="font-mono text-xs text-ink">{a.reference}</TD>
            <TD className="font-medium text-ink">{a.institutionName}</TD>
            <TD className="hidden md:table-cell">{a.templateName.replace(" (Demo template)", "")}</TD>
            <TD className="hidden whitespace-nowrap lg:table-cell">{formatDate(a.submittedAt)}</TD>
            <TD>
              {a.lastRun ? (
                <div className="flex items-center gap-2" title={`Run #${a.lastRun.runNumber}: ${a.lastRun.passed} of ${a.lastRun.total} checks passed or not applicable`}>
                  <span className="h-1.5 w-20 overflow-hidden rounded-full bg-border">
                    <span className={`block h-full ${a.lastRun.passRatio === 1 ? "bg-ok" : a.lastRun.passRatio > 0.85 ? "bg-amber-500" : "bg-bad"}`} style={{ width: `${Math.round(a.lastRun.passRatio * 100)}%` }} />
                  </span>
                  <span className="tabular text-[11px] text-muted">{a.lastRun.passed}/{a.lastRun.total}</span>
                </div>
              ) : (
                <span className="text-xs text-faint">Not validated</span>
              )}
            </TD>
            <TD className={`text-right tabular ${a.openFindings ? "font-semibold text-warn" : "text-faint"}`}>{a.openFindings}</TD>
            <TD><ApplicationStatusBadge status={a.status} /></TD>
            <TD className="text-right"><Link href={`/applications/${a.id}`} className="text-[13px] font-medium text-accent hover:underline">Open</Link></TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
