"use client";

import { useState } from "react";
import { Edit2, Save, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type { WorkingAssumption } from "@/types/chat";

export interface AssumptionsBarProps {
  assumptions: WorkingAssumption[];
  onEditAssumption?: (assumption: WorkingAssumption) => void;
  onSaveAssumption?: (assumption: WorkingAssumption) => void;
  onCancelEdit?: () => void;
  disabled?: boolean;
}

export function AssumptionsBar({
  assumptions,
  onEditAssumption,
  onSaveAssumption,
  onCancelEdit,
  disabled = false,
}: AssumptionsBarProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const activeAssumption = assumptions.find((a) => a.key === editingKey) ?? null;

  const isEditing = Boolean(editingKey);

  if (assumptions.length === 0) {
    return (
      <div className="ms-panel rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Working Assumptions
            </span>
            <Badge variant="default" className="text-[10px]">
              None
            </Badge>
          </div>
          <span className="text-[11px] text-slate-400">
            Assumptions ClarifyAI is making about your request
          </span>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#080c14]/60 p-3 text-[11px] text-slate-400">
          No working assumptions have been identified yet. Assumptions appear here
          once ClarifyAI surfaces them from your request or context.
        </div>
      </div>
    );
  }

  return (
    <div className="ms-panel rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Working Assumptions
          </span>
          <Badge variant="sky" className="text-[10px]">
            {assumptions.length}
          </Badge>
        </div>
        <span className="text-[11px] text-slate-400">
          Assumptions ClarifyAI is making about your request
        </span>
      </div>

      <div className="space-y-2">
        {assumptions.map((assumption) => {
          const isEditingThis = editingKey === assumption.key;

          if (isEditingThis) {
            return (
              <div
                key={assumption.key}
                className="rounded-lg border border-slate-800 bg-[#080c14]/60 p-3 space-y-2"
              >
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  disabled={disabled}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-slate-700 bg-transparent p-2 font-mono text-[11px] leading-relaxed text-slate-200 focus:border-sky-400/60 focus:outline-none disabled:bg-transparent"
                  autoFocus
                />
                <div className="flex items-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => {
                      setEditingKey(null);
                      setEditText("");
                      onCancelEdit?.();
                    }}
                    className="text-[11px] px-2.5"
                  >
                    <X className="h-3 w-3" /> Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={disabled || editText.trim() === assumption.value}
                    onClick={() => {
                      const next = editText.trim();
                      if (next && next !== assumption.value) {
                        onSaveAssumption?.({
                          key: assumption.key,
                          value: next,
                        });
                      }
                      setEditingKey(null);
                      setEditText("");
                    }}
                    className="text-[11px] px-2.5"
                  >
                    <Save className="h-3 w-3" /> Save
                  </Button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={assumption.key}
              className="rounded-lg border border-slate-800 bg-[#080c14]/60 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {assumption.value}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => {
                    setEditText(assumption.value);
                    setEditingKey(assumption.key);
                    onEditAssumption?.(assumption);
                  }}
                  className="p-1 text-[10px]"
                  title="Edit assumption"
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}