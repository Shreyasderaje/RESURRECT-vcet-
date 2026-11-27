"use client";

import { motion } from "framer-motion";
import { CornerDownRight } from "lucide-react";

interface QuickReplyChipsProps {
  options: string[];
  onSelect: (option: string) => void;
  disabled?: boolean;
  isConfirmation?: boolean;
}

export function QuickReplyChips({
  options,
  onSelect,
  disabled,
  isConfirmation,
}: QuickReplyChipsProps) {
  if (options.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="flex flex-wrap gap-2 pt-1"
    >
      {options.map((opt) => {
        const isCancel = /^cancel$/i.test(opt.trim());
        const isConfirm = /^confirm/i.test(opt.trim());
        const colorClass = isConfirmation
          ? isCancel
            ? "border-rose-500/35 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
            : isConfirm
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
            : "border-slate-700 bg-slate-800/80 text-slate-200 hover:border-sky-400/50"
          : "border-sky-500/30 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20 hover:border-sky-400/50";

        return (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(opt)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer disabled:opacity-45 ${colorClass}`}
          >
            <CornerDownRight className="h-3 w-3 opacity-75" />
            <span>{opt}</span>
          </button>
        );
      })}
    </motion.div>
  );
}
