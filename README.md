# ClarifyAI — Ambiguity Identification & Resolution in Natural Language

ClarifyAI is an ambiguity-aware AI assistant that detects underspecified natural-language requests, highlights exact ambiguous phrases, generates plausible interpretations, asks **one targeted clarification question** only when necessary, enforces confirmation gates on high-risk actions, and resolves intent without guessing.

> **Core Principle:** The innovation is not asking more questions—it is knowing **when to ask**, **what to ask**, and **when not to ask**.

---

## Features

- **7-Class Ambiguity Detection:** Identifies `lexical`, `referential`, `contextual`, `subjective`, `syntactic`, `semantic`, and `pragmatic` ambiguity using structured Gemini JSON output validated with Zod.
- **Exact Substring Span Validation:** Rejects paraphrased or hallucinated spans and computes character offsets against the exact input string, tracking span drop rate.
- **Authoritative Policy Decision Engine:** Independently decides between `resolve`, `clarify`, `confirm`, and `unresolved` based on material ambiguity, risk level, and a strict 2-turn clarification budget.
- **Server-Authoritative State Machine:** Preserves the original request separately from clarification turns, prevents client-forged terminal states, rejects unrelated replies as confirmations, and handles duplicate/stale requests.
- **Side-by-Side Baseline Comparison:** Evaluates a single-shot conventional Gemini assistant on the exact same prompt and context.
- **Deterministic Demo Mode:** Six categorized presets (`clear`, `referential`, `contextual`, `subjective`, `lexical_semantic`, `high_risk`) plus deterministic custom fallback work offline without an API key.
- **Evaluation & Error Analysis Suite:** 100-case benchmark (`80 dev` + `20 locked held-out`), checkpointed CLI runner (`--resume`), deterministic slot/criteria scoring, confusion matrix, error breakdown, and case inspector.

---

## Technology Stack

- **Framework:** Next.js 15 (App Router), React 19, TypeScript (strict mode)
- **Styling & Motion:** Tailwind CSS v4, MotionSites.ai-inspired dark SaaS dashboard theme, Framer Motion (`reducedMotion="user"`), Lucide icons
- **Charts:** Recharts
- **AI & Validation:** Official Google Gen AI SDK (`@google/genai`), Zod
- **Testing:** Vitest, React Testing Library

---

## Architecture & Folder Structure

```text
clarify-ai/
├── public/logo.svg
├── data/
│   ├── README.md
│   ├── dev-dataset.json          # 80 development cases
│   ├── heldout-dataset.json      # 20 frozen held-out cases
│   ├── preset-scenarios.json     # 6 interactive demo scenarios
│   ├── default-context.json      # Default workspace context
│   ├── eval-checkpoint.jsonl     # Incremental evaluation checkpoint log
│   └── eval-results-latest.json  # Latest evaluation report (not_run until executed)
├── scripts/
│   ├── smoke-test.ts             # Verifies API key, models, structured output, Zod, spans
│   ├── compute-kappa.ts          # Computes Cohen's kappa for dual-annotator labels
│   └── run-evaluation.ts         # Checkpointed benchmark runner (--resume supported)
├── src/
│   ├── app/
│   │   ├── page.tsx              # Main dashboard
│   │   ├── chat/page.tsx         # Interactive workspace
│   │   ├── evaluation/page.tsx   # Evaluation & error analysis dashboard
│   │   └── api/
│   │       ├── chat/route.ts     # Authoritative conversation state machine API
│   │       ├── evaluation/route.ts # Saved report + rate-limited live spot-check API
│   │       └── health/route.ts   # Runtime & config status endpoint
│   ├── components/
│   │   ├── layout/               # Header, sidebar, page container, motion provider
│   │   ├── chat/                 # Workspace, side-by-side view, presets, context drawer
│   │   ├── ambiguity/            # Heatmap, explainability panel, before/after card
│   │   └── evaluation/           # Metric cards, charts, confusion matrix, error analysis
│   ├── lib/
│   │   ├── ai/                   # Gemini client, schemas, prompts, detector, decision engine, resolver, baseline, state machine, demo engine
│   │   ├── evaluation/           # User simulator, scorer, runner, metrics, rate limiter
│   │   └── utils/                # Stable ID & class helpers
│   └── types/                    # Shared TypeScript interfaces
└── tests/unit/                   # Vitest unit tests
```

---

## Environment Setup & Gemini API Configuration

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Configure variables in `.env.local`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | *(unset)* | Server-side Google AI Studio API key. **Never** prefix with `NEXT_PUBLIC_`. |
| `GEMINI_PRIMARY_MODEL` | `gemini-3.5-flash` | Primary model for detection, resolution, and baseline. *(Note: `gemini-3.5-flash` is deprecated and auto-routed by the Gemini API; recommended supported models are `gemini-3.8-flash` or `gemini-3.6-flash`.)* |
| `GEMINI_FAST_MODEL` | `gemini-3.5-flash-lite` | Fast model for evaluation user simulation. |
| `SPOT_CHECK_MAX_CASES` | `5` | Hard cap per live spot-check request. |
| `SPOT_CHECK_DAILY_LIMIT` | `20` | Global daily ceiling for live spot-check cases. |
| `ENABLE_DEMO_MODE` | `true` | Enables deterministic Demo Mode when `GEMINI_API_KEY` is missing. |

3. Verify your Gemini setup:
   ```bash
   npm run smoke-test
   ```

---

## Local Development & Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run TypeScript check
npm run typecheck

# Run unit tests
npm test

# Build production bundle
npm run build

# Start production server
npm run start
```

### Demo Mode (No API Key Required)

When `GEMINI_API_KEY` is omitted or `ENABLE_DEMO_MODE=true`, ClarifyAI automatically runs in **Deterministic Demo Mode**. Open `/chat` and click any of the **6 Preset Scenarios** to demonstrate clear direct answers, referential/contextual/subjective/lexical clarification, high-risk confirmation gates, and side-by-side baseline comparison without fabricating live API outputs.

---

## Evaluation Methodology & Metrics

- **Dataset Split:** `80` development cases (`data/dev-dataset.json`) + `20` frozen held-out cases (`data/heldout-dataset.json`). Held-out reference labels are never exposed to the detector, baseline, or user simulator.
- **Metrics (`src/lib/evaluation/metrics.ts`):**
  - **Detection Precision / Recall / F1:** Computed from confusion matrix (`TP`, `FP`, `TN`, `FN`); returns `N/A` when denominator is zero.
  - **Resolution Accuracy:** Exact normalized `required_slots` match for referential/contextual cases; explicit binary `reference_criteria` check for lexical/subjective/syntactic/semantic cases.
  - **Unnecessary Clarification Rate:** Share of clear requests where ClarifyAI asked a question.
  - **Mean Clarification Turns & Span Drop Rate:** Tracks dialogue efficiency and exact-substring validation strictness.
- **Run Benchmark:**
  ```bash
  npm run evaluate
  npm run evaluate -- --resume
  ```
- **Inter-Annotator Agreement:**
  ```bash
  npm run compute-kappa -- annotator1.json annotator2.json
  ```

---

## Rate Limits, Privacy & Responsible Use

- **Spot-Check Rate Limits:** `/api/evaluation` enforces a max of `5` cases per request, `5` requests/minute per IP, and `20` cases/day globally (HTTP `429` when exceeded). On serverless Vercel deployments, public live spot-checks are disabled unless durable Redis storage (`UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`) is configured.
- **Simulated Actions Only:** ClarifyAI never executes real emails, calendar edits, file deletions, or financial transfers.
- **Privacy & Safety:** Conversations are anonymous, benchmark data is synthetic, and API keys remain strictly server-side.

---

## Known Limitations

- In-memory conversation state resets on server restart in local single-node MVP mode.
- Evaluation benchmark metrics remain `N/A` until `npm run evaluate` is run with a valid `GEMINI_API_KEY`.
- Reviewer Cohen's kappa remains `Pending` until two independent annotator files are supplied to `scripts/compute-kappa.ts`.
