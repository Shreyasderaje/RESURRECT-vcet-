"use client";

import { Badge } from "@/components/ui/badge";
import type {
  DecisionResult,
  DetectorOutput,
  SpanValidationStats,
} from "@/types/ambiguity";
import { AlertTriangle, CheckCircle2, HelpCircle, ShieldAlert } from "lucide-react";

interface ExplainabilityCardProps {
  analysis: DetectorOutput;
  decision?: DecisionResult | null;
  spanValidation?: SpanValidationStats | null;
}

export function ExplainabilityCard({
  analysis,
  decision,
  spanValidation,
}: ExplainabilityCardProps) {
  const riskVariant =
    analysis.risk_level === "high"
      ? "rose"
      : analysis.risk_level === "medium"
      ? "amber"
      : "emerald";

  return (
    <div className="space-y-4 text-xs">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
          <p className="text-[11px] text-slate-400">Ambiguity Status</p>
          <div className="mt-1 flex items-center gap-1.5 font-medium text-slate-100">
            {analysis.is_ambiguous ? (
              <>
                <HelpCircle className="h-3.5 w-3.5 text-amber-400" />
                <span>Detected</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Clear</span>
              </>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
          <p className="text-[11px] text-slate-400">Risk Level</p>
          <div className="mt-1">
            <Badge variant={riskVariant} className="uppercase text-[10px]">
              {analysis.risk_level === "high" && (
                <ShieldAlert className="h-3 w-3" />
              )}
              {analysis.risk_level}
            </Badge>
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
          <p className="text-[11px] text-slate-400">Policy Decision</p>
          <p className="mt-1 font-mono text-[11px] font-semibold uppercase text-sky-300">
            {decision?.action ?? (analysis.clarification_required ? "clarify" : "resolve")}
          </p>
        </div>
      </div>

      {analysis.ambiguity_types.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Ambiguity Categories
          </p>
          <div className="flex flex-wrap gap-1.5">
            {analysis.ambiguity_types.map((t) => (
              <Badge key={t} variant="indigo" className="capitalize">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Decision Explanation
        </p>
        <p className="rounded-lg border border-slate-800/80 bg-[#090d16] p-2.5 leading-relaxed text-slate-300">
          {decision?.reason ?? analysis.clarification_reason}
        </p>
      </div>

      {analysis.possible_interpretations.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Plausible Interpretations
          </p>
          <ul className="space-y-1.5">
            {analysis.possible_interpretations.map((interp, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 rounded-lg border border-slate-800/70 bg-slate-900/40 px-2.5 py-1.5 text-slate-300"
              >
                <span className="mt-0.5 font-mono text-[10px] text-sky-400">
                  {idx + 1}.
                </span>
                <span>{interp}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.missing_information.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Missing Information
          </p>
          <div className="flex flex-wrap gap-1.5">
            {analysis.missing_information.map((m, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200"
              >
                <AlertTriangle className="h-3 w-3" />
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {spanValidation && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-900/50 px-3 py-2 text-[11px] text-slate-400">
          <span>
            Exact Substring Validation:{" "}
            <strong className="text-slate-200">
              {spanValidation.valid_count}/{spanValidation.total_proposed}
            </strong>{" "}
            spans kept
          </span>
          <span className="font-mono">
            Drop rate: {(spanValidation.span_drop_rate * 100).toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  );
}
