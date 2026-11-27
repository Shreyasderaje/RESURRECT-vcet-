import type { DecisionResult, DetectorOutput } from "@/types/ambiguity";
import { buildConfirmationPrompt } from "./prompts";

export const MAX_CLARIFICATION_TURNS = 2;

export interface DecisionInput {
  originalRequest: string;
  analysis: DetectorOutput;
  clarificationTurnsUsed: number;
  confirmedHighRiskAction: boolean;
  maxClarificationTurns?: number;
}

const HIGH_RISK_PATTERN =
  /\b(delete|remove|drop|wipe|destroy|erase|purge|cancel\s+(all|the|my|their|that)|send\s+(the\s+)?email|email\s+all|publish|deploy\s+to\s+prod|transfer\s+\$|wire\s+money|purchase|buy\s+now|book\s+flight|terminate)\b/i;

export function inferHighRiskAction(
  originalRequest: string,
  analysis: DetectorOutput
): boolean {
  if (analysis.risk_level === "high") return true;
  return HIGH_RISK_PATTERN.test(originalRequest);
}

/**
 * Authoritative application-level decision policy.
 * Enforces clarification budget, avoids unnecessary questions on clear requests,
 * prevents guessing on materially ambiguous requests, and gates high-risk actions.
 */
export function evaluateDecision(input: DecisionInput): DecisionResult {
  const maxTurns = input.maxClarificationTurns ?? MAX_CLARIFICATION_TURNS;
  const remainingBudget = Math.max(0, maxTurns - input.clarificationTurnsUsed);
  const { analysis, originalRequest, confirmedHighRiskAction } = input;

  const isHighRisk = inferHighRiskAction(originalRequest, analysis);
  const distinctInterpretations = new Set(
    analysis.possible_interpretations.map((s) => s.trim().toLowerCase())
  ).size;

  const hasMaterialMissingInfo = analysis.missing_information.length > 0;
  const hasMultipleInterpretations = distinctInterpretations >= 2;
  const hasValidatedSpans = analysis.ambiguous_spans.length > 0;

  // Determine whether material ambiguity actually exists independently of model whim.
  const materiallyAmbiguous =
    analysis.is_ambiguous &&
    (hasMultipleInterpretations ||
      hasMaterialMissingInfo ||
      hasValidatedSpans ||
      analysis.clarification_required);

  // If the detector flagged ambiguity ONLY with trivial non-blocking details and no multiple interpretations:
  const clearlyActionable =
    !analysis.is_ambiguous ||
    (!hasMultipleInterpretations &&
      !hasMaterialMissingInfo &&
      !analysis.clarification_required);

  if (clearlyActionable) {
    if (isHighRisk && !confirmedHighRiskAction) {
      const intent = analysis.resolved_intent ?? originalRequest;
      return {
        action: "confirm",
        clarification_required: false,
        confirmation_required: true,
        reason:
          "Request intent is clear, but the action carries high impact and requires explicit user confirmation.",
        question: buildConfirmationPrompt({
          originalRequest,
          resolvedIntent: intent,
          riskLevel: "high",
        }),
        suggested_options: ["Confirm action", "Cancel"],
        remaining_budget: remainingBudget,
      };
    }

    return {
      action: "resolve",
      clarification_required: false,
      confirmation_required: false,
      reason:
        "Request is sufficiently clear with no material ambiguity; resolving directly without unnecessary questions.",
      question: null,
      suggested_options: [],
      remaining_budget: remainingBudget,
    };
  }

  // Material ambiguity remains: check budget before asking another question.
  if (materiallyAmbiguous) {
    if (remainingBudget <= 0) {
      return {
        action: "unresolved",
        clarification_required: false,
        confirmation_required: false,
        reason: `Maximum clarification budget (${maxTurns} turns) reached while material ambiguity still remains.`,
        question: null,
        suggested_options: [],
        remaining_budget: 0,
      };
    }

    const question =
      analysis.clarification_question?.trim() ||
      (analysis.missing_information[0]
        ? `Could you clarify ${analysis.missing_information[0]}?`
        : "Could you clarify which interpretation you intended?");

    return {
      action: "clarify",
      clarification_required: true,
      confirmation_required: false,
      reason:
        analysis.clarification_reason ||
        "Multiple plausible interpretations or missing required details require one targeted clarification.",
      question,
      suggested_options: analysis.suggested_options.slice(0, 5),
      remaining_budget: remainingBudget,
    };
  }

  return {
    action: "resolve",
    clarification_required: false,
    confirmation_required: false,
    reason: "Sufficient context available to proceed with resolution.",
    question: null,
    suggested_options: [],
    remaining_budget: remainingBudget,
  };
}
