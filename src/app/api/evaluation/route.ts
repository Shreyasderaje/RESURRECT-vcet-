import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getGeminiConfigStatus } from "@/lib/ai/gemini-client";
import { artifactPaths } from "@/lib/evaluation/checkpoints";
import { computeAggregateMetrics } from "@/lib/evaluation/metrics";
import {
  checkSpotCheckRateLimit,
  getSpotCheckConfig,
  isDurableRateLimitRequiredAndMissing,
} from "@/lib/evaluation/rate-limit";
import { evaluateSingleCase } from "@/lib/evaluation/runner";
import type { BenchmarkCase, EvaluationReport } from "@/types/evaluation";

const SpotCheckSchema = z.object({
  dataset: z.enum(["dev", "heldout"]).default("dev"),
  case_ids: z.array(z.string().trim().min(1)).max(5).optional(),
  count: z.number().int().min(1).max(5).default(3),
});

async function readJsonFile<T>(relPath: string): Promise<T | null> {
  try {
    const abs = path.join(process.cwd(), relPath);
    const raw = await fs.readFile(abs, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function GET() {
  const [report, devDataset] = await Promise.all([
    readJsonFile<EvaluationReport>(artifactPaths("dev").report),
    readJsonFile<BenchmarkCase[]>("data/dev-dataset.json"),
  ]);

  const cfg = getGeminiConfigStatus();
  const spotCfg = getSpotCheckConfig();
  const devCases = report?.cases?.filter(c => c.dataset === "dev") ?? [];
  const { checkpoint_entries: _privateEntries, ...publicReport } = (report ?? {}) as EvaluationReport & { checkpoint_entries?: unknown };
  const devReport = report ? {
    ...publicReport,
    cases: devCases,
    total_cases: devCases.length,
    status: devCases.length ? report.status : "not_run",
    dev_metrics: devCases.length && report.dev_metrics?.sample_size === devCases.length ? report.dev_metrics : null,
    heldout_metrics: null,
    combined_metrics: null,
  } : null;

  return NextResponse.json({
    report: devReport ?? {
      run_id: "not_run",
      dataset_version: "clarify-bench-v1.0",
      prompt_version: "clarify-v1.0.0",
      model_primary: cfg.primaryModel,
      model_fast: cfg.fastModel,
      generated_at: null,
      status: "not_run",
      total_cases: 0,
      dev_metrics: null,
      heldout_metrics: null,
      combined_metrics: null,
      kappa_status: {
        status: "pending",
        cohens_kappa: null,
        annotator_count: 0,
        note: "Pending independent dual-annotator review.",
      },
      cases: [],
    },
    datasets: {
      dev_count: devDataset?.length ?? 0,
      heldout_count: 20, // Frozen split metadata; do not load held-out examples.
      heldout_locked: true,
    },
    spot_check: {
      enabled: cfg.hasApiKey && !isDurableRateLimitRequiredAndMissing(),
      has_api_key: cfg.hasApiKey,
      max_cases: spotCfg.maxCasesPerRequest,
      daily_limit: spotCfg.dailyGlobalLimit,
    },
  });
}

export async function POST(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const parsed = SpotCheckSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid spot-check parameters (max 5 cases)." },
      { status: 400 }
    );
  }

  if (parsed.data.dataset === "heldout") {
    return NextResponse.json({ error: "Held-out spot checks are locked." }, { status: 403 });
  }

  const cfg = getGeminiConfigStatus();
  if (!cfg.hasApiKey) {
    return NextResponse.json(
      {
        error:
          "Live spot-check requires GEMINI_API_KEY configured on the server.",
      },
      { status: 503 }
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";

  const requestedCount = parsed.data.case_ids?.length ?? parsed.data.count;
  const limitCheck = checkSpotCheckRateLimit({
    ip,
    requestedCases: requestedCount,
  });

  if (!limitCheck.allowed) {
    return NextResponse.json(
      {
        error: limitCheck.message,
        remaining_daily: limitCheck.remainingDaily,
      },
      { status: limitCheck.statusCode }
    );
  }

  const datasetPath = "data/dev-dataset.json";
  const allCases = await readJsonFile<BenchmarkCase[]>(datasetPath);

  if (!allCases || allCases.length === 0) {
    return NextResponse.json(
      { error: `Dataset ${datasetPath} is empty or unavailable.` },
      { status: 404 }
    );
  }

  const selected = parsed.data.case_ids?.length
    ? allCases.filter((c) => parsed.data.case_ids!.includes(c.id)).slice(0, 5)
    : allCases.slice(0, requestedCount);

  const results = [];
  for (const c of selected) {
    const rec = await evaluateSingleCase(c, { runSelfConsistencySubset: false });
    results.push(rec);
  }

  const metrics = computeAggregateMetrics(results);
  return NextResponse.json({
    dataset: parsed.data.dataset,
    sample_size: results.length,
    remaining_daily: limitCheck.remainingDaily,
    metrics,
    cases: results,
    timestamp: new Date().toISOString(),
  });
}
