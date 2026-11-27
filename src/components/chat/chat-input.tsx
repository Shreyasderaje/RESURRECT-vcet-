"use client";

import { useState, type FormEvent } from "react";
import { RotateCcw, Send, XOctagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConversationStatus, PendingAction } from "@/types/chat";

interface ChatInputProps {
  onSend: (text: string) => void;
  onReset: () => void;
  onCancel?: () => void;
  disabled?: boolean;
  status: ConversationStatus | "IDLE";
  pendingAction: PendingAction;
}

export function ChatInput({
  onSend,
  onReset,
  onCancel,
  disabled,
  status,
  pendingAction,
}: ChatInputProps) {
  const [value, setValue] = useState("");

  const isTerminal =
    status === "RESOLVED" || status === "UNRESOLVED" || status === "CANCELLED";

  const placeholder =
    pendingAction === "clarify"
      ? "Answer the clarification question above..."
      : pendingAction === "confirm"
      ? 'Type "Confirm" to proceed or "Cancel" to abort...'
      : isTerminal
      ? "Conversation complete. Reset to start a new request..."
      : "Describe a task or ask anything (e.g. 'Send the draft to her tomorrow')...";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled || isTerminal) return;
    onSend(trimmed);
    setValue("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5">
      <div className="flex items-end gap-2 rounded-xl border border-slate-700/80 bg-[#090d16] p-2 focus-within:border-sky-400/60 transition-colors">
        <textarea
          rows={2}
          value={value}
          disabled={disabled || isTerminal}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder={placeholder}
          className="w-full resize-none bg-transparent px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none disabled:opacity-50"
        />
        <div className="flex items-center gap-1.5 pb-1">
          {pendingAction && onCancel && (
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={disabled}
              onClick={onCancel}
              title="Cancel pending request"
            >
              <XOctagon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Cancel</span>
            </Button>
          )}
          <Button
            type="submit"
            size="sm"
            disabled={disabled || isTerminal || value.trim().length === 0}
          >
            <Send className="h-3.5 w-3.5" />
            <span>Send</span>
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>Press Enter to send, Shift+Enter for new line</span>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1 text-slate-400 hover:text-sky-300 transition-colors cursor-pointer"
        >
          <RotateCcw className="h-3 w-3" />
          <span>New conversation</span>
        </button>
      </div>
    </form>
  );
}
