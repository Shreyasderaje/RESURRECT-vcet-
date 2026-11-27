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
  if (precision === null || recall === null || precision + recall === 0) {
    return { precision, recall, f1: null };
  }
  const f1 = Number(((2 * precision * recall) / (precision + recall)).toFixed(4));
  return { precision, recall, f1 };
}

export function computeAggregateMetrics(
  cases: CaseEvaluationRecord[]
): AggregateMetrics | null {
  if (cases.length === 0) return null;

  const cm = computeConfusionMatrix(
    cases.map((c) => ({
      groundTruthAmbiguous: c.ground_truth.is_ambiguous,
      predictedAmbiguous: c.clarify_ai.predicted_ambiguous,
    }))
  );

  const { precision, recall, f1 } = computePrecisionRecallF1(cm);

  const validClarifyCases = cases.filter(
    (c) => c.clarify_ai.final_status !== "ERROR"
  );
  const clearCases = cases.filter((c) => !c.ground_truth.is_ambiguous);

  const resolvedCorrect = cases.filter((c) => c.clarify_ai.is_correct).length;
  const baselineCorrect = cases.filter((c) => c.baseline.is_correct).length;

  const unnecessaryClarifications = clearCases.filter(
    (c) => c.clarify_ai.unnecessary_clarification
  ).length;

  const totalClarificationTurns = validClarifyCases.reduce(
    (acc, c) => acc + c.clarify_ai.clarification_turns,
    0
  );

  const totalProposedSpans = cases.reduce(
    (acc, c) => acc + c.clarify_ai.span_total_proposed,
    0
  );
  const totalDroppedSpans = cases.reduce(
    (acc, c) => acc + c.clarify_ai.span_dropped_count,
    0
  );

  const unresolvedCount = cases.filter(
    (c) => c.clarify_ai.final_status === "UNRESOLVED"
  ).length;

  const incorrectAssumptions = cases.filter(
    (c) => c.clarify_ai.made_incorrect_assumption
  ).length;

  const baselineIncorrectAssumptions = cases.filter(
    (c) => c.baseline.made_incorrect_assumption
  ).length;

  const apiErrors = cases.filter(
    (c) => c.clarify_ai.error !== null || c.baseline.error !== null
  ).length;

  const consistencyCases = cases.filter(
    (c) =>
      typeof c.self_consistency_agreement === "number" &&
      !Number.isNaN(c.self_consistency_agreement)
  );
  const selfConsistencyRate =
    consistencyCases.length > 0
      ? safeDivide(
          consistencyCases.reduce(
            (acc, c) => acc + (c.self_consistency_agreement ?? 0),
            0
          ),
          consistencyCases.length
        )
      : null;

  const breakdown: Record<ResolutionOutcomeCategory, number> = {
    correct_direct_answer: 0,
    correct_clarification_and_resolution: 0,
    incorrect_resolution: 0,
    unresolved_request: 0,
    unnecessary_clarification: 0,
    incorrect_assumption: 0,
  };

  for (const c of cases) {
    breakdown[c.clarify_ai.outcome_category] += 1;
  }

  return {
    sample_size: cases.length,
    confusion_matrix: cm,
    detection_precision: precision,
    detection_recall: recall,
    detection_f1: f1,
    resolution_accuracy: safeDivide(resolvedCorrect, cases.length),
    baseline_resolution_accuracy: safeDivide(baselineCorrect, cases.length),
    unnecessary_clarification_rate: safeDivide(
      unnecessaryClarifications,
      clearCases.length
    ),
    mean_clarification_turns: safeDivide(
      totalClarificationTurns,
      validClarifyCases.length
    ),
    self_consistency_agreement_rate: selfConsistencyRate,
    span_drop_rate: safeDivide(totalDroppedSpans, totalProposedSpans),
    unresolved_request_rate: safeDivide(unresolvedCount, cases.length),
    incorrect_assumption_rate: safeDivide(incorrectAssumptions, cases.length),
    baseline_incorrect_assumption_rate: safeDivide(
      baselineIncorrectAssumptions,
      cases.length
    ),
    api_error_rate: safeDivide(apiErrors, cases.length),
    outcome_breakdown: breakdown,
  };
}
