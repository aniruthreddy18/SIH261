import { Badge } from "@/components/ui/badge";
import { COMPLIANCE_STATUS_LABELS, daysBetween } from "@/lib/workflow/stages";

/** Timing badge for an undertaking or a tracked document. */
export function ComplianceTiming({ status, dueDate, kind, warnDays }: { status: string; dueDate: Date; kind: string; warnDays: number }) {
  if (status === "FULFILLED" || status === "WAIVED") return <Badge tone="ok">{COMPLIANCE_STATUS_LABELS[status]}</Badge>;
  if (status === "SUBMITTED") return <Badge tone="info">Awaiting verification</Badge>;
  const left = daysBetween(new Date(), dueDate);
  if (left < 0) return <Badge tone="bad">{kind === "DOCUMENT_VALIDITY" ? "Expired" : "Overdue"} {Math.abs(left)} d</Badge>;
  if (left <= warnDays) return <Badge tone="warn">{kind === "DOCUMENT_VALIDITY" ? "Expires" : "Due"} in {left} d</Badge>;
  return <Badge tone="ok">{left} d left</Badge>;
}

