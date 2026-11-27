"use client";

import { AlertTriangle, Bot, CheckCircle2, HelpCircle, Split } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  BaselineComparisonResult,
  ClarificationTurn,
  ConversationStatus,
} from "@/types/chat";
import type { DetectorOutput } from "@/types/ambiguity";

interface SideBySideViewProps {
  originalRequest: string;
  baseline: BaselineComparisonResult | null;
  analysis: DetectorOutput | null;
  clarificationAnswers: ClarificationTurn[];
  clarifyStatus: ConversationStatus | "IDLE";
  clarifyResponse: string | null;
  resolvedIntent: string | null;
}

export function SideBySideView({
  originalRequest,
  baseline,
  analysis,
  clarificationAnswers,
  clarifyStatus,
  clarifyResponse,
  resolvedIntent,
}: SideBySideViewProps) {
  if (!originalRequest) return null;

  return (
    <div className="ms-panel rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Split className="h-4 w-4 text-indigo-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Side-by-Side Comparison: Conventional Baseline vs ClarifyAI
          </span>
        </div>
        {baseline?.mode === "demo" && (
          <Badge variant="amber">Demo Comparison</Badge>
        )}
      </div>

      <div className="rounded-lg border border-slate-800 bg-[#090d16] px-3 py-2 text-xs text-slate-300">
        <span className="font-semibold text-slate-400">Shared Input: </span>
        &quot;{originalRequest}&quot;
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {/* Baseline Column */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
              <Bot className="h-3.5 w-3.5 text-slate-400" />
              <span>Conventional Assistant</span>
            </div>
            <Badge variant={baseline?.assumed_interpretation ? "rose" : "default"}>
              Single-Shot
            </Badge>
          </div>

          {!baseline || !baseline.available ? (
            <div className="rounded-lg border border-slate-800 bg-[#080c14] p-3 text-xs text-slate-400">
              {baseline?.error ??
                "Baseline comparison unavailable (live API key not configured for custom prompt)."}
            </div>
          ) : (
            <>
              {baseline.assumed_interpretation && (
                <div className="flex items-start gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-200">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-rose-400" />
                  <span>{baseline.assumed_interpretation}</span>
                </div>
              )}
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
                {baseline.response}
              </p>
            </>
          )}
        </div>

        {/* ClarifyAI Column */}
        <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-200">
              <CheckCircle2 className="h-3.5 w-3.5 text-sky-400" />
              <span>ClarifyAI</span>
            </div>
            <Badge
              variant={
                clarifyStatus === "RESOLVED"
                  ? "emerald"
                  : clarifyStatus === "AWAITING_USER"
                  ? "amber"
                  : "default"
              }
            >
              {clarifyStatus}
            </Badge>
          </div>

          {analysis && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-slate-400">Detection:</span>
              <span className="font-medium text-slate-200">
                {analysis.is_ambiguous
                  ? `Ambiguous (${analysis.ambiguity_types.join(", ") || "flagged"})`
                  : "Clear"}
              </span>
            </div>
          )}

          {clarificationAnswers.length > 0 && (
            <div className="space-y-1 rounded-lg border border-slate-800/80 bg-[#080c14]/70 p-2.5 text-[11px]">
              {clarificationAnswers.map((t) => (
                <div key={t.turn} className="space-y-0.5">
                  <div className="flex items-center gap-1 text-amber-300">
                    <HelpCircle className="h-3 w-3 shrink-0" />
                    <span>{t.question}</span>
                  </div>
                  <div className="pl-4 text-sky-300 font-medium">
                    ↳ {t.answer}
                  </div>
                </div>
              ))}
            </div>
          )}

          {clarifyResponse ? (
            <div className="space-y-1.5">
              {resolvedIntent && (
                <p className="text-[11px] font-medium text-emerald-300">
                  Intent: {resolvedIntent}
                </p>
              )}
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-200">
                {clarifyResponse}
              </p>
            </div>
          ) : (
            <p className="text-xs italic text-slate-400">
              Waiting for user clarification/confirmation before acting...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
