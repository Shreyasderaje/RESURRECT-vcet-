"use client";
import Link from "next/link";
import {
  motion,
  type Variants,
} from "framer-motion";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Cpu,
  HelpCircle,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import presetsJson from "../../data/preset-scenarios.json";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageContainer } from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PresetScenario } from "@/types/chat";
import type { EvaluationReport } from "@/types/evaluation";

export const dynamic = "force-dynamic";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
};

/* Faint starfield dots distributed across the page background */
function Starfield() {
  const [stars, setStars] = useState<{ id: number; x: number; y: number; s: number }[]>([]);
  useEffect(() => {
    const s: { id: number; x: number; y: number; s: number }[] = [];
    for (let i = 0; i < 45; i++) {
      s.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        s: 0.3 + Math.random() * 1.4,
      });
    }
    setStars(s);
  }, []);
  return (
    <div className="ms-starfield">
      {stars.map((st) => (
        <div
          key={st.id}
          className="absolute rounded-full bg-slate-300 opacity-20 blur-[0.5px]"
          style={{
            left: `${st.x}%`,
            top: `${st.y}%`,
            width: `${st.s}px`,
            height: `${st.s}px`,
          }}
        />
      ))}
    </div>
  );
}

export default function HomePage() {
  const [cfg, setCfg] = useState<{
    hasApiKey: boolean;
    demoModeEnabled: boolean;
    primaryModel: string;
    fastModel: string;
  } | null>(null);
  const [configStatus, setConfigStatus] = useState<"loading" | "ok" | "unavailable">("loading");
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchConfig() {
      try {
        const res = await fetch("/api/config");
        if (!res.ok) {
          throw new Error(`Config unavailable (${res.status})`);
        }
        const data = await res.json();
        if (!cancelled) {
          setCfg(data);
          setConfigStatus("ok");
        }
      } catch {
        if (!cancelled) {
          setCfg(null);
          setConfigStatus("unavailable");
        }
      }
    }
    fetchConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchReport() {
      try {
        const res = await fetch("/api/evaluation");
        if (!res.ok) {
          throw new Error(`Failed to load evaluation (${res.status})`);
        }
        const data = await res.json();
        if (!cancelled) {
          setReport(data.report ?? null);
          setReportError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setReport(null);
          setReportError(err instanceof Error ? err.message : "Failed to load evaluation.");
        }
      }
    }
    fetchReport();
    return () => {
      cancelled = true;
    };
  }, []);

  const presets = presetsJson as unknown as PresetScenario[];

  const workflowSteps = [
    {
      step: "01",
      title: "Detect & Validate Spans",
      desc: "Classifies 7 ambiguity types and validates every extracted phrase against exact input substrings.",
      icon: Sparkles,
      accent: "text-sky-400",
    },
    {
      step: "02",
      title: "Policy Decision Engine",
      desc: "Resolves clear requests directly, asks one targeted question when needed, and gates high-risk actions.",
      icon: ShieldCheck,
      accent: "text-amber-400",
    },
    {
      step: "03",
      title: "Clarify & Resolve Safely",
      desc: "Merges user answers with context without fabricating facts—or marks unresolved after 2 turns.",
      icon: CheckCircle2,
      accent: "text-emerald-400",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col ms-canvas-bg relative">
      <Starfield />
      <AppHeader
        mode={
          configStatus === "ok" && cfg?.hasApiKey ? "live" : "demo"
        }
        aiConfigured={
          configStatus === "ok" ? Boolean(cfg?.hasApiKey) : false
        }
      />

      <PageContainer className="flex-1">
        <div className="flex gap-6">
          <AppSidebar />

          <div className="flex-1 min-w-0 space-y-6">
            {/* Cinematic Hero Dashboard */}
            <motion.section
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="relative ms-panel rounded-2xl p-6 sm:p-8"
            >
              <div className="ms-hero-glow" />
              <div className="relative z-10 space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="sky">Ambiguity-Aware AI</Badge>
                    <Badge variant="default">Dashboard</Badge>
                  </div>

                  <h1 className="ms-hero-text sharp text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
                    Know when to ask, what to ask, and when not to ask.
                  </h1>

                  <p className="text-base leading-relaxed text-slate-300 max-w-2xl">
                    Conventional AI assistants guess when natural language is
                    underspecified. ClarifyAI detects referential, contextual,
                    lexical, subjective, and syntactic ambiguity, highlights exact
                    phrases, asks a single targeted clarification question, and
                    compares every outcome side-by-side.
                  </p>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <Link href="/chat">
                      <Button size="lg" className="ms-panel-glow">
                        <MessageSquareText className="h-4 w-4" />
                        <span>Start clarifying</span>
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Link href="/evaluation">
                      <Button variant="secondary" size="lg">
                        <BarChart3 className="h-4 w-4" />
                        <span>View evaluation</span>
                      </Button>
                    </Link>
                  </div>
                </div>
            </motion.section>

            {/* 3-Step Engine Pipeline */}
            <section className="grid gap-4 md:grid-cols-3">
              {workflowSteps.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.step}
                    className="ms-card-glass rounded-xl p-5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <Icon className={`h-5 w-5 ${item.accent}`} />
                      <span className="font-mono text-sm text-slate-500">
                        {item.step}
                      </span>
                    </div>
                    <h2 className="text-lg font-semibold text-slate-100">
                      {item.title}
                    </h2>
                    <p className="text-sm leading-relaxed text-slate-400">
                      {item.desc}
                    </p>
                  </div>
                );
              })}
            </section>

            {/* Example Scenarios + Evaluation Status */}
            <div className="grid gap-5 lg:grid-cols-[1.4fr_0.9fr]">
              <section className="ms-panel rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-100">
                      Example Scenarios
                    </h2>
                    <p className="text-sm text-slate-400">
                      Jump into the interactive workspace to test clear,
                      ambiguous, and high-risk flows
                    </p>
                  </div>
                  <Link
                    href="/chat"
                    className="text-sm font-medium text-sky-400 hover:text-sky-300"
                  >
                    Open workspace →
                  </Link>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  {presets.slice(0, 4).map((preset) => (
                    <motion.div
                      key={preset.id}
                      variants={itemVariants}
                      initial="hidden"
                      animate="visible"
                      className="ms-scenario-card rounded-xl border border-slate-800 bg-[#090d16] p-3.5 transition-colors hover:border-sky-400/40"
                    >
                      <Link
                        href="/chat"
                        className="block h-full"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-100">
                            {preset.title}
                          </span>
                          <Badge variant="sky" className="text-[10px]">
                            {preset.badge}
                          </Badge>
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-sm text-slate-400">
                          &quot;{preset.initial_request}&quot;
                        </p>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              </section>

              <section className="ms-panel rounded-xl p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-indigo-400" />
                      <h2 className="text-base font-semibold text-slate-100">
                        Evaluation Status
                      </h2>
                    </div>
                    <Badge
                      variant={
                        report?.status === "completed"
                          ? "emerald"
                          : report?.status === "partial"
                          ? "amber"
                          : "default"
                      }
                    >
                      {report?.status === "completed"
                        ? "Completed"
                        : report?.status === "partial"
                        ? "Partial"
                        : "Not Run"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="rounded-lg border border-slate-800 bg-[#090d16] p-3">
                      <span className="text-[11px] text-slate-400">
                        Benchmark Split
                      </span>
                      <p className="mt-1 font-mono text-sm font-semibold text-slate-100">
                        80 Dev / 20 Held-out
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-[#090d16] p-3">
                      <span className="text-[11px] text-slate-400">
                        Detection F1
                      </span>
                      <p className="mt-1 font-mono text-sm font-semibold text-sky-300">
                        {report?.dev_metrics?.detection_f1 !== null &&
                        report?.dev_metrics?.detection_f1 !== undefined
                          ? `${(report.dev_metrics.detection_f1 * 100).toFixed(1)}%`
                          : "N/A"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 rounded-lg border border-slate-800/80 bg-slate-900/50 p-3 text-[11px] text-slate-400">
                    <HelpCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-sky-400" />
                    <span>
                      {report?.status === "not_run" || !report
                        ? "Run `npm run evaluate` with a valid GEMINI_API_KEY to populate benchmark scores."
                        : `Evaluated ${report.total_cases} cases using ${report.model_primary}.`}
                    </span>
                  </div>
                </div>

                <Link href="/evaluation" className="w-full">
                  <Button variant="outline" size="sm" className="w-full">
                    <BarChart3 className="h-3.5 w-3.5" />
                    <span>Open Evaluation Dashboard</span>
                  </Button>
                </Link>
              </section>
            </div>
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
