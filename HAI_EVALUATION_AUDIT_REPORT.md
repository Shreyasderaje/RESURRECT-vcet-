# HAI Evaluation Audit Report

Date: 2026-11-27  
Branch: `vaibhav/hai-evaluation`; base: `origin/main` at `7003c8c`, containing backend commit `3e92746`. Changes are uncommitted.

## Scope and existing functionality

The evaluation runner executes the baseline, detector, decision engine, user simulator and resolver and saves records; the scorer uses slot and reference-criteria matching. The dashboard displays saved evaluation results and offers live spot checks. The decision engine and its safety gates were preserved. The available refs do not contain Puneeth's reported Strict, Default and Permissive definitions, so there is no supported mapping to the implemented modes.

The decision engine derives severity from detector output: missing information is high, multiple interpretations or clarification-required is medium, and remaining ambiguity is low. Autonomous clarifies high severity; Collaborative also clarifies medium severity; Cautious clarifies all nonzero severity. High-risk material ambiguity triggers clarification in every mode, and high-risk actions require confirmation when no clarification is required. Cautious also requires confirmation for medium-risk actions and clarifies medium ambiguity before that confirmation. Clarification budget exhaustion returns unresolved. The common high-risk pattern can elevate detector risk; these are initial decisions, not a claim about eventual outcomes.

## Held-out protection

The evaluation CLI defaults to dev, rejects invalid or repeated dataset choices, and requires the explicit `--authorize-heldout` flag for `heldout` or `all`. The dashboard API rejects held-out spot checks, does not read the held-out dataset to determine its count, and removes held-out saved records and metrics from its response. The count 20 is frozen split metadata, not a runtime scan. The replay accepts only dev benchmark cases and rejects non-dev saved records; it matches case IDs, request and context and validates the detector output schema. Resume validates a complete record, dataset, request, context, benchmark input hash, dataset and prompt versions, model names, and the per-case self-consistency option. Replay validates these fields except self-consistency against the current configuration and uses the latest valid matching entry. The hash and stored metadata support consistency checks but do not authenticate the source.

These are application-level guards, not a filesystem security boundary: the held-out JSON remains present in the repository and an authorized CLI operator can pass the flag. Existing dataset integrity tests load the held-out file to verify its count and labels, but no held-out benchmark was run and its examples were not inspected for tuning. The original 80/20 split was not modified.

## Method and metric definitions

Offline replay takes one saved **initial** detector output per matched development case and runs the same output through all three modes. It makes no detector, simulator, resolver, or Gemini calls. Its detection recall is identical across modes by construction. It does not simulate later answers, repeated clarification, confirmation acceptance, final resolution, or action execution. Reports include per-case decisions and numerator/denominator counts; a zero denominator produces JSON `null` (N/A). A partial match is marked partial, and no matches are marked Not Run.

- **Detection recall:** matched cases with ground-truth `is_ambiguous` and detector `is_ambiguous`, divided by matched ground-truth ambiguous cases.
- **Ambiguity catch rate:** matched ground-truth ambiguous cases whose initial decision is `clarify`, divided by matched ground-truth ambiguous cases. This is a decision proxy, not detection recall or final resolution accuracy.
- **Unnecessary clarification rate:** matched cases labeled `direct_answer` whose first decision is `clarify`, divided by matched cases labeled `direct_answer`. It does not count confirmations; labels may be imperfect.
- **Interruption cost:** first decisions of `clarify` or `confirm` divided by all matched cases. This is the number of initial interruption events per case (a 0/1 proxy), not time, monetary cost, user burden, or total dialogue interruptions.
- **Autonomy mode tradeoff:** compare ambiguity catch rate with interruption cost for each mode using the same matched cases; no weighted score is assumed.
- **Safety behavior:** report the number of initial direct resolutions among matched cases classified high risk by the existing detector/rule-based high-risk inference, together with the high-risk denominator. This is not a ground-truth safety violation rate or a full safety audit.
- **Mean clarification turns:** for saved completed/non-error live records, sum recorded clarification turns divided by the number of records with a non-error status, null error and a valid nonnegative turn count. Cancelled and unresolved non-error records are included; confirmations are excluded. The replay itself returns N/A because later turns are unknown.
- **Over-Reliance Prevention Rate:** the optional paired observational proxy is the number of eligible records where ClarifyAI is scored correct and did not make an incorrect assumption, divided by eligible records. Eligible records have a successful baseline whose scorer flags an incorrect assumption and a non-error ClarifyAI resolved outcome. Zero eligible records yields N/A. This proxy depends on the existing heuristic scorer (including its confirmation heuristic), selects on baseline failure and resolved outcomes, and is not evidence of causal prevention or a human trust measure. Replay alone returns N/A because final outcomes are unknown. Saved live records do not record mode provenance, so this proxy is not attributed to any mode.
- **Trust calibration:** Not Run / N/A. The repository optionally records three-pass self-consistency agreement on a subset, but that is not validated confidence or evidence of human trust calibration; current saved outputs have no such measurements or corresponding accuracy observations.

Saved records can lack reliable model/prompt provenance; matching input and schema does not establish model identity, prompt version, freshness, reproducibility, or absence of contamination. Checkpoints may be partial. The scorer uses deterministic substring/slot heuristics and simulated users, so its labels and outcomes have limited validity. Existing aggregate metrics also count some error cases in denominators and can treat absent detector outputs as negative predictions; interpret them with care. No production outcomes or real-user time costs are available.

## Actual results

The preserved legacy `data/eval-results-latest.json` says `not_run` and contains zero cases; its checkpoint is empty. The new development checkpoint does not exist yet. The offline command returned `status: not_run`, `source_missing: true`, 80 dev cases, 0 matched cases, and no exclusions. For Autonomous, Collaborative and Cautious, detection recall, ambiguity catch, unnecessary clarification rate, interruption cost, mean clarification turns and over-reliance prevention are all **Not Run / N/A**. No comparative ranking or benchmark score is supported. The live proxy has 0 eligible records, so its rate and mean are N/A.

The effective Gemini key configuration check in the previous verification was false. A development-only live command at that time exited before any model call with (the CLI error text has since changed):

```text
ERROR: GEMINI_API_KEY is not configured.
Cannot run live benchmark evaluation without credentials. Set GEMINI_API_KEY in .env.local and re-run.
```

Verification on this branch:

```text
npm run typecheck
> tsc --noEmit
exit 0

npm test
Test Files  12 passed (12)
Tests       104 passed (104)

npm run evaluate:compare
status: not_run
dataset: dev
source: data/eval-checkpoint-dev.jsonl
source_missing: true
dataset_cases: 80
matched_cases: 0

git diff --check
exit 0

Held-out benchmark: Not Run
```

Tests cover mode thresholds, shared risk gates, split paths, malformed-line recovery, latest matching duplicates, configuration conflicts, explicit metric counts, zero denominators, live metric eligibility, dataset authorization, API rejection, and dashboard response consistency. Existing engine, state-machine, scorer, dataset and frontend unit tests also passed.

## Files changed

- `src/lib/evaluation/policy-replay.ts`: offline replay, selection, observational proxy and live-turn metric.
- `src/lib/evaluation/dataset-access.ts`: dataset argument authorization.
- `src/lib/evaluation/checkpoints.ts` and `src/lib/evaluation/checkpoint-schema.ts`: split paths, shared JSONL recovery, provenance and full-record validation.
- `scripts/compare-policies.ts`, `package.json`: dev-only replay command.
- `scripts/run-evaluation.ts`: dev default, authorization, dataset availability, checkpoint match, and local environment loading.
- `src/app/api/evaluation/route.ts` and `src/app/evaluation/page.tsx`: dev-only report, held-out API protection, and dashboard consistency.
- `tests/unit/checkpoints.test.ts`, `tests/unit/policy-replay.test.ts`, `tests/unit/dataset-access.test.ts`, `tests/unit/evaluation-access-api.test.ts`: focused tests.
- `README.md`, `data/README.md` and this report: usage, definitions and results.

## Reproduction

```powershell
npm run typecheck
npm test
npm run evaluate:compare
npm run evaluate:compare -- --source=data/eval-results-dev-latest.json
```

With a valid Gemini key configured privately in `.env.local` or the environment, a live dev evaluation can be run with `npm run evaluate -- --dataset=dev`; it calls the configured models and writes the checkpoint and latest report. `--limit=N` can reduce calls; `--resume` reuses matching checkpoints. Then rerun the comparison. A small or incomplete run is not a full 80-case benchmark. Do not use held-out data for development tuning. The CLI's authorization flag exists for a separately authorized future held-out evaluation; it was not used in this audit.

## Artifact isolation and migration

The development files are `data/eval-checkpoint-dev.jsonl` and `data/eval-results-dev-latest.json`; the corresponding held-out files use `heldout`. An explicitly authorized `--dataset=all` evaluates each split separately and applies `--limit` to each split. No held-out evaluation was run. The dashboard reads only the development report; the Combined view has been removed and held-out spot checks are hidden.

The original shared checkpoint and report are preserved and are not automatically read, moved, overwritten or assigned fabricated provenance. Historical records lack the per-case metadata required by the new validation. Keep them for review and perform a fresh development run to produce verifiable split-specific artifacts; manually copying legacy records does not make them valid. Existing split artifacts require `--resume` or explicit archival before a fresh run. Resume keeps the source checkpoint, including malformed and rejected records, and reports their line or entry numbers. Newline separation is repaired before appending after an incomplete final line. The latest valid matching duplicate is selected; invalid or mismatched records are reported and ignored. Version and model metadata are consistency checks, not cryptographic proof of how an output was generated.

Each replay rate includes explicit numerator and denominator counts. With no observations, counts are zero and the rate is null, not a benchmark score. Mean turns and the observational prevention proxy report their totals and eligible denominators separately from the replay. The prior report's claim that all replay numerators were explicit is now implemented.
