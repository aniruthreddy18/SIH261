import type { RuleResultStatus } from "@/lib/domain";

export interface DiffInput {
  subjectKey: string;
  ruleCode: string;
  ruleName: string;
  subjectLabel: string;
  status: RuleResultStatus;
  observed: string | null;
}

export interface RunChange {
  subjectKey: string;
  ruleCode: string;
  ruleName: string;
  subjectLabel: string;
  before: RuleResultStatus | null;
  after: RuleResultStatus | null;
  observedBefore: string | null;
  observedAfter: string | null;
  kind: "IMPROVED" | "REGRESSED" | "CHANGED" | "NEW" | "REMOVED";
}

const RANK: Record<RuleResultStatus, number> = { PASS: 3, NOT_APPLICABLE: 3, REVIEW_REQUIRED: 1, PENDING: 1, PROCESSING_FAILED: 0, FAIL: 0 };

/** Compare two validation runs result-by-result (keyed by rule + subject). */
export function diffRuns(previous: DiffInput[], current: DiffInput[]): RunChange[] {
  const prev = new Map(previous.map((r) => [r.subjectKey, r]));
  const curr = new Map(current.map((r) => [r.subjectKey, r]));
  const changes: RunChange[] = [];
  for (const [key, c] of curr) {
    const p = prev.get(key);
    if (!p) {
      if (c.status !== "PASS" && c.status !== "NOT_APPLICABLE") {
        changes.push({ ...pick(c), before: null, after: c.status, observedBefore: null, observedAfter: c.observed, kind: "NEW" });
      }
      continue;
    }
    if (p.status === c.status && p.observed === c.observed) continue;
    const kind = RANK[c.status] > RANK[p.status] ? "IMPROVED" : RANK[c.status] < RANK[p.status] ? "REGRESSED" : "CHANGED";
    changes.push({ ...pick(c), before: p.status, after: c.status, observedBefore: p.observed, observedAfter: c.observed, kind });
  }
  for (const [key, p] of prev) {
    if (!curr.has(key) && p.status !== "PASS" && p.status !== "NOT_APPLICABLE") {
      changes.push({ ...pick(p), before: p.status, after: null, observedBefore: p.observed, observedAfter: null, kind: "REMOVED" });
    }
  }
  const order = { REGRESSED: 0, NEW: 1, IMPROVED: 2, REMOVED: 3, CHANGED: 4 };
  return changes.sort((a, b) => order[a.kind] - order[b.kind]);
}

function pick(r: DiffInput) {
  return { subjectKey: r.subjectKey, ruleCode: r.ruleCode, ruleName: r.ruleName, subjectLabel: r.subjectLabel };
}
