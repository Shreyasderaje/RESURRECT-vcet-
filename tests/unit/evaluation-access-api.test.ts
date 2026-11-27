// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import { makeProvenance } from "@/lib/evaluation/checkpoints";
import { DATASET_VERSION } from "@/lib/evaluation/runner";
import { SAFETY_VERSION } from "@/lib/evaluation/safety";
import { SCORING_VERSION } from "@/lib/evaluation/scorer";
import { PROMPT_VERSION } from "@/lib/ai/prompts";
import { getGeminiConfigStatus } from "@/lib/ai/gemini-client";
import type { BenchmarkCase } from "@/types/evaluation";
import { GET, POST } from "@/app/api/evaluation/route";
vi.mock("node:fs/promises", () => ({ default: { readFile: vi.fn() } }));
describe("evaluation API held-out lock", () => {
  beforeEach(() => vi.clearAllMocks());
  it("rejects held-out requests before requiring credentials or reading the dataset", async () => {
    const request = new NextRequest("http://localhost/api/evaluation", {
      method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({dataset: "heldout"})
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(fs.readFile).not.toHaveBeenCalled();
  });
  it("returns frozen split metadata without reading held-out examples", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("unavailable"));
    const response = await GET();
    const body = await response.json();
    expect(body.datasets.heldout_locked).toBe(true);
    expect(body.datasets.heldout_count).toBe(20);
    expect(vi.mocked(fs.readFile).mock.calls.some(call => String(call[0]).includes("heldout-dataset"))).toBe(false);
  });
  it("does not return held-out records or aggregates from a saved report", async () => {
    vi.mocked(fs.readFile).mockImplementation(async (file) => {
      if (String(file).includes("eval-results")) return JSON.stringify({
        cases: [{ dataset: "dev", case_id: "dev-1" }, { dataset: "heldout", case_id: "hidden" }],
        dev_metrics: { sample_size: 1 }, heldout_metrics: { sample_size: 1 }, combined_metrics: { sample_size: 2 }
      });
      return "[]";
    });
    const body = await (await GET()).json();
    expect(body.report.cases).toEqual([]);
    expect(body.report.dev_metrics).toBeNull();
    expect(body.report.provenance_status).toBe("legacy_unverified");
    expect(body.report.heldout_metrics).toBeNull();
    expect(body.report.combined_metrics).toBeNull();
  });

  it("recomputes a partial report from validated synthetic records instead of trusting saved aggregates", async () => {
    const benchmark = { id: "d1", dataset: "dev", original_request: "test", context: {}, is_ambiguous: false, expected_ambiguity_types: [], expected_interpretations: [], expected_clarification_behavior: "direct_answer", category: "clear", reference_criteria: [], expected_final_intent: "", risk_level: "low" };
    const record = {
      autonomy_mode: "collaborative", case_id: "d1", dataset: "dev", category: "clear", original_request: "test", context: {},
      ground_truth: { is_ambiguous: false, expected_ambiguity_types: [], expected_clarification_behavior: "direct_answer", reference_criteria: [], expected_final_intent: "", risk_level: "low" },
      baseline: { response: "ok", error: null, is_correct: true, made_incorrect_assumption: false, score_reason: "" },
      clarify_ai: { safety_events: [{type:"terminal", status:"ERROR"}], detector_output: null, predicted_ambiguous: false, clarification_questions: [], simulated_user_answers: [],
        clarification_turns: 0, final_status: "ERROR", resolved_intent: null, final_answer: null,
        span_total_proposed: 0, span_valid_count: 0, span_dropped_count: 0,
        outcome_category: "incorrect_resolution", is_correct: false, unnecessary_clarification: false,
        made_incorrect_assumption: false, score_reason: "", error: "detector failed" },
      api_calls: 1, retries: 0, timestamp: "now"
    };
    const cfg = getGeminiConfigStatus();
    const config = { dataset_version: DATASET_VERSION, scoring_version: SCORING_VERSION, safety_version: SAFETY_VERSION, prompt_version: PROMPT_VERSION, model_primary: cfg.primaryModel, model_fast: cfg.fastModel };
    const entry = { provenance: makeProvenance(benchmark as BenchmarkCase, config, false), record };
    vi.mocked(fs.readFile).mockImplementation(async file => String(file).includes("eval-results")
      ? JSON.stringify({ ...config, checkpoint_entries: [entry], cases: [record], status: "completed", dev_metrics: { sample_size: 1, resolution_accuracy: 1 } })
      : JSON.stringify([benchmark]));
    const body = await (await GET()).json();
    expect(body.report.status).toBe("partial");
    expect(body.report.provenance_status).toBe("validated");
    expect(body.report.dev_metrics.resolution_accuracy).toBeNull();
    expect(body.report.dev_metrics.api_error_rate).toBe(1);
    expect(body.report.heldout_metrics).toBeNull();
    entry.provenance.input_hash = "wrong";
    const mismatched = await (await GET()).json();
    expect(mismatched.report.provenance_status).toBe("unverified");
    expect(mismatched.report.dev_metrics).toBeNull();
    expect(mismatched.report.cases).toEqual([]);
  });

  it("marks an incompatible saved trajectory comparison unverified without exposing held-out data", async () => {
    vi.mocked(fs.readFile).mockImplementation(async file => {
      if (String(file).includes("eval-mode-comparison-dev-latest")) return JSON.stringify({version:"old", config:{}, groups:[{case_id:"d1"}]});
      return "[]";
    });
    const body = await (await GET()).json();
    expect(body.trajectory_comparison.status).toBe("unverified");
    expect(body.trajectory_comparison.matched_cases).toBe(0);
    expect(body.trajectory_comparison.rejected_groups).toBe(1);
    expect(body.trajectory_comparison.modes.every((m: {metrics: unknown}) => m.metrics === null)).toBe(true);
    expect(vi.mocked(fs.readFile).mock.calls.some(call => String(call[0]).includes("heldout-dataset"))).toBe(false);
  });

  it("uses dev-only artifacts and returns Not Run when no dev cases are available", async () => {
    vi.mocked(fs.readFile).mockImplementation(async file => String(file).includes("eval-results") ? JSON.stringify({cases: [], status: "completed", dev_metrics: {sample_size: 5}}) : "[]");
    const body = await (await GET()).json();
    expect(body.report.status).toBe("not_run");
    expect(body.report.total_cases).toBe(0);
    expect(body.report.dev_metrics).toBeNull();
    expect(vi.mocked(fs.readFile).mock.calls.some(call => String(call[0]).includes("eval-results-dev-latest.json"))).toBe(true);
    expect(vi.mocked(fs.readFile).mock.calls.some(call => String(call[0]).includes("eval-results-heldout"))).toBe(false);
  });
});
