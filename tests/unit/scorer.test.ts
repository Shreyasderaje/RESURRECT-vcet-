import { describe, expect, it } from "vitest";
import { scoreBaselineCase, scoreClarifyAICase } from "@/lib/evaluation/scorer";
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

  it("flags baseline incorrect assumptions when guessing on ambiguous cases", () => {
    const res = scoreBaselineCase({
      benchmarkCase: contextualCase,
      response: "Moved Project Review to Dec 4, 2026.",
      error: null,
    });

    expect(res.is_correct).toBe(false);
    expect(res.made_incorrect_assumption).toBe(true);
  });
});
