"use client";

import { useState } from "react";
import { AlertCircle, AlertTriangle, HelpCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CaseEvaluationRecord } from "@/types/evaluation";
import { cn } from "@/lib/utils/cn";

type ErrorBucket =
  | "false_positives"
  | "false_negatives"
  | "incorrect_resolutions"
  | "unresolved_cases"
  | "incorrect_assumptions"
  | "span_failures";

interface ErrorAnalysisTabProps {
  cases: CaseEvaluationRecord[];
  onInspectCase: (c: CaseEvaluationRecord) => void;
}

export function ErrorAnalysisTab({
  cases,
  onInspectCase,
}: ErrorAnalysisTabProps) {
  const [bucket, setBucket] = useState<ErrorBucket>("false_positives");

  const buckets: Record<
    ErrorBucket,
    { label: string; items: CaseEvaluationRecord[]; description: string }
  > = {
    false_positives: {
      label: "False Positives",
      description: "Clear requests that triggered unnecessary clarification.",
      items: cases.filter(
        (c) => !c.ground_truth.is_ambiguous && c.clarify_ai.predicted_ambiguous
      ),
    },
    false_negatives: {
      label: "False Negatives",
      description: "Ambiguous requests missed by the ambiguity detector.",
      items: cases.filter(
        (c) => c.ground_truth.is_ambiguous && !c.clarify_ai.predicted_ambiguous
      ),
    },
    incorrect_resolutions: {
      label: "Incorrect Resolutions",
      description: "Cases where final resolved output failed reference criteria.",
      items: cases.filter(
        (c) => !c.clarify_ai.is_correct && c.clarify_ai.final_status === "RESOLVED"
      ),
    },
    unresolved_cases: {
      label: "Unresolved Cases",
      description: "Requests that remained unresolved or cancelled safely.",
      items: cases.filter(
        (c) =>
          c.clarify_ai.final_status === "UNRESOLVED" ||
          c.clarify_ai.final_status === "CANCELLED"
      ),
    },
    incorrect_assumptions: {
      label: "Incorrect Assumptions",
      description: "Cases where ClarifyAI guessed instead of asking.",
      items: cases.filter((c) => c.clarify_ai.made_incorrect_assumption),
    },
    span_failures: {
      label: "Span Validation Drops",
      description: "Cases where proposed ambiguous phrases failed exact substring validation.",
      items: cases.filter((c) => c.clarify_ai.span_dropped_count > 0),
    },
  };

  const active = buckets[bucket];

  // Group active errors by ambiguity category
  const grouped = new Map<string, CaseEvaluationRecord[]>();
  for (const item of active.items) {
    const key =
      item.ground_truth.expected_ambiguity_types[0] ?? item.category ?? "other";
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }

  return (
    <div className="ms-panel rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            Error Analysis Breakdown
          </h3>
          <p className="text-xs text-slate-400">
            Inspect failure modes grouped by ambiguity category
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(buckets) as ErrorBucket[]).map((key) => {
          const b = buckets[key];
          const isSelected = bucket === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setBucket(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer",
                isSelected
                  ? "border-sky-400/50 bg-sky-500/15 text-sky-200"
                  : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200"
              )}
            >
              <span>{b.label}</span>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                {b.items.length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-slate-800 bg-[#090d16] px-3 py-2 text-xs text-slate-400">
        {active.description}
      </div>

      {active.items.length === 0 ? (
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-6 text-center text-xs text-slate-400">
          No cases in this error bucket for the current dataset split.
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([groupKey, groupItems]) => (
            <div key={groupKey} className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="indigo" className="capitalize">
                  {groupKey}
                </Badge>
                <span className="text-[11px] text-slate-400">
                  {groupItems.length} case{groupItems.length > 1 ? "s" : ""}
                </span>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                {groupItems.map((c) => (
                  <button
                    key={c.case_id}
                    type="button"
                    onClick={() => onInspectCase(c)}
                    className="ms-panel ms-panel-hover flex flex-col gap-1.5 rounded-xl p-3 text-left cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-sky-300">
                        {c.case_id}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {c.clarify_ai.final_status === "UNRESOLVED" ? (
                          <HelpCircle className="h-3.5 w-3.5 text-amber-400" />
                        ) : c.clarify_ai.error ? (
                          <XCircle className="h-3.5 w-3.5 text-rose-400" />
                        ) : c.clarify_ai.span_dropped_count > 0 ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                        )}
                        <Badge variant="default" className="text-[10px]">
                          {c.clarify_ai.outcome_category.replaceAll("_", " ")}
                        </Badge>
                      </div>
                    </div>
                    <p className="line-clamp-2 text-xs text-slate-200">
                      &quot;{c.original_request}&quot;
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {c.clarify_ai.score_reason}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
