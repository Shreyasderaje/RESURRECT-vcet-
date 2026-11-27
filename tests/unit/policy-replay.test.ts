import { describe, it, expect } from "vitest";
import { pairedOverReliancePrevention, liveMeanClarificationTurns, replayPolicies, selectReplayInputs } from "@/lib/evaluation/policy-replay";
import type { BenchmarkCase, CaseEvaluationRecord } from "@/types/evaluation";
import type { DetectorOutput } from "@/types/ambiguity";
const detector = (o: Partial<DetectorOutput> = {}): DetectorOutput => ({
  is_ambiguous: false, ambiguity_types: [], ambiguous_spans: [], possible_interpretations: ["one"],
  missing_information: [], risk_level: "low", clarification_required: false,
  clarification_reason: "clear", clarification_question: null, suggested_options: [], resolved_intent: "answer", ...o,
});
const bench = (o: Partial<BenchmarkCase> = {}): BenchmarkCase => ({
  id: "dev-1", dataset: "dev", category: "clear", original_request: "Summarize", context: {},
  is_ambiguous: false, expected_ambiguity_types: [], expected_interpretations: [],
  expected_clarification_behavior: "direct_answer", reference_criteria: [], expected_final_intent: "answer", risk_level: "low", ...o,
});
const saved = (c: BenchmarkCase, d: DetectorOutput): CaseEvaluationRecord => ({
  case_id: c.id, dataset: c.dataset, original_request: c.original_request, context: c.context,
  clarify_ai: { detector_output: d, error: null, final_status: "RESOLVED", is_correct: true, made_incorrect_assumption: false, clarification_turns: 2 },
  baseline: { error: null, made_incorrect_assumption: true },
} as CaseEvaluationRecord);
describe("offline replay", () => {
  it("selects valid output and rejects held-out, duplicate, unknown, mismatched and invalid records", () => {
    const c = bench(), good = saved(c, detector());
    expect(selectReplayInputs([c], [good]).inputs).toHaveLength(1);
    expect(selectReplayInputs([c], [{...good, dataset: "heldout"}]).excluded.non_dev_or_invalid_record).toBe(1);
    expect(selectReplayInputs([c], [{...good, case_id: "unknown"}]).excluded.unknown_case).toBe(1);
    expect(selectReplayInputs([c], [good, good]).excluded.duplicate_case).toBe(2);
    expect(selectReplayInputs([c], [{...good, original_request: "changed"}]).excluded.input_mismatch).toBe(1);
    expect(selectReplayInputs([c], [{...good, clarify_ai: {...good.clarify_ai, detector_output: null}}]).excluded.missing_or_invalid_detector_output).toBe(1);
  });
  it("rejects held-out benchmark data and duplicate IDs", () => {
    expect(() => selectReplayInputs([bench({dataset: "heldout"})], [])).toThrow();
    expect(() => selectReplayInputs([bench(), bench()], [])).toThrow();
    expect(() => replayPolicies([{benchmark: bench({dataset: "heldout"}), detector: detector()}])).toThrow();
  });
  it("reuses detection and distinguishes mode thresholds", () => {
    const c = bench({is_ambiguous: true, expected_clarification_behavior: "clarify"});
    const d = detector({is_ambiguous: true, possible_interpretations: ["a", "b"]});
    const modes = replayPolicies([{benchmark: c, detector: d}]).modes;
    expect(modes.map(m => m.decisions[0].action)).toEqual(["resolve", "clarify", "clarify"]);
    expect(modes.map(m => m.detector_ambiguity_recall)).toEqual([1, 1, 1]);
    expect(modes.map(m => m.ambiguity_catch_rate)).toEqual([0, 1, 1]);
    expect(modes[0].ambiguity_catch_rate_numerator).toBe(0);
    expect(modes[0].ambiguity_catch_rate_denominator).toBe(1);
    expect(modes[1].detector_ambiguity_recall_numerator).toBe(1);
    expect(modes[1].detector_ambiguity_recall_denominator).toBe(1);
    expect(modes[1].interruption_cost_numerator).toBe(1);
    expect(modes[1].interruption_cost_denominator).toBe(1);
  });
  it("handles low severity and medium risk differences", () => {
    const modes = replayPolicies([{benchmark: bench(), detector: detector({is_ambiguous: true})}]).modes;
    expect(modes.map(m => m.decisions[0].action)).toEqual(["resolve", "resolve", "clarify"]);
    expect(modes[2].unnecessary_clarification_rate).toBe(1);
    expect(modes[2].unnecessary_clarification_rate_numerator).toBe(1);
    expect(modes[2].unnecessary_clarification_rate_denominator).toBe(1);
    const medium = replayPolicies([{benchmark: bench(), detector: detector({risk_level: "medium"})}]).modes;
    expect(medium.map(m => m.decisions[0].action)).toEqual(["resolve", "resolve", "confirm"]);
    expect(medium[2].interruption_cost).toBe(1);
  });
  it("retains high-risk gates in every mode", () => {
    for (const d of [detector({risk_level: "high"}), detector({risk_level: "high", is_ambiguous: true, missing_information: ["target"]})]) {
      for (const result of replayPolicies([{benchmark: bench(), detector: d}]).modes) {
        expect(["confirm", "clarify"]).toContain(result.decisions[0].action);
        expect(result.high_risk_direct_resolutions).toBe(0);
      }
    }
  });
  it("returns null for missing denominators and unavailable outcomes", () => {
    const r = replayPolicies([]).modes[0];
    expect(r.interruption_cost).toBeNull(); expect(r.ambiguity_catch_rate).toBeNull();
    expect(r.unnecessary_clarification_rate).toBeNull(); expect(r.mean_clarification_turns).toBeNull();
    expect(r.over_reliance_prevention_rate).toBeNull();
  });
  it("calculates paired prevention and live turns only for eligible records", () => {
    const good = saved(bench(), detector());
    const bad = {...good, clarify_ai: {...good.clarify_ai, is_correct: false}};
    const failed = {...good, baseline: {...good.baseline, error: "failed"}};
    expect(pairedOverReliancePrevention([good, bad, failed])).toEqual({eligible: 2, prevented: 1, rate: 0.5});
    expect(pairedOverReliancePrevention([]).rate).toBeNull();
    expect(liveMeanClarificationTurns([good])).toEqual({eligible: 1, turns: 2, mean: 2});
    expect(liveMeanClarificationTurns([]).mean).toBeNull();
  });
});
