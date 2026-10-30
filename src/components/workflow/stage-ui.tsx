import { Check, Circle, CornerUpLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import { DUE_STATE_LABELS, stageLabel, type DueState, type StageCode } from "@/lib/workflow/stages";

const DUE_TONE: Record<DueState, "ok" | "warn" | "bad"> = { ON_TRACK: "ok", DUE_SOON: "warn", OVERDUE: "bad" };

/** "Overdue 4 d" / "Due in 2 d" / "On track · 9 d left". */
export function DueBadge({ state, daysLeft }: { state: DueState; daysLeft: number }) {
  const text = state === "OVERDUE" ? `Overdue ${Math.abs(daysLeft)} d` : state === "DUE_SOON" ? (daysLeft <= 0 ? "Due today" : `Due in ${daysLeft} d`) : `${DUE_STATE_LABELS[state]} · ${daysLeft} d left`;
  return <Badge tone={DUE_TONE[state]}>{text}</Badge>;
}

export function EscalationBadge({ level }: { level: number }) {
  if (level < 2) return null;
  return <Badge tone={level >= 3 ? "bad" : "warn"}>Escalated L{level}</Badge>;
}

export interface TrackerStep { stage: StageCode; status: "done" | "current" | "upcoming" | "returned"; label?: string; date?: Date | null; dueAt?: Date | null; overdue?: boolean }

/** Horizontal pathway tracker: done stages, the current stage and what comes next. */
export function StageTracker({ steps, compact = false }: { steps: TrackerStep[]; compact?: boolean }) {
  return (
    <ol className="flex flex-wrap items-stretch gap-1.5" aria-label="Processing pathway">
      {steps.map((s, i) => (
        <li key={`${s.stage}-${i}`} className="flex items-center gap-1.5">
          <div
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5",
              s.status === "done" && "border-ok-line bg-ok-soft/70 text-ok-ink",
              s.status === "current" && (s.overdue ? "border-bad-line bg-bad-soft text-bad-ink shadow-sm" : "border-accent-line bg-accent-soft text-accent shadow-sm"),
              s.status === "returned" && "border-warn-line bg-warn-soft text-warn-ink",
              s.status === "upcoming" && "border-border bg-white/40 text-muted",
            )}
            aria-current={s.status === "current" ? "step" : undefined}
          >
            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold", s.status === "done" ? "bg-ok text-white" : s.status === "current" ? (s.overdue ? "bg-bad text-white" : "bg-accent text-white") : s.status === "returned" ? "bg-warn text-white" : "border border-border-strong")}>
              {s.status === "done" ? <Check className="size-3" /> : s.status === "returned" ? <CornerUpLeft className="size-3" /> : s.status === "current" ? <Circle className="size-2 fill-current" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[12px] font-semibold leading-4">{s.label ?? stageLabel(s.stage)}</span>
              {!compact && (s.date || s.dueAt) && (
                <span className="block text-[10.5px] leading-4 opacity-80">
                  {s.status === "done" && s.date ? `Done ${formatDate(s.date)}` : s.status === "current" && s.dueAt ? `${s.overdue ? "Was due" : "Due"} ${formatDate(s.dueAt)}` : s.status === "returned" ? "Returned" : ""}
                </span>
              )}
            </span>
          </div>
          {i < steps.length - 1 && <span className="h-px w-3 bg-border-strong" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

/** Build tracker steps from the pathway and the stage visits recorded so far. */
export function trackerSteps(stages: StageCode[], visits: { stageCode: string; status: string; attempt: number; enteredAt: Date; completedAt: Date | null; dueAt: Date }[], currentStage: string | null, now: Date = new Date()): TrackerStep[] {
  return stages.map((stage) => {
    const mine = visits.filter((v) => v.stageCode === stage);
    const last = mine[mine.length - 1];
    if (last?.status === "ACTIVE") return { stage, status: "current", label: stageLabel(stage, last.attempt), dueAt: last.dueAt, overdue: now > last.dueAt };
    if (mine.some((v) => v.status === "COMPLETED") && (!last || last.status === "COMPLETED")) return { stage, status: "done", label: stageLabel(stage, last?.attempt ?? 1), date: last?.completedAt };
    if (last?.status === "RETURNED" && currentStage === "RETURNED") return { stage, status: "returned", label: stageLabel(stage, last.attempt) };
    if (mine.some((v) => v.status === "COMPLETED")) return { stage, status: "done", label: stageLabel(stage), date: mine.filter((v) => v.status === "COMPLETED").pop()?.completedAt };
    return { stage, status: "upcoming" };
  });
}
