import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getGeminiConfigStatus } from "@/lib/ai/gemini-client";
import { artifactPaths, selectCheckpoints } from "@/lib/evaluation/checkpoints";
import { DATASET_VERSION } from "@/lib/evaluation/runner";
import { SAFETY_VERSION } from "@/lib/evaluation/safety";
import { SCORING_VERSION } from "@/lib/evaluation/scorer";
import { PROMPT_VERSION } from "@/lib/ai/prompts";
import { COMPARISON_PATHS, COMPARISON_VERSION, summarizeModeComparison, validateComparisonGroup, type ComparisonGroup } from "@/lib/evaluation/mode-comparison";
import { replayPolicies, selectReplayInputs } from "@/lib/evaluation/policy-replay";
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
  const [report, devDataset, comparison] = await Promise.all([
    readJsonFile<EvaluationReport>(artifactPaths("dev").report),
    readJsonFile<BenchmarkCase[]>("data/dev-dataset.json"),
    readJsonFile<{version:string; config:unknown; groups:ComparisonGroup[]; selected_case_ids?: string[]}>(COMPARISON_PATHS.report),
  ]);

  const cfg = getGeminiConfigStatus();
  const spotCfg = getSpotCheckConfig();
  const sourceCases = Array.isArray(report?.cases) ? report.cases : [];
  const entries = (report as (EvaluationReport & { checkpoint_entries?: unknown[] }) | null)?.checkpoint_entries;
  const config = { dataset_version: DATASET_VERSION, scoring_version: SCORING_VERSION, safety_version: SAFETY_VERSION, prompt_version: PROMPT_VERSION,
    model_primary: cfg.primaryModel, model_fast: cfg.fastModel };
  const metadataMatches = report && report.dataset_version === config.dataset_version &&
    report.safety_version === config.safety_version && report.scoring_version === config.scoring_version && report.prompt_version === config.prompt_version && report.model_primary === config.model_primary &&
    report.model_fast === config.model_fast;
  const devDatasetValid = Array.isArray(devDataset) && devDataset.every(c => c.dataset === "dev") &&
    new Set(devDataset.map(c => c.id)).size === devDataset.length;
  const selection = metadataMatches && devDatasetValid && Array.isArray(entries)
    ? selectCheckpoints(devDataset, entries, config, undefined, true) : null;
  const duplicateIds = new Set<string>();
  const seen = new Set<string>();
  for (const c of sourceCases) {
    if (seen.has(c?.case_id)) duplicateIds.add(c.case_id);
    seen.add(c?.case_id);
  }
  const devCases = sourceCases.filter(c => {
    const selected = selection?.selected.get(c?.case_id);
    const benchmark = devDataset?.find(item => item.id === c?.case_id);
    const truth = c?.ground_truth;
    return benchmark && truth && c.category === benchmark.category &&
      truth.is_ambiguous === benchmark.is_ambiguous &&
      JSON.stringify(truth.expected_ambiguity_types) === JSON.stringify(benchmark.expected_ambiguity_types) &&
      truth.expected_clarification_behavior === benchmark.expected_clarification_behavior &&
      JSON.stringify(truth.required_slots) === JSON.stringify(benchmark.required_slots) &&
      JSON.stringify(truth.reference_criteria) === JSON.stringify(benchmark.reference_criteria) &&
      truth.expected_final_intent === benchmark.expected_final_intent && truth.risk_level === benchmark.risk_level &&
      c?.dataset === "dev" && !duplicateIds.has(c.case_id) && selected &&
      JSON.stringify(selected.record) === JSON.stringify(c);
  });
  const provenanceStatus = !report ? "not_run" : !Array.isArray(entries) ? "legacy_unverified" :
    selection && sourceCases.length === devCases.length && entries.length === devCases.length && selection.issues.length === 0
      ? "validated" : "unverified";
  const savedConfig = comparison?.config as (typeof config & {max_retries?: unknown}) | undefined;
  const retry = savedConfig?.max_retries;
  const retryValid = retry === undefined || (typeof retry === "number" && Number.isInteger(retry) && retry >= 0 && retry <= 2);
  const comparisonConfig = retry === undefined ? config : {...config, max_retries: retry as number};
  const comparisonCompatible = comparison?.version === COMPARISON_VERSION && Array.isArray(comparison.groups) && retryValid &&
    JSON.stringify(comparison.config) === JSON.stringify(comparisonConfig);
  const rawGroups = comparisonCompatible ? comparison.groups : [];
  const groupCounts = new Map<string, number>();
  for (const g of rawGroups) if (g?.case_id) groupCounts.set(g.case_id, (groupCounts.get(g.case_id) ?? 0) + 1);
  const validGroups = devDatasetValid ? rawGroups.filter(g => {
    const c = devDataset.find(x => x.id === g?.case_id);
    return c && groupCounts.get(g.case_id) === 1 && validateComparisonGroup(g, c, comparisonConfig);
  }) : [];
  const trajectories = summarizeModeComparison(validGroups, devDataset?.length ?? 0);
  const replay = devDatasetValid ? replayPolicies(selectReplayInputs(devDataset, devCases).inputs) : null;
  const { checkpoint_entries: _privateEntries, ...publicReport } = (report ?? {}) as EvaluationReport & { checkpoint_entries?: unknown };
  const devReport = report ? {
    ...publicReport,
    provenance_status: provenanceStatus,
    cases: devCases,
    total_cases: devCases.length,
    status: devCases.length ? (report.status === "partial" || provenanceStatus !== "validated" || devCases.length !== sourceCases.length || devCases.length !== devDataset?.length || devCases.some(c => c.clarify_ai.error !== null || c.clarify_ai.final_status === "ERROR" || c.baseline.error !== null || !c.baseline.response || c.self_consistency_observation?.status === "failed" || c.self_consistency_observation?.status === "unavailable") ? "partial" : "completed") : "not_run",
    dev_metrics: computeAggregateMetrics(devCases),
    heldout_metrics: null,
    combined_metrics: null,
  } : null;

  return NextResponse.json({
    report: devReport ?? {
      provenance_status: "not_run",
      run_id: "not_run",
      dataset_version: "clarify-bench-v1.0",
      scoring_version: SCORING_VERSION,
      safety_version: SAFETY_VERSION,
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
    trajectory_comparison: { ...trajectories,
      status: comparison && !comparisonCompatible ? "unverified" : rawGroups.length !== validGroups.length ? (validGroups.length ? "partial" : "unverified") : (Array.isArray(comparison?.selected_case_ids) && comparison.selected_case_ids.length < (devDataset?.length ?? 0) && trajectories.status === "completed") ? "partial" : trajectories.status,
      rejected_groups: comparison && !comparisonCompatible ? (Array.isArray(comparison.groups) ? comparison.groups.length : 0) : rawGroups.length - validGroups.length },
    offline_policy_replay: replay,
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
