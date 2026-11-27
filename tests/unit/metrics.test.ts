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
      safety_events: [],
      detector_output: { is_ambiguous: predAmbiguous } as CaseEvaluationRecord["clarify_ai"]["detector_output"],
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

  it("returns zero F1 for defined zero precision and recall, and null for undefined inputs", () => {
    expect(computePrecisionRecallF1({ tp: 0, fp: 1, fn: 1, tn: 0 })).toEqual({ precision: 0, recall: 0, f1: 0 });
    expect(computePrecisionRecallF1({ tp: 0, fp: 0, fn: 1, tn: 0 }).f1).toBeNull();
  });

  it("distinguishes recorded errors from unavailable and malformed scores", () => {
    const missing = makeEvalRecord("missing", false, false, true);
    missing.baseline.response = null;
    const malformed = makeEvalRecord("bad", false, false, true);
    (malformed.baseline as unknown as { is_correct: unknown }).is_correct = undefined;
    const m = computeAggregateMetrics([missing, malformed])!;
    expect(m.api_error_rate).toBe(0);
    expect(m.coverage).toMatchObject({baseline_errors: 0, baseline_unavailable: 1, any_unavailable: 1, paired: 0});
    expect(m.baseline_resolution_accuracy).toBeNull();
  });

  it("reports three-pass agreement eligibility, failures, unavailable checks and legacy status", () => {
    const completed = makeEvalRecord("complete", true, true, true);
    completed.self_consistency_observation = {status:"completed", decisions:[true,false,true], error:null};
    completed.self_consistency_agreement = 2/3;
    const failed = makeEvalRecord("failed", true, true, true);
    failed.self_consistency_observation = {status:"failed",decisions:[true],error:"Detector call failed"};
    failed.self_consistency_agreement = null;
    const unavailable = makeEvalRecord("unavailable", true, true, true);
    unavailable.self_consistency_observation = {status:"unavailable",decisions:[],error:"Initial detector unavailable"};
    const unrequested = makeEvalRecord("unrequested", true, true, true);
    unrequested.self_consistency_observation = {status:"not_requested",decisions:[],error:null};
    const legacy = makeEvalRecord("legacy", true, true, true);
    legacy.self_consistency_agreement = 1;
    const invalid = makeEvalRecord("invalid", true, true, true);
    invalid.self_consistency_observation = {status:"completed", decisions:[true,true,false],error:null};
    invalid.self_consistency_agreement = 1;
    const metrics = computeAggregateMetrics([completed,failed,unavailable,unrequested,legacy,invalid])!;
    expect(metrics.self_consistency_coverage).toEqual({completed:2,failed:1,unavailable:1,not_requested:1,legacy_unknown:1,eligible:2});
    expect(metrics.self_consistency_agreement_rate).toBe(0.8333);
    expect(computeAggregateMetrics([failed])!.self_consistency_agreement_rate).toBeNull();
    legacy.self_consistency_agreement = 0.25;
    expect(computeAggregateMetrics([legacy])!.self_consistency_agreement_rate).toBeNull();
  });

  it("keeps accuracy and assumption comparisons paired independently when scores are unavailable", () => {
    const record = makeEvalRecord("one", true, true, true);
    record.clarify_ai.made_incorrect_assumption = null;
    const m = computeAggregateMetrics([record])!;
    expect(m.coverage.paired).toBe(1);
    expect(m.coverage.paired_assumption).toBe(0);
    expect(m.resolution_accuracy).toBe(1);
    expect(m.incorrect_assumption_rate).toBeNull();
    record.clarify_ai.is_correct = null;
    expect(computeAggregateMetrics([record])!.resolution_accuracy).toBeNull();
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


  it("excludes missing detector observations while preserving later failures with observed detection", () => {
    const missing = makeEvalRecord("missing", true, false, false);
    missing.clarify_ai.detector_output = null;
    missing.clarify_ai.final_status = "ERROR";
    missing.clarify_ai.error = "detector failed";
    const later = makeEvalRecord("later", true, true, false);
    later.clarify_ai.final_status = "ERROR";
    later.clarify_ai.error = "resolver failed";
    const m = computeAggregateMetrics([missing, later])!;
    expect(m.coverage.detection).toBe(1);
    expect(m.confusion_matrix).toEqual({tp: 1, fp: 0, tn: 0, fn: 0});
    expect(m.detection_recall).toBe(1);
    expect(m.resolution_accuracy).toBeNull();
    expect(m.api_error_rate).toBe(1);
    expect(m.coverage.clarify_errors).toBe(2);
  });

  it("uses paired observations and retains genuinely incorrect outcomes", () => {
    const good = makeEvalRecord("good", false, false, true);
    const incorrect = makeEvalRecord("incorrect", true, true, false);
    const baselineFailure = makeEvalRecord("baseline", false, false, true);
    baselineFailure.baseline.error = "baseline failed";
    const clarifyFailure = makeEvalRecord("clarify", false, false, false);
    clarifyFailure.clarify_ai.error = "API failed";
    clarifyFailure.clarify_ai.final_status = "ERROR";
    const m = computeAggregateMetrics([good, incorrect, baselineFailure, clarifyFailure])!;
    expect(m.coverage).toMatchObject({paired: 2, baseline_errors: 1, clarify_errors: 1, any_errors: 2});
    expect(m.resolution_accuracy).toBe(0.5);
    expect(m.baseline_resolution_accuracy).toBe(0.5);
    expect(m.api_error_rate).toBe(0.5);
  });

  it("separates unresolved and cancelled and excludes invalid turns", () => {
    const unresolved = makeEvalRecord("u", true, true, false, 2, "UNRESOLVED");
    const cancelled = makeEvalRecord("c", false, false, false);
    cancelled.clarify_ai.final_status = "CANCELLED";
    cancelled.clarify_ai.clarification_turns = -1;
    const invalid = makeEvalRecord("i", false, false, false);
    invalid.clarify_ai.clarification_turns = NaN;
    const m = computeAggregateMetrics([unresolved, cancelled, invalid])!;
    expect(m.coverage).toMatchObject({unresolved: 1, cancelled: 1, valid_turns: 1, direct_answer: 0});
    expect(m.unresolved_request_rate).toBe(0.3333);
    expect(m.cancelled_request_rate).toBe(0.3333);
    expect(m.mean_clarification_turns).toBe(2);
    expect(m.unnecessary_clarification_rate).toBeNull();
    expect(m.resolution_accuracy).toBe(0);
  });

  it("returns null for empty record list", () => {
    expect(computeAggregateMetrics([])).toBeNull();
  });
});
