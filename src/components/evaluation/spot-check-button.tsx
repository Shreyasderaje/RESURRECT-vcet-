"use client";

import { useState } from "react";
import { Loader2, Play, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AggregateMetrics, CaseEvaluationRecord } from "@/types/evaluation";

interface SpotCheckButtonProps {
  enabled: boolean;
  hasApiKey: boolean;
  dataset: "dev" | "heldout";
  maxCases: number;
  dailyLimit: number;
  onSpotCheckComplete: (payload: {
    cases: CaseEvaluationRecord[];
    metrics: AggregateMetrics | null;
    remainingDaily: number;
  }) => void;
}

export function SpotCheckButton({
  enabled,
  hasApiKey,
  dataset,
  maxCases,
  dailyLimit,
  onSpotCheckComplete,
}: SpotCheckButtonProps) {
  const [running, setRunning] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleRunSpotCheck() {
    setRunning(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      const res = await fetch("/api/evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset,
          count: Math.min(3, maxCases),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Spot-check failed (${res.status})`);
      }

      setStatusMsg(
        `Spot-checked ${data.sample_size} ${dataset} cases. Remaining daily quota: ${data.remaining_daily}/${dailyLimit}.`
      );
      onSpotCheckComplete({
        cases: data.cases,
        metrics: data.metrics,
        remainingDaily: data.remaining_daily,
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Live spot-check failed."
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        variant="secondary"
        size="sm"
        disabled={!enabled || running}
        onClick={handleRunSpotCheck}
        title={
          hasApiKey
            ? `Run live Gemini spot-check (max ${maxCases} cases, ${dailyLimit}/day)`
            : "Configure GEMINI_API_KEY on server to enable live spot-check"
        }
      >
        {running ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
        <span>Live Spot-Check (3 cases)</span>
      </Button>
      {!hasApiKey && (
        <span className="text-[11px] text-slate-500">
          Requires server GEMINI_API_KEY
        </span>
      )}
      {statusMsg && (
        <span className="text-[11px] text-emerald-300">{statusMsg}</span>
      )}
      {errorMsg && (
        <span className="inline-flex items-center gap-1 text-[11px] text-rose-300">
          <ShieldAlert className="h-3 w-3" />
          {errorMsg}
        </span>
      )}
    </div>
  );
}
