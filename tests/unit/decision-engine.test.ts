import { describe, expect, it } from "vitest";
import { evaluateDecision } from "@/lib/ai/decision-engine";
import type { DetectorOutput } from "@/types/ambiguity";

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

describe("decision-engine", () => {
  it("resolves clear low-risk request directly without clarification", () => {
    const decision = evaluateDecision({
      originalRequest: "Summarize Q4-Release-Brief.md in 3 bullet points.",
      analysis: makeAnalysis(),
      clarificationTurnsUsed: 0,
      confirmedHighRiskAction: false,
    });

    expect(decision.action).toBe("resolve");
    expect(decision.clarification_required).toBe(false);
    expect(decision.confirmation_required).toBe(false);
  });

  it("asks clarification for materially ambiguous request", () => {
    const decision = evaluateDecision({
      originalRequest: "Send the draft to her before the meeting.",
      analysis: makeAnalysis({
        is_ambiguous: true,
        ambiguity_types: ["referential"],
        ambiguous_spans: [
          {
            phrase: "her",
            type: "referential",
            reason: "Multiple female contacts exist.",
            interpretations: ["Priya Nair", "Maya Chen"],
            start_index: 18,
            end_index: 21,
          },
        ],
        possible_interpretations: [
          "Send to Priya Nair",
          "Send to Maya Chen",
        ],
        missing_information: ["Recipient identity"],
        risk_level: "medium",
        clarification_required: true,
        clarification_reason: "Pronoun 'her' is ambiguous.",
        clarification_question: "Which recipient does 'her' refer to?",
        suggested_options: ["Priya Nair", "Maya Chen"],
        resolved_intent: null,
      }),
      clarificationTurnsUsed: 0,
      confirmedHighRiskAction: false,
    });

    expect(decision.action).toBe("clarify");
    expect(decision.clarification_required).toBe(true);
    expect(decision.question).toContain("her");
  });

  it("requires confirmation for clear high-risk request", () => {
    const decision = evaluateDecision({
      originalRequest: "Delete all Q3 backups from the production bucket.",
      analysis: makeAnalysis({
        risk_level: "high",
        resolved_intent: "Delete all Q3 backups from the production bucket.",
      }),
      clarificationTurnsUsed: 0,
      confirmedHighRiskAction: false,
    });

    expect(decision.action).toBe("confirm");
    expect(decision.confirmation_required).toBe(true);
    expect(decision.suggested_options).toContain("Confirm action");
  });

  it("resolves high-risk request once confirmed", () => {
    const decision = evaluateDecision({
      originalRequest: "Delete all Q3 backups from the production bucket.",
      analysis: makeAnalysis({
        risk_level: "high",
        resolved_intent: "Delete all Q3 backups from the production bucket.",
      }),
      clarificationTurnsUsed: 0,
      confirmedHighRiskAction: true,
    });

    expect(decision.action).toBe("resolve");
    expect(decision.confirmation_required).toBe(false);
  });

  it("returns unresolved when maximum clarification turns are exhausted while ambiguity remains", () => {
    const decision = evaluateDecision({
      originalRequest: "Update that report for them.",
      analysis: makeAnalysis({
        is_ambiguous: true,
        ambiguity_types: ["referential"],
        possible_interpretations: ["Report A for Team X", "Report B for Team Y"],
        missing_information: ["Exact report name"],
        clarification_required: true,
        clarification_question: "Which report?",
        resolved_intent: null,
      }),
      clarificationTurnsUsed: 2,
      confirmedHighRiskAction: false,
    });

    expect(decision.action).toBe("unresolved");
    expect(decision.remaining_budget).toBe(0);
  });

  it("avoids unnecessary clarification when minor detail is irrelevant and intent is clear", () => {
    const decision = evaluateDecision({
      originalRequest: "List the 3 attendees on the Weekly Design Sync.",
      analysis: makeAnalysis({
        is_ambiguous: true,
        ambiguity_types: [],
        ambiguous_spans: [],
        possible_interpretations: ["List attendees on Weekly Design Sync"],
        missing_information: [],
        clarification_required: false,
        resolved_intent: "List attendees on Weekly Design Sync",
      }),
      clarificationTurnsUsed: 0,
      confirmedHighRiskAction: false,
    });

    expect(decision.action).toBe("resolve");
    expect(decision.clarification_required).toBe(false);
  });
});
