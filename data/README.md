# ClarifyAI Benchmark Dataset (`clarify-bench-v1.0`)

This directory contains the synthetic benchmark dataset for evaluating ambiguity identification, clarification decision-making, and intent resolution in natural language.

## Dataset Split

- **`dev-dataset.json`** — **80 development cases** used for prompt engineering, error analysis, and decision-policy tuning.
- **`heldout-dataset.json`** — **20 held-out cases** frozen prior to prompt tuning and isolated from the detector, user simulator, and baseline during evaluation.

### Category Coverage

Both splits span:
1. **Clear (`clear`)** — Unambiguous requests that must be answered directly with zero clarification turns (testing restraint against over-asking).
2. **Lexical (`lexical`)** — Words/names with multiple distinct senses in context (e.g., *Mercury* Bank vs *Mercury* search service).
3. **Referential (`referential`)** — Unresolved pronouns or underspecified nouns (*her*, *that draft*, *the meeting*) with multiple candidate antecedents.
4. **Contextual (`contextual`)** — Relative dates, timezones, or workspace-dependent references that collide or remain underspecified.
5. **Subjective (`subjective`)** — Open-ended quality qualifiers (*concise*, *executive*, *modern*, *better*) requiring audience/format disambiguation.
6. **Syntactic / Semantic (`syntactic`, `semantic`)** — Structural attachment ambiguity or scope ambiguity (*clear the cache*, *only notify managers on Fridays*).
7. **Multi-Turn (`multi_turn`)** — Compound requests needing sequential disambiguation across up to 2 clarification turns, plus high-risk confirmation gates.

## Labeling Guidelines & Ambiguity Definitions

Annotators classify each request using seven canonical ambiguity types:
- `lexical`: A word or domain term has multiple distinct meanings.
- `referential`: A pronoun or definite noun phrase lacks a unique antecedent.
- `contextual`: Interpretation depends on unstated situational, temporal, or workspace facts.
- `subjective`: Evaluative/style criteria vary materially across users.
- `syntactic`: Grammatical structure allows multiple parse trees (e.g., PP attachment).
- `semantic`: Logical scope, quantifier, or operation target is underspecified.
- `pragmatic`: Indirect speech act or high-impact intent requires explicit confirmation or intent check.

### Clarification Decision Policy
- `direct_answer`: Request is sufficiently clear; asking a question would be unnecessary friction.
- `clarify`: Multiple materially distinct interpretations or missing required slots exist; guessing risks an incorrect outcome.
- `confirm`: Intent is clear, but the action is destructive, irreversible, or high-impact.

## Reviewer & Reconciliation Instructions

1. Two reviewers independently label `is_ambiguous`, `expected_ambiguity_types`, and `expected_clarification_behavior` without viewing each other's annotations.
2. Compute inter-annotator agreement using:
   ```bash
   npm run compute-kappa -- annotator1.json annotator2.json
   ```
3. Reconcile any disagreements by discussing whether guessing could lead to a materially wrong action, and record the final reconciled labels.
4. Reviewer agreement is reported as **pending** until dual-annotator files are reconciled.

## Evaluation Methodology & Held-Out Protection

- **Held-out isolation:** Expected labels, `required_slots`, `reference_criteria`, and `expected_final_intent` are stripped before passing inputs to the baseline, detector, or user simulator. Only `scorer.ts` accesses ground-truth fields.
- **Deterministic scoring:**
  - Referential and contextual cases with `required_slots` require exact normalized slot matches (no credit for plausible guesses with wrong dates/entities).
  - Lexical, subjective, syntactic, semantic, and multi-turn cases use explicit binary `reference_criteria`.
- **Checkpointing:** `npm run evaluate` writes every completed case to `data/eval-checkpoint.jsonl` and supports `--resume`.

## Known Limitations

- Benchmark cases are synthetic workspace scenarios rather than production user logs.
- User simulation relies on persona intent facts (`simulated_user_persona_facts`) rather than live human participants.
- External actions (email dispatch, calendar edits, file deletion) are simulated.
