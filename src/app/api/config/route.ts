import { NextResponse } from "next/server";
import { getAIConfigStatus } from "@/lib/ai/ai-client";

export async function GET() {
  const cfg = getAIConfigStatus();

  return NextResponse.json({
    provider: cfg.provider,
    hasApiKey: cfg.hasApiKey,
    demoModeEnabled: cfg.demoModeEnabled,
    primaryModel: cfg.primaryModel,
    fastModel: cfg.fastModel,
  });
}