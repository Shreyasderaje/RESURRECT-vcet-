import "dotenv/config";
import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { artifactPaths, parseCheckpoint, selectCheckpoints } from "../src/lib/evaluation/checkpoints";
import { getGeminiConfigStatus } from "../src/lib/ai/gemini-client";
import { PROMPT_VERSION } from "../src/lib/ai/prompts";
import { DATASET_VERSION } from "../src/lib/evaluation/runner";
import { replayPolicies, selectReplayInputs, pairedOverReliancePrevention, liveMeanClarificationTurns } from "../src/lib/evaluation/policy-replay";
import type { BenchmarkCase } from "../src/types/evaluation";
loadEnv({ path: ".env.local" });
const dataset = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/dev-dataset.json"), "utf8")) as BenchmarkCase[];
const source = process.argv.find(a => a.startsWith("--source="))?.slice("--source=".length) ?? artifactPaths("dev").checkpoint;
const file = path.resolve(source);
let raw: unknown[] = [];
let malformed: Array<{line: number; reason: string}> = [];
if (fs.existsSync(file)) {
  const text = fs.readFileSync(file, "utf8");
  if (source.endsWith(".jsonl")) {
    const parsed = parseCheckpoint(text); raw = parsed.entries; malformed = parsed.issues;
  } else {
    const report = JSON.parse(text);
    if (!Array.isArray(report.checkpoint_entries)) throw new Error("Report has no verifiable checkpoint_entries; legacy records require review.");
    raw = report.checkpoint_entries;
  }
}
const cfg = getGeminiConfigStatus();
const selected = selectCheckpoints(dataset, raw, { dataset_version: DATASET_VERSION, prompt_version: PROMPT_VERSION, model_primary: cfg.primaryModel, model_fast: cfg.fastModel });
const records = [...selected.selected.values()].map(entry => entry.record);
const selection = selectReplayInputs(dataset, records);
console.log(JSON.stringify({
  status: selection.inputs.length === 0 ? "not_run" : selection.inputs.length < dataset.length ? "partial" : "completed",
  dataset: "dev", source, source_missing: !fs.existsSync(file), dataset_cases: dataset.length,
  matched_cases: selection.inputs.length, malformed, rejected: selected.issues, excluded: selection.excluded,
  limitations: "First decision replay only; no live conversations or outcomes are generated.",
  live_saved_records: { note: "Observational saved outcomes; not replay results or a mode comparison.",
    over_reliance_prevention_proxy: pairedOverReliancePrevention(records), mean_clarification_turns: liveMeanClarificationTurns(records) },
  ...replayPolicies(selection.inputs),
}, null, 2));
