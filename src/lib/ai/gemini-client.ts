import { GoogleGenAI } from "@google/genai";

export interface GeminiConfigStatus {
  hasApiKey: boolean;
  primaryModel: string;
  fastModel: string;
  demoModeEnabled: boolean;
}

export class GeminiClientError extends Error {
  public readonly code:
    | "MISSING_API_KEY"
    | "RATE_LIMITED"
    | "TIMEOUT"
    | "MODEL_ERROR"
    | "INVALID_RESPONSE"
    | "UNAVAILABLE";
  public readonly statusCode: number;

  constructor(
    code: GeminiClientError["code"],
    message: string,
    statusCode = 500
  ) {
    super(message);
    this.name = "GeminiClientError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function getGeminiConfigStatus(): GeminiConfigStatus {
  const key = process.env.GEMINI_API_KEY?.trim() ?? "";
  const hasApiKey =
    key.length > 0 && key !== "your_api_key_here" && !key.startsWith("your_");

  return {
    hasApiKey,
    primaryModel: process.env.GEMINI_PRIMARY_MODEL?.trim() || "gemini-3.8-flash",
    fastModel:
      process.env.GEMINI_FAST_MODEL?.trim() || "gemini-3.8-flash-lite",
    demoModeEnabled:
      (process.env.ENABLE_DEMO_MODE?.trim().toLowerCase() ?? "true") !==
      "false",
  };
}

let cachedClient: GoogleGenAI | null = null;
let cachedKey = "";

export function getGeminiClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY?.trim() ?? "";
  if (!key || key === "your_api_key_here") {
    throw new GeminiClientError(
      "MISSING_API_KEY",
      "GEMINI_API_KEY is not configured on the server.",
      503
    );
  }
  if (!cachedClient || cachedKey !== key) {
    cachedClient = new GoogleGenAI({ apiKey: key });
    cachedKey = key;
  }
  return cachedClient;
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
      "[clarify-ai:gemini] provider error:",
      JSON.stringify({ name, status, message: sanitizedMsg }),
    );
  } catch {
    // Never let diagnostic logging break the error path.
    console.error("[clarify-ai:gemini] provider error (unserializable)");
  }
}

export function classifyProviderError(err: unknown): GeminiClientError {
  if (err instanceof GeminiClientError) return err;

  logProviderError(err);

  const rawMsg =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const lower = rawMsg.toLowerCase();

  if (lower.includes("429") || lower.includes("quota") || lower.includes("rate")) {
    return new GeminiClientError(
      "RATE_LIMITED",
      "AI service rate limit reached. Please retry shortly.",
      429
    );
  }
  if (lower.includes("timeout") || lower.includes("aborted")) {
    return new GeminiClientError(
      "TIMEOUT",
      "AI request timed out. Please try again.",
      504
    );
  }
  if (lower.includes("api key") || lower.includes("unauthorized") || lower.includes("401")) {
    return new GeminiClientError(
      "MISSING_API_KEY",
      "Server Gemini credentials are invalid or missing.",
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
    return new GeminiClientError(
      "UNAVAILABLE",
      "AI model is temporarily unavailable. Please try again or switch to Demo Mode.",
      503
    );
  }
  return new GeminiClientError(
    "MODEL_ERROR",
    "AI model generation failed. Please try again or switch to Demo Mode.",
    502
  );
}

export async function generateStructuredJson<T>(params: {
  model?: string;
  systemInstruction: string;
  userPrompt: string;
  responseJsonSchema: Record<string, unknown>;
  temperature?: number;
  timeoutMs?: number;
}): Promise<{ rawText: string; parsedJson: T; modelUsed: string }> {
  const client = getGeminiClient();
  const cfg = getGeminiConfigStatus();
  const modelUsed = params.model ?? cfg.primaryModel;
  const timeoutMs = params.timeoutMs ?? 25000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await Promise.race([
      client.models.generateContent({
        model: modelUsed,
        contents: params.userPrompt,
        config: {
          systemInstruction: params.systemInstruction,
          responseMimeType: "application/json",
          responseJsonSchema: params.responseJsonSchema,
          temperature: params.temperature ?? 0.1,
        },
      }),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(new GeminiClientError("TIMEOUT", "AI request timed out.", 504));
        });
      }),
    ]);

    const rawText = response.text?.trim();
    if (!rawText) {
      throw new GeminiClientError(
        "INVALID_RESPONSE",
        "AI model returned an empty response.",
        502
      );
    }

    let parsedJson: T;
    try {
      parsedJson = JSON.parse(rawText) as T;
    } catch {
      throw new GeminiClientError(
        "INVALID_RESPONSE",
        "AI model returned malformed JSON.",
        502
      );
    }

    return { rawText, parsedJson, modelUsed };
  } catch (err) {
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
  const client = getGeminiClient();
  const cfg = getGeminiConfigStatus();
  const modelUsed = params.model ?? cfg.primaryModel;
  const timeoutMs = params.timeoutMs ?? 25000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await Promise.race([
      client.models.generateContent({
        model: modelUsed,
        contents: params.userPrompt,
        config: {
          systemInstruction: params.systemInstruction,
          temperature: params.temperature ?? 0.2,
        },
      }),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(new GeminiClientError("TIMEOUT", "AI request timed out.", 504));
        });
      }),
    ]);

    const text = response.text?.trim() ?? "";
    if (!text) {
      throw new GeminiClientError(
        "INVALID_RESPONSE",
        "AI model returned an empty text response.",
        502
      );
    }
    return { text, modelUsed };
  } catch (err) {
    throw classifyProviderError(err);
  } finally {
    clearTimeout(timer);
  }
}
