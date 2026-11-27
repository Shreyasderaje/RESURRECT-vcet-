import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/ai-client", () => ({
  generateStructuredJson: vi.fn(),
  getAIConfigStatus: vi.fn(),
}));

import { detectAmbiguity } from "@/lib/ai/detector";
import {
  generateStructuredJson,
  getAIConfigStatus,
} from "@/lib/ai/ai-client";
import type { ConversationContext } from "@/types/chat";
import type { DetectorOutput } from "@/types/ambiguity";

const mockGenerateStructuredJson = vi.mocked(generateStructuredJson);
const mockGetAIConfigStatus = vi.mocked(getAIConfigStatus);

function makeContext(): ConversationContext {
  return {
    user_role: "Product Engineering Lead",
    workspace: "ClarifyAI Workspace",
    timezone: "Asia/Kolkata",
    current_date: "2026-11-27",
    recent_files: [
      { name: "Q4-Release-Brief.md", updated_at: "2026-11-26", owner: "Priya Nair" },
    ],
    contacts: [
      { name: "Priya Nair", role: "Product Manager", email: "priya.nair@example.com" },
    ],
  };
}

function makeDetectorOutput(overrides: Partial<DetectorOutput> = {}): DetectorOutput {
  return {
    is_ambiguous: false,
    ambiguity_types: [],
    ambiguous_spans: [],
    possible_interpretations: ["Single clear interpretation"],
    missing_information: [],
    risk_level: "low",
    clarification_required: false,
    clarification_reason: "Request is clear.",
    clarification_question: null,
    suggested_options: [],
    resolved_intent: "Summarize Q4-Release-Brief.md in 3 bullets.",
    ...overrides,
  };
}

describe("detectAmbiguity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAIConfigStatus.mockReturnValue({
      provider: "gemini",
      hasApiKey: true,
      primaryModel: "gemini-3.5-flash",
      fastModel: "gemini-3.5-flash-lite",
      timeoutMs: 25000,
      demoModeEnabled: false,
    });
  });

  it("returns unambiguous result for a clear request", async () => {
    mockGenerateStructuredJson.mockResolvedValue({
      rawText: "{}",
      parsedJson: makeDetectorOutput({
        is_ambiguous: false,
        clarification_required: false,
        resolved_intent: "Summarize Q4-Release-Brief.md in 3 bullet points.",
      }),
      modelUsed: "gemini-3.5-flash",
    });

    const { analysis, spanValidation, modelUsed } = await detectAmbiguity({
      originalRequest: "Summarize the action items from Q4-Release-Brief.md in 3 bullet points.",
      context: makeContext(),
      clarificationAnswers: [],
    });

    expect(modelUsed).toBe("gemini-3.5-flash");
    expect(analysis.is_ambiguous).toBe(false);
    expect(analysis.ambiguity_types).toEqual([]);
    expect(analysis.ambiguous_spans).toEqual([]);
    expect(analysis.clarification_required).toBe(false);
    expect(spanValidation.valid_count).toBe(0);
    expect(spanValidation.dropped_count).toBe(0);
  });

  it("returns ambiguous result with validated spans for a referential request", async () => {
    mockGenerateStructuredJson.mockResolvedValue({
      rawText: "{}",
      parsedJson: makeDetectorOutput({
        is_ambiguous: true,
        ambiguity_types: ["referential"],
        ambiguous_spans: [
          {
            phrase: "her",
            type: "referential",
            reason: "Multiple female contacts exist.",
            interpretations: ["Priya Nair", "Maya Chen"],
          },
        ],
        possible_interpretations: ["Send to Priya Nair", "Send to Maya Chen"],
        missing_information: ["Recipient identity"],
        risk_level: "medium",
        clarification_required: true,
        clarification_reason: "Pronoun 'her' is ambiguous.",
        clarification_question: "Which recipient does 'her' refer to?",
        suggested_options: ["Priya Nair", "Maya Chen"],
        resolved_intent: null,
      }),
      modelUsed: "gemini-3.5-flash",
    });

    const { analysis, spanValidation } = await detectAmbiguity({
      originalRequest: "Send the updated draft to her before the meeting tomorrow.",
      context: makeContext(),
      clarificationAnswers: [],
    });

    expect(analysis.is_ambiguous).toBe(true);
    expect(analysis.ambiguity_types).toContain("referential");
    expect(analysis.ambiguous_spans).toHaveLength(1);
    expect(analysis.ambiguous_spans[0].phrase).toBe("her");
    expect(analysis.ambiguous_spans[0].start_index).toBeDefined();
    expect(analysis.ambiguous_spans[0].end_index).toBeDefined();
    expect(analysis.clarification_required).toBe(true);
    expect(spanValidation.valid_count).toBe(1);
    expect(spanValidation.dropped_count).toBe(0);
  });

  it("detects contextual ambiguity from relative dates with calendar conflicts", async () => {
    mockGenerateStructuredJson.mockResolvedValue({
      rawText: "{}",
      parsedJson: makeDetectorOutput({
        is_ambiguous: true,
        ambiguity_types: ["contextual"],
        ambiguous_spans: [
          {
            phrase: "next Friday",
            type: "contextual",
            reason:
              "Relative to Friday Nov 27, 'next Friday' can mean Dec 4 (already booked) or Dec 11.",
            interpretations: ["Friday, 2026-12-04", "Friday, 2026-12-11"],
            start_index: 26,
            end_index: 37,
          },
        ],
        possible_interpretations: [
          "Reschedule Project Review to Friday, 2026-12-11.",
          "Keep on Friday, 2026-12-04 and adjust the time.",
        ],
        missing_information: [
          "Exact target Friday (2026-12-04 vs 2026-12-11)",
        ],
        risk_level: "medium",
        clarification_required: true,
        clarification_reason:
          "Moving a team meeting on the wrong Friday causes calendar conflicts.",
        clarification_question:
          'Did "next Friday" mean Dec 4 or Dec 11, and what time?',
        suggested_options: ["Friday, Dec 11 at 14:00", "Friday, Dec 4 at 16:30"],
        resolved_intent: null,
      }),
      modelUsed: "gemini-3.5-flash",
    });

    const { analysis, spanValidation } = await detectAmbiguity({
      originalRequest: "Move the project review to next Friday afternoon.",
      context: {
        ...makeContext(),
        calendar_events: [
          {
            id: "evt_102",
            title: "Project Review — Search Latency",
            date: "2026-12-04",
            time: "15:00",
            attendees: ["Priya Nair", "Jordan Lee"],
          },
        ],
      },
      clarificationAnswers: [],
    });

    expect(analysis.is_ambiguous).toBe(true);
    expect(analysis.ambiguity_types).toContain("contextual");
    expect(analysis.ambiguous_spans).toHaveLength(1);
    expect(analysis.ambiguous_spans[0].phrase).toBe("next Friday");
    expect(analysis.clarification_required).toBe(true);
    expect(spanValidation.valid_count).toBe(1);
    expect(spanValidation.dropped_count).toBe(0);
  });

  it("detects subjective ambiguity from qualitative terms", async () => {
    mockGenerateStructuredJson.mockResolvedValue({
      rawText: "{}",
      parsedJson: makeDetectorOutput({
        is_ambiguous: true,
        ambiguity_types: ["subjective"],
        ambiguous_spans: [
          {
            phrase: "more executive",
            type: "subjective",
            reason:
              "Could prioritize business KPIs/risks for leadership or high-level product value.",
            interpretations: [
              "Board-level KPI summary",
              "Customer value summary",
            ],
            start_index: 33,
            end_index: 47,
          },
          {
            phrase: "concise",
            type: "subjective",
            reason: "Target length is unspecified (3 bullets vs 1 short paragraph).",
            interpretations: [
              "3 high-signal bullet points",
              "Single 3-sentence paragraph",
            ],
            start_index: 52,
            end_index: 59,
          },
        ],
        possible_interpretations: [
          "Rewrite as 3 leadership bullets emphasizing milestones and risks.",
          "Rewrite as a single-paragraph stakeholder update.",
        ],
        missing_information: ["Preferred executive format and emphasis"],
        risk_level: "low",
        clarification_required: true,
        clarification_reason:
          "Clarifying target structure and emphasis prevents rewriting in the wrong tone.",
        clarification_question:
          "Which executive format and focus best fits your audience?",
        suggested_options: [
          "3-bullet leadership brief",
          "One-paragraph status summary",
        ],
        resolved_intent: null,
      }),
      modelUsed: "gemini-3.5-flash",
    });

    const { analysis, spanValidation } = await detectAmbiguity({
      originalRequest: "Make the Q4 release brief sound more executive and concise.",
      context: makeContext(),
      clarificationAnswers: [],
    });

    expect(analysis.is_ambiguous).toBe(true);
    expect(analysis.ambiguity_types).toContain("subjective");
    expect(analysis.ambiguous_spans).toHaveLength(2);
    expect(analysis.ambiguous_spans[0].phrase).toBe("more executive");
    expect(analysis.ambiguous_spans[1].phrase).toBe("concise");
    expect(analysis.clarification_required).toBe(true);
    expect(spanValidation.valid_count).toBe(2);
    expect(spanValidation.dropped_count).toBe(0);
  });
});