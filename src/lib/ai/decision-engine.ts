
import type {
  DecisionResult,
  DetectorOutput,
} from "@/types/ambiguity";
import { buildConfirmationPrompt } from "./prompts";

export const MAX_CLARIFICATION_TURNS = 2;

import type { AutonomyMode } from "@/types/chat";

export type { AutonomyMode } from "@/types/chat";

export type AmbiguitySeverity =
  | "none"
  | "low"
  | "medium"
  | "high";

export interface DecisionInput {
  originalRequest: string;
  analysis: DetectorOutput;
  clarificationTurnsUsed: number;
  confirmedHighRiskAction: boolean;
  maxClarificationTurns?: number;
  autonomy_mode?: AutonomyMode;
}

const HIGH_RISK_PATTERN =
  /\b(delete|remove|drop|wipe|destroy|erase|purge|cancel\s+(all|the|my|their|that)|send\s+(the\s+)?email|email\s+all|publish|deploy\s+to\s+prod|transfer\s+\$|wire\s+money|purchase|buy\s+now|book\s+flight|terminate|crime|criminal|illegal|commit\s+(a\s+)?(crime|offense|felony|misdemeanor)|assault|harm|violence|weapon|firearm|threaten|sabotage)\b/i;

export function inferHighRiskAction(
  originalRequest: string,
  analysis: DetectorOutput
): boolean {
  if (analysis.risk_level === "high") return true;
  return HIGH_RISK_PATTERN.test(originalRequest);
}

/**
 * Deterministic ambiguity severity derived from existing
 * detector output. No additional model calls required.
 */
export function inferAmbiguitySeverity(
  analysis: DetectorOutput
): AmbiguitySeverity {
  if (!analysis.is_ambiguous) return "none";

  const distinctInterpretations = new Set(
    analysis.possible_interpretations
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  ).size;

  // Missing required information must never be guessed.
  if (analysis.missing_information.length > 0) {
    return "high";
  }

  if (
    distinctInterpretations >= 2 ||
    analysis.clarification_required ||
    analysis.ambiguous_spans.length > 0
  ) {
    return "medium";
  }

  return "low";
}

/**
 * Authoritative HAI decision policy.
 * Autonomy preferences never override mandatory safety gates.
 */
export function evaluateDecision(
  input: DecisionInput
): DecisionResult {
  const maxTurns =
    input.maxClarificationTurns ?? MAX_CLARIFICATION_TURNS;

  const remainingBudget = Math.max(
    0,
    maxTurns - input.clarificationTurnsUsed
  );

  const {
    analysis,
    originalRequest,
    confirmedHighRiskAction,
  } = input;

  const mode = input.autonomy_mode ?? "collaborative";
  const severity = inferAmbiguitySeverity(analysis);

  const isHighRisk = inferHighRiskAction(
    originalRequest,
    analysis
  );

  const effectiveRisk = isHighRisk
    ? "high"
    : analysis.risk_level;

  const materialAmbiguity =
    severity === "medium" ||
    severity === "high" ||
    (analysis.is_ambiguous &&
      analysis.ambiguous_spans.length > 0);

  const requiresConfirmation =
    isHighRisk ||
    (mode === "cautious" && effectiveRisk === "medium");

  const requiresClarification =
    severity === "high" ||
    (mode === "collaborative" && severity === "medium") ||
    (mode === "cautious" && severity !== "none") ||
    (isHighRisk && materialAmbiguity) ||
    (requiresConfirmation && severity === "medium");

  if (requiresClarification) {
    if (remainingBudget <= 0) {
      return {
        action: "unresolved",
        clarification_required: false,
        confirmation_required: false,
        reason: `Maximum clarification budget (${maxTurns} turns) reached while ambiguity remains.`,
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
        `Clarification required under ${mode} mode.`,
      question,
      suggested_options:
        analysis.suggested_options.slice(0, 5),
      remaining_budget: remainingBudget,
    };
  }

  // Mandatory confirmation must occur before resolution.
  if (
    requiresConfirmation &&
    !confirmedHighRiskAction
  ) {
    const intent =
      analysis.resolved_intent ?? originalRequest;

    return {
      action: "confirm",
      clarification_required: false,
      confirmation_required: true,
      reason:
        `This ${effectiveRisk}-impact simulated action requires explicit user confirmation.`,
      question: buildConfirmationPrompt({
        originalRequest,
        resolvedIntent: intent,
        riskLevel: effectiveRisk,
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
      severity === "none"
        ? "Request is sufficiently clear."
        : `Proceeding under ${mode} mode without additional clarification.`,
    question: null,
    suggested_options: [],
    remaining_budget: remainingBudget,
  };
}
