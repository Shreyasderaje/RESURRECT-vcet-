"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  MessageSquareText,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

interface AppHeaderProps {
  mode?: "live" | "demo";
  aiConfigured?: boolean;
  onOpenSettings?: () => void;
}

export function AppHeader({
  mode = "demo",
  aiConfigured = false,
  onOpenSettings,
}: AppHeaderProps) {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Overview", icon: Sparkles },
    { href: "/chat", label: "Workspace", icon: MessageSquareText },
    { href: "/evaluation", label: "Evaluation", icon: BarChart3 },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#070a11]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <Image
              src="/logo.svg"
              alt="ClarifyAI Logo"
              width={30}
              height={30}
              className="rounded-lg transition-transform duration-150 group-hover:scale-105"
              suppressHydrationWarning
            />
            <div className="flex items-baseline gap-2">
              <span className="text-base font-semibold tracking-tight text-slate-100">
                ClarifyAI
              </span>
              <span className="hidden text-[11px] font-mono text-slate-400 sm:inline">
                v1.0
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2.5">
          <Badge
            variant={mode === "live" && aiConfigured ? "emerald" : "amber"}
            className="hidden sm:inline-flex"
          >
            <Activity className="h-3 w-3" />
            {mode === "live" && aiConfigured ? "Live Gemini" : "Demo Mode"}
          </Badge>

          {onOpenSettings && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onOpenSettings}
              aria-label="Open Context & Settings"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Context & Settings</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
