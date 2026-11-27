import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/ai-client", () => ({
  generateStructuredJson: vi.fn(),
  getAIConfigStatus: vi.fn(),
}));

import { resolveRequest } from "@/lib/ai/resolver";
import {
  generateStructuredJson,
  getAIConfigStatus,
} from "@/lib/ai/ai-client";
import type { ClarificationTurn } from "@/types/chat";
import type { DetectorOutput } from "@/types/ambiguity";

const mockGenerateStructuredJson = vi.mocked(generateStructuredJson);
const mockGetAIConfigStatus = vi.mocked(getAIConfigStatus);

function makeContext() {
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

function makeAnalysis(overrides: Partial<DetectorOutput> = {}): DetectorOutput {
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

function makeClarificationTurn(turn = 1): ClarificationTurn {
  return {
    turn,
    question: "Which recipient does 'her' refer to?",
    answer: "Maya Chen — Vendor-Contract-Draft-v2.pdf",
    timestamp: "2026-11-27T10:00:00Z",
  };
}

describe("resolver", () => {
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

  it("returns resolution with clarified intent and extracted slots", async () => {
    mockGenerateStructuredJson.mockResolvedValue({
      rawText: "{}",
      parsedJson: {
        resolved_intent:
          "Send Vendor-Contract-Draft-v2.pdf to Maya Chen before tomorrow's meeting.",
        final_answer:
          "Simulated email drafted to Maya Chen attaching Vendor-Contract-Draft-v2.pdf.",
        remaining_uncertainties: [],
        clarification_impact:
          "Clarification anchored the recipient and document, preventing misrouting.",
        is_fully_resolved: true,
        extracted_slots: [
          { key: "recipient", value: "Maya Chen" },
          { key: "document", value: "Vendor-Contract-Draft-v2.pdf" },
        ],
      },
      modelUsed: "gemini-3.5-flash",
    });

    const { resolution, modelUsed } = await resolveRequest({
      originalRequest:
        "Send the updated draft to her before the meeting tomorrow.",
      context: makeContext(),
      clarificationAnswers: [makeClarificationTurn()],
      analysis: makeAnalysis({
        is_ambiguous: false,
        clarification_required: false,
        resolved_intent:
          "Send Vendor-Contract-Draft-v2.pdf to Maya Chen before tomorrow's meeting.",
      }),
      confirmedHighRiskAction: false,
    });

    expect(modelUsed).toBe("gemini-3.5-flash");
    expect(resolution.resolved_intent).toContain("Maya Chen");
    expect(resolution.resolved_intent).toContain("Vendor-Contract-Draft-v2.pdf");
    expect(resolution.final_answer).toBe(
      "Simulated email drafted to Maya Chen attaching Vendor-Contract-Draft-v2.pdf."
    );
    expect(resolution.is_fully_resolved).toBe(true);
    expect(resolution.clarification_impact).toContain("Clarification anchored");
    expect(resolution.extracted_slots).toHaveLength(2);
    expect(resolution.extracted_slots?.[0]).toEqual({
      key: "recipient",
      value: "Maya Chen",
    });
    expect(resolution.remaining_uncertainties).toEqual([]);
  });

  it("resolves clear requests without clarification answers", async () => {
    mockGenerateStructuredJson.mockResolvedValue({
      rawText: "{}",
      parsedJson: {
        resolved_intent:
          "Summarize Q4-Release-Brief.md in 3 bullet points.",
        final_answer: "Here is the summary of action items.",
        remaining_uncertainties: [],
        clarification_impact:
          "No clarification was required; the request was unambiguous and low-risk.",
        is_fully_resolved: true,
        extracted_slots: [
          { key: "document", value: "Q4-Release-Brief.md" },
          { key: "format", value: "3 bullet points" },
        ],
      },
      modelUsed: "gemini-3.5-flash",
    });

    const { resolution } = await resolveRequest({
      originalRequest:
        "Summarize the action items from Q4-Release-Brief.md in 3 bullet points.",
      context: makeContext(),
      clarificationAnswers: [],
      analysis: makeAnalysis(),
      confirmedHighRiskAction: false,
    });

    expect(resolution.resolved_intent).toContain("Q4-Release-Brief.md");
    expect(resolution.clarification_impact).toContain(
      "No clarification was required"
    );
    expect(resolution.extracted_slots).toHaveLength(2);
    expect(resolution.is_fully_resolved).toBe(true);
  });
});