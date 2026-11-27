export type AmbiguityType =
  | "lexical"
  | "referential"
  | "contextual"
  | "subjective"
  | "syntactic"
  | "semantic"
  | "pragmatic";

export type RiskLevel = "low" | "medium" | "high";

export interface AmbiguousSpan {
  phrase: string;
  type: AmbiguityType;
  reason: string;
  interpretations: string[];
  start_index?: number;
  end_index?: number;
}

export interface SpanValidationStats {
  total_proposed: number;
  valid_count: number;
  dropped_count: number;
  dropped_phrases: string[];
  span_drop_rate: number;
  source_text: string;
}

export interface DetectorOutput {
  is_ambiguous: boolean;
  ambiguity_types: AmbiguityType[];
  ambiguous_spans: AmbiguousSpan[];
  possible_interpretations: string[];
  missing_information: string[];
  risk_level: RiskLevel;
  clarification_required: boolean;
  clarification_reason: string;
  clarification_question: string | null;
  suggested_options: string[];
  resolved_intent: string | null;
}

export interface DecisionResult {
  action: "resolve" | "clarify" | "confirm" | "unresolved";
  clarification_required: boolean;
  confirmation_required: boolean;
  reason: string;
  question: string | null;
  suggested_options: string[];
  remaining_budget: number;
}

export interface ResolverSlot {
  key: string;
  value: string;
}

export interface ResolverOutput {
  resolved_intent: string;
  final_answer: string;
  remaining_uncertainties: string[];
  clarification_impact: string;
  is_fully_resolved: boolean;
  extracted_slots?: ResolverSlot[];
}
