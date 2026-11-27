"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AmbiguityType, AmbiguousSpan } from "@/types/ambiguity";
import { cn } from "@/lib/utils/cn";

const TYPE_STYLES: Record<
  AmbiguityType,
  { highlight: string; badge: "sky" | "indigo" | "amber" | "purple" | "rose" | "emerald" | "default"; label: string }
> = {
  referential: {
    highlight: "bg-sky-500/20 text-sky-200 border-b-2 border-sky-400 hover:bg-sky-500/30",
    badge: "sky",
    label: "Referential",
  },
  contextual: {
    highlight: "bg-amber-500/20 text-amber-200 border-b-2 border-amber-400 hover:bg-amber-500/30",
    badge: "amber",
    label: "Contextual",
  },
  subjective: {
    highlight: "bg-purple-500/20 text-purple-200 border-b-2 border-purple-400 hover:bg-purple-500/30",
    badge: "purple",
    label: "Subjective",
  },
  lexical: {
    highlight: "bg-indigo-500/20 text-indigo-200 border-b-2 border-indigo-400 hover:bg-indigo-500/30",
    badge: "indigo",
    label: "Lexical",
  },
  syntactic: {
    highlight: "bg-rose-500/20 text-rose-200 border-b-2 border-rose-400 hover:bg-rose-500/30",
    badge: "rose",
    label: "Syntactic",
  },
  semantic: {
    highlight: "bg-emerald-500/20 text-emerald-200 border-b-2 border-emerald-400 hover:bg-emerald-500/30",
    badge: "emerald",
    label: "Semantic",
  },
  pragmatic: {
    highlight: "bg-slate-500/25 text-slate-100 border-b-2 border-slate-300 hover:bg-slate-500/35",
    badge: "default",
    label: "Pragmatic",
  },
};

interface AmbiguityHeatmapProps {
  originalRequest: string;
  spans: AmbiguousSpan[];
}

interface TextSegment {
  text: string;
  span?: AmbiguousSpan;
}

export function AmbiguityHeatmap({
  originalRequest,
  spans,
}: AmbiguityHeatmapProps) {
  // Verify spans strictly against originalRequest before rendering any highlight
  const verifiedSpans = spans
    .map((span) => {
      const idx = originalRequest.indexOf(span.phrase);
      if (!span.phrase.trim() || idx === -1) return null;
      return {
        ...span,
        start_index: idx,
        end_index: idx + span.phrase.length,
      };
    })
    .filter((s): s is Required<AmbiguousSpan> => s !== null)
    .sort((a, b) => a.start_index - b.start_index);

  const [selectedIdx, setSelectedIdx] = useState<number>(0);

  if (verifiedSpans.length === 0) {
    return null;
  }

  // Build non-overlapping segments
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const span of verifiedSpans) {
    if (span.start_index < cursor) continue; // skip overlapping span
    if (span.start_index > cursor) {
      segments.push({ text: originalRequest.slice(cursor, span.start_index) });
    }
    segments.push({
      text: originalRequest.slice(span.start_index, span.end_index),
      span,
    });
    cursor = span.end_index;
  }
  if (cursor < originalRequest.length) {
    segments.push({ text: originalRequest.slice(cursor) });
  }

  const activeSpan = verifiedSpans[selectedIdx] ?? verifiedSpans[0];
  const activeStyle = TYPE_STYLES[activeSpan.type];

  return (
    <div className="ms-panel rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Ambiguity Span Heatmap
          </span>
          <Badge variant="sky">{verifiedSpans.length} validated</Badge>
        </div>
        <span className="text-[11px] text-slate-400">
          Hover or select a highlighted phrase to inspect
        </span>
      </div>

      <p className="rounded-lg border border-slate-800 bg-[#090d16] p-3.5 text-sm leading-relaxed text-slate-100">
        {segments.map((seg, i) => {
          if (!seg.span) {
            return <span key={i}>{seg.text}</span>;
          }
          const spanIdx = verifiedSpans.findIndex(
            (s) => s.start_index === seg.span!.start_index
          );
          const style = TYPE_STYLES[seg.span.type];
          const isActive = spanIdx === selectedIdx;

          return (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setSelectedIdx(spanIdx)}
              onClick={() => setSelectedIdx(spanIdx)}
              className={cn(
                "mx-0.5 inline rounded px-1.5 py-0.5 font-medium transition-all cursor-pointer",
                style.highlight,
                isActive && "ring-1 ring-white/40"
              )}
            >
              {seg.text}
            </button>
          );
        })}
      </p>

      <div className="rounded-lg border border-slate-800/90 bg-slate-900/60 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Info className="h-3.5 w-3.5 text-sky-400" />
            <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs font-mono text-slate-100">
              &quot;{activeSpan.phrase}&quot;
            </code>
          </div>
          <Badge variant={activeStyle.badge}>{activeStyle.label}</Badge>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          {activeSpan.reason}
        </p>
        {activeSpan.interpretations.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {activeSpan.interpretations.map((interp, idx) => (
              <span
                key={idx}
                className="rounded-md border border-slate-700/80 bg-slate-800/70 px-2 py-0.5 text-[11px] text-slate-300"
              >
                {interp}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
