import { describe, expect, it } from "vitest";
import { addDays, ageBucket, daysBetween, DEFAULT_PATHWAYS, dueState, effectiveStages, escalationChain, nextStage, reentryStage, revertTargets, stageLabel } from "@/lib/workflow/stages";

describe("pathway stages", () => {
  it("adds preliminary checks to pathways without a scrutiny desk and always ends at the decision", () => {
    expect(effectiveStages(["SCRUTINY", "DECISION"])).toEqual(["SCRUTINY", "DECISION"]);
    expect(effectiveStages(["EVC", "SAC_SHC", "DECISION"])).toEqual(["PRELIMINARY", "EVC", "SAC_SHC", "DECISION"]);
    expect(effectiveStages(["EVC"])).toEqual(["PRELIMINARY", "EVC", "DECISION"]);
    expect(effectiveStages(["SCRUTINY", "BOGUS", "DECISION"])).toEqual(["SCRUTINY", "DECISION"]);
  });
  it("covers the four stage combinations named in the problem statement", () => {
    const combos = DEFAULT_PATHWAYS.map((p) => p.stages.filter((s) => s !== "DECISION").join("+"));
    expect(combos).toEqual(expect.arrayContaining(["SCRUTINY", "SCRUTINY+EVC", "EVC+SAC_SHC", "EVC"]));
  });
  it("moves to the next stage and skips stages already completed after a return", () => {
    const stages = effectiveStages(["SCRUTINY", "EVC", "SAC_SHC", "DECISION"]);
    expect(nextStage(stages, "SCRUTINY", [])).toBe("EVC");
    expect(nextStage(stages, "SAC_SHC", [])).toBe("DECISION");
    expect(nextStage(stages, "DECISION", [])).toBeNull();
    // EVC and SAC/SHC were completed before the application was returned; re-scrutiny goes straight to the decision.
    const history = [{ stageCode: "SCRUTINY", status: "COMPLETED" as const }, { stageCode: "EVC", status: "COMPLETED" as const }, { stageCode: "SAC_SHC", status: "COMPLETED" as const }, { stageCode: "DECISION", status: "RETURNED" as const }];
    expect(nextStage(stages, "SCRUTINY", history)).toBe("DECISION");
  });
  it("re-enters at scrutiny (or preliminary checks) after rectification", () => {
    expect(reentryStage(effectiveStages(["SCRUTINY", "EVC", "DECISION"]))).toBe("SCRUTINY");
    expect(reentryStage(effectiveStages(["EVC", "DECISION"]))).toBe("PRELIMINARY");
  });
  it("only allows reverting to earlier, human-handled stages", () => {
    const stages = effectiveStages(["EVC", "SAC_SHC", "DECISION"]);
    expect(revertTargets(stages, "DECISION")).toEqual(["EVC", "SAC_SHC"]);
    expect(revertTargets(stages, "EVC")).toEqual([]);
    expect(revertTargets(stages, "RETURNED")).toEqual([]);
  });
  it("labels a second scrutiny visit as re-scrutiny", () => {
    expect(stageLabel("SCRUTINY")).toBe("Scrutiny");
    expect(stageLabel("SCRUTINY", 2)).toBe("Re-scrutiny");
  });
});

describe("timelines", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  it("classifies due dates as on track, due soon or overdue", () => {
    expect(dueState(addDays(now, 10), now, 3)).toBe("ON_TRACK");
    expect(dueState(addDays(now, 3), now, 3)).toBe("DUE_SOON");
    expect(dueState(addDays(now, -1), now, 3)).toBe("OVERDUE");
  });
  it("counts whole days and buckets ageing", () => {
    expect(daysBetween(now, addDays(now, 5))).toBe(5);
    expect(daysBetween(addDays(now, 5), now)).toBe(-5);
    expect([0, 7, 8, 15, 16, 30, 31].map(ageBucket)).toEqual(["0-7", "0-7", "8-15", "8-15", "16-30", "16-30", "31+"]);
  });
  it("escalates from the responsible desk to the Bureau and then the competent authority", () => {
    expect(escalationChain("SCRUTINY_OFFICER")).toEqual(["BUREAU_OFFICER", "SENIOR_OFFICIAL"]);
    expect(escalationChain("BUREAU_OFFICER")).toEqual(["SENIOR_OFFICIAL"]);
  });
});
