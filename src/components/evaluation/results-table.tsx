"use client";

import { useState } from "react";
import { CheckCircle2, Eye, X, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CaseEvaluationRecord } from "@/types/evaluation";
import type { MatrixQuadrant } from "./confusion-matrix";

interface ResultsTableProps {
  cases: CaseEvaluationRecord[];
  selectedQuadrant: MatrixQuadrant;
  inspectedCase: CaseEvaluationRecord | null;
  onInspectCase: (c: CaseEvaluationRecord | null) => void;
}

function matchesQuadrant(
  c: CaseEvaluationRecord,
  quadrant: MatrixQuadrant
): boolean {
  if (!quadrant) return true;
  const gt = c.ground_truth.is_ambiguous;
  const pred = c.clarify_ai.predicted_ambiguous;
  if (quadrant === "tp") return gt && pred;
  if (quadrant === "fp") return !gt && pred;
  if (quadrant === "tn") return !gt && !pred;
  return gt && !pred;
}

export function ResultsTable({
  cases,
  selectedQuadrant,
  inspectedCase,
  onInspectCase,
}: ResultsTableProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const filtered = cases.filter((c) => {
    if (!matchesQuadrant(c, selectedQuadrant)) return false;
    if (categoryFilter !== "all" && c.category !== categoryFilter) return false;
    return true;
  });

  const categories = Array.from(new Set(cases.map((c) => c.category)));

  return (
    <div className="space-y-5">
      <div className="ms-panel rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Case Results & Inspector ({filtered.length})
            </h3>
            <p className="text-xs text-slate-400">
              Select any case to inspect full prompts, context, detector spans,
              clarification Q&A, and scoring
            </p>
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-[#090d16] px-3 py-1.5 text-xs text-slate-200 focus:border-sky-400 focus:outline-none"
          >
            <option value="all">All categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                <th className="py-2.5 pr-3">ID</th>
                <th className="py-2.5 pr-3">Category</th>
                <th className="py-2.5 pr-3">Request</th>
                <th className="py-2.5 pr-3">Turns</th>
                <th className="py-2.5 pr-3">Baseline</th>
                <th className="py-2.5 pr-3">ClarifyAI</th>
                <th className="py-2.5 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filtered.map((c) => (
                <tr
                  key={c.case_id}
                  onClick={() => onInspectCase(c)}
                  className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 pr-3 font-mono text-sky-300">
                    {c.case_id}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge variant="indigo" className="text-[10px] capitalize">
                      {c.category}
                    </Badge>
                  </td>
                  <td className="max-w-xs truncate py-2.5 pr-3 text-slate-200">
                    {c.original_request}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-slate-300">
                    {c.clarify_ai.clarification_turns}
                  </td>
                  <td className="py-2.5 pr-3">
                    {c.baseline.is_correct === null ? <span>N/A</span> : c.baseline.is_correct ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <XCircle className="h-4 w-4 text-rose-400" />
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge
                      variant={
                        c.clarify_ai.is_correct
                          ? "emerald"
                          : c.clarify_ai.final_status === "UNRESOLVED"
                          ? "amber"
                          : "rose"
                      }
                      className="text-[10px]"
                    >
                      {c.clarify_ai.outcome_category.replaceAll("_", " ")}
                    </Badge>
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onInspectCase(c);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/70 px-2 py-1 text-[11px] text-slate-200 hover:border-sky-400/50 cursor-pointer"
                    >
                      <Eye className="h-3 w-3" />
                      <span>View</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Case Inspector Panel */}
      {inspectedCase && (
        <div className="ms-panel rounded-xl border-sky-500/35 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-sky-300">
                {inspectedCase.case_id}
              </span>
              <Badge variant="indigo" className="capitalize">
                {inspectedCase.category}
              </Badge>
              <Badge variant={inspectedCase.dataset === "heldout" ? "amber" : "sky"}>
                {inspectedCase.dataset === "heldout"
                  ? "Locked Held-Out"
                  : "Development"}
              </Badge>
            </div>
            <button
              type="button"
              onClick={() => onInspectCase(null)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 text-xs">
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-800 bg-[#090d16] p-3">
                <p className="text-[11px] font-semibold uppercase text-slate-400">
                  Original Request
                </p>
                <p className="mt-1 text-slate-100">
                  {inspectedCase.original_request}
                </p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-[#090d16] p-3">
                <p className="text-[11px] font-semibold uppercase text-slate-400">
                  Ground Truth & Reference
                </p>
                <p className="mt-1 text-slate-300">
                  Ambiguous:{" "}
                  <strong className="text-slate-100">
                    {String(inspectedCase.ground_truth.is_ambiguous)}
                  </strong>{" "}
                  | Behavior:{" "}
                  <code className="text-sky-300">
                    {inspectedCase.ground_truth.expected_clarification_behavior}
                  </code>
                </p>
                <p className="mt-1 text-slate-200">
                  Expected Intent: {inspectedCase.ground_truth.expected_final_intent}
                </p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                <p className="text-[11px] font-semibold uppercase text-slate-400">
                  Baseline Response ({inspectedCase.baseline.is_correct === null ? "N/A" : inspectedCase.baseline.is_correct ? "Pass" : "Fail"})
                </p>
                <p className="mt-1 whitespace-pre-wrap text-slate-300">
                  {inspectedCase.baseline.response ??
                    inspectedCase.baseline.error ??
                    "No response"}
                </p>
                <p className="mt-1.5 text-[11px] text-slate-400">
                  Score note: {inspectedCase.baseline.score_reason}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-sky-500/25 bg-sky-500/5 p-3">
                <p className="text-[11px] font-semibold uppercase text-sky-300">
                  ClarifyAI Trace ({inspectedCase.clarify_ai.final_status})
                </p>
                {inspectedCase.clarify_ai.clarification_questions.length > 0 ? (
                  <div className="mt-2 space-y-1.5">
                    {inspectedCase.clarify_ai.clarification_questions.map(
                      (q, i) => (
                        <div key={i} className="rounded bg-[#090d16] p-2">
                          <p className="text-amber-300">Q{i + 1}: {q}</p>
                          <p className="text-sky-200 mt-0.5">
                            Sim User A{i + 1}:{" "}
                            {inspectedCase.clarify_ai.simulated_user_answers[i] ??
                              "—"}
                          </p>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-slate-400">
                    0 clarification turns asked.
                  </p>
                )}

                <div className="mt-2.5 space-y-1">
                  <p className="text-emerald-300 font-medium">
                    Resolved Intent:{" "}
                    {inspectedCase.clarify_ai.resolved_intent ?? "None"}
                  </p>
                  <p className="text-slate-200 whitespace-pre-wrap">
                    {inspectedCase.clarify_ai.final_answer ?? "No final answer"}
                  </p>
                  <p className="text-[11px] text-slate-400 pt-1">
                    Scoring: {inspectedCase.clarify_ai.score_reason}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-[#090d16] p-3">
                <p className="text-[11px] font-semibold uppercase text-slate-400">
                  Context Snapshot
                </p>
                <pre className="mt-1 max-h-36 overflow-auto font-mono text-[11px] text-slate-300">
                  {JSON.stringify(inspectedCase.context, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
