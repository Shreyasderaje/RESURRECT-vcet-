import presetsJson from "../../../data/preset-scenarios.json";
import type {
  BaselineComparisonResult,
  ChatApiResponse,
  ConversationContext,
  ConversationRecord,
  PresetScenario,
} from "@/types/chat";
import { evaluateDecision, MAX_CLARIFICATION_TURNS } from "./decision-engine";
import { validateAmbiguousSpans } from "./detector";
import type { DetectorOutput } from "@/types/ambiguity";

export const PRESET_SCENARIOS = presetsJson as unknown as PresetScenario[];

export function findPresetById(presetId?: string | null): PresetScenario | null {
  if (!presetId) return null;
  return PRESET_SCENARIOS.find((p) => p.id === presetId) ?? null;
}

export function findPresetByPrompt(prompt: string): PresetScenario | null {
  const norm = prompt.trim().toLowerCase();
  return (
    PRESET_SCENARIOS.find(
      (p) => p.initial_request.trim().toLowerCase() === norm
    ) ?? null
  );
}

/**
 * Deterministic demo analysis for arbitrary custom prompts when no GEMINI_API_KEY
 * is configured. Never fabricates live API results; always tags mode: "demo".
 */
export function buildDeterministicCustomDemoAnalysis(
  originalRequest: string,
  context: ConversationContext,
  clarificationAnswersCount: number
): DetectorOutput {
  const lower = originalRequest.toLowerCase();

  // If user already answered once, resolve deterministically
  if (clarificationAnswersCount > 0) {
    return {
      is_ambiguous: false,
      ambiguity_types: [],
      ambiguous_spans: [],
      possible_interpretations: [originalRequest],
      missing_information: [],
      risk_level: /\b(delete|drop|remove|cancel|send|transfer|deploy)\b/i.test(
        originalRequest
      )
        ? "high"
        : "low",
      clarification_required: false,
      clarification_reason:
        "Demo mode incorporated your clarification response into the resolved intent.",
      clarification_question: null,
      suggested_options: [],
      resolved_intent: originalRequest,
    };
  }

  const pronouns = ["it", "this", "that", "they", "them", "her", "him"];
  const foundPronoun = pronouns.find((p) =>
    new RegExp(`\\b${p}\\b`).test(lower)
  );
  const vagueTime = ["soon", "later", "tomorrow", "next week", "next friday"].find(
    (t) => lower.includes(t)
  );
  const subjectiveTerm = ["better", "faster", "clean", "nice", "executive", "concise"].find(
    (s) => lower.includes(s)
  );

  const rawSpans: DetectorOutput["ambiguous_spans"] = [];
  const types: DetectorOutput["ambiguity_types"] = [];

  if (foundPronoun) {
    const match = originalRequest.match(new RegExp(`\\b${foundPronoun}\\b`, "i"));
    if (match?.[0]) {
      types.push("referential");
      rawSpans.push({
        phrase: match[0],
        type: "referential",
        reason: `Pronoun "${match[0]}" lacks an explicit target in the request.`,
        interpretations: [
          context.recent_files?.[0]?.name ?? "Most recent workspace item",
          context.contacts?.[0]?.name ?? "Primary workspace contact",
        ],
      });
    }
  }

  if (vagueTime) {
    const idx = lower.indexOf(vagueTime);
    const exact = originalRequest.slice(idx, idx + vagueTime.length);
    types.push("contextual");
    rawSpans.push({
      phrase: exact,
      type: "contextual",
      reason: `Relative time "${exact}" may map to multiple calendar dates.`,
      interpretations: ["Nearest upcoming slot", "Following week slot"],
    });
  }

  if (subjectiveTerm) {
    const idx = lower.indexOf(subjectiveTerm);
    const exact = originalRequest.slice(idx, idx + subjectiveTerm.length);
    types.push("subjective");
    rawSpans.push({
      phrase: exact,
      type: "subjective",
      reason: `Qualifier "${exact}" depends on audience and target length.`,
      interpretations: ["Brief bullet summary", "Detailed structured rewrite"],
    });
  }

  const { validSpans } = validateAmbiguousSpans(originalRequest, rawSpans);
  const isHighRisk = /\b(delete|remove|drop|wipe|cancel|send\s+email|deploy)\b/i.test(
    originalRequest
  );

  if (validSpans.length === 0) {
    return {
      is_ambiguous: false,
      ambiguity_types: [],
      ambiguous_spans: [],
      possible_interpretations: [originalRequest],
      missing_information: [],
      risk_level: isHighRisk ? "high" : "low",
      clarification_required: false,
      clarification_reason:
        "Deterministic Demo Mode: no ambiguous markers detected in the request.",
      clarification_question: null,
      suggested_options: [],
      resolved_intent: originalRequest,
    };
  }

  const primarySpan = validSpans[0];
  return {
    is_ambiguous: true,
    ambiguity_types: Array.from(new Set(types)),
    ambiguous_spans: validSpans,
    possible_interpretations: primarySpan.interpretations,
    missing_information: [`Specific target for "${primarySpan.phrase}"`],
    risk_level: isHighRisk ? "high" : "medium",
    clarification_required: true,
    clarification_reason: primarySpan.reason,
    clarification_question: `Demo Mode detected ambiguity around "${primarySpan.phrase}". Which option did you mean?`,
    suggested_options: primarySpan.interpretations,
    resolved_intent: null,
  };
}

export function buildDemoResponseForRecord(params: {
  record: ConversationRecord;
  latestInput: string;
  includeBaseline: boolean;
  isConfirmationReply?: { confirmed: boolean; rejected: boolean; unrelated: boolean };
}): Omit<ChatApiResponse, "conversation"> {
  const { record, latestInput, includeBaseline } = params;
  const preset =
    findPresetById(record.preset_id) ??
    findPresetByPrompt(record.original_request);

  if (preset) {
    // Check if high-risk preset confirmation was declined or unrelated
    if (record.pending_action === "confirm" && params.isConfirmationReply) {
      if (params.isConfirmationReply.rejected) {
        return {
          conversation_id: record.conversation_id,
          status: "CANCELLED",
          pending_action: null,
          assistant_message:
            "Action cancelled as requested. No simulated deletion was performed. How would you like to adjust the request?",
          analysis: record.last_analysis,
          clarification_question: null,
          suggested_options: [],
          resolved_intent: null,
          final_answer: null,
          clarification_turns: record.clarification_turns,
          span_validation: record.last_span_validation,
          decision: record.last_decision,
          resolution: null,
          baseline: includeBaseline ? preset.demo_baseline : null,
          mode: "demo",
          error: null,
        };
      }
      if (params.isConfirmationReply.unrelated) {
        return {
          conversation_id: record.conversation_id,
          status: "AWAITING_USER",
          pending_action: "confirm",
          assistant_message:
            "I did not interpret that as an explicit confirmation. Please reply \"Confirm\" to execute the simulated high-risk action, or \"Cancel\" to abort.",
          analysis: record.last_analysis,
          clarification_question: record.last_clarification_question,
          suggested_options: ["Confirm action", "Cancel"],
          resolved_intent: record.last_analysis?.resolved_intent ?? null,
          final_answer: null,
          clarification_turns: record.clarification_turns,
          span_validation: record.last_span_validation,
          decision: record.last_decision,
          resolution: null,
          baseline: includeBaseline ? preset.demo_baseline : null,
          mode: "demo",
          error: null,
        };
      }
    }

    // Match demo turn index: initial request is turn index 0, first follow-up is index 1
    const turnIdx =
      record.clarification_answers.length === 0 && !record.confirmed_action
        ? 0
        : Math.min(
            preset.demo_turns.length - 1,
            Math.max(1, record.clarification_answers.length)
          );
    const turnData = preset.demo_turns[turnIdx] ?? preset.demo_turns[0];

    return {
      ...turnData.response,
      conversation_id: record.conversation_id,
      baseline: includeBaseline ? preset.demo_baseline : null,
      mode: "demo",
    };
  }

  // Fallback deterministic demo handling for custom user prompts
  const analysis = buildDeterministicCustomDemoAnalysis(
    record.original_request,
    record.context,
    record.clarification_answers.length
  );
  const { stats } = validateAmbiguousSpans(
    record.original_request,
    analysis.ambiguous_spans
  );
  const decision = evaluateDecision({
    originalRequest: record.original_request,
    analysis,
    clarificationTurnsUsed: record.clarification_turns,
    confirmedHighRiskAction: record.confirmed_action,
    maxClarificationTurns: MAX_CLARIFICATION_TURNS,
  });

  const baseline: BaselineComparisonResult | null = includeBaseline
    ? {
        available: true,
        mode: "demo",
        model: "demo-baseline",
        response: `Demo Baseline (direct guess without clarification): Processed "${record.original_request}" using the default workspace context.`,
      }
    : null;

  if (decision.action === "clarify") {
    return {
      conversation_id: record.conversation_id,
      status: "AWAITING_USER",
      pending_action: "clarify",
      assistant_message: decision.question ?? "Could you clarify your request?",
      analysis,
      clarification_question: decision.question,
      suggested_options: decision.suggested_options,
      resolved_intent: null,
      final_answer: null,
      clarification_turns: record.clarification_turns + 1,
      span_validation: stats,
      decision,
      resolution: null,
      baseline,
      mode: "demo",
      error: null,
    };
  }

  if (decision.action === "confirm") {
    return {
      conversation_id: record.conversation_id,
      status: "AWAITING_USER",
      pending_action: "confirm",
      assistant_message:
        decision.question ??
        "Please reply Confirm to proceed with this simulated high-risk action, or Cancel to abort.",
      analysis,
      clarification_question: decision.question,
      suggested_options: ["Confirm action", "Cancel"],
      resolved_intent: analysis.resolved_intent ?? record.original_request,
      final_answer: null,
      clarification_turns: record.clarification_turns,
      span_validation: stats,
      decision,
      resolution: null,
      baseline,
      mode: "demo",
      error: null,
    };
  }

  if (decision.action === "unresolved") {
    return {
      conversation_id: record.conversation_id,
      status: "UNRESOLVED",
      pending_action: null,
      assistant_message:
        "Important ambiguity remains after reaching the 2-turn clarification limit. Please provide a more specific request or reset the conversation.",
      analysis,
      clarification_question: null,
      suggested_options: [],
      resolved_intent: null,
      final_answer: null,
      clarification_turns: record.clarification_turns,
      span_validation: stats,
      decision,
      resolution: null,
      baseline,
      mode: "demo",
      error: null,
    };
  }

  const answerSummary =
    record.clarification_answers.length > 0
      ? ` (Clarified via: "${latestInput}")`
      : "";
  const resolvedIntent = `${record.original_request}${answerSummary}`;

  return {
    conversation_id: record.conversation_id,
    status: "RESOLVED",
    pending_action: null,
    assistant_message: `**Demo Mode Resolution:**\n\nIntent: ${resolvedIntent}\n\nSimulated response prepared using your active workspace context. Configure \`GEMINI_API_KEY\` in \`.env.local\` for live Gemini responses.`,
    analysis,
    clarification_question: null,
    suggested_options: [],
    resolved_intent: resolvedIntent,
    final_answer: `Demo Mode simulated resolution for: ${resolvedIntent}`,
    clarification_turns: record.clarification_turns,
    span_validation: stats,
    decision,
    resolution: {
      resolved_intent: resolvedIntent,
      final_answer: `Demo Mode simulated resolution for: ${resolvedIntent}`,
      remaining_uncertainties: [],
      clarification_impact:
        record.clarification_answers.length > 0
          ? "Clarification response narrowed the request before simulated resolution."
          : "No clarification was required.",
      is_fully_resolved: true,
      extracted_slots: [],
    },
    baseline,
    mode: "demo",
    error: null,
  };
}
