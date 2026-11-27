"use client";

import { Brain, Share2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type { AutonomyMode } from "@/types/chat";

export interface AutonomyDialProps {
  mode: AutonomyMode;
  onModeChange: (mode: AutonomyMode) => void;
  disabled?: boolean;
}

const MODE_INFO: Record<
  AutonomyMode,
  {
    label: string;
    icon: React.ElementType;
    description: string;
    variant: "sky" | "emerald" | "amber";
  }
> = {
  autonomous: {
    label: "Autonomous",
    icon: Brain,
    description:
      "ClarifyAI resolves clear requests directly and minimizes clarification questions.",
    variant: "emerald",
  },
  collaborative: {
    label: "Collaborative",
    icon: Share2,
    description:
      "ClarifyAI asks targeted questions when ambiguity is detected and confirms high-risk actions.",
    variant: "sky",
  },
  cautious: {
    label: "Cautious",
    icon: ShieldCheck,
    description:
      "ClarifyAI asks more questions, confirms more actions, and avoids guessing.",
    variant: "amber",
  },
};

export function AutonomyDial({
  mode,
  onModeChange,
  disabled = false,
}: AutonomyDialProps) {
  const active = MODE_INFO[mode];

  return (
    <div className="ms-panel rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Autonomy Dial
          </span>
          <Badge variant={active.variant} className="text-[10px]">
            {active.label}
          </Badge>
        </div>
        <span className="text-[11px] text-slate-400">
          How assertively ClarifyAI resolves requests
        </span>
      </div>

      <div className="grid gap-2">
        {Object.entries(MODE_INFO).map(([key, info]) => {
          const m = key as AutonomyMode;
          const isSelected = m === mode;
          const Icon = info.icon;
          return (
            <Button
              key={m}
              type="button"
              size="sm"
              variant={isSelected ? "default" : "outline"}
              disabled={disabled}
              onClick={() => !disabled && onModeChange(m)}
              className={cn(
                "w-full flex items-center gap-2 text-left justify-between",
                isSelected && "shadow-sm shadow-sky-500/20"
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span className="font-medium">{info.label}</span>
              </div>
              {isSelected && (
                <span className="text-[10px] font-medium text-slate-400">
                  Active
                </span>
              )}
            </Button>
          );
        })}
      </div>

      <div className="rounded-lg border border-slate-800/80 bg-[#080c14]/60 p-3 text-[11px] leading-relaxed text-slate-300">
        {active.description}
      </div>
    </div>
  );
}