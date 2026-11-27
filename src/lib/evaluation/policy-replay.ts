import { DetectorOutputSchema } from "@/lib/ai/schemas";
import { evaluateDecision, inferHighRiskAction } from "@/lib/ai/decision-engine";
import type { AutonomyMode } from "@/types/chat";
import type { BenchmarkCase, CaseEvaluationRecord } from "@/types/evaluation";
import type { DetectorOutput } from "@/types/ambiguity";

export const REPLAY_MODES: AutonomyMode[] = ["autonomous", "collaborative", "cautious"];
const ratio = (a: number, b: number): number | null => b ? a / b : null;
export interface ReplayInput { benchmark: BenchmarkCase; detector: DetectorOutput }

export function selectReplayInputs(cases: BenchmarkCase[], saved: CaseEvaluationRecord[]) {
  if (cases.some(c => c.dataset !== "dev")) throw new Error("Replay only accepts development cases.");
  const byId = new Map(cases.map(c => [c.id, c]));
  if (byId.size !== cases.length) throw new Error("Duplicate development case ID.");
  const counts = new Map<string, number>();
  for (const r of saved) if (typeof r?.case_id === "string") counts.set(r.case_id, (counts.get(r.case_id) ?? 0) + 1);
  const inputs: ReplayInput[] = [];
  const excluded: Record<string, number> = {};
  const skip = (reason: string) => { excluded[reason] = (excluded[reason] ?? 0) + 1; };
  for (const r of saved) {
    if (!r || r.dataset !== "dev") { skip("non_dev_or_invalid_record"); continue; }
    const c = byId.get(r.case_id);
    if (!c) { skip("unknown_case"); continue; }
    if (counts.get(r.case_id) !== 1) { skip("duplicate_case"); continue; }
    if (r.original_request !== c.original_request || JSON.stringify(r.context) !== JSON.stringify(c.context)) { skip("input_mismatch"); continue; }
    const parsed = DetectorOutputSchema.safeParse(r.clarify_ai?.detector_output);
    if (!parsed.success) { skip("missing_or_invalid_detector_output"); continue; }
    inputs.push({ benchmark: c, detector: parsed.data });
  }
  return { inputs, excluded };
}

export function replayPolicies(inputs: ReplayInput[]) {
  if (inputs.some(({ benchmark }) => benchmark.dataset !== "dev")) throw new Error("Replay only accepts development cases.");
  const modes = REPLAY_MODES.map(mode => {
    const decisions = inputs.map(({ benchmark: b, detector: d }) => ({
      case_id: b.id, detector_ambiguous: d.is_ambiguous, actual_ambiguous: b.is_ambiguous,
      expected: b.expected_clarification_behavior, high_risk: inferHighRiskAction(b.original_request, d),
      action: evaluateDecision({ originalRequest: b.original_request, analysis: d,
        clarificationTurnsUsed: 0, confirmedHighRiskAction: false, autonomy_mode: mode }).action,
    }));
    const ambiguous = decisions.filter(d => d.actual_ambiguous);
    const direct = decisions.filter(d => d.expected === "direct_answer");
    const high = decisions.filter(d => d.high_risk);
    const clarifications = decisions.filter(d => d.action === "clarify").length;
    const confirmations = decisions.filter(d => d.action === "confirm").length;
    return { mode, sample_size: decisions.length,
      detector_ambiguity_recall_numerator: ambiguous.filter(d => d.detector_ambiguous).length,
      detector_ambiguity_recall_denominator: ambiguous.length,
      detector_ambiguity_recall: ratio(ambiguous.filter(d => d.detector_ambiguous).length, ambiguous.length),
      ambiguity_catch_rate_numerator: ambiguous.filter(d => d.action === "clarify").length,
      ambiguity_catch_rate_denominator: ambiguous.length,
      ambiguity_catch_rate: ratio(ambiguous.filter(d => d.action === "clarify").length, ambiguous.length),
      unnecessary_clarification_rate_numerator: direct.filter(d => d.action === "clarify").length,
      unnecessary_clarification_rate_denominator: direct.length,
      unnecessary_clarification_rate: ratio(direct.filter(d => d.action === "clarify").length, direct.length),
      interruption_cost_numerator: clarifications + confirmations,
      interruption_cost_denominator: decisions.length,
      interruption_cost: ratio(clarifications + confirmations, decisions.length),
      clarification_decisions: decisions.length ? clarifications : null, confirmation_decisions: decisions.length ? confirmations : null,
      direct_answer_cases: decisions.length ? direct.length : null, ambiguous_cases: decisions.length ? ambiguous.length : null, high_risk_cases: decisions.length ? high.length : null,
      high_risk_direct_resolutions: decisions.length ? high.filter(d => d.action === "resolve").length : null,
      mean_clarification_turns: null, over_reliance_prevention_rate: null, decisions };
  });
  return { methodology: "offline_first_decision_replay" as const, modes };
}

/** Observational paired proxy, not a randomized causal effect. */
export function pairedOverReliancePrevention(records: CaseEvaluationRecord[]) {
  const eligible = records.filter(r => r.baseline?.error === null && r.clarify_ai?.error === null &&
    r.clarify_ai.final_status === "RESOLVED" && r.baseline.made_incorrect_assumption);
  const prevented = eligible.filter(r => r.clarify_ai.is_correct && !r.clarify_ai.made_incorrect_assumption).length;
  return { eligible: eligible.length, prevented, rate: ratio(prevented, eligible.length) };
}
export function liveMeanClarificationTurns(records: CaseEvaluationRecord[]) {
  const valid = records.filter(r => r.clarify_ai?.error === null && r.clarify_ai.final_status !== "ERROR" && Number.isFinite(r.clarify_ai.clarification_turns) && r.clarify_ai.clarification_turns >= 0);
  const turns = valid.reduce((sum, r) => sum + r.clarify_ai.clarification_turns, 0);
  return { eligible: valid.length, turns, mean: ratio(turns, valid.length) };
}
