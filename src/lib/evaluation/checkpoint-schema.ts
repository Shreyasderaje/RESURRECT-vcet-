import { z } from "zod";
import { DetectorOutputSchema } from "@/lib/ai/schemas";

export const SavedEvaluationRecordSchema = z.object({
  case_id: z.string().min(1), dataset: z.enum(["dev", "heldout"]), category: z.string(),
  original_request: z.string(), context: z.record(z.string(), z.unknown()),
  ground_truth: z.object({
    is_ambiguous: z.boolean(), expected_ambiguity_types: z.array(z.string()),
    expected_clarification_behavior: z.enum(["direct_answer", "clarify", "confirm"]),
    reference_criteria: z.array(z.string()), expected_final_intent: z.string(), risk_level: z.string(),
  }).passthrough(),
  baseline: z.object({
    response: z.string().nullable(), error: z.string().nullable(), is_correct: z.boolean().nullable(),
    made_incorrect_assumption: z.boolean().nullable(), score_reason: z.string(),
  }),
  clarify_ai: z.object({
    safety_events: z.array(z.discriminatedUnion("type", [
      z.object({type: z.literal("decision"), action: z.enum(["clarify","confirm","resolve","unresolved"]), detector_risk: z.enum(["low","medium","high"])}),
      z.object({type: z.literal("confirmation_reprompt")}),
      z.object({type: z.literal("confirmation_response"), response: z.enum(["approved","rejected","other"])}),
      z.object({type: z.literal("resolution_started")}),
      z.object({type: z.literal("resolution_completed"), resolved: z.boolean()}),
      z.object({type: z.literal("terminal"), status: z.enum(["RESOLVED","UNRESOLVED","CANCELLED","ERROR"])}),
    ])),
    detector_output: DetectorOutputSchema, predicted_ambiguous: z.boolean(),
    clarification_questions: z.array(z.string()), simulated_user_answers: z.array(z.string()),
    clarification_turns: z.number().int().nonnegative(),
    final_status: z.enum(["RESOLVED", "UNRESOLVED", "CANCELLED", "ERROR"]),
    resolved_intent: z.string().nullable(), final_answer: z.string().nullable(),
    span_total_proposed: z.number().nonnegative(), span_valid_count: z.number().nonnegative(),
    span_dropped_count: z.number().nonnegative(),
    outcome_category: z.enum(["correct_direct_answer", "correct_clarification_and_resolution", "incorrect_resolution", "unresolved_request", "unnecessary_clarification", "incorrect_assumption", "unscorable", "cancelled_request", "evaluation_error"]),
    is_correct: z.boolean().nullable(), unnecessary_clarification: z.boolean(),
    made_incorrect_assumption: z.boolean().nullable(), score_reason: z.string(), error: z.string().nullable(),
  }),
  self_consistency_observation: z.object({
    status: z.enum(["not_requested","completed","failed","unavailable"]),
    decisions: z.array(z.boolean()).max(3), error: z.string().nullable(),
  }).optional(),
  self_consistency_agreement: z.number().finite().min(0).max(1).nullable().optional(),
  api_calls: z.number().nonnegative(), retries: z.number().nonnegative(), timestamp: z.string(),
}).passthrough();
