// @vitest-environment node
import { describe, expect, it } from "vitest";
import { artifactPaths, makeProvenance, parseCheckpoint, selectCheckpoints } from "@/lib/evaluation/checkpoints";
import type { BenchmarkCase, CaseEvaluationRecord } from "@/types/evaluation";
const c = { id: "d1", dataset: "dev", original_request: "test", context: {} } as BenchmarkCase;
const config = { dataset_version: "v1", scoring_version: "scorer-v2", safety_version: "safety-v2", prompt_version: "p1", model_primary: "m1", model_fast: "m2" };
const rec = { autonomy_mode: "collaborative", case_id: "d1", dataset: "dev", category: "clear", original_request: "test", context: {},
  ground_truth: { is_ambiguous: false, expected_ambiguity_types: [], expected_clarification_behavior: "direct_answer", reference_criteria: [], expected_final_intent: "", risk_level: "low" },
  baseline: { response: "ok", error: null, is_correct: true, made_incorrect_assumption: false, score_reason: "" },
  clarify_ai: { safety_events: [{type:"decision", action:"resolve", detector_risk:"low"}, {type:"resolution_started"}, {type:"resolution_completed", resolved:true}, {type:"terminal", status:"RESOLVED"}], detector_output: { is_ambiguous: false, ambiguity_types: [], ambiguous_spans: [], possible_interpretations: [], missing_information: [], risk_level: "low", clarification_required: false, clarification_reason: "clear", clarification_question: null, suggested_options: [], resolved_intent: null }, predicted_ambiguous: false, clarification_questions: [], simulated_user_answers: [],
    clarification_turns: 0, final_status: "RESOLVED", resolved_intent: "", final_answer: "", span_total_proposed: 0,
    span_valid_count: 0, span_dropped_count: 0, outcome_category: "correct_direct_answer", is_correct: true,
    unnecessary_clarification: false, made_incorrect_assumption: false, score_reason: "", error: null },
  api_calls: 1, retries: 0, timestamp: "now" } as CaseEvaluationRecord;
const entry = { provenance: makeProvenance(c, config, false), record: rec };
describe("split checkpoint artifacts", () => {
  it("isolates every checkpoint and report path for dev and held-out", () => {
    const dev = artifactPaths("dev"), held = artifactPaths("heldout");
    expect(new Set([dev.checkpoint, dev.report, held.checkpoint, held.report]).size).toBe(4);
    expect(dev.checkpoint).toContain("dev"); expect(held.checkpoint).toContain("heldout");
  });
  it("recovers preceding and following records and reports malformed lines", () => {
    const parsed = parseCheckpoint(JSON.stringify(entry) + "\n{broken\n" + JSON.stringify(entry) + "\n{\"last\":");
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.issues).toEqual([{line: 2, reason: "malformed_json"}, {line: 4, reason: "malformed_json"}]);
  });
  it("retains the last valid matching duplicate without losing valid records to conflicts", () => {
    const later = { ...entry, record: {...rec, timestamp: "later"} };
    const wrong = { ...entry, provenance: {...entry.provenance, model_primary: "other"} };
    const selected = selectCheckpoints([c], [entry, wrong, later], config);
    expect(selected.selected.get("d1")?.record.timestamp).toBe("later");
    expect(selected.issues.map(i => i.reason)).toEqual(["configuration_mismatch", "duplicate_superseded"]);
  });
  it("rejects mode-mismatched or mode-less checkpoints", () => {
    const wrong = {...entry, provenance: {...entry.provenance, autonomy_mode: "autonomous"}};
    const legacy = {...entry, record: {...rec, autonomy_mode: undefined}};
    expect(selectCheckpoints([c], [wrong, legacy], config).issues.map(i => i.reason)).toEqual(["mode_mismatch", "mode_mismatch"]);
  });
  it("rejects stale or missing scoring versions", () => {
    const stale = {...entry, provenance: {...entry.provenance, scoring_version: "scorer-v1"}};
    const legacy = {...entry, provenance: {...entry.provenance, scoring_version: undefined}};
    expect(selectCheckpoints([c], [stale, legacy], config).issues.map(i => i.reason)).toEqual(["configuration_mismatch", "configuration_mismatch"]);
    const noSafety = {...entry, provenance: {...entry.provenance, safety_version: undefined}};
    const oldSafety = {...entry, provenance: {...entry.provenance, safety_version: "safety-v1"}};
    expect(selectCheckpoints([c], [noSafety, oldSafety], config).issues.map(i => i.reason)).toEqual(["configuration_mismatch", "configuration_mismatch"]);
  });
  it("does not resume a requested self-consistency check when failed or legacy", () => {
    const wanted = {...entry, provenance:{...entry.provenance,self_consistency:true}};
    const failed = {...wanted,record:{...rec,self_consistency_agreement:null,
      self_consistency_observation:{status:"failed",decisions:[true],error:"failure"}}};
    const good = {...wanted,record:{...rec,self_consistency_agreement:2/3,
      self_consistency_observation:{status:"completed",decisions:[true,false,true],error:null}}};
    expect(selectCheckpoints([c],[wanted,failed],config,()=>true).issues.map(i=>i.reason))
      .toEqual(["self_consistency_incomplete_or_legacy","self_consistency_incomplete_or_legacy"]);
    expect(selectCheckpoints([c],[good],config,()=>true).selected.size).toBe(1);
  });
  it("rejects corrupt records even when their provenance matches", () => {
    const broken = {...entry, record: {...rec, clarify_ai: {...rec.clarify_ai, detector_output: null}}};
    const result = selectCheckpoints([c], [broken], config);
    expect(result.selected.size).toBe(0);
    expect(result.issues[0].reason).toBe("invalid_record");
  });
  it("rejects legacy, changed benchmark, wrong split, self-consistency and failed records", () => {
    const failed = {...entry, record: {...rec, clarify_ai: {...rec.clarify_ai, error: "failed"}}};
    const changed = {...entry, provenance: {...entry.provenance, input_hash: "wrong"}};
    const held = {...entry, record: {...rec, dataset: "heldout"}};
    const result = selectCheckpoints([c], [rec, changed, held, entry, failed], config, () => true);
    expect(result.selected.size).toBe(0);
    expect(result.issues.map(i => i.reason)).toEqual(["missing_provenance", "case_hash_mismatch", "unknown_case_or_split", "configuration_mismatch", "configuration_mismatch"]);
  });
});
