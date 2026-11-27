import { runBaselineAssistant } from "@/lib/ai/baseline";
import {
  evaluateDecision,
  MAX_CLARIFICATION_TURNS,
} from "@/lib/ai/decision-engine";
import { detectAmbiguity } from "@/lib/ai/detector";
import { getGeminiConfigStatus } from "@/lib/ai/gemini-client";
import { PROMPT_VERSION } from "@/lib/ai/prompts";
import { resolveRequest } from "@/lib/ai/resolver";
import type { DetectorOutput, ResolverOutput } from "@/types/ambiguity";
import type { ClarificationTurn } from "@/types/chat";
import type {
  BenchmarkCase,
  CaseEvaluationRecord,
  EvaluationReport,
} from "@/types/evaluation";
import { computeAggregateMetrics } from "./metrics";
import { scoreBaselineCase, scoreClarifyAICase } from "./scorer";
import { simulateUserAnswer } from "./user-simulator";

export const DATASET_VERSION = "clarify-bench-v1.0";

async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3
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
    }
  }

  throw lastError;
}

export async function evaluateSingleCase(
  benchmarkCase: BenchmarkCase,
  options?: { runSelfConsistencySubset?: boolean }
): Promise<CaseEvaluationRecord> {
  let apiCalls = 0;
  let totalRetries = 0;

  // 1. Run conventional baseline (receives ONLY original_request + context)
  let baselineResponse: string | null = null;
  let baselineError: string | null = null;
  try {
    const { result, retries } = await withExponentialBackoff(async () => {
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
    totalRetries += retries;
    baselineResponse = result.response;
    baselineError = result.error ?? null;
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

  try {
    for (let step = 0; step <= MAX_CLARIFICATION_TURNS + 1; step += 1) {
      const { result: detRes, retries: detRetries } =
        await withExponentialBackoff(async () => {
          apiCalls += 1;
          return detectAmbiguity({
            originalRequest: benchmarkCase.original_request,
            context: benchmarkCase.context,
            clarificationAnswers,
          });
        });
      totalRetries += detRetries;

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
      });

      if (decision.action === "clarify") {
        clarificationTurnsUsed += 1;
        const question = decision.question ?? "Could you clarify your request?";
        clarificationQuestions.push(question);

        const { result: simRes, retries: simRetries } =
          await withExponentialBackoff(async () => {
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
        totalRetries += simRetries;

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
        const confirmPrompt =
          decision.question ?? "Confirm high-risk simulated action?";
        clarificationQuestions.push(confirmPrompt);

        const { result: simRes, retries: simRetries } =
          await withExponentialBackoff(async () => {
            apiCalls += 1;
            return simulateUserAnswer({
              originalRequest: benchmarkCase.original_request,
              context: benchmarkCase.context,
              clarificationQuestion: confirmPrompt,
              suggestedOptions: ["Confirm", "Cancel"],
              personaFacts: benchmarkCase.simulated_user_persona_facts,
              priorAnswers: clarificationAnswers.map((t) => ({
                question: t.question,
                answer: t.answer,
              })),
            });
          });
        totalRetries += simRetries;

        simulatedAnswers.push(simRes.answer);
        if (/^(confirm|yes|proceed|approve)/i.test(simRes.answer.trim())) {
          confirmedHighRisk = true;
        } else {
          finalStatus = "CANCELLED";
          break;
        }
      }

      if (decision.action === "unresolved") {
        finalStatus = "UNRESOLVED";
        break;
      }

      // Resolve
      const { result: resOut, retries: resRetries } =
        await withExponentialBackoff(async () => {
          apiCalls += 1;
          return resolveRequest({
            originalRequest: benchmarkCase.original_request,
            context: benchmarkCase.context,
            clarificationAnswers,
            analysis: finalAnalysis!,
            confirmedHighRiskAction: confirmedHighRisk,
          });
        });
      totalRetries += resRetries;
      resolution = resOut.resolution;
      finalStatus = resolution.is_fully_resolved ? "RESOLVED" : "UNRESOLVED";
      break;
    }
  } catch (err) {
    clarifyError = err instanceof Error ? err.message : "ClarifyAI failed";
    finalStatus = "ERROR";
  }

  // Optional 3-pass self-consistency check on fixed subset
  let selfConsistencyAgreement: number | null = null;
  if (options?.runSelfConsistencySubset && firstAnalysis) {
    try {
      const decisions: boolean[] = [firstAnalysis.clarification_required];
      for (let p = 0; p < 2; p += 1) {
        apiCalls += 1;
        const pass = await detectAmbiguity({
          originalRequest: benchmarkCase.original_request,
          context: benchmarkCase.context,
          clarificationAnswers: [],
        });
        decisions.push(pass.analysis.clarification_required);
      }
      const trues = decisions.filter(Boolean).length;
      selfConsistencyAgreement = Math.max(trues, decisions.length - trues) / decisions.length;
    } catch {
      selfConsistencyAgreement = null;
    }
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
