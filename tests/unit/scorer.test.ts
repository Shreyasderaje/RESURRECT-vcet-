import { describe, expect, it } from "vitest";
import { matchRequiredSlots, matchReferenceCriteria, scoreBaselineCase, scoreClarifyAICase } from "@/lib/evaluation/scorer";
import type { BenchmarkCase } from "@/types/evaluation";

const contextualCase: BenchmarkCase = {
  id: "test-ctx-1",
  dataset: "dev",
  category: "contextual",
  original_request: "Move the project review to next Friday.",
  context: { current_date: "2026-11-27" },
  is_ambiguous: true,
  expected_ambiguity_types: ["contextual"],
  expected_interpretations: ["Dec 4", "Dec 11"],
  expected_clarification_behavior: "clarify",
  required_slots: {
    meeting: "Project Review",
    date: "2026-12-11",
  },
  reference_criteria: ["Project Review", "2026-12-11"],
  expected_final_intent: "Move Project Review to 2026-12-11.",
  risk_level: "medium",
};

describe("scorer", () => {
  it("requires exact required_slots match and rejects wrong dates even if plausible", () => {
    const wrongDate = scoreClarifyAICase({
      benchmarkCase: contextualCase,
      finalStatus: "RESOLVED",
      clarificationTurns: 1,
      resolvedIntent: "Move Project Review to 2026-12-04.",
      finalAnswer: "Moved Project Review to 2026-12-04.",
      extractedSlots: [
        { key: "meeting", value: "Project Review" },
        { key: "date", value: "2026-12-04" },
      ],
      predictedAmbiguous: true,
    });

    expect(wrongDate.is_correct).toBe(false);
    expect(wrongDate.outcome_category).toBe("incorrect_resolution");

    const rightDate = scoreClarifyAICase({
      benchmarkCase: contextualCase,
      finalStatus: "RESOLVED",
      clarificationTurns: 1,
      resolvedIntent: "Move Project Review to 2026-12-11.",
      finalAnswer: "Moved Project Review to 2026-12-11.",
      extractedSlots: [
        { key: "meeting", value: "Project Review" },
        { key: "date", value: "2026-12-11" },
      ],
      predictedAmbiguous: true,
    });

    expect(rightDate.is_correct).toBe(true);
    expect(rightDate.outcome_category).toBe(
      "correct_clarification_and_resolution"
    );
  });

  it("scores unresolved cases as unresolved_request rather than resolved", () => {
    const res = scoreClarifyAICase({
      benchmarkCase: contextualCase,
      finalStatus: "UNRESOLVED",
      clarificationTurns: 2,
      resolvedIntent: null,
      finalAnswer: null,
      predictedAmbiguous: true,
    });

    expect(res.is_correct).toBe(false);
    expect(res.outcome_category).toBe("unresolved_request");
  });

  it("does not infer an incorrect baseline assumption from a missing reference match", () => {
    const res = scoreBaselineCase({
      benchmarkCase: contextualCase,
      response: "Moved Project Review to Dec 4, 2026.",
      error: null,
    });

    expect(res.is_correct).toBe(false);
    expect(res.made_incorrect_assumption).toBeNull();
  });

  it("matches structured slots exactly after normalization and rejects partial values", () => {
    const check = (expected: string, actual: string) => matchRequiredSlots({
      requiredSlots: { name: expected }, extractedSlots: [{ key: " Name ", value: actual }],
      resolvedIntent: null, finalAnswer: null,
    }).matched;
    expect(check("Maya Chen", "  maya   CHEN ")).toBe(true);
    expect(check("5", "50")).toBe(false);
    expect(check("Ann", "Anna")).toBe(false);
    expect(check("Ann", "")).toBe(false);
    expect(check("", "anything")).toBeNull();
    expect(matchRequiredSlots({requiredSlots: {}, resolvedIntent: null, finalAnswer: null}).matched).toBeNull();
  });

  it("uses literal boundaries and explicit pipe alternatives in text criteria", () => {
    const score = (criterion: string, answer: string) => matchReferenceCriteria({criteria: [criterion], resolvedIntent: null, finalAnswer: answer}).passed;
    expect(score("5", "50 users")).toBe(false);
    expect(score("5", "5.0 users")).toBe(false);
    expect(score("5", "-5 users")).toBe(false);
    expect(score("Ann", "Anna")).toBe(false);
    expect(score("redis|cdn", "Use CDN.")).toBe(true);
    expect(matchReferenceCriteria({criteria: [], resolvedIntent: null, finalAnswer: "anything"}).passed).toBeNull();
    expect(score(" | ", "anything")).toBeNull();
  });

  it("keeps intent accuracy separate from unnecessary clarification", () => {
    const c = {...contextualCase, is_ambiguous: false, expected_clarification_behavior: "direct_answer" as const};
    const result = scoreClarifyAICase({benchmarkCase: c, finalStatus: "RESOLVED", clarificationTurns: 1,
      resolvedIntent: "Project Review 2026-12-11", finalAnswer: null, predictedAmbiguous: false});
    expect(result.is_correct).toBe(true);
    expect(result.unnecessary_clarification).toBe(true);
    expect(result.outcome_category).toBe("unnecessary_clarification");
    expect(scoreBaselineCase({benchmarkCase: c, response: "Project Review 2026-12-11", error: null}).is_correct).toBe(true);
  });

  it("does not infer an assumption when evidence is absent, and records explicit mismatch separately", () => {
    const result = scoreClarifyAICase({benchmarkCase: contextualCase, finalStatus: "RESOLVED", clarificationTurns: 0,
      resolvedIntent: "Project Review 2026-12-04", finalAnswer: null, predictedAmbiguous: true});
    expect(result.is_correct).toBe(false);
    expect(result.made_incorrect_assumption).toBeNull();
    const explicit = scoreClarifyAICase({benchmarkCase: contextualCase, finalStatus: "RESOLVED", clarificationTurns: 0,
      resolvedIntent: null, finalAnswer: null, extractedSlots: [{key:"meeting", value:"Project Review"}, {key:"date", value:"2026-12-04"}], predictedAmbiguous: true});
    expect(explicit.made_incorrect_assumption).toBe(true);
  });

  it("reports missing criteria, empty outputs, cancellation and errors distinctly", () => {
    const c = {...contextualCase, required_slots: {}, reference_criteria: []};
    const args = {benchmarkCase: c, clarificationTurns: 0, resolvedIntent: "answer", finalAnswer: null, predictedAmbiguous: false};
    expect(scoreClarifyAICase({...args, finalStatus: "RESOLVED"})).toMatchObject({is_correct: null, outcome_category: "unscorable"});
    expect(scoreBaselineCase({benchmarkCase: c, response: "answer", error: null}).is_correct).toBeNull();
    expect(scoreClarifyAICase({...args, resolvedIntent: null, finalStatus: "RESOLVED"}).is_correct).toBeNull();
    expect(scoreClarifyAICase({...args, finalStatus: "CANCELLED"})).toMatchObject({is_correct: false, outcome_category: "cancelled_request"});
    expect(scoreClarifyAICase({...args, finalStatus: "ERROR"})).toMatchObject({is_correct: null, outcome_category: "evaluation_error"});
    expect(scoreBaselineCase({benchmarkCase: c, response: null, error: "API error"}).is_correct).toBeNull();
  });
});
