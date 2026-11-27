import "dotenv/config";
import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { getGeminiConfigStatus } from "../src/lib/ai/gemini-client";
import { PROMPT_VERSION } from "../src/lib/ai/prompts";
import { DATASET_VERSION, evaluateModeComparison } from "../src/lib/evaluation/runner";
import { SAFETY_VERSION } from "../src/lib/evaluation/safety";
import { SCORING_VERSION } from "../src/lib/evaluation/scorer";
import { COMPARISON_PATHS } from "../src/lib/evaluation/mode-comparison";
import { selectComparisonCases, runComparisonArtifacts } from "../src/lib/evaluation/comparison-artifacts";
import type { BenchmarkCase } from "../src/types/evaluation";
loadEnv({path: ".env.local"});

async function main() {
  const args = process.argv.slice(2);
  const all = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/dev-dataset.json"), "utf8")) as BenchmarkCase[];
  selectComparisonCases(args, all);
  const retryArg = args.find(a => a.startsWith("--max-retries="));
  const maxRetries = retryArg ? Number(retryArg.slice(14)) : 3;
  const cfg = getGeminiConfigStatus();
  if (!cfg.hasApiKey) throw new Error("API key is not configured; evaluation was not run.");
  const config = { dataset_version: DATASET_VERSION, scoring_version: SCORING_VERSION, safety_version: SAFETY_VERSION, prompt_version: PROMPT_VERSION, model_primary: cfg.primaryModel, model_fast: cfg.fastModel, ...(maxRetries === 3 ? {} : {max_retries: maxRetries}) };
  const result = await runComparisonArtifacts({
    args, dataset: all, config, evaluate: c => evaluateModeComparison(c, {maxRetries}), fs, paths: COMPARISON_PATHS,
  });
  console.log(JSON.stringify(result));

}
main().catch(error => { console.error("Mode comparison failed:", error); process.exitCode = 1; });
