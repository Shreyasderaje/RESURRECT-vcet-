"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Columns2,
  Loader2,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { AmbiguityHeatmap } from "@/components/ambiguity/ambiguity-heatmap";
import { AmbiguityPanel } from "@/components/ambiguity/ambiguity-panel";
import { ResolvedPromptCard } from "@/components/ambiguity/resolved-prompt-card";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageContainer } from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createStableId } from "@/lib/utils/ids";
import type {
  AutonomyMode,
  AssumptionOverride,
  BaselineComparisonResult,
  ChatApiResponse,
  ChatMessage,
  ClarificationTurn,
  ConversationContext,
  ConversationStatus,
  PendingAction,
  PresetScenario,
  WorkingAssumption,
} from "@/types/chat";
import type {
  DecisionResult,
  DetectorOutput,
  ResolverOutput,
  SpanValidationStats,
} from "@/types/ambiguity";
import { AutonomyDial } from "./autonomy-dial";
import { AssumptionsBar } from "./assumptions-bar";
import { ChatInput } from "./chat-input";
import { ContextDrawer } from "./context-drawer";
import { MessageBubble } from "./message-bubble";
import { PresetChips } from "./preset-chips";
import { QuickReplyChips } from "./quick-reply-chips";
import { SideBySideView } from "./side-by-side-view";

interface ChatWorkspaceProps {
  presets: PresetScenario[];
  defaultContext: ConversationContext;
  initialAiConfigured: boolean;
  primaryModel: string;
  fastModel: string;
}

export function ChatWorkspace({
  presets,
  defaultContext,
  initialAiConfigured,
  primaryModel,
  fastModel,
}: ChatWorkspaceProps) {
  const [demoMode, setDemoMode] = useState(!initialAiConfigured);
  const [includeBaseline, setIncludeBaseline] = useState(true);
  const [showSideBySide, setShowSideBySide] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [context, setContext] = useState<ConversationContext>(defaultContext);
  const [conversationId, setConversationId] = useState<string | undefined>(
    undefined
  );
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [originalRequest, setOriginalRequest] = useState<string>("");
  const [clarificationAnswers, setClarificationAnswers] = useState<
    ClarificationTurn[]
  >([]);

  const [status, setStatus] = useState<ConversationStatus | "IDLE">("IDLE");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [autonomyMode, setAutonomyMode] = useState<AutonomyMode>("collaborative");
  const [workingAssumptions, setWorkingAssumptions] = useState<WorkingAssumption[]>([]);
  const [overrideCount, setOverrideCount] = useState<number | null>(null);
  const [autonomySuggestion, setAutonomySuggestion] = useState<"cautious" | null>(null);
  const [editingAssumptionKey, setEditingAssumptionKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [analysis, setAnalysis] = useState<DetectorOutput | null>(null);
  const [spanValidation, setSpanValidation] =
    useState<SpanValidationStats | null>(null);
  const [decision, setDecision] = useState<DecisionResult | null>(null);
  const [resolution, setResolution] = useState<ResolverOutput | null>(null);
  const [resolvedIntent, setResolvedIntent] = useState<string | null>(null);
  const [finalAnswer, setFinalAnswer] = useState<string | null>(null);
  const [suggestedOptions, setSuggestedOptions] = useState<string[]>([]);
  const [baseline, setBaseline] = useState<BaselineComparisonResult | null>(
    null
  );

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function resetConversation(nextContext?: ConversationContext) {
    setConversationId(undefined);
    setActivePresetId(null);
    setOriginalRequest("");
    setClarificationAnswers([]);
    setStatus("IDLE");
    setPendingAction(null);
    setMessages([]);
    setAnalysis(null);
    setSpanValidation(null);
    setDecision(null);
    setResolution(null);
    setResolvedIntent(null);
    setFinalAnswer(null);
    setSuggestedOptions([]);
    setBaseline(null);
    setErrorMsg(null);
    setWorkingAssumptions([]);
    setOverrideCount(null);
    setAutonomySuggestion(null);
    setEditingAssumptionKey(null);
    if (nextContext) {
      setContext(nextContext);
    }
  }

  function handleAutonomyModeChange(mode: AutonomyMode) {
    setAutonomyMode(mode);
  }

  function handleEditAssumption(assumption: WorkingAssumption) {
    setEditingAssumptionKey(assumption.key);
  }

  async function handleSaveAssumption(updated: WorkingAssumption) {
    if (!conversationId) return;
    setEditingAssumptionKey(null);
    await sendTurn("", {
      action: "override",
      assumptionOverride: { key: updated.key, newValue: updated.value },
      freshStart: false,
    });
  }

  function handleCancelEdit() {
    setEditingAssumptionKey(null);
  }

  async function sendTurn(
    text: string,
    opts?: {
      presetId?: string;
      overrideContext?: ConversationContext;
      action?: "submit" | "cancel" | "override";
      assumptionOverride?: AssumptionOverride;
      freshStart?: boolean;
    }
  ) {
    setLoading(true);
    setErrorMsg(null);

    const isFresh = Boolean(opts?.freshStart) || status === "IDLE";
    const activeConvId = isFresh ? undefined : conversationId;
    const activeCtx = opts?.overrideContext ?? context;

    if (opts?.action !== "cancel") {
      const userKind: ChatMessage["kind"] = isFresh
        ? "request"
        : pendingAction === "confirm"
        ? "confirmation_answer"
        : "clarification_answer";
      setMessages((prev) => [
        ...(isFresh ? [] : prev),
        {
          id: createStableId("msg"),
          role: "user",
          content: text,
          timestamp: new Date().toISOString(),
          kind: userKind,
        },
      ]);
    }

    if (isFresh) {
      setOriginalRequest(text);
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: activeConvId,
          message: text,
          action: opts?.action ?? "submit",
          context: activeCtx,
          include_baseline: includeBaseline,
          demo_mode: demoMode,
          preset_id: opts?.presetId ?? activePresetId ?? undefined,
          autonomy_mode: autonomyMode,
          assumption_override: opts?.assumptionOverride,
        }),
      });

      const data = (await res.json()) as ChatApiResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      setConversationId(data.conversation_id);
      setStatus(data.status);
      setPendingAction(data.pending_action);
      if (data.autonomy_mode !== undefined) setAutonomyMode(data.autonomy_mode);
      if (data.working_assumptions !== undefined)
        setWorkingAssumptions(data.working_assumptions);
      if (data.overrideCount !== undefined) setOverrideCount(data.overrideCount);
      if (data.autonomy_suggestion !== undefined)
        setAutonomySuggestion(data.autonomy_suggestion);
      if (data.analysis) setAnalysis(data.analysis);
      if (data.span_validation) setSpanValidation(data.span_validation);
      if (data.decision) setDecision(data.decision);
      if (data.resolution !== undefined) setResolution(data.resolution ?? null);
      setResolvedIntent(data.resolved_intent);
      setFinalAnswer(data.final_answer);
      setSuggestedOptions(data.suggested_options ?? []);
      if (data.baseline) setBaseline(data.baseline);
      if (data.conversation) {
        setOriginalRequest(data.conversation.original_request);
        setClarificationAnswers(data.conversation.clarification_answers);
      }

      const assistantKind: ChatMessage["kind"] =
        data.pending_action === "clarify"
          ? "clarification_question"
          : data.pending_action === "confirm"
          ? "confirmation_prompt"
          : data.status === "RESOLVED"
          ? "resolution"
          : data.status === "UNRESOLVED"
          ? "unresolved"
          : "cancelled";

      setMessages((prev) => [
        ...prev,
        {
          id: createStableId("msg"),
          role: "assistant",
          content: data.assistant_message,
          timestamp: new Date().toISOString(),
          kind: assistantKind,
          analysis: data.analysis,
          span_validation: data.span_validation,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send message.";
      setErrorMsg(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: createStableId("msg"),
          role: "assistant",
          content: msg,
          timestamp: new Date().toISOString(),
          kind: "error",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectPreset(preset: PresetScenario) {
    const mergedContext = { ...defaultContext, ...preset.context };
    resetConversation(mergedContext);
    setActivePresetId(preset.id);
    setOriginalRequest(preset.initial_request);
    void sendTurn(preset.initial_request, {
      presetId: preset.id,
      overrideContext: mergedContext,
      freshStart: true,
    });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader
        mode={demoMode ? "demo" : "live"}
        aiConfigured={initialAiConfigured}
        onOpenSettings={() => setDrawerOpen(true)}
      />

      <PageContainer className="flex-1">
        <div className="flex gap-6">
          <AppSidebar />

          <div className="flex-1 min-w-0 space-y-5">
            {/* Top Status & Controls Bar */}
            <div className="ms-panel rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-sm font-semibold text-slate-100">
                  Ambiguity Resolution Workspace
                </h1>
                <Badge variant={demoMode ? "amber" : "emerald"}>
                  {demoMode ? "Deterministic Demo Mode" : "Live Gemini Mode"}
                </Badge>
                {status !== "IDLE" && (
                  <Badge variant="sky" className="font-mono text-[10px]">
                    {status}
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={showSideBySide ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setShowSideBySide((s) => !s)}
                >
                  <Columns2 className="h-3.5 w-3.5" />
                  <span>Baseline Compare</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDrawerOpen(true)}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Context</span>
                </Button>
              </div>
            </div>

            {demoMode && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-200/90">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span>
                    <strong>Demo Mode active:</strong> Preset scenarios use
                    deterministic offline flows.{" "}
                    {!initialAiConfigured &&
                      "Set GEMINI_API_KEY in .env.local to unlock live Gemini inference."}
                  </span>
                </div>
              </div>
            )}

            {/* Preset Scenarios */}
            <PresetChips
              presets={presets}
              activePresetId={activePresetId}
              onSelect={handleSelectPreset}
              disabled={loading}
            />

            {/* Main 2-column grid: Chat + Explainability */}
            <div className="grid gap-5 xl:grid-cols-[1.25fr_0.95fr] items-start">
              {/* Left: Conversation Thread & Input */}
              <div className="ms-panel rounded-xl p-4 sm:p-5 space-y-4">
                <div className="min-h-[300px] max-h-[520px] overflow-y-auto space-y-4 pr-1">
                  {messages.length === 0 ? (
                    <div className="flex h-[280px] flex-col items-center justify-center text-center px-4">
                      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-400">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-medium text-slate-200">
                        Test ClarifyAI on any natural-language request
                      </p>
                      <p className="mt-1 max-w-md text-xs text-slate-400 leading-relaxed">
                        Select one of the 6 preset scenarios above or enter your
                        own request below. Clear requests resolve directly;
                        ambiguous requests trigger one targeted question.
                      </p>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <MessageBubble key={msg.id} message={msg} />
                    ))
                  )}

                  {loading && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-2.5 rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-3 text-xs text-sky-200"
                    >
                      <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
                      <span>
                        Analyzing ambiguity spans, evaluating decision policy...
                      </span>
                    </motion.div>
                  )}

                  {status === "AWAITING_USER" &&
                    suggestedOptions.length > 0 &&
                    !loading && (
                      <QuickReplyChips
                        options={suggestedOptions}
                        onSelect={(opt) => void sendTurn(opt)}
                        disabled={loading}
                        isConfirmation={pendingAction === "confirm"}
                      />
                    )}

                  <div ref={messagesEndRef} />
                </div>

                {errorMsg && (
                  <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <ChatInput
                  onSend={(text) => void sendTurn(text)}
                  onReset={() => resetConversation()}
                  onCancel={
                    pendingAction
                      ? () => void sendTurn("Cancel", { action: "cancel" })
                      : undefined
                  }
                  disabled={loading}
                  status={status}
                  pendingAction={pendingAction}
                />
              </div>

              {/* Right: Autonomy + Assumptions + Heatmap + Explainability + Resolved Card */}
              <div className="space-y-4">
                <AutonomyDial
                  mode={autonomyMode}
                  onModeChange={handleAutonomyModeChange}
                  disabled={loading}
                />
                <AssumptionsBar
                  assumptions={workingAssumptions}
                  onEditAssumption={handleEditAssumption}
                  onSaveAssumption={handleSaveAssumption}
                  onCancelEdit={handleCancelEdit}
                  disabled={loading}
                />

                {originalRequest &&
                  analysis &&
                  analysis.ambiguous_spans.length > 0 && (
                    <AmbiguityHeatmap
                      originalRequest={originalRequest}
                      spans={analysis.ambiguous_spans}
                    />
                  )}

                <AmbiguityPanel
                  analysis={analysis}
                  decision={decision}
                  spanValidation={spanValidation}
                />

                {status === "RESOLVED" && resolvedIntent && finalAnswer && (
                  <ResolvedPromptCard
                    originalRequest={originalRequest}
                    clarificationAnswers={clarificationAnswers}
                    resolvedIntent={resolvedIntent}
                    finalAnswer={finalAnswer}
                    resolution={resolution}
                  />
                )}
              </div>
            </div>

            {/* Side-by-Side Comparison */}
            {showSideBySide && includeBaseline && originalRequest && (
              <SideBySideView
                originalRequest={originalRequest}
                baseline={baseline}
                analysis={analysis}
                clarificationAnswers={clarificationAnswers}
                clarifyStatus={status}
                clarifyResponse={finalAnswer}
                resolvedIntent={resolvedIntent}
              />
            )}
          </div>
        </div>
      </PageContainer>

      <ContextDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        context={context}
        defaultContext={defaultContext}
        onSaveContext={(ctx) => setContext(ctx)}
        demoMode={demoMode}
        onToggleDemoMode={setDemoMode}
        includeBaseline={includeBaseline}
        onToggleBaseline={setIncludeBaseline}
        aiConfigured={initialAiConfigured}
        primaryModel={primaryModel}
        fastModel={fastModel}
      />
    </div>
  );
}
