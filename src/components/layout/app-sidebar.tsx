"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function AppSidebar() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Dashboard", icon: Sparkles },
    { href: "/chat", label: "Clarify Workspace", icon: MessageSquareText },
    { href: "/evaluation", label: "Benchmark & Errors", icon: BarChart3 },
  ];

  return (
    <aside className="hidden w-56 shrink-0 lg:flex lg:flex-col lg:gap-4">
      <div className="ms-panel rounded-xl p-3">
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Navigation
        </p>
        <div className="flex flex-col gap-1">
          {links.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-all",
                  active
                    ? "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="ms-panel rounded-xl p-3.5 text-xs text-slate-400 space-y-2">
        <div className="flex items-center gap-2 text-slate-200 font-medium">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>Decision Policy</span>
        </div>
        <p className="leading-relaxed">
          Clear requests resolve directly. Materially ambiguous requests trigger
          at most 2 targeted turns. High-risk actions require confirmation.
        </p>
        <div className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-500">
          <BookOpen className="h-3.5 w-3.5" />
          <span>Simulated external actions</span>
        </div>
      </div>
    </aside>
  );
}
