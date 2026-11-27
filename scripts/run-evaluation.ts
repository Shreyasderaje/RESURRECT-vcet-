import "dotenv/config";
import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { parseEvaluationDataset } from "../src/lib/evaluation/dataset-access";
import { artifactPaths, makeProvenance, parseCheckpoint, selectCheckpoints, type Split } from "../src/lib/evaluation/checkpoints";
import { getGeminiConfigStatus } from "../src/lib/ai/gemini-client";
import { PROMPT_VERSION } from "../src/lib/ai/prompts";
import { createStableId } from "../src/lib/utils/ids";
import { DATASET_VERSION, buildEvaluationReport, evaluateSingleCase } from "../src/lib/evaluation/runner";
import type { BenchmarkCase, CaseEvaluationRecord } from "../src/types/evaluation";
loadEnv({ path: ".env.local" });

async function main() {
  const args = process.argv.slice(2);
  const dataset = parseEvaluationDataset(args);
  const resume = args.includes("--resume");
  const consistency = args.includes("--self-consistency");
  const rawLimit = args.find(a => a.startsWith("--limit="))?.slice(8);
  const limit = rawLimit === undefined ? undefined : Number(rawLimit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new Error("--limit must be a positive integer.");
  const cfg = getGeminiConfigStatus();
  if (!cfg.hasApiKey) throw new Error("GEMINI_API_KEY is not configured. Live evaluation was not run.");
  const config = { dataset_version: DATASET_VERSION, prompt_version: PROMPT_VERSION, model_primary: cfg.primaryModel, model_fast: cfg.fastModel };
  const splits: Split[] = dataset === "all" ? ["dev", "heldout"] : [dataset];
  if (!resume) {
    for (const split of splits) {
      const paths = artifactPaths(split);
      if (fs.existsSync(paths.checkpoint) || fs.existsSync(paths.report)) throw new Error(`Existing ${split} artifacts preserved; use --resume or archive them first.`);
    }
  }
  for (const split of splits) {
    const paths = artifactPaths(split);
    const all = JSON.parse(fs.readFileSync(path.join(process.cwd(), `data/${split}-dataset.json`), "utf8")) as BenchmarkCase[];
    if (!all.length || all.some(c => c.dataset !== split)) throw new Error(`Invalid or empty ${split} dataset.`);
    const cases = limit ? all.slice(0, limit) : all;
    const indexById = new Map(all.map((c, i) => [c.id, i]));
    const wantsConsistency = (c: BenchmarkCase) => consistency && (indexById.get(c.id) ?? Infinity) < 10;
    const checkpointPath = path.join(process.cwd(), paths.checkpoint);
    const existing = resume && fs.existsSync(checkpointPath) ? parseCheckpoint(fs.readFileSync(checkpointPath, "utf8")) : { entries: [], issues: [] };
    const selection = selectCheckpoints(all, existing.entries, config, wantsConsistency);
    console.log(JSON.stringify({ split, malformed: existing.issues, rejected: selection.issues }));
    // Preserve the original checkpoint, including rejected and malformed lines.
    // A missing trailing newline must be repaired before appending a new entry.
    let needsNewline = fs.existsSync(checkpointPath) && fs.statSync(checkpointPath).size > 0 &&
      !fs.readFileSync(checkpointPath, "utf8").endsWith("\n");
    const records: CaseEvaluationRecord[] = [];
    for (const [index, c] of cases.entries()) {
      const saved = selection.selected.get(c.id);
      if (saved) { records.push(saved.record); continue; }
      console.log(`[${index + 1}/${cases.length}] Evaluating ${c.id} (${split})...`);
      const record = await evaluateSingleCase(c, { runSelfConsistencySubset: wantsConsistency(c) });
      const entry = { provenance: makeProvenance(c, config, wantsConsistency(c)), record };
      fs.appendFileSync(checkpointPath, `${needsNewline ? "\n" : ""}${JSON.stringify(entry)}\n`, "utf8");
      needsNewline = false;
      records.push(record);
    }
    const report = buildEvaluationReport({ runId: createStableId("eval"), cases: records,
      status: cases.length < all.length || records.some(r => r.clarify_ai.final_status === "ERROR" || r.baseline.error !== null) ? "partial" : "completed" });
    // Preserve provenance for offline validation; reports stay split-specific.
    const entries = records.map(r => selection.selected.get(r.case_id) ?? { provenance: makeProvenance(all.find(c => c.id === r.case_id)!, config, wantsConsistency(all.find(c => c.id === r.case_id)!)), record: r });
    fs.writeFileSync(path.join(process.cwd(), paths.report), JSON.stringify({ ...report, checkpoint_entries: entries }, null, 2), "utf8");
    console.log(`Saved ${split} report to ${paths.report}`);
  }
}
main().catch(err => { console.error("Evaluation failed:", err); process.exitCode = 1; });
