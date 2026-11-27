import "dotenv/config";
import { validateAmbiguousSpans } from "../src/lib/ai/detector";
import { generateStructuredJson, getGeminiConfigStatus } from "../src/lib/ai/gemini-client";
import { buildDetectorPrompt } from "../src/lib/ai/prompts";
import { DETECTOR_JSON_SCHEMA, DetectorOutputSchema } from "../src/lib/ai/schemas";

async function main() {
  console.log("=== ClarifyAI Gemini Integration Smoke Test ===");
  const cfg = getGeminiConfigStatus();
  console.log(`Primary model: ${cfg.primaryModel}`);
  console.log(`Fast model:    ${cfg.fastModel}`);

  // 1. Offline checks (always run)
  const sampleText = "Move the project review to next Friday afternoon.";
  const spanCheck = validateAmbiguousSpans(sampleText, [
    {
      phrase: "next Friday",
      type: "contextual",
      reason: "Relative date",
      interpretations: ["2026-12-04", "2026-12-11"],
    },
    {
      phrase: "hallucinated substring",
      type: "lexical",
      reason: "Should be dropped",
      interpretations: ["A"],
    },
  ]);

  if (spanCheck.validSpans.length !== 1 || spanCheck.stats.dropped_count !== 1) {
    console.error("FAIL: Exact substring span validation check failed.");
    process.exit(1);
  }
  console.log("PASS: Exact substring span validation works.");

  if (!cfg.hasApiKey) {
    console.error("\nSETUP REQUIRED: GEMINI_API_KEY is not configured.");
    console.error("1. Copy .env.example to .env.local");
    console.error("2. Set GEMINI_API_KEY=<your Google AI Studio key>");
    console.error("3. Re-run `npm run smoke-test`");
    console.error("\nOffline deterministic Demo Mode remains available without an API key.");
    process.exit(1);
  }

  // 2. Live API check for primary + fast models
  const { systemInstruction, userPrompt } = buildDetectorPrompt({
    originalRequest: sampleText,
    context: { current_date: "2026-11-27" },
    clarificationAnswers: [],
  });

  for (const model of [cfg.primaryModel, cfg.fastModel]) {
    try {
      const res = await generateStructuredJson<unknown>({
        model,
        systemInstruction,
        userPrompt,
        responseJsonSchema: DETECTOR_JSON_SCHEMA as unknown as Record<string, unknown>,
      });

      const parsed = DetectorOutputSchema.safeParse(res.parsedJson);
      if (!parsed.success) {
        console.error(`FAIL [${model}]: Zod validation failed:`, parsed.error.issues);
        process.exit(1);
      }

      const liveSpanCheck = validateAmbiguousSpans(
        sampleText,
        parsed.data.ambiguous_spans
      );
      console.log(
        `PASS [${res.modelUsed}]: Structured JSON + Zod valid. Proposed spans=${liveSpanCheck.stats.total_proposed}, Valid=${liveSpanCheck.stats.valid_count}, DropRate=${liveSpanCheck.stats.span_drop_rate}`
      );
    } catch (err) {
      console.error(
        `FAIL [${model}]:`,
        err instanceof Error ? err.message : String(err)
      );
      process.exit(1);
    }
  }

  console.log("\nAll smoke tests passed!");
}

main();
