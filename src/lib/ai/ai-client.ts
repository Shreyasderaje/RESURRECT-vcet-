import {
  generateStructuredJson as geminiStructuredJson,
  generatePlainText as geminiPlainText,
  getGeminiConfigStatus,
  GeminiClientError,
  classifyProviderError as geminiClassifyProviderError,
} from "./gemini-client";
import {
  generateStructuredJson as openrouterStructuredJson,
  generatePlainText as openrouterPlainText,
  getOpenRouterConfigStatus,
  OpenRouterClientError,
  classifyProviderError as openrouterClassifyProviderError,
} from "./openrouter-client";

export type AIProvider = "gemini" | "openrouter";

export interface AIConfigStatus {
  provider: AIProvider;
  hasApiKey: boolean;
  primaryModel: string;
  fastModel: string;
  timeoutMs: number;
  demoModeEnabled: boolean;
}

export class AIProviderError extends Error {
  public readonly code:
    | "MISSING_API_KEY"
    | "RATE_LIMITED"
    | "TIMEOUT"
    | "MODEL_ERROR"
    | "INVALID_RESPONSE"
    | "UNAVAILABLE";
  public readonly statusCode: number;

  constructor(
    code: AIProviderError["code"],
    message: string,
    statusCode = 500
  ) {
    super(message);
    this.name = "AIProviderError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function getAIConfigStatus(): AIConfigStatus {
  const provider: AIProvider =
    (process.env.AI_PROVIDER?.trim().toLowerCase() as AIProvider) ?? "gemini";

  if (provider === "openrouter") {
    const cfg = getOpenRouterConfigStatus();
    return {
      provider,
      hasApiKey: cfg.hasApiKey,
      primaryModel: cfg.model,
      fastModel: cfg.model,
      timeoutMs: cfg.timeoutMs,
      demoModeEnabled: cfg.hasApiKey === false,
    };
  }
  return {
    provider: "gemini",
    ...getGeminiConfigStatus(),
    timeoutMs: 25000,
  };
}

export async function generateStructuredJson<T>(params: {
  model?: string;
  systemInstruction: string;
  userPrompt: string;
  responseJsonSchema: Record<string, unknown>;
  temperature?: number;
  timeoutMs?: number;
}): Promise<{ rawText: string; parsedJson: T; modelUsed: string }> {
  const provider: AIProvider =
    (process.env.AI_PROVIDER?.trim().toLowerCase() as AIProvider) ?? "gemini";

  try {
    if (provider === "openrouter") {
      return await openrouterStructuredJson(params);
    }
    return await geminiStructuredJson(params);
  } catch (err) {
    if (err instanceof AIProviderError) throw err;
    if (provider === "openrouter" && err instanceof OpenRouterClientError) {
      throw new AIProviderError(err.code, err.message, err.statusCode);
    }
    if (provider === "gemini" && err instanceof GeminiClientError) {
      throw new AIProviderError(err.code, err.message, err.statusCode);
    }
    const classified =
      provider === "openrouter"
        ? openrouterClassifyProviderError(err)
        : geminiClassifyProviderError(err);
    throw new AIProviderError(
      classified.code,
      classified.message,
      classified.statusCode
    );
  }
}

export async function generatePlainText(params: {
  model?: string;
  systemInstruction: string;
  userPrompt: string;
  temperature?: number;
  timeoutMs?: number;
}): Promise<{ text: string; modelUsed: string }> {
  const provider: AIProvider =
    (process.env.AI_PROVIDER?.trim().toLowerCase() as AIProvider) ?? "gemini";

  try {
    if (provider === "openrouter") {
      return await openrouterPlainText(params);
    }
    return await geminiPlainText(params);
  } catch (err) {
    if (err instanceof AIProviderError) throw err;
    if (provider === "openrouter" && err instanceof OpenRouterClientError) {
      throw new AIProviderError(err.code, err.message, err.statusCode);
    }
    if (provider === "gemini" && err instanceof GeminiClientError) {
      throw new AIProviderError(err.code, err.message, err.statusCode);
    }
    const classified =
      provider === "openrouter"
        ? openrouterClassifyProviderError(err)
        : geminiClassifyProviderError(err);
    throw new AIProviderError(
      classified.code,
      classified.message,
      classified.statusCode
    );
  }
}

export function classifyProviderError(err: unknown): AIProviderError {
  if (err instanceof AIProviderError) return err;

  const provider: AIProvider =
    (process.env.AI_PROVIDER?.trim().toLowerCase() as AIProvider) ?? "gemini";

  const classified =
    provider === "openrouter"
      ? openrouterClassifyProviderError(err)
      : geminiClassifyProviderError(err);

  return new AIProviderError(
    classified.code,
    classified.message,
    classified.statusCode
  );
}