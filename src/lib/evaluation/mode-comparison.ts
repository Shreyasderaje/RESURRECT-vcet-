import { SavedEvaluationRecordSchema } from "./checkpoint-schema";
import { makeProvenance, type Provenance, type RunConfig } from "./checkpoints";
import { computeAggregateMetrics } from "./metrics";
import type { BenchmarkCase, CaseEvaluationRecord } from "@/types/evaluation";
import type { AutonomyMode } from "@/types/chat";

export const COMPARISON_VERSION = "trajectory-comparison-v3";
export const COMPARISON_MODES: AutonomyMode[] = ["autonomous", "collaborative", "cautious"];
export const COMPARISON_PATHS = { checkpoint: "data/eval-mode-comparison-dev.jsonl", report: "data/eval-mode-comparison-dev-latest.json" };
export type ComparisonEntry = { mode: AutonomyMode; provenance: Provenance & { autonomy_mode: AutonomyMode; comparison_version: string }; record: CaseEvaluationRecord };
export type ComparisonGroup = { version: string; case_id: string; entries: ComparisonEntry[] };
const schema = SavedEvaluationRecordSchema.extend({ clarify_ai: SavedEvaluationRecordSchema.shape.clarify_ai.extend({
  detector_output: SavedEvaluationRecordSchema.shape.clarify_ai.shape.detector_output.nullable(),
}) });

export function validateComparisonGroup(group: ComparisonGroup, benchmark: BenchmarkCase, config: RunConfig): boolean {
  if (!group || group.version !== COMPARISON_VERSION || benchmark.dataset !== "dev" ||
      group.case_id !== benchmark.id || !Array.isArray(group.entries) || group.entries.length !== 3) return false;
  for (const mode of COMPARISON_MODES) {
    const found = group.entries.filter(e => e?.mode === mode);
    if (found.length !== 1) return false;
    const {record, provenance} = found[0];
    if (!schema.safeParse(record).success || !provenance || record.autonomy_mode !== mode ||
        !record.shared_usage || !Number.isInteger(record.shared_usage.api_calls) || !Number.isInteger(record.shared_usage.retries) ||
        record.shared_usage.api_calls < 0 || record.shared_usage.retries < 0 ||
        record.shared_usage.api_calls > record.api_calls || record.shared_usage.retries > record.retries ||
        (mode !== "autonomous" && (record.shared_usage.api_calls !== 0 || record.shared_usage.retries !== 0)) ||
        record.dataset !== "dev" || record.case_id !== benchmark.id ||
        record.original_request !== benchmark.original_request ||
        JSON.stringify(record.context) !== JSON.stringify(benchmark.context) ||
        JSON.stringify(provenance) !== JSON.stringify({...makeProvenance(benchmark, config, false), autonomy_mode: mode, comparison_version: COMPARISON_VERSION})) return false;
    const gt = record.ground_truth;
    if (record.category !== benchmark.category || gt.is_ambiguous !== benchmark.is_ambiguous ||
        gt.expected_clarification_behavior !== benchmark.expected_clarification_behavior ||
        gt.risk_level !== benchmark.risk_level ||
        JSON.stringify(gt.expected_ambiguity_types) !== JSON.stringify(benchmark.expected_ambiguity_types) ||
        JSON.stringify(gt.required_slots) !== JSON.stringify(benchmark.required_slots) ||
        JSON.stringify(gt.reference_criteria) !== JSON.stringify(benchmark.reference_criteria) ||
        gt.expected_final_intent !== benchmark.expected_final_intent) return false;
  }
  const [first, ...others] = group.entries.map(e => e.record);
  return others.every(r => JSON.stringify(r.baseline) === JSON.stringify(first.baseline) &&
    JSON.stringify(r.clarify_ai.detector_output) === JSON.stringify(first.clarify_ai.detector_output));
}

export function summarizeModeComparison(groups: ComparisonGroup[], datasetSize: number) {
  const records = (mode: AutonomyMode) => groups.map(g => g.entries.find(e => e.mode === mode)!.record);
  const common = groups.filter(g => g.entries.every(({record: r}) =>
    r.baseline.error === null && !!r.baseline.response?.trim() && r.clarify_ai.error === null &&
    r.clarify_ai.final_status !== "ERROR" && typeof r.baseline.is_correct === "boolean" &&
    typeof r.clarify_ai.is_correct === "boolean"));
  return {
    methodology: "full_simulated_trajectories" as const,
    status: groups.length === 0 ? "not_run" : groups.length < datasetSize ||
      groups.some(g => g.entries.some(({record: r}) => r.baseline.error !== null || !r.baseline.response?.trim() || r.clarify_ai.final_status === "ERROR" || r.clarify_ai.error !== null)) ? "partial" : "completed",
    recorded_api_calls: groups.reduce((n, g) => n + g.entries.reduce((m, e) => m + e.record.api_calls, 0), 0),
    recorded_retries: groups.reduce((n, g) => n + g.entries.reduce((m, e) => m + e.record.retries, 0), 0),
    matched_cases: groups.length, dataset_cases: datasetSize, common_accuracy_cases: common.length,
    modes: COMPARISON_MODES.map(mode => {
      const rows = records(mode);
      const initial = rows.filter(r => r.clarify_ai.safety_events[0]?.type === "decision");
      const ambiguous = initial.filter(r => r.ground_truth.is_ambiguous);
      const interruptions = initial.filter(r => { const e = r.clarify_ai.safety_events[0]; return e.type === "decision" && (e.action === "clarify" || e.action === "confirm"); });
      const catches = ambiguous.filter(r => { const e = r.clarify_ai.safety_events[0]; return e.type === "decision" && e.action === "clarify"; });
      return { mode, metrics: computeAggregateMetrics(rows),
        initial_interruption: { numerator: interruptions.length, denominator: initial.length, rate: initial.length ? interruptions.length / initial.length : null },
        initial_ambiguity_catch: { numerator: catches.length, denominator: ambiguous.length, rate: ambiguous.length ? catches.length / ambiguous.length : null },
        common_accuracy: common.length ? common.filter(g => g.entries.find(e => e.mode === mode)!.record.clarify_ai.is_correct === true).length / common.length : null };
    }),
    limitations: "Common accuracy uses cases with available paired baseline and outcome scores in all modes; other per-mode metrics use their own eligible denominators. First decisions and simulated trajectories are distinct. No human effort or real actions are measured.",
  };
}
