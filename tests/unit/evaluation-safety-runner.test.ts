import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BenchmarkCase } from "@/types/evaluation";
import { MAX_CONFIRMATION_REPLIES, evaluateSingleCase } from "@/lib/evaluation/runner";
import { computeSafetyMetrics } from "@/lib/evaluation/safety";

vi.mock("@/lib/ai/baseline", () => ({ runBaselineAssistant: vi.fn(async () => ({available:true, response:"ok", error:null})) }));
vi.mock("@/lib/ai/detector", () => ({ detectAmbiguity: vi.fn(async () => ({analysis:{risk_level:"high", is_ambiguous:false}, spanValidation:{total_proposed:0,valid_count:0,dropped_count:0}})) }));
vi.mock("@/lib/ai/decision-engine", () => ({ MAX_CLARIFICATION_TURNS:2, evaluateDecision: vi.fn(() => ({action:"confirm", question:"Confirm?", suggested_options:[]})) }));
vi.mock("@/lib/evaluation/user-simulator", () => ({ simulateUserAnswer: vi.fn() }));
vi.mock("@/lib/ai/resolver", () => ({ resolveRequest: vi.fn(async () => ({resolution:{is_fully_resolved:true,resolved_intent:"ok",final_answer:"ok",extracted_slots:[]}})) }));
import { resolveRequest } from "@/lib/ai/resolver";
import { detectAmbiguity } from "@/lib/ai/detector";
import { evaluateDecision } from "@/lib/ai/decision-engine";
import { simulateUserAnswer } from "@/lib/evaluation/user-simulator";

const benchmark = {id:"synthetic",dataset:"dev",category:"clear",original_request:"test",context:{},
 is_ambiguous:false,expected_ambiguity_types:[],expected_interpretations:[],
 expected_clarification_behavior:"confirm",reference_criteria:["ok"],expected_final_intent:"ok",risk_level:"high"} as BenchmarkCase;

describe("evaluation runner safety recording", () => {
  beforeEach(() => vi.clearAllMocks());
  it("records the observed approval before simulated resolution", async () => {
    vi.mocked(simulateUserAnswer).mockResolvedValue({answer:"Confirm"} as never);
    const result = await evaluateSingleCase(benchmark);
    expect(result.clarify_ai.safety_events.map(e => e.type)).toEqual(["decision","confirmation_response","resolution_started","resolution_completed","terminal"]);
    expect(computeSafetyMetrics([result]).confirmation_compliance.rate).toBe(1);
  });
  it("keeps the previously unsafe contradictory reply unresolved after bounded retries", async () => {
    vi.mocked(simulateUserAnswer).mockResolvedValue({answer:"yes no"} as never);
    const result = await evaluateSingleCase(benchmark);
    expect(result.clarify_ai.final_status).toBe("UNRESOLVED");
    expect(simulateUserAnswer).toHaveBeenCalledTimes(MAX_CONFIRMATION_REPLIES);
    expect(resolveRequest).not.toHaveBeenCalled();
    expect(computeSafetyMetrics([result]).unsafe_resolution.rate).toBe(0);
    expect(result.clarify_ai.safety_events.map(e => e.type)).toEqual([
      "decision", "confirmation_response", "confirmation_reprompt", "confirmation_response",
      "confirmation_reprompt", "confirmation_response", "terminal",
    ]);
  });
  it("records an explicit rejection followed by cancellation", async () => {
    vi.mocked(simulateUserAnswer).mockResolvedValue({answer:"Cancel"} as never);
    const result = await evaluateSingleCase(benchmark);
    expect(result.clarify_ai.final_status).toBe("CANCELLED");
    expect(computeSafetyMetrics([result]).cancellation_compliance.rate).toBe(1);
  });

  it("reprompts an unrelated reply and resolves only after explicit approval", async () => {
    vi.mocked(simulateUserAnswer).mockResolvedValueOnce({answer:"maybe later"} as never)
      .mockResolvedValueOnce({answer:"Confirm"} as never);
    const result = await evaluateSingleCase(benchmark, {autonomyMode:"cautious"});
    expect(result.clarify_ai.final_status).toBe("RESOLVED");
    expect(result.clarify_ai.safety_events.map(e => e.type)).toEqual([
      "decision", "confirmation_response", "confirmation_reprompt", "confirmation_response",
      "resolution_started", "resolution_completed", "terminal",
    ]);
    expect(computeSafetyMetrics([result]).confirmation_compliance.rate).toBe(1);
    expect(vi.mocked(simulateUserAnswer).mock.calls[1][0].priorAnswers).toContainEqual({question:"Confirm?",answer:"maybe later"});
    expect(vi.mocked(evaluateDecision).mock.calls[0][0].autonomy_mode).toBe("cautious");
  });

  it("treats empty or missing replies as unrelated and remains bounded", async () => {
    vi.mocked(simulateUserAnswer).mockResolvedValueOnce({answer:""} as never)
      .mockResolvedValueOnce({} as never).mockResolvedValueOnce({answer:"  "} as never);
    const result = await evaluateSingleCase(benchmark);
    expect(result.clarify_ai.final_status).toBe("UNRESOLVED");
    expect(resolveRequest).not.toHaveBeenCalled();
    expect(result.clarify_ai.safety_events.filter(e => e.type === "confirmation_response"))
      .toEqual([{type:"confirmation_response",response:"other"},{type:"confirmation_response",response:"other"},{type:"confirmation_response",response:"other"}]);
  });

  it("keeps the chosen mode through clarification followed by valid approval", async () => {
    vi.mocked(evaluateDecision).mockReturnValueOnce({action:"clarify",question:"Which?",suggested_options:[]} as never)
      .mockReturnValueOnce({action:"confirm",question:"Confirm?",suggested_options:[]} as never);
    vi.mocked(simulateUserAnswer).mockResolvedValueOnce({answer:"Option A"} as never)
      .mockResolvedValueOnce({answer:"Confirm action"} as never);
    const result = await evaluateSingleCase(benchmark, {autonomyMode:"collaborative"});
    expect(result.clarify_ai.final_status).toBe("RESOLVED");
    expect(vi.mocked(evaluateDecision).mock.calls.map(c=>c[0].autonomy_mode)).toEqual(["collaborative","collaborative"]);
    expect(result.clarify_ai.safety_events.map(e=>e.type)).toEqual([
      "decision","decision","confirmation_response","resolution_started","resolution_completed","terminal",
    ]);
    expect(computeSafetyMetrics([result]).confirmation_compliance.rate).toBe(1);
  });

  it("continues after clarification and respects a subsequent rejection", async () => {
    vi.mocked(evaluateDecision).mockReturnValueOnce({action:"clarify",question:"Which?",suggested_options:[]} as never)
      .mockReturnValueOnce({action:"confirm",question:"Confirm?",suggested_options:[]} as never);
    vi.mocked(simulateUserAnswer).mockResolvedValueOnce({answer:"Option A"} as never)
      .mockResolvedValueOnce({answer:"not sure"} as never).mockResolvedValueOnce({answer:"Cancel"} as never);
    const result = await evaluateSingleCase(benchmark, {autonomyMode:"autonomous"});
    expect(result.clarify_ai.final_status).toBe("CANCELLED");
    expect(resolveRequest).not.toHaveBeenCalled();
    expect(result.clarify_ai.safety_events.map(e=>e.type)).toEqual([
      "decision","decision","confirmation_response","confirmation_reprompt","confirmation_response","terminal",
    ]);
    expect(computeSafetyMetrics([result]).cancellation_compliance.rate).toBe(1);
    expect(vi.mocked(evaluateDecision).mock.calls.map(c=>c[0].autonomy_mode)).toEqual(["autonomous","autonomous"]);
  });

  it("records the three initial-context detector decisions and their agreement", async () => {
    const pass = (value:boolean) => ({analysis:{risk_level:"high", is_ambiguous:false, clarification_required:value},
      spanValidation:{total_proposed:0,valid_count:0,dropped_count:0}} as never);
    vi.mocked(detectAmbiguity).mockResolvedValueOnce(pass(true)).mockResolvedValueOnce(pass(false)).mockResolvedValueOnce(pass(true));
    vi.mocked(simulateUserAnswer).mockResolvedValue({answer:"Confirm"} as never);
    const result = await evaluateSingleCase(benchmark, {runSelfConsistencySubset:true});
    expect(result.self_consistency_observation).toEqual({status:"completed", decisions:[true,false,true], error:null});
    expect(result.self_consistency_agreement).toBeCloseTo(2/3);
    expect(vi.mocked(detectAmbiguity).mock.calls.slice(1).every(call => call[0].clarificationAnswers.length === 0)).toBe(true);
  });

  it("reports self-consistency provider failure without inventing a score", async () => {
    vi.mocked(detectAmbiguity).mockResolvedValueOnce({analysis:{risk_level:"high",is_ambiguous:false,clarification_required:true},
      spanValidation:{total_proposed:0,valid_count:0,dropped_count:0}} as never)
      .mockRejectedValueOnce(new Error("provider failure"));
    vi.mocked(simulateUserAnswer).mockResolvedValue({answer:"Confirm"} as never);
    const result = await evaluateSingleCase(benchmark, {runSelfConsistencySubset:true});
    expect(result.self_consistency_observation).toMatchObject({status:"failed",decisions:[true]});
    expect(result.self_consistency_agreement).toBeNull();
    expect(result.self_consistency_observation?.error).toBeTruthy();
  });
});
