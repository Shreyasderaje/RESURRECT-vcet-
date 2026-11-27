import { z } from "zod";

export const AmbiguityTypeEnum = z.enum([
  "lexical",
  "referential",
  "contextual",
  "subjective",
  "syntactic",
  "semantic",
  "pragmatic",
]);

export const RiskLevelEnum = z.enum(["low", "medium", "high"]);

export const AmbiguousSpanSchema = z.object({
  phrase: z.string().trim().min(1).max(160),
  type: AmbiguityTypeEnum,
  reason: z.string().trim().min(1).max(320),
  interpretations: z.array(z.string().trim().min(1).max(160)).max(5),
  start_index: z.number().int().nonnegative().optional(),
  end_index: z.number().int().nonnegative().optional(),
});

export const DetectorOutputSchema = z.object({
  is_ambiguous: z.boolean(),
  ambiguity_types: z.array(AmbiguityTypeEnum).max(7),
  ambiguous_spans: z.array(AmbiguousSpanSchema).max(8),
  possible_interpretations: z.array(z.string().trim().min(1).max(240)).max(6),
  missing_information: z.array(z.string().trim().min(1).max(180)).max(8),
  risk_level: RiskLevelEnum,
  clarification_required: z.boolean(),
  clarification_reason: z.string().trim().min(1).max(450),
  clarification_question: z.string().trim().min(1).max(320).nullable(),
  suggested_options: z.array(z.string().trim().min(1).max(120)).max(5),
  resolved_intent: z.string().trim().min(1).max(450).nullable(),
});

export const ResolverSlotSchema = z.object({
  key: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(240),
});

export const ResolverOutputSchema = z.object({
  resolved_intent: z.string().trim().min(1).max(450),
  final_answer: z.string().trim().min(1).max(4000),
  remaining_uncertainties: z.array(z.string().trim().min(1).max(240)).max(6),
  clarification_impact: z.string().trim().min(1).max(450),
  is_fully_resolved: z.boolean(),
  extracted_slots: z.array(ResolverSlotSchema).max(12).optional(),
});

export const ConversationStatusEnum = z.enum([
  "ANALYZING",
  "AWAITING_USER",
  "RESOLVED",
  "UNRESOLVED",
  "CANCELLED",
]);

export const PendingActionEnum = z.enum(["clarify", "confirm"]).nullable();

export const ConversationContextSchema = z
  .object({
    user_role: z.string().max(120).optional(),
    workspace: z.string().max(120).optional(),
    timezone: z.string().max(80).optional(),
    current_date: z.string().max(40).optional(),
    calendar_events: z
      .array(
        z.object({
          id: z.string().max(80),
          title: z.string().max(200),
          date: z.string().max(40),
          time: z.string().max(40),
          attendees: z.array(z.string().max(120)).max(20).optional(),
        })
      )
      .max(30)
      .optional(),
    recent_files: z
      .array(
        z.object({
          name: z.string().max(200),
          updated_at: z.string().max(40),
          owner: z.string().max(120).optional(),
        })
      )
      .max(30)
      .optional(),
    contacts: z
      .array(
        z.object({
          name: z.string().max(120),
          role: z.string().max(120),
          email: z.string().max(160),
        })
      )
      .max(30)
      .optional(),
    notes: z.string().max(1000).optional(),
  })
  .passthrough();

export const ChatApiRequestSchema = z.object({
  conversation_id: z.string().trim().min(1).max(120).optional(),
  message: z.string().trim().min(1).max(2000),
  action: z.enum(["submit", "reset", "cancel", "override"]).default("submit"),
  context: ConversationContextSchema.optional(),
  include_baseline: z.boolean().default(true),
  demo_mode: z.boolean().optional(),
  preset_id: z.string().trim().max(80).optional(),
  client_status: ConversationStatusEnum.optional(),
  client_turns: z.number().int().min(0).max(10).optional(),
  autonomy_mode: z.enum(["autonomous", "collaborative", "cautious"]).optional(),
  assumption_override: z
    .object({
      key: z.string().trim().min(1).max(120),
      newValue: z.string().trim().min(1).max(240),
    })
    .optional(),
});

export const DETECTOR_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_ambiguous",
    "ambiguity_types",
    "ambiguous_spans",
    "possible_interpretations",
    "missing_information",
    "risk_level",
    "clarification_required",
    "clarification_reason",
    "clarification_question",
    "suggested_options",
    "resolved_intent",
  ],
  properties: {
    is_ambiguous: { type: "boolean" },
    ambiguity_types: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "lexical",
          "referential",
          "contextual",
          "subjective",
          "syntactic",
          "semantic",
          "pragmatic",
        ],
      },
    },
    ambiguous_spans: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["phrase", "type", "reason", "interpretations"],
        properties: {
          phrase: { type: "string" },
          type: {
            type: "string",
            enum: [
              "lexical",
              "referential",
              "contextual",
              "subjective",
              "syntactic",
              "semantic",
              "pragmatic",
            ],
          },
          reason: { type: "string" },
          interpretations: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
    possible_interpretations: {
      type: "array",
      items: { type: "string" },
    },
    missing_information: {
      type: "array",
      items: { type: "string" },
    },
    risk_level: {
      type: "string",
      enum: ["low", "medium", "high"],
    },
    clarification_required: { type: "boolean" },
    clarification_reason: { type: "string" },
    clarification_question: {
      type: ["string", "null"],
    },
    suggested_options: {
      type: "array",
      items: { type: "string" },
    },
    resolved_intent: {
      type: ["string", "null"],
    },
  },
} as const;

export const RESOLVER_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "resolved_intent",
    "final_answer",
    "remaining_uncertainties",
    "clarification_impact",
    "is_fully_resolved",
    "extracted_slots",
  ],
  properties: {
    resolved_intent: { type: "string" },
    final_answer: { type: "string" },
    remaining_uncertainties: {
      type: "array",
      items: { type: "string" },
    },
    clarification_impact: { type: "string" },
    is_fully_resolved: { type: "boolean" },
    extracted_slots: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "value"],
        properties: {
          key: { type: "string" },
          value: { type: "string" },
        },
      },
    },
  },
} as const;
