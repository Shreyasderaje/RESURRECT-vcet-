"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface MetricCardProps {
  label: string;
  value: string;
  subtitle?: string;
  icon?: LucideIcon;
  tone?: "default" | "sky" | "emerald" | "amber" | "rose";
}

const TONE_MAP = {
  default: "text-slate-100",
  sky: "text-sky-300",
  emerald: "text-emerald-300",
  amber: "text-amber-300",
  rose: "text-rose-300",
};

export function MetricCard({
  label,
  value,
  subtitle,
  icon: Icon,
  tone = "default",
}: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="ms-panel ms-panel-hover rounded-xl p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </span>
        {Icon && <Icon className="h-4 w-4 text-slate-400" />}
      </div>
      <div
        className={cn(
          "mt-2 font-mono text-2xl font-semibold tracking-tight",
          TONE_MAP[tone]
        )}
      >
        {value}
      </div>
      {subtitle && (
        <p className="mt-1 text-[11px] text-slate-400 leading-snug">
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}
