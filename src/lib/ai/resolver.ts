import type { DetectorOutput, ResolverOutput } from "@/types/ambiguity";
import type { ClarificationTurn, ConversationContext } from "@/types/chat";
import {
  generateStructuredJson,
  getAIConfigStatus,
} from "./ai-client";
import { buildResolverPrompt } from "./prompts";
import { RESOLVER_JSON_SCHEMA, ResolverOutputSchema } from "./schemas";

export async function resolveRequest(params: {
  originalRequest: string;
  context: ConversationContext;
  clarificationAnswers: ClarificationTurn[];
  analysis: DetectorOutput;
  confirmedHighRiskAction: boolean;
  model?: string;
}): Promise<{ resolution: ResolverOutput; modelUsed: string }> {
  const cfg = getAIConfigStatus();
  const { systemInstruction, userPrompt } = buildResolverPrompt({
    originalRequest: params.originalRequest,
    context: params.context,
    clarificationAnswers: params.clarificationAnswers,
    analysis: params.analysis,
    confirmedHighRiskAction: params.confirmedHighRiskAction,
  });

  const { parsedJson, modelUsed } = await generateStructuredJson<unknown>({
    model: params.model ?? cfg.primaryModel,
    systemInstruction,
    userPrompt,
    responseJsonSchema: RESOLVER_JSON_SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.2,
  });

  const validated = ResolverOutputSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new Error(
      `Resolver output failed schema validation: ${validated.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`
    );
  }

  return {
    resolution: validated.data,
    modelUsed,
  };
}
