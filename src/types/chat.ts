import type {
  DecisionResult,
  DetectorOutput,
  ResolverOutput,
  SpanValidationStats,
} from "./ambiguity";

export type ConversationStatus =
  | "ANALYZING"
  | "AWAITING_USER"
  | "RESOLVED"
  | "UNRESOLVED"
  | "CANCELLED";

export type AutonomyMode = "autonomous" | "collaborative" | "cautious";

export type PendingAction = "clarify" | "confirm" | "override" | null;

export interface WorkingAssumption {
  key: string;
  value: string;
}

export interface AssumptionOverride {
  key: string;
  newValue: string;
}

export interface ConversationContext {
  user_role?: string;
  workspace?: string;
  timezone?: string;
  current_date?: string;
  calendar_events?: Array<{
    id: string;
    title: string;
    date: string;
    time: string;
    attendees?: string[];
  }>;
  recent_files?: Array<{
    name: string;
    updated_at: string;
    owner?: string;
  }>;
  contacts?: Array<{
    name: string;
    role: string;
    email: string;
  }>;
  notes?: string;
  [key: string]: unknown;
}

export interface ClarificationTurn {
  turn: number;
  question: string;
  answer: string;
  timestamp: string;
}

export interface ConversationRecord {
  assumption_overrides?: WorkingAssumption[];
  inference_mode?: "live" | "demo";
  autonomy_mode?: AutonomyMode;
working_assumptions?: WorkingAssumption[];
overrideCount?: number;
  conversation_id: string;
  original_request: string;
  context: ConversationContext;
  clarification_answers: ClarificationTurn[];
  status: ConversationStatus;
  pending_action: PendingAction;
  clarification_turns: number;
  last_analysis: DetectorOutput | null;
  last_span_validation: SpanValidationStats | null;
  last_decision: DecisionResult | null;
  last_resolution: ResolverOutput | null;
  last_clarification_question: string | null;
  last_suggested_options: string[];
  confirmed_action: boolean;
  preset_id?: string | null;
  updated_at: string;
}
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  kind?:
    | "request"
    | "clarification_question"
    | "clarification_answer"
    | "confirmation_prompt"
    | "confirmation_answer"
    | "resolution"
    | "unresolved"
    | "cancelled"
    | "error";
  analysis?: DetectorOutput | null;
  span_validation?: SpanValidationStats | null;
}

export interface BaselineComparisonResult {
  available: boolean;
  mode: "live" | "demo" | "unavailable";
  model: string | null;
  response: string | null;
  assumed_interpretation?: string | null;
  error?: string | null;
}

export interface ChatApiRequest {
  conversation_id?: string;
  message: string;
  action?: "submit" | "reset" | "cancel" | "override";
  context?: ConversationContext;
  include_baseline?: boolean;
  demo_mode?: boolean;
  preset_id?: string;
  client_status?: ConversationStatus;
  client_turns?: number;
  conversation_snapshot?: ConversationRecord;
  autonomy_mode?: AutonomyMode;
  assumption_override?: AssumptionOverride;
  expected_override_count?: number;
}

export interface ChatApiResponse {
  conversation_id: string;
  status: ConversationStatus;
  pending_action: PendingAction;
  assistant_message: string;
  analysis: DetectorOutput | null;
  clarification_question: string | null;
  suggested_options: string[];
  resolved_intent: string | null;
  final_answer: string | null;
  clarification_turns: number;
  span_validation?: SpanValidationStats | null;
  decision?: DecisionResult | null;
  resolution?: ResolverOutput | null;
  baseline?: BaselineComparisonResult | null;
  conversation?: ConversationRecord;
  mode: "live" | "demo";
  error?: string | null;
  autonomy_mode?: AutonomyMode;
  working_assumptions?: WorkingAssumption[];
  overrideCount?: number;
  autonomy_suggestion?: "cautious" | null;
}

export interface PresetScenario {
  id: string;
  title: string;
  category:
    | "clear"
    | "referential"
    | "contextual"
    | "subjective"
    | "lexical_semantic"
    | "high_risk";
  badge: string;
  description: string;
  initial_request: string;
  context: ConversationContext;
  demo_turns: Array<{
    user_input: string;
    response: Omit<ChatApiResponse, "conversation_id" | "conversation">;
  }>;
  demo_baseline: BaselineComparisonResult;
}

export interface WorkingAssumption {
  key: string;
  value: string;
}

export interface AssumptionOverride {
  key: string;
  newValue: string;
}
