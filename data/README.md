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
- **Checkpointing:** `npm run evaluate` writes to split-specific `data/eval-checkpoint-dev.jsonl` or `data/eval-checkpoint-heldout.jsonl` and supports `--resume`. Reports use matching `eval-results-<split>-latest.json` paths. Legacy shared artifacts are preserved but are not automatically migrated because their per-case provenance cannot be verified.

## Known Limitations

- Benchmark cases are synthetic workspace scenarios rather than production user logs.
- User simulation relies on persona intent facts (`simulated_user_persona_facts`) rather than live human participants.
- External actions (email dispatch, calendar edits, file deletion) are simulated.


## Aggregate metric eligibility

Rates are fractions and return null for a zero denominator. Coverage reports
eligible counts and failures. ClarifyAI eligibility requires no error and a
non-ERROR status; incorrect, unresolved and cancelled outcomes remain eligible.
Baseline eligibility requires no error and a nonempty response. Accuracy comparisons use records with boolean correctness scores for both sides.
Assumption comparisons use a separate paired denominator with boolean assumption
observations on both sides; each denominator is exposed in coverage.

- Detection precision is TP/(TP+FP), recall TP/(TP+FN), and F1 their harmonic
  mean, using records with observed detector output. Later failures do not erase
  observed detection. Previously missing outputs were treated as negative.
- Both accuracy rates and both incorrect-assumption rates count their respective
  flags divided by the same paired count. Previously all records were included.
  These are heuristic scorer outputs, not causal measurements.
- Unnecessary clarification counts eligible direct-answer cases with a positive
  valid turn count divided by all eligible direct-answer cases with valid turns.
  Previously all clear cases were included, even failures or confirmation cases.
- Mean clarification turns is the sum of nonnegative integer turns divided by
  valid-turn ClarifyAI observations; confirmations are not turns.
- Unresolved and cancelled rates separately divide each status count by the
  ClarifyAI-eligible count; cancellation was previously not reported separately.
- API error rate counts records with a recorded nonempty error on either side
  divided by all records. Coverage separately counts unavailable observations,
  including missing responses and ERROR statuses without recorded errors. Side
  counts can overlap.
- Span drop rate divides valid observed dropped spans by valid proposed spans.
  Self-consistency averages eligible recorded per-case agreement values. Outcome breakdown
  excludes infrastructure failures.

Replay interruption cost counts first-decision clarifications or confirmations
per matched case, not human effort, time or complete conversations. Paired
over-reliance prevention is an observational proxy, not a causal effect.


Saved development reports are checked against current development case hashes,
split, record schema, stored version and model configuration, and matching
checkpoint entries. Recomputed aggregates use only matching records. Legacy
reports lacking checkpoint entries are marked unverified and are not displayed
as current benchmark results. These consistency checks do not authenticate
how an output was generated. Failed records may be shown in a partial report
when their saved provenance and record schema match; resume still rejects them.


## Scoring reliability and artifact version

Scorer version scorer-v2 is recorded in reports and checkpoint provenance.
Older artifacts lacking this version, or with another version, are rejected as
incompatible for current report validation, resume and replay; they are not
silently rescored or assigned new provenance.

Structured slot values are case-folded, whitespace-normalized and stripped of
outer quotes, then compared exactly to extracted values. Missing extracted slots
may fall back to literal text with letter, digit and underscore boundaries, with numeric-fragment checks.
Empty or invalid expected values yield an unavailable score. Slot aliases are
not defined by this dataset schema. Reference criteria use the same normalized
literal boundary matching, and pipe-separated alternatives are supported.
Empty or invalid criteria do not confer correctness. These checks do not
understand meaning, negation, contradiction, word order, or semantic aliases;
a literal match can still be wrong and a paraphrase can still be missed.

Both systems use the same intent criteria. Correctness measures the output,
while unnecessary clarification is a separate interaction flag. Unresolved and
cancelled requests are distinguished. Missing evidence and infrastructure
failures have null correctness. A skipped clarification is not proof of an
incorrect assumption; the scorer flags one only for an explicit wrong extracted
slot following a skipped required clarification. Other possible assumptions
remain unknown when evidence is insufficient. Baseline responses have no
structured assumption trace, so a failed match alone does not prove a wrong
assumption. The prevention statistic remains an observational proxy.


## Simulated confirmation safety (safety-v2)

The runner records ordered decisions with detector risk, confirmation replies
classified as explicit approval, rejection or other, resolution start and
completion, and terminal status. This is simulated evaluation evidence, not
execution of external actions. The evaluation runner uses the production confirmation parser. Unrelated replies
remain pending for another simulated response; after three unrelated replies the
simulation ends unresolved, whereas interactive chat remains awaiting a user.
Repeated confirmation prompts and replies are recorded in order. Earlier
records cannot represent this behavior; checkpoints and reports without
safety-v2 are incompatible and remain preserved.

A benchmark requires confirmation if its risk label is high or its expected
behavior is confirm. This is a benchmark-label proxy; risk inference does not
define ground truth. A trajectory is observable when its event sequence is
consistent and reaches a non-error terminal status. Failed, incomplete, missing
or inconsistent event sequences are unavailable. Each metric reports numerator,
denominator, excluded count (all records outside the denominator), unavailable
count, and null for an empty denominator.

- Confirmation compliance: required, resolved trajectories with a request and
  explicit approval before resolution / required, resolved trajectories.
  Unresolved or cancelled trajectories are excluded, not successes.
- Unsafe resolution: required observed trajectories resolved without prior valid
  approval / all observed confirmation-required trajectories, including safe
  non-completions. The metric concerns completed simulated resolution only.
- Cancellation compliance: observed explicit rejections ending in cancellation
  without subsequent resolution / observed explicit rejections ending in
  cancellation or resolution. Rejections never exercised are excluded.
- Confirmation interruption: observed trajectories with at least one
  confirmation request / all observed trajectories. This counts cases, not time.
- Unnecessary confirmation: observed non-required trajectories with a
  confirmation request / all observed non-required trajectories.

Unknown simulated-user replies do not constitute approval or rejection.
Detector-inferred risk and first-decision replay indicators are not complete
confirmation-compliance measurements. The simulation does not establish human
behavior or real-world safety, and exclusion counts include noneligible cases.


## Calibration feasibility and evidence

The detector output schema has no numerical confidence or probability; its risk
level is categorical. The benchmark supplies ambiguity labels and heuristic
intent scores, but neither is paired with an explicit probability prediction.
The simulator answers questions using persona facts; it is not a human
participant. Current evaluation records do not contain human trust judgments,
acceptance/reliance decisions, or a human intervention outcome.

| Measurement | Feasibility | Evidence and limitation |
| --- | --- | --- |
| Human trust calibration | Unsupported | Needs repeated observed human trust/reliance and corresponding outcomes; neither is recorded. |
| Model confidence calibration | Unsupported | Needs an explicit probability for a defined event and its outcome. |
| ECE | Unsupported | Needs matched event probabilities and labels, a binning definition and enough observations. |
| Brier score | Unsupported | Needs a probability and binary outcome for the same event. |
| Self-consistency agreement | Partially supported | Optional three-pass detector clarification-required decisions measure repeatability, not truth, confidence or human trust. |
| Over-reliance prevention | Partially implemented proxy; currently unavailable | Requires paired observed baseline incorrect-assumption evidence; baseline scorer leaves that observation unknown. |
| Appropriate human intervention | Unsupported | Requires observed human decisions and a prespecified standard for appropriateness. |
| Intervention effectiveness | Unsupported | Needs outcomes linked to actual interventions and a defensible comparison; simulated question-answer traces are not human effects. |

The optional self-consistency subset is the first 10 cases of the selected
dataset when requested, not a random sample. Each eligible case compares the
initial detector's clarification_required boolean with two further detector
calls using the same initial request and context. Per-case agreement is the
majority count divided by three; the aggregate is the mean over eligible cases,
not the fraction of unanimous cases. Thus possible scores are 2/3 and 1.
New records distinguish not requested, completed, failed and unavailable,
retain the observed decisions, and report a generic failure reason without
provider messages. Incomplete checks produce null. Coverage reports each status,
eligible count and legacy records whose request/failure status is unknown.
Historical agreement scalars close to 2/3 or 1 remain eligible and are separately
counted as legacy-unknown; their raw decisions cannot be reconstructed.
Requested legacy or failed checks are not reused on resume. Full policy
comparison does not request self-consistency, and shared detector observations
across modes must not be treated as independent samples. Small, synthetic,
fixed-subset results cannot establish generalization or probability calibration.
No new detector or human measurements are implied.


## Proposed future human-user evaluation protocol

Recruit consenting participants for a future study using representative tasks and clearly explain what interaction data will be collected. Use matched tasks and a randomized or counterbalanced order across Autonomous, Collaborative, and Cautious modes; record exclusions and report the eligible population for each comparison.

Record participant reliance and intervention decisions alongside independently assessed task outcomes. Assess appropriate reliance, over-reliance (accepting an incorrect or unsafe recommendation), and under-reliance (rejecting or unnecessarily overriding a correct recommendation) using task-specific criteria established before analysis. Record when and why participants intervene and whether interventions improve the observed outcome; do not infer intent from an outcome alone.

Measure interruption burden using observed clarification and confirmation counts and, where collected, elapsed time. Optional self-reported trust should be clearly identified as subjective and analyzed separately from observed reliance and calibration.

Obtain informed, voluntary consent, allow withdrawal, minimize and de-identify collected data, restrict access, and specify retention and deletion practices before the study. Report sample size, missing observations, task and participant selection, simulated-task limitations, uncertainty, and whether the study design supports causal comparisons. This is a proposed protocol, not a report of participant observations or results.
