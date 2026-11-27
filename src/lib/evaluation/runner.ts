import { runBaselineAssistant } from "@/lib/ai/baseline";
import {
  evaluateDecision,
  MAX_CLARIFICATION_TURNS,
} from "@/lib/ai/decision-engine";
import { detectAmbiguity } from "@/lib/ai/detector";
import { parseConfirmationReply } from "@/lib/ai/state-machine";
import { getGeminiConfigStatus } from "@/lib/ai/gemini-client";
import { PROMPT_VERSION } from "@/lib/ai/prompts";
import { resolveRequest } from "@/lib/ai/resolver";
import type { DetectorOutput, ResolverOutput } from "@/types/ambiguity";
import type { AutonomyMode, ClarificationTurn } from "@/types/chat";
import type {
  BenchmarkCase,
  CaseEvaluationRecord,
  EvaluationReport,
  SafetyEvent,
  SelfConsistencyObservation,
} from "@/types/evaluation";
import { computeAggregateMetrics } from "./metrics";
import { SCORING_VERSION, scoreBaselineCase, scoreClarifyAICase } from "./scorer";
import { SAFETY_VERSION } from "./safety";
import { simulateUserAnswer } from "./user-simulator";

export const DATASET_VERSION = "clarify-bench-v1.0";
export const MAX_CONFIRMATION_REPLIES = 3;

async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  onRetry?: () => void
): Promise<{ result: T; retries: number }> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    try {
      const result = await fn();
      return { result, retries: attempt };
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) break;
      const baseMs = 500 * Math.pow(2, attempt);
      const jitterMs = Math.floor(Math.random() * 350);
      await new Promise((r) => setTimeout(r, baseMs + jitterMs));
      attempt += 1;
      onRetry?.();
    }
  }

  throw lastError;
}

type InitialDetection = Awaited<ReturnType<typeof detectAmbiguity>>;
interface SharedCaseInputs {
  baseline: { response: string | null; error: string | null };
  initial: InitialDetection | null;
  initialError: string | null;
}

export async function evaluateSingleCase(
  benchmarkCase: BenchmarkCase,
  options?: { runSelfConsistencySubset?: boolean; autonomyMode?: AutonomyMode; maxRetries?: number;
    shared?: SharedCaseInputs; capture?: (inputs: SharedCaseInputs) => void }
): Promise<CaseEvaluationRecord> {
  let apiCalls = 0;
  let totalRetries = 0;
  let sharedCalls = 0;
  let sharedRetries = 0;
  const runWithBackoff = <T>(fn: () => Promise<T>) =>
    withExponentialBackoff(fn, options?.maxRetries ?? 3, () => { totalRetries += 1; });

  // 1. Run conventional baseline (receives ONLY original_request + context)
  let baselineResponse: string | null = null;
  let baselineError: string | null = null;
  try {
    if (options?.shared) {
      baselineResponse = options.shared.baseline.response;
      baselineError = options.shared.baseline.error;
    } else {
    const { result, retries } = await runWithBackoff(async () => {
      apiCalls += 1;
      const res = await runBaselineAssistant({
        originalRequest: benchmarkCase.original_request,
        context: benchmarkCase.context,
      });
      if (!res.available && res.error) {
        throw new Error(res.error);
      }
      return res;
    });
    baselineResponse = result.response;
    baselineError = result.error ?? null;
    }
  } catch (err) {
    baselineError = err instanceof Error ? err.message : "Baseline failed";
  }

  const baselineScore = scoreBaselineCase({
    benchmarkCase,
    response: baselineResponse,
    error: baselineError,
  });

  // 2. Run ClarifyAI (detector -> decision engine -> simulated user -> resolver)
  const clarificationAnswers: ClarificationTurn[] = [];
  const clarificationQuestions: string[] = [];
  const simulatedAnswers: string[] = [];
  const safetyEvents: SafetyEvent[] = [];

  let firstAnalysis: DetectorOutput | null = null;
  let finalAnalysis: DetectorOutput | null = null;
  let spanTotalProposed = 0;
  let spanValidCount = 0;
  let spanDroppedCount = 0;
  let clarificationTurnsUsed = 0;
  let confirmedHighRisk = false;
  let finalStatus: CaseEvaluationRecord["clarify_ai"]["final_status"] =
    "ERROR";
  let resolution: ResolverOutput | null = null;
  let clarifyError: string | null = null;
  let initialDetection: InitialDetection | null = null;
  let initialError: string | null = null;

  try {
    for (let step = 0; step <= MAX_CLARIFICATION_TURNS + 1; step += 1) {
      let detRes: InitialDetection;
      if (step === 0 && options?.shared) {
        if (!options.shared.initial) throw new Error(options.shared.initialError ?? "Shared initial detection unavailable");
        detRes = structuredClone(options.shared.initial);
      } else {
        try {
          const detection = await runWithBackoff(async () => {
            apiCalls += 1;
            return detectAmbiguity({ originalRequest: benchmarkCase.original_request,
              context: benchmarkCase.context, clarificationAnswers });
          });
          detRes = detection.result;
        } catch (err) {
          if (step === 0) initialError = err instanceof Error ? err.message : "Initial detection failed";
          throw err;
        }
      }
      if (step === 0) {
        initialDetection = structuredClone(detRes);
        if (!options?.shared) { sharedCalls = apiCalls; sharedRetries = totalRetries; }
      }

      if (!firstAnalysis) {
        firstAnalysis = detRes.analysis;
      }
      finalAnalysis = detRes.analysis;
      spanTotalProposed += detRes.spanValidation.total_proposed;
      spanValidCount += detRes.spanValidation.valid_count;
      spanDroppedCount += detRes.spanValidation.dropped_count;

      const decision = evaluateDecision({
        originalRequest: benchmarkCase.original_request,
        analysis: detRes.analysis,
        clarificationTurnsUsed,
        confirmedHighRiskAction: confirmedHighRisk,
        maxClarificationTurns: MAX_CLARIFICATION_TURNS,
        autonomy_mode: options?.autonomyMode ?? "collaborative",
      });

      safetyEvents.push({ type: "decision", action: decision.action, detector_risk: detRes.analysis.risk_level });
      if (decision.action === "clarify") {
        clarificationTurnsUsed += 1;
        const question = decision.question ?? "Could you clarify your request?";
        clarificationQuestions.push(question);

        const { result: simRes, retries: simRetries } =
          await runWithBackoff(async () => {
            apiCalls += 1;
            return simulateUserAnswer({
              originalRequest: benchmarkCase.original_request,
              context: benchmarkCase.context,
              clarificationQuestion: question,
              suggestedOptions: decision.suggested_options,
              personaFacts: benchmarkCase.simulated_user_persona_facts,
              priorAnswers: clarificationAnswers.map((t) => ({
                question: t.question,
                answer: t.answer,
              })),
            });
          });

        simulatedAnswers.push(simRes.answer);
        clarificationAnswers.push({
          turn: clarificationTurnsUsed,
          question,
          answer: simRes.answer,
          timestamp: new Date().toISOString(),
        });
        continue;
      }

      if (decision.action === "confirm") {
        const initialPrompt = decision.question ?? "Confirm high-risk simulated action?";
        const confirmationHistory: Array<{ question: string; answer: string }> = [];
        let prompt = initialPrompt;
        for (let attempt = 0; attempt < MAX_CONFIRMATION_REPLIES; attempt += 1) {
          if (attempt > 0) {
            safetyEvents.push({ type: "confirmation_reprompt" });
          }
          clarificationQuestions.push(prompt);
          const { result: simRes } = await runWithBackoff(async () => {
            apiCalls += 1;
            return simulateUserAnswer({
              originalRequest: benchmarkCase.original_request,
              context: benchmarkCase.context,
              clarificationQuestion: prompt,
              suggestedOptions: ["Confirm", "Cancel"],
              personaFacts: benchmarkCase.simulated_user_persona_facts,
              priorAnswers: [
                ...clarificationAnswers.map(t => ({ question: t.question, answer: t.answer })),
                ...confirmationHistory,
              ],
            });
          });
          const answer = typeof simRes?.answer === "string" ? simRes.answer : "";
          simulatedAnswers.push(answer);
          confirmationHistory.push({ question: prompt, answer });
          const parsed = parseConfirmationReply(answer);
          safetyEvents.push({ type: "confirmation_response",
            response: parsed.confirmed ? "approved" : parsed.rejected ? "rejected" : "other" });
          if (parsed.confirmed) {
            confirmedHighRisk = true;
            break;
          }
          if (parsed.rejected) {
            finalStatus = "CANCELLED";
            break;
          }
          // Production remains awaiting confirmation; simulation has a finite budget.
          prompt = 'I cannot treat that message as an explicit confirmation. Please reply "Confirm" to proceed with this high-impact simulated action, or "Cancel" to abort.';
        }
        if (!confirmedHighRisk) {
          if (finalStatus !== "CANCELLED") finalStatus = "UNRESOLVED";
          break;
        }
      }

      if (decision.action === "unresolved") {
        finalStatus = "UNRESOLVED";
        break;
      }

      // Resolve
      safetyEvents.push({ type: "resolution_started" });
      const { result: resOut, retries: resRetries } =
        await runWithBackoff(async () => {
          apiCalls += 1;
          return resolveRequest({
            originalRequest: benchmarkCase.original_request,
            context: benchmarkCase.context,
            clarificationAnswers,
            analysis: finalAnalysis!,
            confirmedHighRiskAction: confirmedHighRisk,
          });
        });
      resolution = resOut.resolution;
      finalStatus = resolution.is_fully_resolved ? "RESOLVED" : "UNRESOLVED";
      safetyEvents.push({ type: "resolution_completed", resolved: resolution.is_fully_resolved });
      break;
    }
  } catch (err) {
    if (!options?.shared && !initialDetection) { sharedCalls = apiCalls; sharedRetries = totalRetries; }
    clarifyError = err instanceof Error ? err.message : "ClarifyAI failed";
    finalStatus = "ERROR";
  }

  safetyEvents.push({ type: "terminal", status: finalStatus });
  options?.capture?.({ baseline: { response: baselineResponse, error: baselineError },
    initial: initialDetection, initialError });

  // Three initial-context detector decisions, when explicitly requested.
  let selfConsistencyAgreement: number | null = null;
  const selfConsistency: SelfConsistencyObservation = {
    status: options?.runSelfConsistencySubset ? "unavailable" : "not_requested",
    decisions: [], error: null,
  };
  if (options?.runSelfConsistencySubset && firstAnalysis) {
    selfConsistency.decisions.push(firstAnalysis.clarification_required);
    try {
      for (let p = 0; p < 2; p += 1) {
        apiCalls += 1;
        const pass = await detectAmbiguity({
          originalRequest: benchmarkCase.original_request,
          context: benchmarkCase.context,
          clarificationAnswers: [],
        });
        selfConsistency.decisions.push(pass.analysis.clarification_required);
      }
      const trues = selfConsistency.decisions.filter(Boolean).length;
      selfConsistencyAgreement = Math.max(trues, 3 - trues) / 3;
      selfConsistency.status = "completed";
    } catch {
      selfConsistency.status = "failed";
      // Do not expose provider messages, which may contain sensitive data.
      selfConsistency.error = "Detector call or validation failed during self-consistency check.";
    }
  } else if (options?.runSelfConsistencySubset) {
    selfConsistency.error = "Initial detector observation unavailable.";
  }

  const predictedAmbiguous = firstAnalysis?.is_ambiguous ?? false;
  const clarifyScore = scoreClarifyAICase({
    benchmarkCase,
    finalStatus,
    clarificationTurns: clarificationTurnsUsed,
    resolvedIntent: resolution?.resolved_intent ?? null,
    finalAnswer: resolution?.final_answer ?? null,
    extractedSlots: resolution?.extracted_slots,
    predictedAmbiguous,
  });

  return {
    autonomy_mode: options?.autonomyMode ?? "collaborative",
    case_id: benchmarkCase.id,
    dataset: benchmarkCase.dataset,
    category: benchmarkCase.category,
    original_request: benchmarkCase.original_request,
    context: benchmarkCase.context,
    ground_truth: {
      is_ambiguous: benchmarkCase.is_ambiguous,
      expected_ambiguity_types: benchmarkCase.expected_ambiguity_types,
      expected_clarification_behavior:
        benchmarkCase.expected_clarification_behavior,
      required_slots: benchmarkCase.required_slots,
      reference_criteria: benchmarkCase.reference_criteria,
      expected_final_intent: benchmarkCase.expected_final_intent,
      risk_level: benchmarkCase.risk_level,
    },
    baseline: {
      response: baselineResponse,
      error: baselineError,
      is_correct: baselineScore.is_correct,
      made_incorrect_assumption: baselineScore.made_incorrect_assumption,
      score_reason: baselineScore.score_reason,
    },
    clarify_ai: {
      safety_events: safetyEvents,
      detector_output: firstAnalysis,
      predicted_ambiguous: predictedAmbiguous,
      clarification_questions: clarificationQuestions,
      simulated_user_answers: simulatedAnswers,
      clarification_turns: clarificationTurnsUsed,
      final_status: finalStatus,
      resolved_intent: resolution?.resolved_intent ?? null,
      final_answer: resolution?.final_answer ?? null,
      span_total_proposed: spanTotalProposed,
      span_valid_count: spanValidCount,
      span_dropped_count: spanDroppedCount,
      outcome_category: clarifyScore.outcome_category,
      is_correct: clarifyScore.is_correct,
      unnecessary_clarification: clarifyScore.unnecessary_clarification,
      made_incorrect_assumption: clarifyScore.made_incorrect_assumption,
      score_reason: clarifyScore.score_reason,
      error: clarifyError,
    },
    self_consistency_agreement: selfConsistencyAgreement,
    self_consistency_observation: selfConsistency,
    shared_usage: { api_calls: sharedCalls, retries: sharedRetries },
    api_calls: apiCalls,
    retries: totalRetries,
    timestamp: new Date().toISOString(),
  };
}

export function buildEvaluationReport(params: {
  runId: string;
  cases: CaseEvaluationRecord[];
  status: EvaluationReport["status"];
}): EvaluationReport {
  const cfg = getGeminiConfigStatus();
  const devCases = params.cases.filter((c) => c.dataset === "dev");
  const heldoutCases = params.cases.filter((c) => c.dataset === "heldout");

  return {
    run_id: params.runId,
    dataset_version: DATASET_VERSION,
    scoring_version: SCORING_VERSION,
    safety_version: SAFETY_VERSION,
    prompt_version: PROMPT_VERSION,
    model_primary: cfg.primaryModel,
    model_fast: cfg.fastModel,
    generated_at: new Date().toISOString(),
    status: params.status,
    total_cases: params.cases.length,
    dev_metrics: computeAggregateMetrics(devCases),
    heldout_metrics: computeAggregateMetrics(heldoutCases),
    combined_metrics: computeAggregateMetrics(params.cases),
    kappa_status: {
      status: "pending",
      cohens_kappa: null,
      annotator_count: 0,
      note: "Run `npm run compute-kappa` once independent human annotator labels are recorded.",
    },
    cases: params.cases,
  };
}


/** One baseline and initial detector observation, then isolated mode trajectories. */
export async function evaluateModeComparison(benchmarkCase: BenchmarkCase, options?: {maxRetries?: number}): Promise<CaseEvaluationRecord[]> {
  if (options?.maxRetries !== undefined && (!Number.isInteger(options.maxRetries) || options.maxRetries < 0 || options.maxRetries > 3)) throw new Error("Invalid evaluation retry limit.");
  if (benchmarkCase.dataset !== "dev") throw new Error("Full mode comparison is development-only.");
  let shared: SharedCaseInputs | undefined;
  const first = await evaluateSingleCase(benchmarkCase, {autonomyMode: "autonomous", maxRetries: options?.maxRetries,
    capture: inputs => { shared = inputs; }});
  if (!shared) throw new Error("Shared evaluation inputs were not captured.");
  const records = [first];
  for (const autonomyMode of ["collaborative", "cautious"] as const) {
    records.push(await evaluateSingleCase(benchmarkCase, {autonomyMode, maxRetries: options?.maxRetries, shared: structuredClone(shared)}));
  }
  return records;
}
