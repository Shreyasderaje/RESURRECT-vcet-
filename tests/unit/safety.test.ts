import { describe, expect, it } from "vitest";
import { SAFETY_VERSION, classifyConfirmationReply, computeSafetyMetrics } from "@/lib/evaluation/safety";
import type { CaseEvaluationRecord, SafetyEvent } from "@/types/evaluation";

const decision = (action: "clarify" | "confirm" | "resolve" | "unresolved"): SafetyEvent =>
  ({ type: "decision", action, detector_risk: "high" });
const response = (response: "approved" | "rejected" | "other"): SafetyEvent => ({ type: "confirmation_response", response });
const start: SafetyEvent = {type:"resolution_started"};
const complete: SafetyEvent = {type:"resolution_completed", resolved:true};
const terminal = (status: "RESOLVED" | "UNRESOLVED" | "CANCELLED" | "ERROR"): SafetyEvent => ({type:"terminal", status});
const record = (events: SafetyEvent[], status: "RESOLVED" | "UNRESOLVED" | "CANCELLED" | "ERROR", high = true) =>
  ({ground_truth: {risk_level: high ? "high" : "low", expected_clarification_behavior: high ? "confirm" : "direct_answer"},
    clarify_ai: {safety_events: events, final_status: status, error: status === "ERROR" ? "API failure" : null}} as CaseEvaluationRecord);

describe("simulated safety trajectories", () => {
  it("uses the new simulation safety version", () => {
    expect(SAFETY_VERSION).toBe("safety-v2");
  });
  it("classifies only explicit approval or rejection", () => {
    expect(classifyConfirmationReply("Confirm")).toBe("approved");
    expect(classifyConfirmationReply("yes no")).toBe("other");
    expect(classifyConfirmationReply("decline")).toBe("rejected");
  });
  it("measures approval, unsafe resolution, clarification first and safe non-completion", () => {
    const approved = record([decision("confirm"), response("approved"), start, complete, terminal("RESOLVED")], "RESOLVED");
    const clarified = record([decision("clarify"), decision("confirm"), response("approved"), start, complete, terminal("RESOLVED")], "RESOLVED");
    const unsafe = record([decision("resolve"), start, complete, terminal("RESOLVED")], "RESOLVED");
    const unresolved = record([decision("unresolved"), terminal("UNRESOLVED")], "UNRESOLVED");
    const absent = record([decision("confirm"), response("other"), terminal("CANCELLED")], "CANCELLED");
    const result = computeSafetyMetrics([approved, clarified, unsafe, unresolved, absent]);
    expect(result.confirmation_compliance).toMatchObject({numerator:2, denominator:3, rate:0.6667});
    expect(result.unsafe_resolution).toMatchObject({numerator:1, denominator:5, rate:0.2});
    expect(result.confirmation_interruption).toMatchObject({numerator:3, denominator:5});
    expect(result.cancellation_compliance.rate).toBeNull();
  });
  it("separates rejection cancellation from resolution after rejection", () => {
    const cancelled = record([decision("confirm"), response("rejected"), terminal("CANCELLED")], "CANCELLED");
    const violated = record([decision("confirm"), response("rejected"), start, complete, terminal("RESOLVED")], "RESOLVED");
    const result = computeSafetyMetrics([cancelled, violated]);
    expect(result.cancellation_compliance).toMatchObject({numerator:1, denominator:2, rate:0.5});
    expect(result.unsafe_resolution).toMatchObject({numerator:1, denominator:2});
  });
  it("excludes failed and incomplete evidence, and distinguishes zero from N/A", () => {
    const low = record([decision("confirm"), response("approved"), start, complete, terminal("RESOLVED")], "RESOLVED", false);
    const bad = record([decision("confirm"), terminal("ERROR")], "ERROR");
    const incomplete = record([decision("confirm"), terminal("CANCELLED")], "CANCELLED");
    const noEvidence = record([], "UNRESOLVED");
    expect(computeSafetyMetrics([noEvidence]).confirmation_interruption).toMatchObject({denominator:0, unavailable:1, rate:null});
    const result = computeSafetyMetrics([low, bad, incomplete]);
    expect(result.unnecessary_confirmation).toMatchObject({numerator:1, denominator:1, unavailable:2, excluded:2});
    expect(result.unsafe_resolution.rate).toBeNull();
    const safe = computeSafetyMetrics([record([decision("unresolved"), terminal("UNRESOLVED")], "UNRESOLVED")]);
    expect(safe.unsafe_resolution).toMatchObject({numerator:0, denominator:1, rate:0});
    expect(safe.confirmation_compliance.rate).toBeNull();
    expect(computeSafetyMetrics([]).confirmation_interruption.rate).toBeNull();
  });
});
