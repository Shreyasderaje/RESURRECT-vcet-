import type { AmbiguityType, DetectorOutput, RiskLevel } from "./ambiguity";
import type { AutonomyMode, ConversationContext } from "./chat";

export type DatasetCategory =
  | "clear"
  | "lexical"
  | "referential"
  | "contextual"
  | "subjective"
  | "syntactic"
  | "semantic"
  | "multi_turn";

export type ExpectedClarificationBehavior =
  | "direct_answer"
  | "clarify"
  | "confirm";

export interface BenchmarkCase {
  id: string;
  dataset: "dev" | "heldout";
  category: DatasetCategory;
  original_request: string;
  context: ConversationContext;
  is_ambiguous: boolean;
  expected_ambiguity_types: AmbiguityType[];
  expected_interpretations: string[];
  expected_clarification_behavior: ExpectedClarificationBehavior;
  required_slots?: Record<string, string>;
  reference_criteria: string[];
  expected_final_intent: string;
  simulated_user_persona_facts?: Record<string, string>;
  risk_level: RiskLevel;
}

export type ResolutionOutcomeCategory =
  | "correct_direct_answer"
  | "correct_clarification_and_resolution"
  | "incorrect_resolution"
  | "unresolved_request"
  | "unnecessary_clarification"
  | "incorrect_assumption"
  | "unscorable"
  | "cancelled_request"
  | "evaluation_error";

export type SafetyEvent =
  | { type: "decision"; action: "clarify" | "confirm" | "resolve" | "unresolved"; detector_risk: RiskLevel }
  | { type: "confirmation_reprompt" }
  | { type: "confirmation_response"; response: "approved" | "rejected" | "other" }
  | { type: "resolution_started" }
  | { type: "resolution_completed"; resolved: boolean }
  | { type: "terminal"; status: "RESOLVED" | "UNRESOLVED" | "CANCELLED" | "ERROR" };

export interface SafetyMetric { numerator: number; denominator: number; excluded: number; unavailable: number; rate: number | null }
export interface SafetyMetrics {
  confirmation_compliance: SafetyMetric; unsafe_resolution: SafetyMetric;
  cancellation_compliance: SafetyMetric; confirmation_interruption: SafetyMetric;
  unnecessary_confirmation: SafetyMetric;
}

export interface SelfConsistencyObservation {
  status: "not_requested" | "completed" | "failed" | "unavailable";
  decisions: boolean[];
  error: string | null;
}

export interface CaseEvaluationRecord {
  autonomy_mode?: AutonomyMode;
  case_id: string;
  dataset: "dev" | "heldout";
  category: DatasetCategory;
  original_request: string;
  context: ConversationContext;
  ground_truth: {
    is_ambiguous: boolean;
    expected_ambiguity_types: AmbiguityType[];
    expected_clarification_behavior: ExpectedClarificationBehavior;
    required_slots?: Record<string, string>;
    reference_criteria: string[];
    expected_final_intent: string;
    risk_level: RiskLevel;
  };
  baseline: {
    response: string | null;
    error: string | null;
    is_correct: boolean | null;
    made_incorrect_assumption: boolean | null;
    score_reason: string;
  };
  clarify_ai: {
    safety_events: SafetyEvent[];
    detector_output: DetectorOutput | null;
    predicted_ambiguous: boolean;
    clarification_questions: string[];
    simulated_user_answers: string[];
    clarification_turns: number;
    final_status: "RESOLVED" | "UNRESOLVED" | "CANCELLED" | "ERROR";
    resolved_intent: string | null;
    final_answer: string | null;
    span_total_proposed: number;
    span_valid_count: number;
    span_dropped_count: number;
    outcome_category: ResolutionOutcomeCategory;
    is_correct: boolean | null;
    unnecessary_clarification: boolean;
    made_incorrect_assumption: boolean | null;
    score_reason: string;
    error: string | null;
  };
  self_consistency_agreement?: number | null;
  self_consistency_observation?: SelfConsistencyObservation;
  shared_usage?: { api_calls: number; retries: number };
  api_calls: number;
  retries: number;
  timestamp: string;
}

export interface ConfusionMatrixCounts {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

export interface AggregateMetrics {
  sample_size: number;
  safety: SafetyMetrics;
  coverage: { detection: number; clarify: number; baseline: number; paired: number; paired_assumption: number;
    direct_answer: number; valid_turns: number; clarify_errors: number;
    baseline_errors: number; any_errors: number; clarify_unavailable: number; baseline_unavailable: number; any_unavailable: number; unresolved: number; cancelled: number };
  cancelled_request_rate: number | null;
  confusion_matrix: ConfusionMatrixCounts;
  detection_precision: number | null;
  detection_recall: number | null;
  detection_f1: number | null;
  resolution_accuracy: number | null;
  baseline_resolution_accuracy: number | null;
  unnecessary_clarification_rate: number | null;
  mean_clarification_turns: number | null;
  self_consistency_agreement_rate: number | null;
  self_consistency_coverage: { completed: number; failed: number; unavailable: number;
    not_requested: number; legacy_unknown: number; eligible: number };
  span_drop_rate: number | null;
  unresolved_request_rate: number | null;
  incorrect_assumption_rate: number | null;
  baseline_incorrect_assumption_rate: number | null;
  api_error_rate: number | null;
  outcome_breakdown: Record<ResolutionOutcomeCategory, number>;
}

export interface EvaluationReport {
  provenance_status?: "not_run" | "validated" | "legacy_unverified" | "unverified";
  run_id: string;
  dataset_version: string;
  scoring_version: string;
  safety_version: string;
  prompt_version: string;
  model_primary: string;
  model_fast: string;
  generated_at: string;
  status: "completed" | "partial" | "not_run";
  total_cases: number;
  dev_metrics: AggregateMetrics | null;
  heldout_metrics: AggregateMetrics | null;
  combined_metrics: AggregateMetrics | null;
  kappa_status: {
    status: "pending" | "computed";
    cohens_kappa: number | null;
    annotator_count: number;
    note: string;
  };
  cases: CaseEvaluationRecord[];
}
