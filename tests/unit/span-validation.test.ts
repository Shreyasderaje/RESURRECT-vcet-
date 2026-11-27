import { describe, expect, it } from "vitest";
import { validateAmbiguousSpans } from "@/lib/ai/detector";
import type { AmbiguousSpan } from "@/types/ambiguity";

describe("span-validation", () => {
  it("accepts exact valid spans and computes character indices", () => {
    const input = "Move the project review to next Friday.";
    const spans: AmbiguousSpan[] = [
      {
        phrase: "next Friday",
        type: "contextual",
        reason: "Could be Dec 4 or Dec 11.",
        interpretations: ["2026-12-04", "2026-12-11"],
      },
    ];

    const { validSpans, stats } = validateAmbiguousSpans(input, spans);
    expect(validSpans).toHaveLength(1);
    expect(validSpans[0].start_index).toBe(27);
    expect(validSpans[0].end_index).toBe(38);
    expect(stats.dropped_count).toBe(0);
    expect(stats.span_drop_rate).toBe(0);
  });

  it("rejects fabricated/paraphrased substrings, empty spans, and case mismatches", () => {
    const input = "Send the Draft to her.";
    const spans: AmbiguousSpan[] = [
      {
        phrase: "the draft", // case mismatch
        type: "referential",
        reason: "Case mismatch",
        interpretations: ["A", "B"],
      },
      {
        phrase: "updated document", // fabricated paraphrase
        type: "referential",
        reason: "Not in input",
        interpretations: ["A", "B"],
      },
      {
        phrase: "   ", // empty
        type: "lexical",
        reason: "Whitespace only",
        interpretations: ["A"],
      },
      {
        phrase: "her", // exact valid
        type: "referential",
        reason: "Unclear pronoun",
        interpretations: ["Priya", "Maya"],
      },
    ];

    const { validSpans, stats } = validateAmbiguousSpans(input, spans);
    expect(validSpans).toHaveLength(1);
    expect(validSpans[0].phrase).toBe("her");
    expect(stats.total_proposed).toBe(4);
    expect(stats.valid_count).toBe(1);
    expect(stats.dropped_count).toBe(3);
    expect(stats.span_drop_rate).toBe(0.75);
  });

  it("handles Unicode text accurately", () => {
    const input = "Send the résumé to José before 5pm — urgent.";
    const spans: AmbiguousSpan[] = [
      {
        phrase: "résumé",
        type: "referential",
        reason: "Multiple versions exist",
        interpretations: ["v1", "v2"],
      },
      {
        phrase: "José",
        type: "referential",
        reason: "Two contacts named José",
        interpretations: ["José A", "José B"],
      },
    ];

    const { validSpans, stats } = validateAmbiguousSpans(input, spans);
    expect(validSpans).toHaveLength(2);
    expect(stats.span_drop_rate).toBe(0);
    expect(input.slice(validSpans[0].start_index, validSpans[0].end_index)).toBe(
      "résumé"
    );
    expect(input.slice(validSpans[1].start_index, validSpans[1].end_index)).toBe(
      "José"
    );
  });

  it("assigns distinct positions to repeated phrases", () => {
    const input = "Check her availability, then check her calendar.";
    const spans: AmbiguousSpan[] = [
      {
        phrase: "her",
        type: "referential",
        reason: "First occurrence",
        interpretations: ["Priya Nair"],
      },
      {
        phrase: "her",
        type: "referential",
        reason: "Second occurrence",
        interpretations: ["Maya Chen"],
      },
    ];

    const { validSpans, stats } = validateAmbiguousSpans(input, spans);
    expect(validSpans).toHaveLength(2);
    expect(stats.dropped_count).toBe(0);
    expect(stats.span_drop_rate).toBe(0);
    expect(validSpans[0].start_index).toBe(6);
    expect(validSpans[0].end_index).toBe(9);
    expect(input.slice(validSpans[0].start_index, validSpans[0].end_index)).toBe(
      "her"
    );
    expect(validSpans[1].start_index).toBe(35);
    expect(validSpans[1].end_index).toBe(38);
    expect(input.slice(validSpans[1].start_index, validSpans[1].end_index)).toBe(
      "her"
    );
  });

  it("drops repeated phrases whose occurrences all overlap claimed spans", () => {
    const input = "Send the draft to her.";
    const spans: AmbiguousSpan[] = [
      {
        phrase: "her",
        type: "referential",
        reason: "Valid occurrence",
        interpretations: ["Priya Nair"],
      },
      {
        phrase: "her",
        type: "referential",
        reason: "Duplicate with no distinct occurrence",
        interpretations: ["Maya Chen"],
      },
    ];

    const { validSpans, stats } = validateAmbiguousSpans(input, spans);
    expect(validSpans).toHaveLength(1);
    expect(stats.total_proposed).toBe(2);
    expect(stats.valid_count).toBe(1);
    expect(stats.dropped_count).toBe(1);
    expect(stats.dropped_phrases).toContain("her");
    expect(stats.span_drop_rate).toBe(0.5);
  });

  it("preserves single-occurrence behavior unchanged", () => {
    const input = "Move the project review to next Friday.";
    const spans: AmbiguousSpan[] = [
      {
        phrase: "next Friday",
        type: "contextual",
        reason: "Could be Dec 4 or Dec 11.",
        interpretations: ["2026-12-04", "2026-12-11"],
      },
    ];

    const { validSpans, stats } = validateAmbiguousSpans(input, spans);
    expect(validSpans).toHaveLength(1);
    expect(validSpans[0].start_index).toBe(27);
    expect(validSpans[0].end_index).toBe(38);
    expect(stats.dropped_count).toBe(0);
    expect(stats.span_drop_rate).toBe(0);
  });
});
