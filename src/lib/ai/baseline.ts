import type {
  BaselineComparisonResult,
  ConversationContext,
} from "@/types/chat";
import {
  AIProviderError,
  generatePlainText,
  getAIConfigStatus,
} from "./ai-client";
import { buildBaselinePrompt } from "./prompts";

export async function runBaselineAssistant(params: {
  originalRequest: string;
  context: ConversationContext;
  model?: string;
}): Promise<BaselineComparisonResult> {
  const cfg = getAIConfigStatus();
  if (!cfg.hasApiKey) {
    return {
      available: false,
      mode: "unavailable",
      model: null,
      response: null,
      error: "Live baseline unavailable: GEMINI_API_KEY is not configured.",
    };
  }

  const { systemInstruction, userPrompt } = buildBaselinePrompt({
    originalRequest: params.originalRequest,
    context: params.context,
  });

  try {
    const { text, modelUsed } = await generatePlainText({
      model: params.model ?? cfg.primaryModel,
      systemInstruction,
      userPrompt,
      temperature: 0.2,
    });
    return {
      available: true,
      mode: "live",
      model: modelUsed,
      response: text,
      error: null,
    };
  } catch (err) {
    const message =
      err instanceof AIProviderError
        ? err.message
        : "Baseline assistant failed to respond.";
    return {
      available: false,
      mode: "unavailable",
      model: params.model ?? cfg.primaryModel,
      response: null,
      error: message,
    };
  }
}
