import type {
  BaselineComparisonResult,
  ChatApiRequest,
  ChatApiResponse,
  ConversationContext,
  ConversationRecord,
} from "@/types/chat";
import { createStableId } from "@/lib/utils/ids";
import { runBaselineAssistant } from "./baseline";
import { evaluateDecision, inferHighRiskAction, MAX_CLARIFICATION_TURNS } from "./decision-engine";
import { buildDemoResponseForRecord, findPresetByPrompt } from "./demo-engine";
import { detectAmbiguity } from "./detector";
import { getAIConfigStatus } from "./ai-client";
import { resolveRequest } from "./resolver";

// Authoritative server-side conversation store.
// Preserves original requests, context, clarification turns, and pending actions.
const conversationStore = new Map<string, ConversationRecord>();

// Deduplicate accidental rapid double-submissions per conversation.
const recentSubmissions = new Map<
  string,
  { fingerprint: string; timestamp: number; response: ChatApiResponse }
>();

const CONFIRM_POSITIVE_RE =
  /^(confirm|confirm action|yes|yes,?\s*proceed|proceed|approve|approved|go ahead|do it|execute)$/i;
const CONFIRM_NEGATIVE_RE =
  /^(cancel|no|abort|stop|decline|don't|do not|nevermind|never mind)$/i;

export function parseConfirmationReply(input: string): {
  confirmed: boolean;
  rejected: boolean;
  unrelated: boolean;
} {
  const trimmed = input.trim();
  if (CONFIRM_POSITIVE_RE.test(trimmed)) {
    return { confirmed: true, rejected: false, unrelated: false };
  }
  if (CONFIRM_NEGATIVE_RE.test(trimmed)) {
    return { confirmed: false, rejected: true, unrelated: false };
  }
  return { confirmed: false, rejected: false, unrelated: true };
}

export function getStoredConversation(
  conversationId: string
): ConversationRecord | undefined {
  return conversationStore.get(conversationId);
}

export function clearConversationStore(): void {
  conversationStore.clear();
  recentSubmissions.clear();
}

function sanitizeContext(ctx?: ConversationContext): ConversationContext {
  const safe = { ...(ctx ?? {}) };
  delete safe.hai_user_corrections;
  return safe;
}

function contextForInference(
  record: ConversationRecord
): ConversationContext {
  return {
    ...sanitizeContext(record.context),
    hai_user_corrections:
      record.assumption_overrides ?? [],
  };
}

function buildErrorOrUnresolved(params: {
  record: ConversationRecord;
  mode: "live" | "demo";
  status: ConversationRecord["status"];
  message: string;
  baseline: BaselineComparisonResult | null;
}): ChatApiResponse {
  const { record } = params;
  record.status = params.status;
  record.pending_action = null;
  record.updated_at = new Date().toISOString();
  conversationStore.set(record.conversation_id, record);

  return {
    conversation_id: record.conversation_id,
    status: record.status,
    pending_action: null,
    assistant_message: params.message,
    analysis: record.last_analysis,
    clarification_question: null,
    suggested_options: [],
    resolved_intent: null,
    final_answer: null,
    clarification_turns: record.clarification_turns,
    span_validation: record.last_span_validation,
    decision: record.last_decision,
    resolution: null,
    baseline: params.baseline,
    conversation: record,
    mode: params.mode,
    error: null,
  };
}

async function processChatTurnInternal(
  req: ChatApiRequest,
  workingRecord?: ConversationRecord
): Promise<ChatApiResponse> {
  const cfg = getAIConfigStatus();
  const requestedDemo =
    req.demo_mode ??
    (workingRecord?.inference_mode === "demo");
  const useDemoMode =
    requestedDemo || (!cfg.hasApiKey && cfg.demoModeEnabled);
  const mode: "live" | "demo" = useDemoMode ? "demo" : "live";

  const conversationId = req.conversation_id || createStableId("conv");

  // Handle explicit reset
  if (req.action === "reset") {
    conversationStore.delete(conversationId);
    recentSubmissions.delete(conversationId);
    const freshId = createStableId("conv");
    return {
      conversation_id: freshId,
      status: "ANALYZING",
      pending_action: null,
      assistant_message: "Conversation reset. Enter a new request to begin.",
      analysis: null,
      clarification_question: null,
      suggested_options: [],
      resolved_intent: null,
      final_answer: null,
      clarification_turns: 0,
      mode,
      error: null,
    };
  }

  let record = workingRecord ?? conversationStore.get(conversationId);

  // Safeguard: never let the client force a brand new conversation into RESOLVED state
  if (
    !record &&
    req.client_status &&
    (req.client_status === "RESOLVED" || req.client_status === "AWAITING_USER")
  ) {
    // Stale client state after server restart or invalid state injection:
    // Re-initialize only if a valid non-terminal snapshot was not present on server.
    // We reject forged RESOLVED states outright.
    if (req.client_status === "RESOLVED") {
      throw new StateConflictError(
        "Stale or invalid conversation state: cannot transition a resolved conversation without starting a new request."
      );
    }
  }

  // Handle explicit cancellation
  if (
    req.action === "cancel" ||
    (record?.pending_action === "clarify" &&
      /^cancel$/i.test(req.message.trim()))
  ) {
    if (!record) {
      record = {
        conversation_id: conversationId,
        original_request: req.message,
        context: sanitizeContext(req.context),
        clarification_answers: [],
        status: "CANCELLED",
        pending_action: null,
        clarification_turns: 0,
        last_analysis: null,
        last_span_validation: null,
        last_decision: null,
        last_resolution: null,
        last_clarification_question: null,
        last_suggested_options: [],
        confirmed_action: false,
        autonomy_mode: req.autonomy_mode ?? "collaborative",
        working_assumptions: [],
        overrideCount: 0,
        preset_id: req.preset_id ?? null,
        updated_at: new Date().toISOString(),
      };
    }
    return buildErrorOrUnresolved({
      record,
      mode,
      status: "CANCELLED",
      message:
        "Request cancelled. No simulated action was executed. Feel free to start a new request.",
      baseline: null,
    });
  }

  // Duplicate submission guard (within 3 seconds for identical message & status)
  const fingerprint = JSON.stringify({
    message: req.message.trim(),
    status: record?.status ?? "NEW",
    clarificationTurns: record?.clarification_turns ?? 0,
    mode,
    autonomyMode:
      record?.autonomy_mode ??
      req.autonomy_mode ??
      "collaborative",
    overrideCount: record?.overrideCount ?? 0,
    corrections: record?.assumption_overrides ?? [],
  });
  const prevSub = recentSubmissions.get(conversationId);
  if (
    prevSub &&
    prevSub.fingerprint === fingerprint &&
    Date.now() - prevSub.timestamp < 3000
  ) {
    return prevSub.response;
  }

  // If existing conversation is already terminal, reject stale follow-up on same ID
  if (
    record &&
    (record.status === "RESOLVED" ||
      record.status === "UNRESOLVED" ||
      record.status === "CANCELLED")
  ) {
    // Treat as a brand new request only if caller started fresh, otherwise reject stale mutation
    throw new StateConflictError(
      `Conversation ${conversationId} is already ${record.status}. Reset or start a new conversation.`
    );
  }

  const includeBaseline = req.include_baseline !== false;
  let baselineResult: BaselineComparisonResult | null = null;

  // Initialize new conversation record
  const isNewConversation = !record;
  if (!record) {
    const matchedPreset = findPresetByPrompt(req.message);
    record = {
      conversation_id: conversationId,
      original_request: req.message.trim(),
      context: sanitizeContext(req.context),
      clarification_answers: [],
      status: "ANALYZING",
      pending_action: null,
      clarification_turns: 0,
      last_analysis: null,
      last_span_validation: null,
      last_decision: null,
      last_resolution: null,
      last_clarification_question: null,
      last_suggested_options: [],
      confirmed_action: false,
      autonomy_mode: req.autonomy_mode ?? "collaborative",
      working_assumptions: [],
      overrideCount: 0,
      preset_id: req.preset_id ?? matchedPreset?.id ?? null,
      updated_at: new Date().toISOString(),
    };
  } else {
    // Merge any updated context on follow-up
    if (req.context) {
      const updatedContext = {
        ...record.context,
        ...sanitizeContext(req.context),
      };

      if (
        record.pending_action === "confirm" &&
        JSON.stringify(updatedContext) !==
          JSON.stringify(record.context)
      ) {
        throw new StateConflictError(
          "Context changed after confirmation was requested. Start a new request."
        );
      }

      record.context = updatedContext;
    }
  }

  // Handle pending confirmation response
  let confirmationParsed:
    | { confirmed: boolean; rejected: boolean; unrelated: boolean }
    | undefined;

  if (!isNewConversation && record.pending_action === "confirm") {
    confirmationParsed = parseConfirmationReply(req.message);
    if (confirmationParsed.rejected) {
      return buildErrorOrUnresolved({
        record,
        mode,
        status: "CANCELLED",
        message:
          "Confirmation declined. The simulated high-impact action was cancelled. Let me know how you'd like to adjust the request.",
        baseline: null,
      });
    }
    if (confirmationParsed.unrelated) {
      const response: ChatApiResponse = {
        conversation_id: record.conversation_id,
        status: "AWAITING_USER",
        pending_action: "confirm",
        assistant_message:
          'I cannot treat that message as an explicit confirmation. Please reply "Confirm" to proceed with this high-impact simulated action, or "Cancel" to abort.',
        analysis: record.last_analysis,
        clarification_question: record.last_clarification_question,
        suggested_options: ["Confirm action", "Cancel"],
        resolved_intent: record.last_analysis?.resolved_intent ?? null,
        final_answer: null,
        clarification_turns: record.clarification_turns,
        span_validation: record.last_span_validation,
        decision: record.last_decision,
        resolution: null,
        baseline: null,
        conversation: record,
        mode,
        error: null,
      };
      conversationStore.set(record.conversation_id, record);
      return response;
    }
    // Confirmed!
    record.confirmed_action = true;
    record.pending_action = null;
  } else if (!isNewConversation && record.pending_action === "clarify") {
    // Record clarification answer while preserving original_request separately
    record.clarification_answers.push({
      turn: record.clarification_turns,
      question:
        record.last_clarification_question ?? "Clarification requested",
      answer: req.message.trim(),
      timestamp: new Date().toISOString(),
    });
  }

  // DEMO MODE PATH
  if (useDemoMode) {
    const demoReply = buildDemoResponseForRecord({
      record,
      latestInput: req.message.trim(),
      includeBaseline,
      isConfirmationReply: confirmationParsed,
    });

    record.status = demoReply.status;
    record.pending_action = demoReply.pending_action;
    record.clarification_turns = demoReply.clarification_turns;
    record.last_analysis = demoReply.analysis;
    record.last_span_validation = demoReply.span_validation ?? null;
    record.last_decision = demoReply.decision ?? null;
    record.last_resolution = demoReply.resolution ?? null;
    record.last_clarification_question = demoReply.clarification_question;
    record.last_suggested_options = demoReply.suggested_options;
    record.updated_at = new Date().toISOString();
    conversationStore.set(record.conversation_id, record);

    const fullResponse: ChatApiResponse = {
      ...demoReply,
      conversation: record,
    };
    recentSubmissions.set(record.conversation_id, {
      fingerprint,
      timestamp: Date.now(),
      response: fullResponse,
    });
    return fullResponse;
  }

  // LIVE GEMINI ENGINE PATH
  if (isNewConversation && includeBaseline) {
    baselineResult = await runBaselineAssistant({
      originalRequest: record.original_request,
      context: contextForInference(record),
    });
  }

  // If confirmation was just granted on an already-clear high-risk request, resolve directly
  if (record.confirmed_action && record.last_analysis) {
    const { resolution } = await resolveRequest({
      originalRequest: record.original_request,
      context: contextForInference(record),
      clarificationAnswers: record.clarification_answers,
      analysis: record.last_analysis,
      confirmedHighRiskAction: true,
    });

    record.status = resolution.is_fully_resolved ? "RESOLVED" : "UNRESOLVED";
    record.pending_action = null;
    record.last_resolution = resolution;
    record.updated_at = new Date().toISOString();
    conversationStore.set(record.conversation_id, record);

    const response: ChatApiResponse = {
      conversation_id: record.conversation_id,
      status: record.status,
      pending_action: null,
      assistant_message: resolution.final_answer,
      analysis: record.last_analysis,
      clarification_question: null,
      suggested_options: [],
      resolved_intent: resolution.resolved_intent,
      final_answer: resolution.final_answer,
      clarification_turns: record.clarification_turns,
      span_validation: record.last_span_validation,
      decision: record.last_decision,
      resolution,
      baseline: baselineResult,
      conversation: record,
      mode: "live",
      error: null,
    };
    recentSubmissions.set(record.conversation_id, {
      fingerprint,
      timestamp: Date.now(),
      response,
    });
    return response;
  }

  const { analysis, spanValidation } = await detectAmbiguity({
    originalRequest: record.original_request,
    context: contextForInference(record),
    clarificationAnswers: record.clarification_answers,
  });

  if (record.assumption_overrides?.length) {
    const correctedText = [
      record.original_request,
      ...record.assumption_overrides.map(
        (item) => item.value
      ),
    ].join(" ");

    if (
      record.last_analysis?.risk_level === "high" ||
      inferHighRiskAction(correctedText, analysis)
    ) {
      analysis.risk_level = "high";
    } else if (
      record.last_analysis?.risk_level === "medium" &&
      analysis.risk_level === "low"
    ) {
      analysis.risk_level = "medium";
    }
  }

  const decision = evaluateDecision({
    originalRequest: record.original_request,
    analysis,
    clarificationTurnsUsed: record.clarification_turns,
    confirmedHighRiskAction: record.confirmed_action,
    autonomy_mode: record.autonomy_mode ?? "collaborative",
    maxClarificationTurns: MAX_CLARIFICATION_TURNS,
  });

  record.last_analysis = analysis;
  record.last_span_validation = spanValidation;
  record.last_decision = decision;

  if (decision.action === "clarify") {
    record.clarification_turns += 1;
    record.status = "AWAITING_USER";
    record.pending_action = "clarify";
    record.last_clarification_question = decision.question;
    record.last_suggested_options = decision.suggested_options;
    record.updated_at = new Date().toISOString();
    conversationStore.set(record.conversation_id, record);

    const response: ChatApiResponse = {
      conversation_id: record.conversation_id,
      status: "AWAITING_USER",
      pending_action: "clarify",
      assistant_message:
        decision.question ?? "Could you clarify what you meant?",
      analysis,
      clarification_question: decision.question,
      suggested_options: decision.suggested_options,
      resolved_intent: null,
      final_answer: null,
      clarification_turns: record.clarification_turns,
      span_validation: spanValidation,
      decision,
      resolution: null,
      baseline: baselineResult,
      conversation: record,
      mode: "live",
      error: null,
    };
    recentSubmissions.set(record.conversation_id, {
      fingerprint,
      timestamp: Date.now(),
      response,
    });
    return response;
  }

  if (decision.action === "confirm") {
    record.status = "AWAITING_USER";
    record.pending_action = "confirm";
    record.last_clarification_question = decision.question;
    record.last_suggested_options = decision.suggested_options;
    record.updated_at = new Date().toISOString();
    conversationStore.set(record.conversation_id, record);

    const response: ChatApiResponse = {
      conversation_id: record.conversation_id,
      status: "AWAITING_USER",
      pending_action: "confirm",
      assistant_message:
        decision.question ??
        "Please confirm if you want to proceed with this high-impact simulated action.",
      analysis,
      clarification_question: decision.question,
      suggested_options: decision.suggested_options,
      resolved_intent: analysis.resolved_intent ?? record.original_request,
      final_answer: null,
      clarification_turns: record.clarification_turns,
      span_validation: spanValidation,
      decision,
      resolution: null,
      baseline: baselineResult,
      conversation: record,
      mode: "live",
      error: null,
    };
    recentSubmissions.set(record.conversation_id, {
      fingerprint,
      timestamp: Date.now(),
      response,
    });
    return response;
  }

  if (decision.action === "unresolved") {
    const missingList =
      analysis.missing_information.length > 0
        ? ` Remaining gaps: ${analysis.missing_information.join("; ")}.`
        : "";
    return buildErrorOrUnresolved({
      record,
      mode: "live",
      status: "UNRESOLVED",
      message: `Unable to resolve safely after ${MAX_CLARIFICATION_TURNS} clarification turns.${missingList} Please provide additional details in a new request or reset.`,
      baseline: baselineResult,
    });
  }

  // RESOLVE
  const { resolution } = await resolveRequest({
    originalRequest: record.original_request,
    context: contextForInference(record),
    clarificationAnswers: record.clarification_answers,
    analysis,
    confirmedHighRiskAction: record.confirmed_action,
  });

  if (!resolution.is_fully_resolved) {
    const gaps =
      resolution.remaining_uncertainties.length > 0
        ? ` Unresolved items: ${resolution.remaining_uncertainties.join("; ")}.`
        : "";
    return buildErrorOrUnresolved({
      record,
      mode: "live",
      status: "UNRESOLVED",
      message: `The request remains unresolved because required information is unavailable.${gaps}`,
      baseline: baselineResult,
    });
  }

  record.status = "RESOLVED";
  record.pending_action = null;
  record.last_resolution = resolution;
  record.updated_at = new Date().toISOString();
  conversationStore.set(record.conversation_id, record);

  const response: ChatApiResponse = {
    conversation_id: record.conversation_id,
    status: "RESOLVED",
    pending_action: null,
    assistant_message: resolution.final_answer,
    analysis,
    clarification_question: null,
    suggested_options: [],
    resolved_intent: resolution.resolved_intent,
    final_answer: resolution.final_answer,
    clarification_turns: record.clarification_turns,
    span_validation: spanValidation,
    decision,
    resolution,
    baseline: baselineResult,
    conversation: record,
    mode: "live",
    error: null,
  };
  recentSubmissions.set(record.conversation_id, {
    fingerprint,
    timestamp: Date.now(),
    response,
  });
  return response;
}

export class StateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateConflictError";
  }
}



const activeTurns = new Set<string>();

export async function processChatTurn(
  req: ChatApiRequest
): Promise<ChatApiResponse> {
  const id = req.conversation_id;

  if (id && activeTurns.has(id)) {
    throw new StateConflictError(
      "Another request is already being processed."
    );
  }

  if (id) activeTurns.add(id);

  const previous = id
    ? conversationStore.get(id)
    : undefined;

  const previousSubmission = id
    ? recentSubmissions.get(id)
    : undefined;

  let record = previous
    ? structuredClone(previous)
    : undefined;

  let effectiveReq = req;

  try {
    if (req.action === "override") {
      if (!record || !req.assumption_override) {
        throw new StateConflictError(
          "An existing conversation and assumption are required."
        );
      }

      if (
        record.status !== "RESOLVED" &&
        record.status !== "UNRESOLVED"
      ) {
        throw new StateConflictError(
          "Finish the pending conversation before editing assumptions."
        );
      }

      const count = record.overrideCount ?? 0;

      if (
        req.expected_override_count !== undefined &&
        req.expected_override_count !== count
      ) {
        throw new StateConflictError(
          "Stale assumption edit. Refresh the conversation."
        );
      }

      const key = req.assumption_override.key.trim();
      const newValue =
        req.assumption_override.newValue.trim();

      if (
        !key ||
        key.length > 80 ||
        !newValue ||
        newValue.length > 240
      ) {
        throw new StateConflictError(
          "Invalid assumption correction."
        );
      }

      const assumptions =
        record.working_assumptions ?? [];

      const existing = assumptions.find(
        (item) => item.key === key
      );

      if (!existing) {
        throw new StateConflictError(
          "Unknown working assumption."
        );
      }

      if (existing.value === newValue) {
        throw new StateConflictError(
          "This assumption already has that value."
        );
      }

      record.working_assumptions =
        assumptions.map((item) =>
          item.key === key
            ? { key, value: newValue }
            : item
        );

      record.assumption_overrides = [
        ...(record.assumption_overrides ?? [])
          .filter((item) => item.key !== key),
        { key, value: newValue },
      ];

      record.overrideCount = count + 1;

      record.autonomy_mode =
        req.autonomy_mode ??
        record.autonomy_mode ??
        "collaborative";

      // Any previous confirmation is invalidated.
      record.confirmed_action = false;
      record.status = "ANALYZING";
      record.pending_action = null;
      record.last_resolution = null;
      record.last_decision = null;
      record.last_clarification_question = null;
      record.last_suggested_options = [];

      effectiveReq = {
        ...req,
        action: "submit",
        message: record.original_request,
        context: undefined,
        include_baseline: false,
        demo_mode: record.inference_mode
          ? record.inference_mode === "demo"
          : req.demo_mode,
      };
    } else if (record) {
      // Retain the established inference mode.
      if (
        req.action !== "reset" &&
        record.inference_mode &&
        req.demo_mode !== undefined &&
        req.demo_mode !==
          (record.inference_mode === "demo")
      ) {
        throw new StateConflictError(
          "Reset the conversation before changing inference mode."
        );
      }

      record.autonomy_mode =
        req.autonomy_mode ??
        record.autonomy_mode ??
        "collaborative";
    }

    // Reuse the existing conversation engine.
    const response = await processChatTurnInternal(
      effectiveReq,
      record
    );

    const updated = response.conversation;

    const slots =
      response.resolution?.extracted_slots ??
      updated?.last_resolution?.extracted_slots ??
      [];

    // Do not report a successful corrected resolution
    // if the resolver ignored an explicit correction.
    if (
      response.status === "RESOLVED" &&
      updated?.assumption_overrides?.length &&
      !updated.assumption_overrides.every(
        (correction) =>
          slots.some(
            (slot) =>
              slot.key === correction.key &&
              slot.value === correction.value
          )
      )
    ) {
      throw new StateConflictError(
        "Resolution did not preserve the corrected values."
      );
    }

    const uniqueSlots = new Map<string, string>();

    for (const slot of slots) {
      if (slot.key.trim() && slot.value.trim()) {
        uniqueSlots.set(slot.key, slot.value);
      }
    }

    const workingAssumptions =
      slots.length > 0
        ? Array.from(
            uniqueSlots,
            ([key, value]) => ({ key, value })
          )
        : updated?.working_assumptions ?? [];

    const autonomyMode =
      updated?.autonomy_mode ??
      req.autonomy_mode ??
      "collaborative";

    const overrideCount =
      updated?.overrideCount ?? 0;

    if (updated) {
      updated.autonomy_mode = autonomyMode;
      updated.working_assumptions =
        workingAssumptions;
      updated.overrideCount = overrideCount;
      updated.inference_mode = response.mode;

      conversationStore.set(
        updated.conversation_id,
        updated
      );
    }

    return {
      ...response,
      autonomy_mode: autonomyMode,
      working_assumptions: workingAssumptions,
      overrideCount,
      autonomy_suggestion:
        overrideCount >= 2 &&
        autonomyMode !== "cautious"
          ? "cautious"
          : null,
    };
  } catch (error) {
    // Restore server state if re-resolution fails.
    if (id) {
      if (previous) {
        conversationStore.set(id, previous);
      } else {
        conversationStore.delete(id);
      }

      if (previousSubmission) {
        recentSubmissions.set(
          id,
          previousSubmission
        );
      } else {
        recentSubmissions.delete(id);
      }
    }

    throw error;
  } finally {
    if (id) activeTurns.delete(id);
  }
}