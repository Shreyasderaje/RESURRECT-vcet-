import { describe, expect, it } from "vitest";
import { classifyProviderError } from "@/lib/ai/gemini-client";

function providerError(msg: string, status?: number): Error {
  const err = new Error(msg) as Error & Record<string, unknown>;
  if (status !== undefined) err.status = status;
  return err;
}

describe("classifyProviderError", () => {
  it("maps a provider 503/high-demand error to UNAVAILABLE/503 via structured status", () => {
    const err = providerError("Something went wrong", 503);
    const result = classifyProviderError(err);
    expect(result.code).toBe("UNAVAILABLE");
    expect(result.statusCode).toBe(503);
  });

  it("maps a high-demand message (no status) to UNAVAILABLE/503", () => {
    const err = new Error("This model is currently experiencing high demand");
    const result = classifyProviderError(err);
    expect(result.code).toBe("UNAVAILABLE");
    expect(result.statusCode).toBe(503);
  });

  it("maps an unavailable message to UNAVAILABLE/503", () => {
    const err = new Error("service unavailable");
    const result = classifyProviderError(err);
    expect(result.code).toBe("UNAVAILABLE");
    expect(result.statusCode).toBe(503);
  });

  it("keeps existing TIMEOUT/504 behavior", () => {
    const err = new Error("execution timeout exceeded");
    const result = classifyProviderError(err);
    expect(result.code).toBe("TIMEOUT");
    expect(result.statusCode).toBe(504);
  });

  it("keeps existing 429/RATE_LIMITED behavior", () => {
    const err = providerError("rate limit exceeded", 429);
    const result = classifyProviderError(err);
    expect(result.code).toBe("RATE_LIMITED");
    expect(result.statusCode).toBe(429);
  });

  it("keeps existing 401/MISSING_API_KEY behavior", () => {
    const err = providerError("invalid api key", 401);
    const result = classifyProviderError(err);
    expect(result.code).toBe("MISSING_API_KEY");
    expect(result.statusCode).toBe(503);
  });

  it("passes through existing GeminiClientError unchanged", () => {
    const err = new Error("already classified");
    (err as Error & { code?: string }).name = "GeminiClientError";
    const result = classifyProviderError(err);
    expect(result.code).toBe("MODEL_ERROR");
    expect(result.statusCode).toBe(502);
  });
});