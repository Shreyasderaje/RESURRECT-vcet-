import { describe, expect, it } from "vitest";
import {
  computeAggregateMetrics,
  computeConfusionMatrix,
  computePrecisionRecallF1,
  safeDivide,
} from "@/lib/evaluation/metrics";
import type { CaseEvaluationRecord } from "@/types/evaluation";

function makeEvalRecord(
  id: string,
  gtAmbiguous: boolean,
  predAmbiguous: boolean,
  clarifyCorrect: boolean,
  turns = 0,
  status: "RESOLVED" | "UNRESOLVED" = "RESOLVED",
  proposedSpans = 1,
  droppedSpans = 0
): CaseEvaluationRecord {
  return {
    case_id: id,
    dataset: "dev",
    category: gtAmbiguous ? "referential" : "clear",
    original_request: "Test request",
    context: {},
    ground_truth: {
      is_ambiguous: gtAmbiguous,
      expected_ambiguity_types: gtAmbiguous ? ["referential"] : [],
      expected_clarification_behavior: gtAmbiguous ? "clarify" : "direct_answer",
      reference_criteria: ["test"],
      expected_final_intent: "Test intent",
      risk_level: "low",
    },
    baseline: {
      response: "Baseline answer",
      error: null,
      is_correct: !gtAmbiguous,
      made_incorrect_assumption: gtAmbiguous,
      score_reason: "Test",
    },
    clarify_ai: {
      detector_output: null,
      predicted_ambiguous: predAmbiguous,
      clarification_questions: turns > 0 ? ["Which?"] : [],
      simulated_user_answers: turns > 0 ? ["Option A"] : [],
      clarification_turns: turns,
      final_status: status,
      resolved_intent: status === "RESOLVED" ? "Test intent" : null,
      final_answer: status === "RESOLVED" ? "Resolved" : null,
      span_total_proposed: proposedSpans,
      span_valid_count: proposedSpans - droppedSpans,
      span_dropped_count: droppedSpans,
      outcome_category: clarifyCorrect
        ? turns > 0
          ? "correct_clarification_and_resolution"
          : "correct_direct_answer"
        : status === "UNRESOLVED"
        ? "unresolved_request"
        : !gtAmbiguous && turns > 0
        ? "unnecessary_clarification"
        : "incorrect_resolution",
      is_correct: clarifyCorrect,
      unnecessary_clarification: !gtAmbiguous && turns > 0,
      made_incorrect_assumption: false,
      score_reason: "Test",
      error: null,
    },
    api_calls: 2,
    retries: 0,
    timestamp: "2026-11-27T00:00:00Z",
  };
}

describe("metrics", () => {
  it("computes precision, recall, F1, and handles zero denominators with null", () => {
    const cm = computeConfusionMatrix([
      { groundTruthAmbiguous: true, predictedAmbiguous: true },
      { groundTruthAmbiguous: true, predictedAmbiguous: true },
      { groundTruthAmbiguous: false, predictedAmbiguous: true },
      { groundTruthAmbiguous: true, predictedAmbiguous: false },
      { groundTruthAmbiguous: false, predictedAmbiguous: false },
    ]);

    expect(cm).toEqual({ tp: 2, fp: 1, tn: 1, fn: 1 });
    const prf = computePrecisionRecallF1(cm);
    expect(prf.precision).toBeCloseTo(2 / 3, 4);
    expect(prf.recall).toBeCloseTo(2 / 3, 4);
    expect(prf.f1).toBeCloseTo(2 / 3, 4);

    // Zero denominator case
    expect(safeDivide(0, 0)).toBeNull();
    const zeroPrf = computePrecisionRecallF1({ tp: 0, fp: 0, tn: 5, fn: 0 });
    expect(zeroPrf.precision).toBeNull();
    expect(zeroPrf.recall).toBeNull();
    expect(zeroPrf.f1).toBeNull();
  });

  it("computes resolution accuracy, unnecessary clarification rate, and span drop rate", () => {
    const records = [
      makeEvalRecord("1", true, true, true, 1, "RESOLVED", 2, 0),
      makeEvalRecord("2", false, false, true, 0, "RESOLVED", 0, 0),
      makeEvalRecord("3", false, true, false, 1, "RESOLVED", 2, 1),
      makeEvalRecord("4", true, true, false, 2, "UNRESOLVED", 2, 1),
    ];

    const agg = computeAggregateMetrics(records);
    expect(agg).not.toBeNull();
    expect(agg?.sample_size).toBe(4);
    expect(agg?.resolution_accuracy).toBe(0.5);
    expect(agg?.unnecessary_clarification_rate).toBe(0.5);
    expect(agg?.mean_clarification_turns).toBe(1);
    expect(agg?.span_drop_rate).toBeCloseTo(2 / 6, 4);
    expect(agg?.unresolved_request_rate).toBe(0.25);
  });

  it("returns null for empty record list", () => {
    expect(computeAggregateMetrics([])).toBeNull();
  });
});
