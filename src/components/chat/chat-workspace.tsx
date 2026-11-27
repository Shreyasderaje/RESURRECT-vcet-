"use client";

import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Columns2,
  ChevronDown,
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
import { cn } from "@/lib/utils/cn";
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
  provider: "gemini" | "openrouter";
}

export function ChatWorkspace({
  presets,
  defaultContext,
  initialAiConfigured,
  primaryModel,
  fastModel,
  provider,
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
  const [serverMode, setServerMode] = useState<"live" | "demo" | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // The API response carries an authoritative mode field ("live" | "demo").
  // Prefer it over the client-side demoMode toggle so the badge reflects the
  // actual inference path used by the server for the current conversation.
  function effectiveMode(): "live" | "demo" {
    return serverMode ?? (demoMode ? "demo" : "live");
  }

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
      if (data.mode) setServerMode(data.mode);
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
                <Badge variant={effectiveMode() === "demo" ? "amber" : "emerald"}>
                  {effectiveMode() === "demo"
                    ? "Deterministic Demo Mode"
                    : provider === "openrouter"
                    ? "Live OpenRouter Mode"
                    : "Live Gemini Mode"}
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

            {/* Main 2-column grid: Conversation Thread (left) + Control Panels (right) */}
            <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr] items-start">
              {/* Left: Conversation Thread & Input */}
              <div className="ms-panel rounded-xl p-4 sm:p-5 space-y-4 flex flex-col min-w-0">
                <div className="flex-1 min-h-[320px] max-h-[600px] overflow-y-auto space-y-4 pr-1">
                  {messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center px-6 py-12">
                      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-400">
                        <Sparkles className="h-7 w-7" />
                      </div>
                      <p className="text-base font-medium text-slate-200 mb-2">
                        Start a new clarifying conversation
                      </p>
                      <p className="max-w-sm text-sm text-slate-400 leading-relaxed">
                        Select one of the 6 preset scenarios above or enter your
                        own request below. Clear requests resolve directly;
                        ambiguous requests trigger one targeted question.
                      </p>
                      <div className="mt-8 flex items-center gap-3">
                        <Badge variant="sky" className="text-[10px]">
                          Ambiguity-Aware AI
                        </Badge>
                        <Badge variant="default" className="text-[10px]">
                          Safe by default
                        </Badge>
                      </div>
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

              {/* Right: Control Panels (collapsible sections) */}
              <div className="space-y-3 flex flex-col gap-3">
                {/* Autonomy Dial */}
                <section className="ms-panel rounded-xl p-4 sm:p-5">
                  <AutonomyDial
                    mode={autonomyMode}
                    onModeChange={handleAutonomyModeChange}
                    disabled={loading}
                  />
                </section>

                {/* Working Assumptions (collapsible) */}
                <CollapsibleSection
                  title="Working Assumptions"
                  icon={SlidersHorizontal}
                  accent="text-amber-400"
                  defaultExpanded={workingAssumptions.length > 0}
                >
                  <AssumptionsBar
                    assumptions={workingAssumptions}
                    onEditAssumption={handleEditAssumption}
                    onSaveAssumption={handleSaveAssumption}
                    onCancelEdit={handleCancelEdit}
                    disabled={loading}
                  />
                </CollapsibleSection>

                {/* Ambiguity Heatmap (only when spans exist) */}
                {originalRequest &&
                  analysis &&
                  analysis.ambiguous_spans.length > 0 && (
                    <CollapsibleSection
                      title="Ambiguity Heatmap"
                      icon={Sparkles}
                      accent="text-sky-400"
                      defaultExpanded={true}
                    >
                      <AmbiguityHeatmap
                        originalRequest={originalRequest}
                        spans={analysis.ambiguous_spans}
                      />
                    </CollapsibleSection>
                  )}

                {/* Explainability Panel (collapsible) */}
                <CollapsibleSection
                  title="Explainability Analysis"
                  icon={Columns2}
                  accent="text-sky-400"
                  defaultExpanded={true}
                >
                  <AmbiguityPanel
                    analysis={analysis}
                    decision={decision}
                    spanValidation={spanValidation}
                  />
                </CollapsibleSection>

                {/* Resolved Prompt Card (collapsible, only when resolved) */}
                {status === "RESOLVED" && resolvedIntent && finalAnswer && (
                  <CollapsibleSection
                    title="Before → After Resolution"
                    icon={ChevronDown}
                    accent="text-emerald-400"
                    defaultExpanded={true}
                  >
                    <ResolvedPromptCard
                      originalRequest={originalRequest}
                      clarificationAnswers={clarificationAnswers}
                      resolvedIntent={resolvedIntent}
                      finalAnswer={finalAnswer}
                      resolution={resolution}
                    />
                  </CollapsibleSection>
                )}

                {/* Override & Autonomy Suggestion Status (when available) */}
                {(overrideCount !== null || autonomySuggestion !== null) && (
                  <section className="ms-panel rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Policy & Override Status
                      </span>
                      {autonomySuggestion && (
                        <Badge variant="amber" className="text-[10px]">
                          Suggest: Cautious
                        </Badge>
                      )}
                    </div>
                    <div className="grid gap-2 text-xs sm:grid-cols-2">
                      <div className="rounded-lg border border-slate-800 bg-[#090d16] p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Override Count
                        </p>
                        <p className="mt-1 font-mono text-sm text-slate-100">
                          {overrideCount ?? "—"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-[#090d16] p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Active Autonomy Mode
                        </p>
                        <p className="mt-1 font-mono text-sm text-slate-100">
                          {autonomyMode.charAt(0).toUpperCase() + autonomyMode.slice(1)}
                        </p>
                      </div>
                    </div>
                  </section>
                )}
              </div>
            </div>

            {/* Side-by-Side Comparison (collapsible section below grid) */}
            {showSideBySide && includeBaseline && originalRequest && (
              <CollapsibleSection
                title="Baseline Comparison — Side-by-Side"
                icon={Columns2}
                accent="text-indigo-400"
                defaultExpanded={true}
              >
                <SideBySideView
                  originalRequest={originalRequest}
                  baseline={baseline}
                  analysis={analysis}
                  clarificationAnswers={clarificationAnswers}
                  clarifyStatus={status}
                  clarifyResponse={finalAnswer}
                  resolvedIntent={resolvedIntent}
                />
              </CollapsibleSection>
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

/* Collapsible panel section with motion transitions and reduced-motion support */
interface CollapsibleSectionProps {
  title: string;
  icon: React.ElementType;
  accent?: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  icon: Icon,
  accent,
  defaultExpanded = true,
  children,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="ms-panel rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-800/40 cursor-pointer"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0" />
          <span className={cn("text-xs font-semibold uppercase tracking-wider text-slate-200", accent ?? "")}>
            {title}
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden border-t border-slate-800/80"
          >
            <div className="p-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
