import { computeSafetyMetrics } from "./safety";
import type {
  AggregateMetrics,
  CaseEvaluationRecord,
  ConfusionMatrixCounts,
  ResolutionOutcomeCategory,
} from "@/types/evaluation";

export function computeConfusionMatrix(
  records: Array<{ groundTruthAmbiguous: boolean; predictedAmbiguous: boolean }>
): ConfusionMatrixCounts {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  for (const r of records) {
    if (r.groundTruthAmbiguous && r.predictedAmbiguous) tp += 1;
    else if (!r.groundTruthAmbiguous && r.predictedAmbiguous) fp += 1;
    else if (!r.groundTruthAmbiguous && !r.predictedAmbiguous) tn += 1;
    else fn += 1;
  }

  return { tp, fp, tn, fn };
}

export function safeDivide(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Number((numerator / denominator).toFixed(4));
}

export function computePrecisionRecallF1(cm: ConfusionMatrixCounts): {
  precision: number | null;
  recall: number | null;
  f1: number | null;
} {
  const precision = safeDivide(cm.tp, cm.tp + cm.fp);
  const recall = safeDivide(cm.tp, cm.tp + cm.fn);
  if (precision === null || recall === null) {
    return { precision, recall, f1: null };
  }
  const f1 = precision + recall === 0 ? 0 : Number(((2 * precision * recall) / (precision + recall)).toFixed(4));
  return { precision, recall, f1 };
}


/** Eligibility and formulas are documented in data/README.md. */
export function computeAggregateMetrics(cases: CaseEvaluationRecord[]): AggregateMetrics | null {
  if (!cases.length) return null;
  const clarify = cases.filter(c => c.clarify_ai.error === null && c.clarify_ai.final_status !== "ERROR");
  const baseline = cases.filter(c => c.baseline.error === null && typeof c.baseline.response === "string" && c.baseline.response.trim().length > 0);
  const baselineSet = new Set(baseline);
  const clarifySet = new Set(clarify);
  const paired = clarify.filter(c => baselineSet.has(c) &&
    typeof c.clarify_ai.is_correct === "boolean" && typeof c.baseline.is_correct === "boolean");
  const pairedAssumption = clarify.filter(c => baselineSet.has(c) && typeof c.clarify_ai.made_incorrect_assumption === "boolean" && typeof c.baseline.made_incorrect_assumption === "boolean");
  const detection = cases.filter(c => c.clarify_ai.detector_output !== null && typeof c.clarify_ai.detector_output?.is_ambiguous === "boolean");
  const cm = computeConfusionMatrix(detection.map(c => ({ groundTruthAmbiguous: c.ground_truth.is_ambiguous, predictedAmbiguous: c.clarify_ai.detector_output!.is_ambiguous })));
  const { precision, recall, f1 } = computePrecisionRecallF1(cm);
  const turns = clarify.filter(c => Number.isInteger(c.clarify_ai.clarification_turns) && c.clarify_ai.clarification_turns >= 0);
  const direct = turns.filter(c => c.ground_truth.expected_clarification_behavior === "direct_answer");
  const count = (xs: CaseEvaluationRecord[], fn: (c: CaseEvaluationRecord) => boolean) => xs.filter(fn).length;
  const unresolved = count(clarify, c => c.clarify_ai.final_status === "UNRESOLVED");
  const cancelled = count(clarify, c => c.clarify_ai.final_status === "CANCELLED");
  const recordedError = (v: unknown) => typeof v === "string" && v.length > 0;
  const clarifyErrors = count(cases, c => recordedError(c.clarify_ai.error));
  const baselineErrors = count(cases, c => recordedError(c.baseline.error));
  const anyErrors = count(cases, c => recordedError(c.clarify_ai.error) || recordedError(c.baseline.error));
  const anyUnavailable = count(cases, c => !clarifySet.has(c) || !baselineSet.has(c));
  const consistency = cases.filter(c => {
    const score = c.self_consistency_agreement;
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1) return false;
    const observation = c.self_consistency_observation;
    // Historical records have only the scalar. Accept only values consistent
    // with the documented three-pass majority calculation.
    if (!observation) return Math.abs(score - 1) < 0.0001 || Math.abs(score - 2 / 3) < 0.0001;
    if (observation.status !== "completed" || observation.error !== null ||
        observation.decisions.length !== 3 || observation.decisions.some(v => typeof v !== "boolean")) return false;
    const yes = observation.decisions.filter(Boolean).length;
    return Math.abs(score - Math.max(yes, 3 - yes) / 3) < 0.0001;
  });
  const consistencyStatus = (status: "completed" | "failed" | "unavailable" | "not_requested") =>
    count(cases, c => c.self_consistency_observation?.status === status);
  const spans = detection.filter(c => Number.isFinite(c.clarify_ai.span_total_proposed) && Number.isFinite(c.clarify_ai.span_dropped_count) && c.clarify_ai.span_total_proposed >= 0 && c.clarify_ai.span_dropped_count >= 0 && c.clarify_ai.span_dropped_count <= c.clarify_ai.span_total_proposed);
  const breakdown: Record<ResolutionOutcomeCategory, number> = { correct_direct_answer: 0, correct_clarification_and_resolution: 0, incorrect_resolution: 0, unresolved_request: 0, unnecessary_clarification: 0, incorrect_assumption: 0, unscorable: 0, cancelled_request: 0, evaluation_error: 0 };
  for (const c of clarify) breakdown[c.clarify_ai.outcome_category]++;
  return {
    sample_size: cases.length, safety: computeSafetyMetrics(cases),
    coverage: { detection: detection.length, clarify: clarify.length, baseline: baseline.length, paired: paired.length, paired_assumption: pairedAssumption.length, direct_answer: direct.length, valid_turns: turns.length, clarify_errors: clarifyErrors, baseline_errors: baselineErrors, any_errors: anyErrors, clarify_unavailable: cases.length - clarify.length, baseline_unavailable: cases.length - baseline.length, any_unavailable: anyUnavailable, unresolved, cancelled },
    confusion_matrix: cm, detection_precision: precision, detection_recall: recall, detection_f1: f1,
    resolution_accuracy: safeDivide(count(paired, c => c.clarify_ai.is_correct === true), paired.length),
    baseline_resolution_accuracy: safeDivide(count(paired, c => c.baseline.is_correct === true), paired.length),
    incorrect_assumption_rate: safeDivide(count(pairedAssumption, c => c.clarify_ai.made_incorrect_assumption === true), pairedAssumption.length),
    baseline_incorrect_assumption_rate: safeDivide(count(pairedAssumption, c => c.baseline.made_incorrect_assumption === true), pairedAssumption.length),
    unnecessary_clarification_rate: safeDivide(count(direct, c => c.clarify_ai.clarification_turns > 0), direct.length),
    mean_clarification_turns: safeDivide(turns.reduce((sum, c) => sum + c.clarify_ai.clarification_turns, 0), turns.length),
    self_consistency_coverage: {
      completed: consistencyStatus("completed"), failed: consistencyStatus("failed"),
      unavailable: consistencyStatus("unavailable"), not_requested: consistencyStatus("not_requested"),
      legacy_unknown: count(cases, c => !c.self_consistency_observation), eligible: consistency.length,
    },
    self_consistency_agreement_rate: safeDivide(consistency.reduce((sum, c) => sum + c.self_consistency_agreement!, 0), consistency.length),
    span_drop_rate: safeDivide(spans.reduce((sum, c) => sum + c.clarify_ai.span_dropped_count, 0), spans.reduce((sum, c) => sum + c.clarify_ai.span_total_proposed, 0)),
    unresolved_request_rate: safeDivide(unresolved, clarify.length), cancelled_request_rate: safeDivide(cancelled, clarify.length),
    api_error_rate: safeDivide(anyErrors, cases.length), outcome_breakdown: breakdown,
  };
}
