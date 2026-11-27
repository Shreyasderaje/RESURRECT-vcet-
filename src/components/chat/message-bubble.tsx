"use client";

import { motion } from "framer-motion";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  HelpCircle,
  ShieldAlert,
  User,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ChatMessage } from "@/types/chat";
import { cn } from "@/lib/utils/cn";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  const badgeInfo = (() => {
    switch (message.kind) {
      case "clarification_question":
        return { label: "Clarification Needed", variant: "amber" as const, icon: HelpCircle };
      case "confirmation_prompt":
        return { label: "High-Risk Confirmation", variant: "rose" as const, icon: ShieldAlert };
      case "resolution":
        return { label: "Resolved", variant: "emerald" as const, icon: CheckCircle2 };
      case "unresolved":
        return { label: "Unresolved", variant: "amber" as const, icon: AlertCircle };
      case "cancelled":
        return { label: "Cancelled", variant: "default" as const, icon: XCircle };
      case "error":
        return { label: "Error", variant: "rose" as const, icon: AlertCircle };
      default:
        return null;
    }
  })();

  const Icon = badgeInfo?.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}
    >
      {!isUser && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-300">
          <Bot className="h-4 w-4" />
        </div>
      )}

      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-gradient-to-br from-sky-500/20 to-indigo-500/20 border border-sky-400/30 text-slate-100"
            : "ms-panel text-slate-200"
        )}
      >
        {badgeInfo && Icon && (
          <div className="mb-2">
            <Badge variant={badgeInfo.variant} className="text-[10px]">
              <Icon className="h-3 w-3" />
              {badgeInfo.label}
            </Badge>
          </div>
        )}
        <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed">
          {message.content}
        </div>
      </div>

      {isUser && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300">
          <User className="h-4 w-4" />
        </div>
      )}
    </motion.div>
  );
}
