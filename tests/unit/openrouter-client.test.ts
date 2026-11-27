// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  classifyProviderError,
  generatePlainText,
  generateStructuredJson,
  getOpenRouterConfigStatus,
  OpenRouterClientError,
} from "@/lib/ai/openrouter-client";

describe("OpenRouter config status", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("reports missing key when OPENROUTER_API_KEY is unset", () => {
    vi.stubEnv("OPENROUTER_API_KEY", undefined);
    const cfg = getOpenRouterConfigStatus();
    expect(cfg.provider).toBe("openrouter");
    expect(cfg.hasApiKey).toBe(false);
    expect(cfg.model).toBe("liquid/lfm-3-1.7b:free");
  });

  it("reports valid key when OPENROUTER_API_KEY is set", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-key-12345");
    const cfg = getOpenRouterConfigStatus();
    expect(cfg.hasApiKey).toBe(true);
    expect(cfg.model).toBe("liquid/lfm-3-1.7b:free");
  });

  it("uses custom OPENROUTER_MODEL when set", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-key-12345");
    vi.stubEnv("OPENROUTER_MODEL", "meta-llama/llama-3.1-8b-instruct:free");
    const cfg = getOpenRouterConfigStatus();
    expect(cfg.model).toBe("meta-llama/llama-3.1-8b-instruct:free");
  });

  it("uses default timeout of 25000ms", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-key-12345");
    const cfg = getOpenRouterConfigStatus();
    expect(cfg.timeoutMs).toBe(25000);
  });

  it("uses custom OPENROUTER_TIMEOUT_MS when set", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-key-12345");
    vi.stubEnv("OPENROUTER_TIMEOUT_MS", "10000");
    const cfg = getOpenRouterConfigStatus();
    expect(cfg.timeoutMs).toBe(10000);
  });
});

describe("OpenRouter missing key errors", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", undefined);
    vi.clearAllMocks();
  });

  it("generateStructuredJson throws MISSING_API_KEY without key", async () => {
    await expect(
      generateStructuredJson({
        systemInstruction: "test",
        userPrompt: "test",
        responseJsonSchema: { type: "object" },
      })
    ).rejects.toMatchObject({
      code: "MISSING_API_KEY",
      statusCode: 503,
    });
  });

  it("generatePlainText throws MISSING_API_KEY without key", async () => {
    await expect(
      generatePlainText({
        systemInstruction: "test",
        userPrompt: "test",
      })
    ).rejects.toMatchObject({
      code: "MISSING_API_KEY",
      statusCode: 503,
    });
  });
});

describe("OpenRouter provider error classification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies 429 rate limit errors", async () => {
    const err = new Error("Rate limit exceeded: 429");
    const classified = classifyProviderError(err);
    expect(classified).toMatchObject({
      code: "RATE_LIMITED",
      statusCode: 429,
    });
  });

  it("classifies timeout errors", async () => {
    const err = new Error("Connection timeout exceeded");
    const classified = classifyProviderError(err);
    expect(classified).toMatchObject({
      code: "TIMEOUT",
      statusCode: 504,
    });
  });

  it("classifies unauthorized errors", async () => {
    const err = new Error("Unauthorized: 401");
    const classified = classifyProviderError(err);
    expect(classified).toMatchObject({
      code: "MISSING_API_KEY",
      statusCode: 503,
    });
  });

  it("classifies unavailable errors", async () => {
    const err = new Error("Service unavailable: 503");
    const classified = classifyProviderError(err);
    expect(classified).toMatchObject({
      code: "UNAVAILABLE",
      statusCode: 503,
    });
  });

  it("classifies unknown errors as MODEL_ERROR", async () => {
    const err = new Error("Something unexpected happened");
    const classified = classifyProviderError(err);
    expect(classified).toMatchObject({
      code: "MODEL_ERROR",
      statusCode: 502,
    });
  });

  it("passes through OpenRouterClientError unchanged", async () => {
    const err = new OpenRouterClientError("RATE_LIMITED", "rate limited", 429);
    const classified = classifyProviderError(err);
    expect(classified).toBe(err);
  });
});