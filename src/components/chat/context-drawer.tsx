"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { KeyRound, RotateCcw, Save, SlidersHorizontal, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ConversationContext } from "@/types/chat";

interface ContextDrawerProps {
  open: boolean;
  onClose: () => void;
  context: ConversationContext;
  defaultContext: ConversationContext;
  onSaveContext: (ctx: ConversationContext) => void;
  demoMode: boolean;
  onToggleDemoMode: (val: boolean) => void;
  includeBaseline: boolean;
  onToggleBaseline: (val: boolean) => void;
  aiConfigured: boolean;
  primaryModel?: string;
  fastModel?: string;
}

export function ContextDrawer({
  open,
  onClose,
  context,
  defaultContext,
  onSaveContext,
  demoMode,
  onToggleDemoMode,
  includeBaseline,
  onToggleBaseline,
  aiConfigured,
  primaryModel = "gemini-3.5-flash",
  fastModel = "gemini-3.5-flash-lite",
}: ContextDrawerProps) {
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(context, null, 2)
  );
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    setJsonText(JSON.stringify(context, null, 2));
    setParseError(null);
  }, [context, open]);

  function handleApply() {
    try {
      const parsed = JSON.parse(jsonText) as ConversationContext;
      setParseError(null);
      onSaveContext(parsed);
      onClose();
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : "Invalid JSON syntax."
      );
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/65 backdrop-blur-xs"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-800 bg-[#0b101b] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-sky-400" />
                <h2 className="text-sm font-semibold text-slate-100">
                  Context & Runtime Settings
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 cursor-pointer"
                aria-label="Close settings drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Runtime mode & API Setup */}
              <div className="ms-panel rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    AI Engine Mode
                  </span>
                  <Badge variant={aiConfigured ? "emerald" : "amber"}>
                    {aiConfigured ? "API Key Detected" : "No Server Key"}
                  </Badge>
                </div>

                <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-xs cursor-pointer">
                  <div>
                    <p className="font-medium text-slate-200">
                      Deterministic Demo Mode
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Uses curated preset workflows without live API calls
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={demoMode}
                    onChange={(e) => onToggleDemoMode(e.target.checked)}
                    disabled={!aiConfigured}
                    className="h-4 w-4 accent-sky-400"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-xs cursor-pointer">
                  <div>
                    <p className="font-medium text-slate-200">
                      Side-by-Side Baseline Comparison
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Compare ClarifyAI against a single-turn direct assistant
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={includeBaseline}
                    onChange={(e) => onToggleBaseline(e.target.checked)}
                    className="h-4 w-4 accent-sky-400"
                  />
                </label>

                <div className="rounded-lg border border-slate-800/80 bg-[#080c14] p-3 text-[11px] text-slate-400 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-slate-200 font-medium">
                    <KeyRound className="h-3.5 w-3.5 text-sky-400" />
                    <span>Server-Side Gemini Setup</span>
                  </div>
                  <p>
                    Models: <code className="text-sky-300">{primaryModel}</code>{" "}
                    / <code className="text-indigo-300">{fastModel}</code>
                  </p>
                  {!aiConfigured && (
                    <p className="text-amber-300/90 leading-relaxed">
                      Add <code>GEMINI_API_KEY</code> to <code>.env.local</code>{" "}
                      and restart the server to enable live Gemini inference.
                      Keys are never exposed to the browser.
                    </p>
                  )}
                </div>
              </div>

              {/* Editable Context JSON */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Workspace Context (JSON)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setJsonText(JSON.stringify(defaultContext, null, 2));
                      setParseError(null);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset default</span>
                  </button>
                </div>
                <textarea
                  rows={14}
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-[#080c14] p-3 font-mono text-[11.5px] leading-relaxed text-slate-200 focus:border-sky-400/60 focus:outline-none"
                />
                {parseError && (
                  <p className="text-xs text-rose-400">{parseError}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3.5">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleApply}>
                <Save className="h-3.5 w-3.5" />
                <span>Apply Context</span>
              </Button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
