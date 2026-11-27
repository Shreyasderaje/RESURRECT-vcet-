import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { getGeminiConfigStatus } from "../src/lib/ai/gemini-client";
import { createStableId } from "../src/lib/utils/ids";
import {
  buildEvaluationReport,
  evaluateSingleCase,
} from "../src/lib/evaluation/runner";
import type {
  BenchmarkCase,
  CaseEvaluationRecord,
} from "../src/types/evaluation";

const CHECKPOINT_PATH = path.join(process.cwd(), "data/eval-checkpoint.jsonl");
const REPORT_PATH = path.join(process.cwd(), "data/eval-results-latest.json");

function loadDataset(filePath: string): BenchmarkCase[] {
  const abs = path.join(process.cwd(), filePath);
  if (!fs.existsSync(abs)) return [];
  return JSON.parse(fs.readFileSync(abs, "utf8")) as BenchmarkCase[];
}

function loadCheckpoints(): Map<string, CaseEvaluationRecord> {
  const map = new Map<string, CaseEvaluationRecord>();
  if (!fs.existsSync(CHECKPOINT_PATH)) return map;
  const lines = fs
    .readFileSync(CHECKPOINT_PATH, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  for (const line of lines) {
    try {
      const rec = JSON.parse(line) as CaseEvaluationRecord;
      if (rec.case_id) {
        map.set(rec.case_id, rec);
      }
    } catch {
      // Skip malformed partial line
    }
  }
  return map;
}

async function main() {
  const args = process.argv.slice(2);
  const resume = args.includes("--resume");
  const datasetArg =
    args.find((a) => a.startsWith("--dataset="))?.split("=")[1] ?? "all";
  const consistencySubset = args.includes("--self-consistency");
  const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const limit = limitArg ? Number(limitArg) : undefined;

  const cfg = getGeminiConfigStatus();
  if (!cfg.hasApiKey) {
    console.error("ERROR: GEMINI_API_KEY is not configured.");
    console.error(
      "Cannot run live benchmark evaluation without credentials. Set GEMINI_API_KEY in .env.local and re-run."
    );
    process.exit(1);
  }

  let cases: BenchmarkCase[] = [];
  if (datasetArg === "dev" || datasetArg === "all") {
    cases = cases.concat(loadDataset("data/dev-dataset.json"));
  }
  if (datasetArg === "heldout" || datasetArg === "all") {
    cases = cases.concat(loadDataset("data/heldout-dataset.json"));
  }
  if (limit && Number.isFinite(limit) && limit > 0) {
    cases = cases.slice(0, limit);
  }

  const completed = resume ? loadCheckpoints() : new Map<string, CaseEvaluationRecord>();
  if (!resume) {
    fs.writeFileSync(CHECKPOINT_PATH, "", "utf8");
  }

  console.log(
    `Running ClarifyAI evaluation (${cases.length} cases, resume=${resume}, completed=${completed.size})`
  );

  const records: CaseEvaluationRecord[] = [];
  let idx = 0;

  for (const c of cases) {
    idx += 1;
    const existing = completed.get(c.id);
    if (existing) {
      records.push(existing);
      continue;
    }

    const runSelfConsistency = consistencySubset && idx <= 10;
    console.log(`[${idx}/${cases.length}] Evaluating ${c.id} (${c.category})...`);
    const record = await evaluateSingleCase(c, {
      runSelfConsistencySubset: runSelfConsistency,
    });
    records.push(record);
    fs.appendFileSync(CHECKPOINT_PATH, `${JSON.stringify(record)}\n`, "utf8");
  }

  const isPartial = records.length < cases.length;
  const report = buildEvaluationReport({
    runId: createStableId("eval"),
    cases: records,
    status: isPartial ? "partial" : "completed",
  });

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nSaved evaluation report to ${REPORT_PATH}`);
  console.log(
    `Dev F1: ${report.dev_metrics?.detection_f1 ?? "N/A"} | Held-out F1: ${
      report.heldout_metrics?.detection_f1 ?? "N/A"
    }`
  );
}

main().catch((err) => {
  console.error("Evaluation failed:", err);
  process.exit(1);
});
