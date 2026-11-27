import defaultContextJson from "../../../data/default-context.json";
import presetsJson from "../../../data/preset-scenarios.json";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { getGeminiConfigStatus } from "@/lib/ai/gemini-client";
import type { ConversationContext, PresetScenario } from "@/types/chat";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  const cfg = getGeminiConfigStatus();

  return (
    <ChatWorkspace
      presets={presetsJson as unknown as PresetScenario[]}
      defaultContext={defaultContextJson as unknown as ConversationContext}
      initialAiConfigured={cfg.hasApiKey}
      primaryModel={cfg.primaryModel}
      fastModel={cfg.fastModel}
    />
  );
}
