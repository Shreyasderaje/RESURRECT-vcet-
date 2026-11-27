import defaultContextJson from "../../../data/default-context.json";
import presetsJson from "../../../data/preset-scenarios.json";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { getAIConfigStatus } from "@/lib/ai/ai-client";
import type { ConversationContext, PresetScenario } from "@/types/chat";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  const cfg = getAIConfigStatus();

  return (
    <ChatWorkspace
      presets={presetsJson as unknown as PresetScenario[]}
      defaultContext={defaultContextJson as unknown as ConversationContext}
      initialAiConfigured={cfg.hasApiKey}
      primaryModel={cfg.primaryModel}
      fastModel={cfg.fastModel}
      provider={cfg.provider}
    />
  );
}
