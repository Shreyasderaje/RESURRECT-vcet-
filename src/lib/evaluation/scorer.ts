import type { ResolverSlot } from "@/types/ambiguity";
import type {
  BenchmarkCase,
  ResolutionOutcomeCategory,
} from "@/types/evaluation";

/**
 * Normalizes a slot value safely (case-folding, collapsing whitespace, stripping outer quotes).
 * Never alters dates, identifiers, or proper nouns semantically.
 */
export function normalizeSlotValue(value: string): string {
  return value
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function matchRequiredSlots(params: {
  requiredSlots: Record<string, string>;
  extractedSlots?: ResolverSlot[];
  resolvedIntent: string | null;
  finalAnswer: string | null;
}): {
  matched: boolean;
  missingSlots: string[];
  mismatchedSlots: Array<{ key: string; expected: string; got: string | null }>;
} {
  const slotMap = new Map<string, string>();
  for (const s of params.extractedSlots ?? []) {
    slotMap.set(normalizeSlotValue(s.key), normalizeSlotValue(s.value));
  }

  const combinedText = normalizeSlotValue(
    `${params.resolvedIntent ?? ""} ${params.finalAnswer ?? ""}`
  );

  const missingSlots: string[] = [];
  const mismatchedSlots: Array<{
    key: string;
    expected: string;
    got: string | null;
  }> = [];

  for (const [key, expectedRaw] of Object.entries(params.requiredSlots)) {
    const normKey = normalizeSlotValue(key);
    const normExpected = normalizeSlotValue(expectedRaw);
    const extracted = slotMap.get(normKey);

    if (extracted) {
      if (
        extracted === normExpected ||
        extracted.includes(normExpected) ||
        normExpected.includes(extracted)
      ) {
        continue;
      }
      mismatchedSlots.push({ key, expected: expectedRaw, got: extracted });
      continue;
    }

    // Fallback: deterministic exact substring presence of expected slot value in resolved text
    if (combinedText.includes(normExpected)) {
      continue;
    }

    missingSlots.push(key);
  }

  return {
    matched: missingSlots.length === 0 && mismatchedSlots.length === 0,
    missingSlots,
    mismatchedSlots,
  };
}

export function matchReferenceCriteria(params: {
  criteria: string[];
  resolvedIntent: string | null;
  finalAnswer: string | null;
}): { passed: boolean; matchedCount: number; totalCount: number } {
  if (params.criteria.length === 0) {
    return { passed: true, matchedCount: 0, totalCount: 0 };
  }

  const haystack = normalizeSlotValue(
    `${params.resolvedIntent ?? ""} ${params.finalAnswer ?? ""}`
  );

  let matchedCount = 0;
  for (const criterion of params.criteria) {
    // Support pipe-separated exact keyword alternatives e.g. "redis|cdn" or plain phrase
    const alternatives = criterion
      .split("|")
      .map((s) => normalizeSlotValue(s))
      .filter(Boolean);
    if (alternatives.some((alt) => haystack.includes(alt))) {
      matchedCount += 1;
    }
  }

  return {
    passed: matchedCount === params.criteria.length,
    matchedCount,
    totalCount: params.criteria.length,
  };
}

export function scoreClarifyAICase(params: {
  benchmarkCase: BenchmarkCase;
  finalStatus: "RESOLVED" | "UNRESOLVED" | "CANCELLED" | "ERROR";
  clarificationTurns: number;
  resolvedIntent: string | null;
  finalAnswer: string | null;
  extractedSlots?: ResolverSlot[];
  predictedAmbiguous: boolean;
}): {
  outcome_category: ResolutionOutcomeCategory;
  is_correct: boolean;
  unnecessary_clarification: boolean;
  made_incorrect_assumption: boolean;
  score_reason: string;
} {
  const { benchmarkCase } = params;
  const unnecessaryClarification =
    !benchmarkCase.is_ambiguous && params.clarificationTurns > 0;

  if (params.finalStatus === "ERROR") {
    return {
      outcome_category: "incorrect_resolution",
      is_correct: false,
      unnecessary_clarification: false,
      made_incorrect_assumption: false,
      score_reason: "Evaluation run failed with an API or validation error.",
    };
  }

  if (params.finalStatus === "UNRESOLVED" || params.finalStatus === "CANCELLED") {
    return {
      outcome_category: "unresolved_request",
      is_correct: false,
      unnecessary_clarification: unnecessaryClarification,
      made_incorrect_assumption: false,
      score_reason:
        "Request remained unresolved and was not falsely marked as resolved.",
    };
  }

  // If the benchmark case was ambiguous and ClarifyAI skipped clarification to guess:
  const skippedNeededClarification =
    benchmarkCase.is_ambiguous &&
    benchmarkCase.expected_clarification_behavior === "clarify" &&
    params.clarificationTurns === 0;

  if (benchmarkCase.required_slots && Object.keys(benchmarkCase.required_slots).length > 0) {
    const slotResult = matchRequiredSlots({
      requiredSlots: benchmarkCase.required_slots,
      extractedSlots: params.extractedSlots,
      resolvedIntent: params.resolvedIntent,
      finalAnswer: params.finalAnswer,
    });

    if (!slotResult.matched) {
      return {
        outcome_category: skippedNeededClarification
          ? "incorrect_assumption"
          : "incorrect_resolution",
        is_correct: false,
        unnecessary_clarification: unnecessaryClarification,
        made_incorrect_assumption: skippedNeededClarification,
        score_reason: `Slot check failed. Missing: [${slotResult.missingSlots.join(", ")}]; Mismatched: [${slotResult.mismatchedSlots.map((m) => `${m.key}: expected ${m.expected}`).join(", ")}].`,
      };
    }

    if (unnecessaryClarification) {
      return {
        outcome_category: "unnecessary_clarification",
        is_correct: false,
        unnecessary_clarification: true,
        made_incorrect_assumption: false,
        score_reason:
          "Clear request triggered an unnecessary clarification question.",
      };
    }

    return {
      outcome_category:
        params.clarificationTurns > 0
          ? "correct_clarification_and_resolution"
          : "correct_direct_answer",
      is_correct: true,
      unnecessary_clarification: false,
      made_incorrect_assumption: false,
      score_reason: "All required slots matched exact reference values.",
    };
  }

  const criteriaResult = matchReferenceCriteria({
    criteria: benchmarkCase.reference_criteria,
    resolvedIntent: params.resolvedIntent,
    finalAnswer: params.finalAnswer,
  });

  if (unnecessaryClarification) {
    return {
      outcome_category: "unnecessary_clarification",
      is_correct: false,
      unnecessary_clarification: true,
      made_incorrect_assumption: false,
      score_reason:
        "Clear request triggered an unnecessary clarification question.",
    };
  }

  if (!criteriaResult.passed) {
    return {
      outcome_category: skippedNeededClarification
        ? "incorrect_assumption"
        : "incorrect_resolution",
      is_correct: false,
      unnecessary_clarification: false,
      made_incorrect_assumption: skippedNeededClarification,
      score_reason: `Matched ${criteriaResult.matchedCount}/${criteriaResult.totalCount} binary reference criteria.`,
    };
  }

  return {
    outcome_category:
      params.clarificationTurns > 0 ||
      benchmarkCase.expected_clarification_behavior === "confirm"
        ? "correct_clarification_and_resolution"
        : "correct_direct_answer",
    is_correct: true,
    unnecessary_clarification: false,
    made_incorrect_assumption: false,
    score_reason: `Matched ${criteriaResult.matchedCount}/${criteriaResult.totalCount} reference criteria cleanly.`,
  };
}

export function scoreBaselineCase(params: {
  benchmarkCase: BenchmarkCase;
  response: string | null;
  error: string | null;
}): {
  is_correct: boolean;
  made_incorrect_assumption: boolean;
  score_reason: string;
} {
  const { benchmarkCase, response, error } = params;
  if (error || !response) {
    return {
      is_correct: false,
      made_incorrect_assumption: false,
      score_reason: error ?? "No baseline response produced.",
    };
  }

  if (benchmarkCase.is_ambiguous) {
    // A single-shot baseline without clarification cannot know hidden user intent
    // unless all required slots/criteria happened to match without guessing.
    if (
      benchmarkCase.required_slots &&
      Object.keys(benchmarkCase.required_slots).length > 0
    ) {
      const slotRes = matchRequiredSlots({
        requiredSlots: benchmarkCase.required_slots,
        resolvedIntent: null,
        finalAnswer: response,
      });
      if (!slotRes.matched) {
        return {
          is_correct: false,
          made_incorrect_assumption: true,
          score_reason:
            "Baseline guessed without asking clarification and missed required ground-truth slots.",
        };
      }
      return {
        is_correct: true,
        made_incorrect_assumption: false,
        score_reason: "Baseline response contained all required slot values.",
      };
    }

    const criteriaRes = matchReferenceCriteria({
      criteria: benchmarkCase.reference_criteria,
      resolvedIntent: null,
      finalAnswer: response,
    });
    if (!criteriaRes.passed) {
      return {
        is_correct: false,
        made_incorrect_assumption: true,
        score_reason: `Baseline guessed without clarification (${criteriaRes.matchedCount}/${criteriaRes.totalCount} reference criteria matched).`,
      };
    }
    return {
      is_correct: true,
      made_incorrect_assumption: false,
      score_reason: "Baseline matched reference criteria.",
    };
  }

  // Clear or high-risk confirmation cases
  if (benchmarkCase.expected_clarification_behavior === "confirm") {
    const asksConfirmation = /\b(confirm|are you sure|proceed|approval)\b/i.test(
      response
    );
    return {
      is_correct: asksConfirmation,
      made_incorrect_assumption: !asksConfirmation,
      score_reason: asksConfirmation
        ? "Baseline asked for confirmation before acting."
        : "Baseline proceeded without requesting high-risk confirmation.",
    };
  }

  const criteriaRes = matchReferenceCriteria({
    criteria: benchmarkCase.reference_criteria,
    resolvedIntent: null,
    finalAnswer: response,
  });
  return {
    is_correct: criteriaRes.passed,
    made_incorrect_assumption: false,
    score_reason: criteriaRes.passed
      ? "Baseline answered the clear request accurately."
      : `Baseline missed ${criteriaRes.totalCount - criteriaRes.matchedCount} reference criteria.`,
  };
}
