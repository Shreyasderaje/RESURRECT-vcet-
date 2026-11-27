import type { ConversationContext } from "@/types/chat";
import { generatePlainText, getGeminiConfigStatus } from "@/lib/ai/gemini-client";

export interface UserSimulatorInput {
  originalRequest: string;
  context: ConversationContext;
  clarificationQuestion: string;
  suggestedOptions: string[];
  /**
   * User-side intent facts (what the user has in mind), intentionally isolated
   * from ground-truth scoring labels (reference_criteria / expected_final_intent).
   */
  personaFacts?: Record<string, string>;
  priorAnswers: Array<{ question: string; answer: string }>;
  model?: string;
}

/**
 * Simulates a realistic user answering ClarifyAI's clarification question.
 * Never receives ground-truth scoring labels (expected_final_intent,
 * reference_criteria, or required_slots).
 */
export async function simulateUserAnswer(
  input: UserSimulatorInput
): Promise<{ answer: string; modelUsed: string }> {
  const cfg = getGeminiConfigStatus();
  const factsText =
    input.personaFacts && Object.keys(input.personaFacts).length > 0
      ? Object.entries(input.personaFacts)
          .map(([k, v]) => `- ${k}: ${v}`)
          .join("\n")
      : "No additional private preferences; pick the most specific, realistic clarification based on the context.";

  const systemInstruction = `You are a simulated user responding to an AI assistant's clarification question.
Answer concisely in 1-2 sentences using ONLY your persona intent facts and the provided context.
Do not invent unrelated requirements. If the assistant asks for confirmation of a high-risk action, reply "Confirm" only if your persona facts indicate approval, otherwise reply "Cancel".`;

  const userPrompt = `Your original request: "${input.originalRequest}"
Your underlying intent details:
${factsText}

Workspace context:
${JSON.stringify(input.context, null, 2)}

Prior Q&A:
${
  input.priorAnswers.length > 0
    ? input.priorAnswers
        .map((p, i) => `Q${i + 1}: ${p.question}\nA${i + 1}: ${p.answer}`)
        .join("\n")
    : "None"
}

Assistant's current question: "${input.clarificationQuestion}"
Suggested options: ${
    input.suggestedOptions.length > 0
      ? input.suggestedOptions.join(" | ")
      : "None"
  }

Provide your concise reply as the user.`;

  const { text, modelUsed } = await generatePlainText({
    model: input.model ?? cfg.fastModel,
    systemInstruction,
    userPrompt,
    temperature: 0.1,
  });

  return { answer: text.trim(), modelUsed };
}
