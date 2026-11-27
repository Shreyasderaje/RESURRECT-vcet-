import { createHash } from "node:crypto";
import { SavedEvaluationRecordSchema } from "./checkpoint-schema";
import type { BenchmarkCase, CaseEvaluationRecord } from "@/types/evaluation";

export type Split = "dev" | "heldout";
export interface RunConfig { dataset_version: string; prompt_version: string; model_primary: string; model_fast: string }
export interface Provenance extends RunConfig { version: 1; input_hash: string; self_consistency: boolean }
export interface CheckpointEntry { provenance: Provenance; record: CaseEvaluationRecord }

export function artifactPaths(split: Split) {
  return { checkpoint: `data/eval-checkpoint-${split}.jsonl`, report: `data/eval-results-${split}-latest.json` };
}
export function makeProvenance(c: BenchmarkCase, config: RunConfig, selfConsistency: boolean): Provenance {
  return { version: 1, ...config, input_hash: createHash("sha256").update(JSON.stringify(c)).digest("hex"), self_consistency: selfConsistency };
}
export function parseCheckpoint(text: string) {
  const entries: unknown[] = [];
  const issues: Array<{ line: number; reason: string }> = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    try { entries.push(JSON.parse(line)); }
    catch { issues.push({ line: i + 1, reason: "malformed_json" }); }
  });
  return { entries, issues };
}

/** Select the last valid matching entry, reporting each rejected entry and duplicate. */
export function selectCheckpoints(cases: BenchmarkCase[], raw: unknown[], config: RunConfig, consistency?: (c: BenchmarkCase) => boolean) {
  const byId = new Map(cases.map(c => [c.id, c]));
  if (byId.size !== cases.length) throw new Error("Duplicate case ID in dataset.");
  const selected = new Map<string, CheckpointEntry>();
  const issues: Array<{ entry: number; reason: string }> = [];
  raw.forEach((value, index) => {
    const e = value as CheckpointEntry | null;
    const r = e?.record;
    const p = e?.provenance;
    const c = r && byId.get(r.case_id);
    let reason = "";
    if (!r || !p || p.version !== 1 || typeof p.self_consistency !== "boolean") reason = "missing_provenance";
    else if (!c || r.dataset !== c.dataset) reason = "unknown_case_or_split";
    else if (r.original_request !== c.original_request || JSON.stringify(r.context) !== JSON.stringify(c.context)) reason = "input_mismatch";
    else if (p.input_hash !== makeProvenance(c, config, p.self_consistency).input_hash) reason = "case_hash_mismatch";
    else if (p.dataset_version !== config.dataset_version || p.prompt_version !== config.prompt_version || p.model_primary !== config.model_primary || p.model_fast !== config.model_fast || (consistency && p.self_consistency !== consistency(c))) reason = "configuration_mismatch";
    else if (!SavedEvaluationRecordSchema.safeParse(r).success) reason = "invalid_record";
    else if (!r.clarify_ai || !r.baseline || r.clarify_ai.final_status === "ERROR" || r.clarify_ai.error !== null || r.baseline.error !== null) reason = "incomplete_or_failed";
    if (reason || !r || !e) { issues.push({ entry: index + 1, reason: reason || "invalid_record" }); return; }
    if (selected.has(r.case_id)) issues.push({ entry: index + 1, reason: "duplicate_superseded" });
    selected.set(r.case_id, e!);
  });
  return { selected, issues };
}
