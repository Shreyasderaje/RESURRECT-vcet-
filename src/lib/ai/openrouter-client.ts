import type { AIConfigStatus, AIProvider } from "./ai-client";

export interface OpenRouterConfigStatus {
  provider: "openrouter";
  hasApiKey: boolean;
  model: string;
  timeoutMs: number;
}

export class OpenRouterClientError extends Error {
  public readonly code:
    | "MISSING_API_KEY"
    | "RATE_LIMITED"
    | "TIMEOUT"
    | "MODEL_ERROR"
    | "INVALID_RESPONSE"
    | "UNAVAILABLE";
  public readonly statusCode: number;

  constructor(
    code: OpenRouterClientError["code"],
    message: string,
    statusCode = 500
  ) {
    super(message);
    this.name = "OpenRouterClientError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function getOpenRouterConfigStatus(): OpenRouterConfigStatus {
  const key = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  const hasApiKey =
    key.length > 0 && key !== "your_api_key_here" && !key.startsWith("your_");

  return {
    provider: "openrouter",
    hasApiKey,
    model:
      process.env.OPENROUTER_MODEL?.trim() ||
      "liquid/lfm-3-1.7b:free",
    timeoutMs: Number(process.env.OPENROUTER_TIMEOUT_MS?.trim()) || 25000,
  };
}

let cachedKey = "";

function getOpenRouterHeaders(key: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "HTTP-Referer": "https://clarify-ai.local",
    "X-Title": "ClarifyAI",
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
  const cfg = getOpenRouterConfigStatus();
  if (!cfg.hasApiKey) {
    throw new OpenRouterClientError(
      "MISSING_API_KEY",
      "OPENROUTER_API_KEY is not configured on the server.",
      503
    );
  }

  const modelUsed = params.model ?? cfg.model;
  const timeoutMs = params.timeoutMs ?? cfg.timeoutMs;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = Date.now();

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: getOpenRouterHeaders(process.env.OPENROUTER_API_KEY!),
      body: JSON.stringify({
        model: modelUsed,
        messages: [
          { role: "system", content: params.systemInstruction },
          { role: "user", content: params.userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "clarify_ai_response",
            strict: true,
            schema: params.responseJsonSchema,
          },
        },
        temperature: params.temperature ?? 0.1,
      }),
      signal: controller.signal,
    });

    const elapsedMs = Date.now() - startTime;
    console.error(
      "[clarify-ai:openrouter] structured request complete:",
      JSON.stringify({
        provider: "openrouter",
        model: modelUsed,
        elapsedMs,
        status: res.status,
        ok: res.ok,
        operation: "generateStructuredJson",
      })
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new OpenRouterClientError(
        "MODEL_ERROR",
        `OpenRouter API error (${res.status}): ${errBody.slice(0, 200)}`,
        res.status
      );
    }

    const data = await res.json();
    const rawText = data.choices?.[0]?.message?.content?.trim();

    if (!rawText) {
      throw new OpenRouterClientError(
        "INVALID_RESPONSE",
        "OpenRouter returned an empty response.",
        502
      );
    }

    let parsedJson: T;
    try {
      parsedJson = JSON.parse(rawText) as T;
    } catch {
      throw new OpenRouterClientError(
        "INVALID_RESPONSE",
        "OpenRouter returned malformed JSON.",
        502
      );
    }

    return { rawText, parsedJson, modelUsed };
  } catch (err) {
    const elapsedMs = Date.now() - startTime;
    const isOpenRouterError = err instanceof OpenRouterClientError;
    if (isOpenRouterError) {
      console.error(
        "[clarify-ai:openrouter] structured request failed:",
        JSON.stringify({
          provider: "openrouter",
          model: modelUsed,
          elapsedMs,
          code: err.code,
          statusCode: err.statusCode,
          message: err.message.slice(0, 200),
          operation: "generateStructuredJson",
        })
      );
    } else {
      console.error(
        "[clarify-ai:openrouter] structured request failed (unclassified):",
        JSON.stringify({
          provider: "openrouter",
          model: modelUsed,
          elapsedMs,
          name: err instanceof Error ? err.name : typeof err === "string" ? "StringError" : "UnknownError",
          message: (err instanceof Error ? err.message : typeof err === "string" ? err : "").slice(0, 200),
          operation: "generateStructuredJson",
        })
      );
    }
    if (err instanceof OpenRouterClientError) throw err;
    throw classifyProviderError(err);
  } finally {
    clearTimeout(timer);
  }
}

export async function generatePlainText(params: {
  model?: string;
  systemInstruction: string;
  userPrompt: string;
  temperature?: number;
  timeoutMs?: number;
}): Promise<{ text: string; modelUsed: string }> {
  const cfg = getOpenRouterConfigStatus();
  if (!cfg.hasApiKey) {
    throw new OpenRouterClientError(
      "MISSING_API_KEY",
      "OPENROUTER_API_KEY is not configured on the server.",
      503
    );
  }

  const modelUsed = params.model ?? cfg.model;
  const timeoutMs = params.timeoutMs ?? cfg.timeoutMs;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = Date.now();

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: getOpenRouterHeaders(process.env.OPENROUTER_API_KEY!),
      body: JSON.stringify({
        model: modelUsed,
        messages: [
          { role: "system", content: params.systemInstruction },
          { role: "user", content: params.userPrompt },
        ],
        temperature: params.temperature ?? 0.2,
      }),
      signal: controller.signal,
    });

    const elapsedMs = Date.now() - startTime;
    console.error(
      "[clarify-ai:openrouter] plain text request complete:",
      JSON.stringify({
        provider: "openrouter",
        model: modelUsed,
        elapsedMs,
        status: res.status,
        ok: res.ok,
        operation: "generatePlainText",
      })
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new OpenRouterClientError(
        "MODEL_ERROR",
        `OpenRouter API error (${res.status}): ${errBody.slice(0, 200)}`,
        res.status
      );
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";

    if (!text) {
      throw new OpenRouterClientError(
        "INVALID_RESPONSE",
        "OpenRouter returned an empty text response.",
        502
      );
    }

    return { text, modelUsed };
  } catch (err) {
    const elapsedMs = Date.now() - startTime;
    const isOpenRouterError = err instanceof OpenRouterClientError;
    if (isOpenRouterError) {
      console.error(
        "[clarify-ai:openrouter] plain text request failed:",
        JSON.stringify({
          provider: "openrouter",
          model: modelUsed,
          elapsedMs,
          code: err.code,
          statusCode: err.statusCode,
          message: err.message.slice(0, 200),
          operation: "generatePlainText",
        })
      );
    } else {
      console.error(
        "[clarify-ai:openrouter] plain text request failed (unclassified):",
        JSON.stringify({
          provider: "openrouter",
          model: modelUsed,
          elapsedMs,
          name: err instanceof Error ? err.name : typeof err === "string" ? "StringError" : "UnknownError",
          message: (err instanceof Error ? err.message : typeof err === "string" ? err : "").slice(0, 200),
          operation: "generatePlainText",
        })
      );
    }
    if (err instanceof OpenRouterClientError) throw err;
    throw classifyProviderError(err);
  } finally {
    clearTimeout(timer);
  }
}

function logProviderError(err: unknown): void {
  try {
    const name =
      err instanceof Error
        ? err.name
        : typeof err === "string"
        ? "StringError"
        : "UnknownError";
    const props = err as Record<string, unknown> | undefined;
    const status =
      props &&
      (props["status"] !== undefined ||
        props["statusCode"] !== undefined ||
        (props["code"] !== undefined && typeof props["code"] === "number"))
        ? props["status"] ?? props["statusCode"] ?? props["code"]
        : undefined;
    const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
    const sanitizedMsg = msg.slice(0, 200);

    console.error(
      "[clarify-ai:openrouter] provider error:",
      JSON.stringify({ name, status, message: sanitizedMsg })
    );
  } catch {
    console.error("[clarify-ai:openrouter] provider error (unserializable)");
  }
}

export function classifyProviderError(err: unknown): OpenRouterClientError {
  if (err instanceof OpenRouterClientError) return err;

  logProviderError(err);

  const rawMsg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const lower = rawMsg.toLowerCase();

  if (lower.includes("429") || lower.includes("quota") || lower.includes("rate")) {
    return new OpenRouterClientError(
      "RATE_LIMITED",
      "AI service rate limit reached. Please retry shortly.",
      429
    );
  }
  if (lower.includes("timeout") || lower.includes("aborted")) {
    return new OpenRouterClientError(
      "TIMEOUT",
      "AI request timed out. Please try again.",
      504
    );
  }
  if (lower.includes("api key") || lower.includes("unauthorized") || lower.includes("401")) {
    return new OpenRouterClientError(
      "MISSING_API_KEY",
      "Server OpenRouter credentials are invalid or missing.",
      503
    );
  }
  const props = err as Record<string, unknown> | undefined;
  const status =
    props &&
    (props["status"] !== undefined ||
      props["statusCode"] !== undefined ||
      (props["code"] !== undefined && typeof props["code"] === "number"))
      ? props["status"] ?? props["statusCode"] ?? props["code"]
      : undefined;
  if (
    status === 503 ||
    lower.includes("high demand") ||
    lower.includes("unavailable") ||
    lower.includes("503")
  ) {
    return new OpenRouterClientError(
      "UNAVAILABLE",
      "AI model is temporarily unavailable. Please try again or switch to Demo Mode.",
      503
    );
  }
  return new OpenRouterClientError(
    "MODEL_ERROR",
    "AI model generation failed. Please try again or switch to Demo Mode.",
    502
  );
}