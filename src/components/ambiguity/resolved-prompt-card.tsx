"use client";

import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ResolverOutput } from "@/types/ambiguity";
import type { ClarificationTurn } from "@/types/chat";

interface ResolvedPromptCardProps {
  originalRequest: string;
  clarificationAnswers: ClarificationTurn[];
  resolvedIntent: string;
  finalAnswer: string;
  resolution?: ResolverOutput | null;
}

export function ResolvedPromptCard({
  originalRequest,
  clarificationAnswers,
  resolvedIntent,
  finalAnswer,
  resolution,
}: ResolvedPromptCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="ms-panel rounded-xl border-emerald-500/30 p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
            Before → After Resolution
          </span>
        </div>
        <Badge variant="emerald">
          {clarificationAnswers.length === 0
            ? "Direct Resolution (0 turns)"
            : `Clarified in ${clarificationAnswers.length} turn${
                clarificationAnswers.length > 1 ? "s" : ""
              }`}
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] items-stretch">
        <div className="rounded-lg border border-slate-800 bg-[#090d16] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Original Request
          </p>
          <p className="mt-1.5 text-xs text-slate-200 leading-relaxed">
            &quot;{originalRequest}&quot;
          </p>
        </div>

        <div className="hidden md:flex items-center justify-center text-sky-400">
          <ArrowRight className="h-4 w-4" />
        </div>

        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
            Resolved Intent
          </p>
          <p className="mt-1.5 text-xs text-slate-100 font-medium leading-relaxed">
            {resolvedIntent}
          </p>
        </div>
      </div>

      {clarificationAnswers.length > 0 && (
        <div className="rounded-lg border border-slate-800/80 bg-slate-900/50 p-3 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Clarification Inputs Incorporated
          </p>
          {clarificationAnswers.map((t) => (
            <div key={t.turn} className="text-xs text-slate-300">
              <span className="text-slate-400">Turn {t.turn}:</span>{" "}
              <span className="text-sky-300 font-medium">{t.answer}</span>
            </div>
          ))}
        </div>
      )}

      {resolution?.extracted_slots && resolution.extracted_slots.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {resolution.extracted_slots.map((slot, idx) => (
            <span
              key={idx}
              className="rounded-md border border-slate-700/80 bg-slate-800/70 px-2 py-0.5 text-[11px] font-mono text-slate-200"
            >
              <span className="text-slate-400">{slot.key}:</span> {slot.value}
            </span>
          ))}
        </div>
      )}

      {resolution?.clarification_impact && (
        <div className="flex items-start gap-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs text-sky-200">
          <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-sky-400" />
          <span>{resolution.clarification_impact}</span>
        </div>
      )}

      <div className="rounded-lg border border-slate-800 bg-[#090d16] p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Final Simulated Response
        </p>
        <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-200 leading-relaxed">
          {finalAnswer}
        </p>
      </div>
    </motion.div>
  );
}
