// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getAIConfigStatus,
} from "@/lib/ai/ai-client";

describe("AI provider selection", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("defaults to gemini when AI_PROVIDER is unset", () => {
    vi.stubEnv("AI_PROVIDER", undefined);
    const cfg = getAIConfigStatus();
    expect(cfg.provider).toBe("gemini");
  });

  it("selects openrouter when AI_PROVIDER=openrouter", () => {
    vi.stubEnv("AI_PROVIDER", "openrouter");
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-key-12345");
    const cfg = getAIConfigStatus();
    expect(cfg.provider).toBe("openrouter");
    expect(cfg.hasApiKey).toBe(true);
  });

  it("selects gemini when AI_PROVIDER=gemini", () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key-12345");
    const cfg = getAIConfigStatus();
    expect(cfg.provider).toBe("gemini");
    expect(cfg.hasApiKey).toBe(true);
  });

  it("reports missing key for openrouter without OPENROUTER_API_KEY", () => {
    vi.stubEnv("AI_PROVIDER", "openrouter");
    vi.stubEnv("OPENROUTER_API_KEY", undefined);
    const cfg = getAIConfigStatus();
    expect(cfg.provider).toBe("openrouter");
    expect(cfg.hasApiKey).toBe(false);
    expect(cfg.demoModeEnabled).toBe(true);
  });

  it("reports missing key for gemini without GEMINI_API_KEY", () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", undefined);
    const cfg = getAIConfigStatus();
    expect(cfg.provider).toBe("gemini");
    expect(cfg.hasApiKey).toBe(false);
    expect(cfg.demoModeEnabled).toBe(true);
  });

  it("uses OPENROUTER_MODEL when set", () => {
    vi.stubEnv("AI_PROVIDER", "openrouter");
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-key-12345");
    vi.stubEnv("OPENROUTER_MODEL", "meta-llama/llama-3.1-8b-instruct:free");
    const cfg = getAIConfigStatus();
    expect(cfg.primaryModel).toBe("meta-llama/llama-3.1-8b-instruct:free");
    expect(cfg.fastModel).toBe("meta-llama/llama-3.1-8b-instruct:free");
  });

  it("uses default openrouter/auto model when OPENROUTER_MODEL unset", () => {
    vi.stubEnv("AI_PROVIDER", "openrouter");
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-key-12345");
    vi.stubEnv("OPENROUTER_MODEL", undefined);
    const cfg = getAIConfigStatus();
    expect(cfg.primaryModel).toBe("liquid/lfm-3-1.7b:free");
  });
});