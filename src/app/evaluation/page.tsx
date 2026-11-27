"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  Lock,
  Terminal,
} from "lucide-react";
import { ComparisonChart } from "@/components/evaluation/comparison-chart";
import {
  ConfusionMatrix,
  type MatrixQuadrant,
} from "@/components/evaluation/confusion-matrix";
import { ErrorAnalysisTab } from "@/components/evaluation/error-analysis-tab";
import { MetricCard } from "@/components/evaluation/metric-card";
import { ResultsTable } from "@/components/evaluation/results-table";
import { SpotCheckButton } from "@/components/evaluation/spot-check-button";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageContainer } from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import type {
  AggregateMetrics,
  CaseEvaluationRecord,
  EvaluationReport,
} from "@/types/evaluation";
import { cn } from "@/lib/utils/cn";

interface EvaluationApiResponse {
  report: EvaluationReport;
  datasets: {
    dev_count: number;
    heldout_count: number;
    heldout_locked: boolean;
  };
  spot_check: {
    enabled: boolean;
    has_api_key: boolean;
    max_cases: number;
    daily_limit: number;
  };
}

function formatPct(val: number | null | undefined): string {
  if (val === null || val === undefined) return "N/A";
  return `${(val * 100).toFixed(1)}%`;
}

function formatNum(val: number | null | undefined): string {
  if (val === null || val === undefined) return "N/A";
  return val.toFixed(2);
}

export default function EvaluationPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EvaluationApiResponse | null>(null);

  const [datasetView, setDatasetView] = useState<"dev" | "heldout">(
    "dev"
  );
  const [activeTab, setActiveTab] = useState<"overview" | "errors" | "cases">(
    "overview"
  );
  const [selectedQuadrant, setSelectedQuadrant] = useState<MatrixQuadrant>(null);
  const [inspectedCase, setInspectedCase] =
    useState<CaseEvaluationRecord | null>(null);
  const [spotCheckResults, setSpotCheckResults] = useState<{
    cases: CaseEvaluationRecord[];
    metrics: AggregateMetrics | null;
  } | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/evaluation")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<EvaluationApiResponse>;
      })
      .then((payload) => {
        if (active) setData(payload);
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load evaluation report."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const report = data?.report;
  const activeMetrics = spotCheckResults
    ? spotCheckResults.metrics
    : datasetView === "dev"
    ? report?.dev_metrics ?? null
    : report?.heldout_metrics ?? null;

  const activeCases = spotCheckResults
    ? spotCheckResults.cases
    : (report?.cases ?? []).filter((c) =>
        c.dataset === datasetView
      );

  const hasSavedResults =
    (report && report.status !== "not_run" && activeCases.length > 0) ||
    Boolean(spotCheckResults);

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader
        mode={data?.spot_check.has_api_key ? "live" : "demo"}
        aiConfigured={Boolean(data?.spot_check.has_api_key)}
      />

      <PageContainer className="flex-1">
        <div className="flex gap-6">
          <AppSidebar />

          <div className="flex-1 min-w-0 space-y-5">
            {/* Header & Dataset Switcher */}
            <div className="ms-panel rounded-xl p-5 flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-semibold tracking-tight text-slate-100">
                    Evaluation & Error Analysis Dashboard
                  </h1>
                  <Badge variant="sky" className="font-mono text-[10px]">
                    {report?.dataset_version ?? "clarify-bench-v1.0"}
                  </Badge>
                  <Badge variant="indigo" className="font-mono text-[10px]">
                    {report?.prompt_version ?? "clarify-v1.0.0"}
                  </Badge>
                </div>
                <p className="text-xs text-slate-400">
                  Benchmark size:{" "}
                  <strong className="text-slate-200">
                    {(data?.datasets.dev_count ?? 80) +
                      (data?.datasets.heldout_count ?? 20)}
                  </strong>{" "}
                  cases ({data?.datasets.dev_count ?? 80} dev /{" "}
                  {data?.datasets.heldout_count ?? 20} locked held-out). Held-out
                  reference answers are isolated from the detector, baseline,
                  and user simulator.
                </p>
              </div>

              {data && datasetView === "dev" && (
                <SpotCheckButton
                  enabled={data.spot_check.enabled}
                  hasApiKey={data.spot_check.has_api_key}
                  dataset="dev"
                  maxCases={data.spot_check.max_cases}
                  dailyLimit={data.spot_check.daily_limit}
                  onSpotCheckComplete={(res) => {
                    setSpotCheckResults({
                      cases: res.cases,
                      metrics: res.metrics,
                    });
                    setInspectedCase(res.cases[0] ?? null);
                  }}
                />
              )}
            </div>

            {/* Dataset Toggle + View Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { id: "dev", label: `Development (${data?.datasets.dev_count ?? 80})` },
                    { id: "heldout", label: `Held-Out Locked (${data?.datasets.heldout_count ?? 20})`, locked: true },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSpotCheckResults(null);
                      setDatasetView(item.id);
                      setSelectedQuadrant(null);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                      datasetView === item.id && !spotCheckResults
                        ? "border-sky-400/50 bg-sky-500/15 text-sky-200"
                        : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200"
                    )}
                  >
                    {"locked" in item && item.locked && (
                      <Lock className="h-3 w-3 text-amber-400" />
                    )}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-[#090d16] p-1">
                {(
                  [
                    { id: "overview", label: "Overview" },
                    { id: "errors", label: "Error Analysis" },
                    { id: "cases", label: "Case Inspector" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                      activeTab === tab.id
                        ? "bg-slate-800 text-slate-100"
                        : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Loading / Error / Empty States */}
            {loading ? (
              <div className="ms-panel rounded-xl p-10 text-center text-xs text-slate-400">
                Loading evaluation datasets and committed benchmark results...
              </div>
            ) : error ? (
              <div className="ms-panel rounded-xl border-rose-500/30 p-6 text-xs text-rose-200 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-400" />
                <span>{error}</span>
              </div>
            ) : !hasSavedResults ? (
              <div className="space-y-5">
                <div className="ms-panel rounded-xl p-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
                      <Database className="h-5 w-5" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold text-slate-100">
                          No Benchmark Results Computed Yet (Zero Fabricated Numbers)
                        </h2>
                        <Badge variant="amber">Status: Not Run</Badge>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                        ClarifyAI never displays synthetic or fabricated metrics.
                        The 100-case benchmark suite (80 development + 20 locked
                        held-out cases) is committed and ready. Configure{" "}
                        <code className="text-sky-300">GEMINI_API_KEY</code> and
                        run the evaluation CLI to populate real results in{" "}
                        <code className="text-sky-300">
                          data/eval-results-dev-latest.json
                        </code>
                        , or run a small live spot-check above.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-[#080c14] p-3.5 font-mono text-xs text-slate-300 space-y-1">
                    <div className="flex items-center gap-2 text-slate-400 mb-1">
                      <Terminal className="h-3.5 w-3.5 text-sky-400" />
                      <span>Run benchmark CLI (with checkpointing & resume):</span>
                    </div>
                    <p className="text-sky-300">npm run smoke-test</p>
                    <p className="text-sky-300">npm run evaluate</p>
                    <p className="text-slate-400">npm run evaluate -- --resume</p>
                  </div>
                </div>

                {/* Honest N/A Cards */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard
                    label="Total Test Cases"
                    value={String(
                      (data?.datasets.dev_count ?? 80) +
                        (data?.datasets.heldout_count ?? 20)
                    )}
                    subtitle={`${data?.datasets.dev_count ?? 80} dev / ${data?.datasets.heldout_count ?? 20} held-out`}
                    icon={Database}
                  />
                  <MetricCard
                    label="Detection F1"
                    value="N/A"
                    subtitle="Run evaluation to compute"
                    icon={BarChart3}
                  />
                  <MetricCard
                    label="Resolution Accuracy"
                    value="N/A"
                    subtitle="Run evaluation to compute"
                    icon={CheckCircle2}
                  />
                  <MetricCard
                    label="Annotator Kappa"
                    value={
                      report?.kappa_status.cohens_kappa !== null &&
                      report?.kappa_status.cohens_kappa !== undefined
                        ? String(report.kappa_status.cohens_kappa)
                        : "Pending"
                    }
                    subtitle={report?.kappa_status.note}
                    icon={Activity}
                  />
                </div>
              </div>
            ) : (
              <>
                {report?.status === "partial" && !spotCheckResults && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-200">
                    Partial evaluation run loaded ({report.total_cases} cases
                    completed). Run <code>npm run evaluate -- --resume</code> to
                    finish remaining cases.
                  </div>
                )}

                {spotCheckResults && (
                  <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 text-xs text-sky-200">
                    Showing live spot-check results ({spotCheckResults.cases.length}{" "}
                    cases). Switch dataset tabs above to return to saved
                    benchmark results.
                  </div>
                )}

                {/* Overview KPI Cards */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard
                    label="Sample Size"
                    value={activeMetrics ? String(activeMetrics.sample_size) : "N/A"}
                    subtitle={`Dev: ${data?.datasets.dev_count ?? 80} | Held-out: ${data?.datasets.heldout_count ?? 20}`}
                    icon={Database}
                  />
                  <MetricCard
                    label="Detection F1"
                    value={formatPct(activeMetrics?.detection_f1)}
                    subtitle={`P: ${formatPct(activeMetrics?.detection_precision)} · R: ${formatPct(activeMetrics?.detection_recall)}`}
                    tone="sky"
                    icon={BarChart3}
                  />
                  <MetricCard
                    label="Resolution Accuracy"
                    value={formatPct(activeMetrics?.resolution_accuracy)}
                    subtitle={`Baseline: ${formatPct(activeMetrics?.baseline_resolution_accuracy)}`}
                    tone="emerald"
                    icon={CheckCircle2}
                  />
                  <MetricCard
                    label="Unnecessary Clarify Rate"
                    value={formatPct(activeMetrics?.unnecessary_clarification_rate)}
                    subtitle={`Mean turns: ${formatNum(activeMetrics?.mean_clarification_turns)} · Span drop: ${formatPct(activeMetrics?.span_drop_rate)}`}
                    tone="amber"
                    icon={Activity}
                  />
                </div>

                {activeTab === "overview" && (
                  <div className="space-y-5">
                    <ComparisonChart
                      activeMetrics={activeMetrics}
                      devMetrics={report?.dev_metrics ?? null}
                      heldoutMetrics={report?.heldout_metrics ?? null}
                    />
                    {activeMetrics && (
                      <ConfusionMatrix
                        counts={activeMetrics.confusion_matrix}
                        selectedQuadrant={selectedQuadrant}
                        onSelectQuadrant={(q) => {
                          setSelectedQuadrant(q);
                          if (q) setActiveTab("cases");
                        }}
                      />
                    )}
                  </div>
                )}

                {activeTab === "errors" && (
                  <ErrorAnalysisTab
                    cases={activeCases}
                    onInspectCase={(c) => {
                      setInspectedCase(c);
                      setActiveTab("cases");
                    }}
                  />
                )}

                {activeTab === "cases" && (
                  <ResultsTable
                    cases={activeCases}
                    selectedQuadrant={selectedQuadrant}
                    inspectedCase={inspectedCase}
                    onInspectCase={setInspectedCase}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
