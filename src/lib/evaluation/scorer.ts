import type { ResolverSlot } from "@/types/ambiguity";
import type { BenchmarkCase, ResolutionOutcomeCategory } from "@/types/evaluation";

export const SCORING_VERSION = "scorer-v2";

export function normalizeSlotValue(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "").replace(/\s+/g, " ").toLowerCase();
}

// Literal phrase at Unicode letter/digit/underscore boundaries. Not semantic or negation-aware.
function containsLiteral(text: string, phrase: string): boolean {
  let pos = text.indexOf(phrase);
  const word = (c: string) => /[\p{L}\p{N}_]/u.test(c);
  while (pos >= 0) {
    const before = pos > 0 ? text[pos - 1] : "";
    const after = text[pos + phrase.length] ?? "";
    const numeric = /^[-+]?\d+(?:\.\d+)?$/.test(phrase);
    const numericFragment = numeric && ((before === "." && pos > 1 && /\d/.test(text[pos - 2])) ||
      (after === "." && /\d/.test(text[pos + phrase.length + 1] ?? "")) ||
      ((before === "-" || before === "+") && !phrase.startsWith(before)));
    if (!numericFragment && (!before || !word(before)) && (!after || !word(after))) return true;
    pos = text.indexOf(phrase, pos + 1);
  }
  return false;
}

export function matchRequiredSlots(params: {
  requiredSlots: Record<string, string>; extractedSlots?: ResolverSlot[];
  resolvedIntent: string | null; finalAnswer: string | null;
}): { matched: boolean | null; missingSlots: string[]; mismatchedSlots: Array<{key: string; expected: string; got: string | null}> } {
  const entries = Object.entries(params.requiredSlots);
  if (!entries.length || entries.some(([k, v]) => typeof k !== "string" || !normalizeSlotValue(k) || typeof v !== "string" || !normalizeSlotValue(v))) {
    return { matched: null, missingSlots: [], mismatchedSlots: [] };
  }
  const slots = new Map<string, string[]>();
  for (const item of params.extractedSlots ?? []) {
    if (typeof item?.key !== "string") continue;
    const key = normalizeSlotValue(item.key);
    const value = typeof item?.value === "string" ? normalizeSlotValue(item.value) : "";
    if (key) slots.set(key, [...(slots.get(key) ?? []), value]);
  }
  const text = normalizeSlotValue(`${params.resolvedIntent ?? ""} ${params.finalAnswer ?? ""}`);
  const missingSlots: string[] = [];
  const mismatchedSlots: Array<{key: string; expected: string; got: string | null}> = [];
  for (const [key, expected] of entries) {
    const wanted = normalizeSlotValue(expected);
    const values = slots.get(normalizeSlotValue(key));
    if (values) {
      if (values.length === 1 && values[0] === wanted) continue;
      if (values.length === 1 && !values[0]) { missingSlots.push(key); continue; }
      mismatchedSlots.push({ key, expected, got: values.join(", ") });
    } else if (!containsLiteral(text, wanted)) missingSlots.push(key);
  }
  return { matched: missingSlots.length === 0 && mismatchedSlots.length === 0, missingSlots, mismatchedSlots };
}

export function matchReferenceCriteria(params: {
  criteria: string[]; resolvedIntent: string | null; finalAnswer: string | null;
}): { passed: boolean | null; matchedCount: number; totalCount: number } {
  if (!Array.isArray(params.criteria) || !params.criteria.length ||
      params.criteria.some(c => typeof c !== "string" || !c.trim() || c.split("|").some(a => !a.trim()))) {
    return { passed: null, matchedCount: 0, totalCount: params.criteria?.length ?? 0 };
  }
  const text = normalizeSlotValue(`${params.resolvedIntent ?? ""} ${params.finalAnswer ?? ""}`);
  const matchedCount = params.criteria.filter(c => c.split("|").some(a => containsLiteral(text, normalizeSlotValue(a)))).length;
  return { passed: matchedCount === params.criteria.length, matchedCount, totalCount: params.criteria.length };
}

function intentScore(c: BenchmarkCase, intent: string | null, answer: string | null, slots?: ResolverSlot[]) {
  if (c.required_slots && Object.keys(c.required_slots).length) {
    const result = matchRequiredSlots({requiredSlots: c.required_slots, extractedSlots: slots, resolvedIntent: intent, finalAnswer: answer});
    return { score: result.matched, reason: result.matched === null ? "Invalid required-slot criteria." :
      `Required slots: ${result.missingSlots.length} missing, ${result.mismatchedSlots.length} mismatched.`,
      explicitMismatch: result.mismatchedSlots.length > 0 };
  }
  const result = matchReferenceCriteria({criteria: c.reference_criteria, resolvedIntent: intent, finalAnswer: answer});
  return { score: result.passed, reason: result.passed === null ? "No usable reference criteria." :
    `Matched ${result.matchedCount}/${result.totalCount} literal reference criteria.`, explicitMismatch: false };
}

export function scoreClarifyAICase(params: {
  benchmarkCase: BenchmarkCase; finalStatus: "RESOLVED" | "UNRESOLVED" | "CANCELLED" | "ERROR";
  clarificationTurns: number; resolvedIntent: string | null; finalAnswer: string | null;
  extractedSlots?: ResolverSlot[]; predictedAmbiguous: boolean;
}): { outcome_category: ResolutionOutcomeCategory; is_correct: boolean | null; unnecessary_clarification: boolean;
  made_incorrect_assumption: boolean | null; score_reason: string } {
  const c = params.benchmarkCase;
  const unnecessary = c.expected_clarification_behavior === "direct_answer" && params.clarificationTurns > 0;
  if (params.finalStatus === "ERROR") return {outcome_category: "evaluation_error", is_correct: null,
    unnecessary_clarification: unnecessary, made_incorrect_assumption: null, score_reason: "Evaluation infrastructure failed."};
  if (params.finalStatus === "UNRESOLVED" || params.finalStatus === "CANCELLED") return {
    outcome_category: params.finalStatus === "CANCELLED" ? "cancelled_request" : "unresolved_request",
    is_correct: false, unnecessary_clarification: unnecessary, made_incorrect_assumption: null,
    score_reason: params.finalStatus === "CANCELLED" ? "Request cancelled." : "Request unresolved." };
  if (!params.resolvedIntent?.trim() && !params.finalAnswer?.trim() && !(params.extractedSlots?.length)) return {
    outcome_category: "unscorable", is_correct: null, unnecessary_clarification: unnecessary,
    made_incorrect_assumption: null, score_reason: "No answer or extracted slots available to score." };
  const result = intentScore(c, params.resolvedIntent, params.finalAnswer, params.extractedSlots);
  const skipped = c.expected_clarification_behavior === "clarify" && params.clarificationTurns === 0;
  const assumption = skipped && result.score === false && result.explicitMismatch ? true : null;
  const category: ResolutionOutcomeCategory = result.score === null ? "unscorable" :
    result.score === false ? (assumption === true ? "incorrect_assumption" : "incorrect_resolution") :
    unnecessary ? "unnecessary_clarification" : params.clarificationTurns > 0 ? "correct_clarification_and_resolution" : "correct_direct_answer";
  return {outcome_category: category, is_correct: result.score, unnecessary_clarification: unnecessary,
    made_incorrect_assumption: assumption, score_reason: result.reason + (skipped ? " Required clarification was skipped; assumption evidence may be unavailable." : "")};
}

export function scoreBaselineCase(params: { benchmarkCase: BenchmarkCase; response: string | null; error: string | null
}): { is_correct: boolean | null; made_incorrect_assumption: boolean | null; score_reason: string } {
  if (params.error || !params.response?.trim()) return {is_correct: null, made_incorrect_assumption: null,
    score_reason: params.error ?? "No baseline response produced."};
  const result = intentScore(params.benchmarkCase, null, params.response);
  const assumption = null;
  return {is_correct: result.score, made_incorrect_assumption: assumption,
    score_reason: result.reason + " Baseline interaction compliance and unsupported assumptions are not inferred from text matching."};
}
