import { NextResponse } from "next/server";
import { getAIConfigStatus } from "@/lib/ai/ai-client";
import {
  getSpotCheckConfig,
  isDurableRateLimitRequiredAndMissing,
} from "@/lib/evaluation/rate-limit";

export async function GET() {
  const cfg = getAIConfigStatus();
  const spotCheckCfg = getSpotCheckConfig();

  return NextResponse.json({
    status: "ok",
    service: "ClarifyAI",
    ai_configured: cfg.hasApiKey,
    demo_mode_enabled: cfg.demoModeEnabled,
    primary_model: cfg.primaryModel,
    fast_model: cfg.fastModel,
    spot_check_enabled:
      cfg.hasApiKey && !isDurableRateLimitRequiredAndMissing(),
    spot_check_max_cases: spotCheckCfg.maxCasesPerRequest,
    spot_check_daily_limit: spotCheckCfg.dailyGlobalLimit,
    timestamp: new Date().toISOString(),
  });
}
