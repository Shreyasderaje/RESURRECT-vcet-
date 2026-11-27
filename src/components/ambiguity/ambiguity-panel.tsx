"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  DecisionResult,
  DetectorOutput,
  SpanValidationStats,
} from "@/types/ambiguity";
import { ExplainabilityCard } from "./explainability-card";

interface AmbiguityPanelProps {
  analysis: DetectorOutput | null;
  decision?: DecisionResult | null;
  spanValidation?: SpanValidationStats | null;
  defaultExpanded?: boolean;
}

export function AmbiguityPanel({
  analysis,
  decision,
  spanValidation,
  defaultExpanded = true,
}: AmbiguityPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!analysis) {
    return (
      <div className="ms-panel rounded-xl p-4 text-xs text-slate-400">
        <div className="flex items-center gap-2 text-slate-300 font-medium">
          <Cpu className="h-4 w-4 text-sky-400" />
          <span>Explainability & Detection Panel</span>
        </div>
        <p className="mt-2 leading-relaxed">
          Send a request or pick a preset scenario to inspect ClarifyAI&apos;s
          ambiguity classification, validated phrase spans, and decision policy.
        </p>
      </div>
    );
  }

  return (
    <div className="ms-panel rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-800/40 cursor-pointer"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-sky-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Explainability Analysis
          </span>
          <Badge variant={analysis.is_ambiguous ? "amber" : "emerald"}>
            {analysis.is_ambiguous ? "Ambiguous" : "Unambiguous"}
          </Badge>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden border-t border-slate-800/80"
          >
            <div className="p-4">
              <ExplainabilityCard
                analysis={analysis}
                decision={decision}
                spanValidation={spanValidation}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
