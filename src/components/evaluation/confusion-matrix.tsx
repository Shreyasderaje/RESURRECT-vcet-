"use client";

import { Badge } from "@/components/ui/badge";
import type { ConfusionMatrixCounts } from "@/types/evaluation";
import { cn } from "@/lib/utils/cn";

export type MatrixQuadrant = "tp" | "fp" | "tn" | "fn" | null;

interface ConfusionMatrixProps {
  counts: ConfusionMatrixCounts;
  selectedQuadrant: MatrixQuadrant;
  onSelectQuadrant: (q: MatrixQuadrant) => void;
}

export function ConfusionMatrix({
  counts,
  selectedQuadrant,
  onSelectQuadrant,
}: ConfusionMatrixProps) {
  const cells: Array<{
    key: Exclude<MatrixQuadrant, null>;
    title: string;
    subtitle: string;
    value: number;
    tone: string;
  }> = [
    {
      key: "tp",
      title: "True Positive (TP)",
      subtitle: "Ambiguous → Detected",
      value: counts.tp,
      tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    },
    {
      key: "fn",
      title: "False Negative (FN)",
      subtitle: "Ambiguous → Missed",
      value: counts.fn,
      tone: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    },
    {
      key: "fp",
      title: "False Positive (FP)",
      subtitle: "Clear → Over-asked",
      value: counts.fp,
      tone: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    },
    {
      key: "tn",
      title: "True Negative (TN)",
      subtitle: "Clear → Answered Directly",
      value: counts.tn,
      tone: "border-sky-500/30 bg-sky-500/10 text-sky-300",
    },
  ];

  return (
    <div className="ms-panel rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            Ambiguity Detection Confusion Matrix
          </h3>
          <p className="text-xs text-slate-400">
            Click any quadrant to filter cases in the inspector below
          </p>
        </div>
        {selectedQuadrant && (
          <button
            type="button"
            onClick={() => onSelectQuadrant(null)}
            className="text-xs text-sky-400 hover:text-sky-300 cursor-pointer"
          >
            Clear filter ({selectedQuadrant.toUpperCase()})
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {cells.map((cell) => {
          const active = selectedQuadrant === cell.key;
          return (
            <button
              key={cell.key}
              type="button"
              onClick={() =>
                onSelectQuadrant(active ? null : cell.key)
              }
              className={cn(
                "rounded-xl border p-4 text-left transition-all cursor-pointer hover:scale-[1.01]",
                cell.tone,
                active && "ring-2 ring-white/50"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">{cell.title}</span>
                <Badge variant="default" className="font-mono text-[10px]">
                  {cell.key.toUpperCase()}
                </Badge>
              </div>
              <div className="mt-2 font-mono text-2xl font-bold">
                {cell.value}
              </div>
              <p className="mt-1 text-[11px] opacity-80">{cell.subtitle}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
