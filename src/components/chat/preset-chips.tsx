"use client";

import type { PresetScenario } from "@/types/chat";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

const CATEGORY_BADGE: Record<
  PresetScenario["category"],
  "emerald" | "sky" | "amber" | "purple" | "indigo" | "rose"
> = {
  clear: "emerald",
  referential: "sky",
  contextual: "amber",
  subjective: "purple",
  lexical_semantic: "indigo",
  high_risk: "rose",
};

interface PresetChipsProps {
  presets: PresetScenario[];
  activePresetId: string | null;
  onSelect: (preset: PresetScenario) => void;
  disabled?: boolean;
}

export function PresetChips({
  presets,
  activePresetId,
  onSelect,
  disabled,
}: PresetChipsProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          6 Categorized Preset Scenarios
        </span>
        <span className="text-[11px] text-slate-500">
          Works offline in Demo Mode or Live Gemini
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {presets.map((preset) => {
          const isActive = preset.id === activePresetId;
          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(preset)}
              className={cn(
                "ms-panel ms-panel-hover flex flex-col items-start gap-1.5 rounded-xl p-3 text-left cursor-pointer disabled:opacity-50",
                isActive && "border-sky-400/50 bg-sky-500/10"
              )}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-100">
                  {preset.title}
                </span>
                <Badge
                  variant={CATEGORY_BADGE[preset.category]}
                  className="text-[10px]"
                >
                  {preset.badge}
                </Badge>
              </div>
              <p className="line-clamp-2 text-[11px] text-slate-400 leading-relaxed">
                &quot;{preset.initial_request}&quot;
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
