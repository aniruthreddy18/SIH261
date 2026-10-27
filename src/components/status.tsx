import { AlertTriangle, CheckCircle2, CircleDashed, CircleSlash, Clock, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  APPLICATION_STATUS_DESCRIPTIONS,
  APPLICATION_STATUS_LABELS,
  FINDING_STATUS_LABELS,
  SOURCE_TYPE_LABELS,
  VERIFICATION_STATUS_LABELS,
  type ApplicationStatus,
  type FindingStatus,
  type RuleResultStatus,
  type Severity,
  type SourceType,
  type VerificationStatus,
} from "@/lib/domain";

type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "accent" | "outline";

const APP_TONE: Record<ApplicationStatus, Tone> = {
  DRAFT: "neutral",
  PROCESSING: "info",
  AUTO_PASSED: "ok",
  AUTO_FAILED: "bad",
  REVIEW_REQUIRED: "warn",
  PROCESSING_FAILED: "bad",
  RECTIFICATION_REQUIRED: "warn",
  READY_FOR_AUTHORIZED_REVIEW: "accent",
  CLOSED: "outline",
};

export function ApplicationStatusBadge({ status }: { status: string }) {
  const s = status as ApplicationStatus;
  return (
    <Badge tone={APP_TONE[s] ?? "neutral"} title={APPLICATION_STATUS_DESCRIPTIONS[s]}>
      {s === "PROCESSING" && <Loader2 className="size-3 animate-spin" />}
      {APPLICATION_STATUS_LABELS[s] ?? status}
    </Badge>
  );
}

const RULE: Record<RuleResultStatus, { tone: Tone; label: string; Icon: typeof CheckCircle2 }> = {
  PASS: { tone: "ok", label: "Pass", Icon: CheckCircle2 },
  FAIL: { tone: "bad", label: "Fail", Icon: XCircle },
  REVIEW_REQUIRED: { tone: "warn", label: "Review required", Icon: AlertTriangle },
  NOT_APPLICABLE: { tone: "neutral", label: "Not applicable", Icon: CircleSlash },
  PROCESSING_FAILED: { tone: "bad", label: "Processing failed", Icon: ShieldAlert },
  PENDING: { tone: "info", label: "Pending", Icon: CircleDashed },
};

export function RuleStatusBadge({ status }: { status: string }) {
  const r = RULE[status as RuleResultStatus] ?? RULE.PENDING;
  return (
    <Badge tone={r.tone}>
      <r.Icon className="size-3" />
      {r.label}
    </Badge>
  );
}

const VERIF_TONE: Record<VerificationStatus, Tone> = {
  VERIFIED: "ok",
  MISMATCH_DETECTED: "bad",
  EXPIRED: "bad",
  VERIFICATION_PENDING: "info",
  SOURCE_UNAVAILABLE: "warn",
  MANUAL_REVIEW_REQUIRED: "warn",
  NOT_SUPPORTED: "neutral",
};

export function VerificationStatusBadge({ status }: { status: string }) {
  const s = status as VerificationStatus;
  return <Badge tone={VERIF_TONE[s] ?? "neutral"}>{s === "VERIFICATION_PENDING" && <Clock className="size-3" />}{VERIFICATION_STATUS_LABELS[s] ?? status}</Badge>;
}

export function SourceTypeBadge({ type }: { type: string }) {
  const t = type as SourceType;
  const tone: Tone = t === "SIMULATED" ? "warn" : t === "REAL" ? "ok" : t === "MANUAL" ? "accent" : "info";
  return (
    <Badge tone={tone} className="uppercase tracking-wide" title={t === "SIMULATED" ? "Simulated source with fictional records — not an official verification." : undefined}>
      {SOURCE_TYPE_LABELS[t] ?? type}
    </Badge>
  );
}

const SEV_TONE: Record<Severity, Tone> = { LOW: "neutral", MEDIUM: "info", HIGH: "warn", CRITICAL: "bad" };
export function SeverityBadge({ severity }: { severity: string }) {
  return <Badge tone={SEV_TONE[severity as Severity] ?? "neutral"} className="uppercase tracking-wide">{severity.toLowerCase()}</Badge>;
}

const FS_TONE: Record<FindingStatus, Tone> = { OPEN: "warn", INFO_REQUESTED: "info", ESCALATED: "accent", RECTIFICATION_REQUESTED: "warn", RESOLVED: "ok", DISMISSED: "neutral", AUTO_CLEARED: "ok" };
export function FindingStatusBadge({ status }: { status: string }) {
  return <Badge tone={FS_TONE[status as FindingStatus] ?? "neutral"}>{FINDING_STATUS_LABELS[status as FindingStatus] ?? status}</Badge>;
}

export function OutcomeClassBadge({ outcomeClass, deterministic }: { outcomeClass: string; deterministic?: boolean }) {
  if (outcomeClass === "FAIL") return <Badge tone="bad">{deterministic === false ? "Confirmed issue" : "Deterministic failure"}</Badge>;
  if (outcomeClass === "PROCESSING_FAILED") return <Badge tone="bad">Technical failure</Badge>;
  return <Badge tone="warn">Needs human judgement</Badge>;
}

export function ProcessingBadge({ status }: { status: string }) {
  const map: Record<string, { tone: Tone; label: string }> = { PENDING: { tone: "neutral", label: "Queued" }, PROCESSING: { tone: "info", label: "Processing" }, PROCESSED: { tone: "ok", label: "Processed" }, FAILED: { tone: "bad", label: "Processing failed" } };
  const m = map[status] ?? map.PENDING;
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function ConfidenceMeter({ value, corrected }: { value: number; corrected?: boolean }) {
  if (corrected) return <Badge tone="accent">Reviewer-corrected</Badge>;
  const p = Math.round(value * 100);
  const color = p >= 85 ? "bg-ok" : p >= 60 ? "bg-warn" : "bg-bad";
  return (
    <span className="inline-flex items-center gap-1.5" title={`Extraction confidence ${p}%`}>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-border">
        <span className={`block h-full ${color}`} style={{ width: `${p}%` }} />
      </span>
      <span className="tabular text-[11px] text-muted">{p}%</span>
    </span>
  );
}
