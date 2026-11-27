"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AggregateMetrics } from "@/types/evaluation";

interface ComparisonChartProps {
  activeMetrics: AggregateMetrics | null;
  devMetrics: AggregateMetrics | null;
  heldoutMetrics: AggregateMetrics | null;
}

function pct(val: number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  return Number((val * 100).toFixed(1));
}

export function ComparisonChart({
  activeMetrics,
  devMetrics,
  heldoutMetrics,
}: ComparisonChartProps) {
  const baselineVsClarifyData = activeMetrics
    ? [
        {
          metric: "Resolution Accuracy (%)",
          Baseline: pct(activeMetrics.baseline_resolution_accuracy),
          ClarifyAI: pct(activeMetrics.resolution_accuracy),
        },
        {
          metric: "Incorrect Assumption Rate (%)",
          Baseline: pct(activeMetrics.baseline_incorrect_assumption_rate),
          ClarifyAI: pct(activeMetrics.incorrect_assumption_rate),
        },
      ]
    : [];

  const splitComparisonData =
    devMetrics || heldoutMetrics
      ? [
          {
            metric: "Detection Precision",
            Dev: pct(devMetrics?.detection_precision),
            HeldOut: pct(heldoutMetrics?.detection_precision),
          },
          {
            metric: "Detection Recall",
            Dev: pct(devMetrics?.detection_recall),
            HeldOut: pct(heldoutMetrics?.detection_recall),
          },
          {
            metric: "Detection F1",
            Dev: pct(devMetrics?.detection_f1),
            HeldOut: pct(heldoutMetrics?.detection_f1),
          },
          {
            metric: "Resolution Acc.",
            Dev: pct(devMetrics?.resolution_accuracy),
            HeldOut: pct(heldoutMetrics?.resolution_accuracy),
          },
        ]
      : [];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="ms-panel rounded-xl p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            Baseline vs. ClarifyAI (%)
          </h3>
          <p className="text-xs text-slate-400">
            Higher resolution accuracy and lower incorrect assumption rate
            indicate safer disambiguation
          </p>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={baselineVsClarifyData}
              margin={{ top: 10, right: 16, left: -12, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
              <XAxis
                dataKey="metric"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={{ stroke: "rgba(148,163,184,0.2)" }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={{ stroke: "rgba(148,163,184,0.2)" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0d121e",
                  borderColor: "rgba(148,163,184,0.25)",
                  borderRadius: "0.75rem",
                  fontSize: "12px",
                  color: "#e2e8f0",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="Baseline" fill="#64748b" radius={[6, 6, 0, 0]} />
              <Bar dataKey="ClarifyAI" fill="#38bdf8" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="ms-panel rounded-xl p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            Development vs. Locked Held-Out Split (%)
          </h3>
          <p className="text-xs text-slate-400">
            Reported separately to verify generalization without prompt leakage
          </p>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={splitComparisonData}
              margin={{ top: 10, right: 16, left: -12, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
              <XAxis
                dataKey="metric"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={{ stroke: "rgba(148,163,184,0.2)" }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={{ stroke: "rgba(148,163,184,0.2)" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0d121e",
                  borderColor: "rgba(148,163,184,0.25)",
                  borderRadius: "0.75rem",
                  fontSize: "12px",
                  color: "#e2e8f0",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="Dev" fill="#818cf8" radius={[6, 6, 0, 0]} />
              <Bar dataKey="HeldOut" fill="#34d399" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
