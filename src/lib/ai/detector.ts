import type {
  AmbiguousSpan,
  DetectorOutput,
  SpanValidationStats,
} from "@/types/ambiguity";
import type { ClarificationTurn, ConversationContext } from "@/types/chat";
import {
  generateStructuredJson,
  getAIConfigStatus,
} from "./ai-client";
import { buildDetectorPrompt } from "./prompts";
import { DETECTOR_JSON_SCHEMA, DetectorOutputSchema } from "./schemas";

export interface DetectionResult {
  analysis: DetectorOutput;
  spanValidation: SpanValidationStats;
  modelUsed: string;
}

/**
 * Validates every proposed ambiguous span against the exact input string
 * supplied to the detector (case-sensitive substring check).
 * Computes exact character offsets and records drop statistics.
 */
export function validateAmbiguousSpans(
  sourceText: string,
  proposedSpans: AmbiguousSpan[]
): { validSpans: AmbiguousSpan[]; stats: SpanValidationStats } {
  const validSpans: AmbiguousSpan[] = [];
  const droppedPhrases: string[] = [];
  const claimedIntervals: { start: number; end: number }[] = [];

  for (const span of proposedSpans) {
    const phrase = span.phrase;
    if (phrase.trim().length === 0) {
      droppedPhrases.push(phrase);
      continue;
    }

    // Collect every occurrence of the phrase in the source text so that
    // repeated phrases can be assigned distinct, non-overlapping positions
    // instead of all collapsing onto the first indexOf match.
    const occurrences: number[] = [];
    let searchFrom = 0;
    while (true) {
      const idx = sourceText.indexOf(phrase, searchFrom);
      if (idx === -1) break;
      occurrences.push(idx);
      searchFrom = idx + 1;
    }

    // Pick the first occurrence that does not overlap any already-claimed span.
    let assignedIndex: number | null = null;
    for (const idx of occurrences) {
      const candidateStart = idx;
      const candidateEnd = idx + phrase.length;
      const overlaps = claimedIntervals.some(
        (interval) => candidateStart < interval.end && candidateEnd > interval.start
      );
      if (!overlaps) {
        assignedIndex = idx;
        claimedIntervals.push({ start: candidateStart, end: candidateEnd });
        break;
      }
    }

    if (assignedIndex === null) {
      droppedPhrases.push(phrase);
      continue;
    }

    validSpans.push({
      ...span,
      start_index: assignedIndex,
      end_index: assignedIndex + phrase.length,
    });
  }

  const totalProposed = proposedSpans.length;
  const droppedCount = droppedPhrases.length;
  const spanDropRate = totalProposed > 0 ? droppedCount / totalProposed : 0;

  return {
    validSpans,
    stats: {
      total_proposed: totalProposed,
      valid_count: validSpans.length,
      dropped_count: droppedCount,
      dropped_phrases: droppedPhrases,
      span_drop_rate: Number(spanDropRate.toFixed(4)),
      source_text: sourceText,
    },
  };
}

export async function detectAmbiguity(params: {
  originalRequest: string;
  context: ConversationContext;
  clarificationAnswers: ClarificationTurn[];
  model?: string;
}): Promise<DetectionResult> {
  const cfg = getAIConfigStatus();
  const { systemInstruction, userPrompt } = buildDetectorPrompt({
    originalRequest: params.originalRequest,
    context: params.context,
    clarificationAnswers: params.clarificationAnswers,
  });

  const { parsedJson, modelUsed } = await generateStructuredJson<unknown>({
    model: params.model ?? cfg.primaryModel,
    systemInstruction,
    userPrompt,
    responseJsonSchema: DETECTOR_JSON_SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.1,
  });

  const validated = DetectorOutputSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new Error(
      `Detector output failed schema validation: ${validated.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`
    );
  }

  const { validSpans, stats } = validateAmbiguousSpans(
    params.originalRequest,
    validated.data.ambiguous_spans
  );

  const analysis: DetectorOutput = {
    ...validated.data,
    ambiguous_spans: validSpans,
  };

  return {
    analysis,
    spanValidation: stats,
    modelUsed,
  };
}
