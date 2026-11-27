import { makeProvenance, parseCheckpoint, type RunConfig } from "./checkpoints";
import { COMPARISON_VERSION, summarizeModeComparison, validateComparisonGroup, type ComparisonGroup } from "./mode-comparison";
import type { BenchmarkCase, CaseEvaluationRecord } from "@/types/evaluation";

interface Store {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: "utf8"): string;
  statSync(path: string): {size: number};
  appendFileSync(path: string, value: string): void;
  writeFileSync(path: string, value: string): void;
}
export function selectComparisonCases(args: string[], dataset: BenchmarkCase[]) {
  if (args.some(a => a !== "--resume" && !/^--limit=\d+$/.test(a) && !a.startsWith("--cases=") && !/^--max-retries=\d+$/.test(a))) throw new Error("Unsupported argument; development only.");
  const limits = args.filter(a => a.startsWith("--limit="));
  const selections = args.filter(a => a.startsWith("--cases="));
  const retries = args.filter(a => a.startsWith("--max-retries="));
  const maxRetries = retries.length ? Number(retries[0].slice(14)) : 3;
  if (retries.length > 1 || !Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 3) throw new Error("--max-retries must be an integer from 0 to 3.");
  if (limits.length > 1 || (limits.length && (!Number.isSafeInteger(Number(limits[0].slice(8))) || Number(limits[0].slice(8)) < 1))) throw new Error("Specify one positive --limit.");
  if (selections.length > 1 || (limits.length && selections.length)) throw new Error("--cases and --limit are mutually exclusive.");
  if (!dataset.length || dataset.some(c => c.dataset !== "dev") || new Set(dataset.map(c => c.id)).size !== dataset.length) throw new Error("Invalid development dataset.");
  const ids = selections.length ? selections[0].slice(8).split(",") : null;
  if (ids && (ids.some(id => !id || id !== id.trim()) || new Set(ids).size !== ids.length)) throw new Error("--cases requires distinct, nonempty development IDs.");
  const index = new Map(dataset.map(c => [c.id, c]));
  if (ids && ids.some(id => !index.has(id))) throw new Error("Unknown or non-development case ID.");
  return ids ? ids.map(id => index.get(id)!) : limits.length ? dataset.slice(0, Number(limits[0].slice(8))) : dataset;
}

export async function runComparisonArtifacts(input: {
  args: string[]; dataset: BenchmarkCase[]; config: RunConfig;
  evaluate: (c: BenchmarkCase) => Promise<CaseEvaluationRecord[]>;
  fs: Store; paths: {checkpoint: string; report: string};
}) {
  const {args, dataset, config, evaluate, fs, paths} = input;
  const chosen = selectComparisonCases(args, dataset);
  const retryArg = args.find(a => a.startsWith("--max-retries="));
  if ((config.max_retries ?? 3) !== (retryArg ? Number(retryArg.slice(14)) : 3)) throw new Error("Retry configuration does not match --max-retries.");
  const resume = args.includes("--resume");
  if (!resume && (fs.existsSync(paths.checkpoint) || fs.existsSync(paths.report))) throw new Error("Existing comparison artifacts preserved; use --resume or archive them.");
  let existing: {version:string; config:RunConfig; groups?: ComparisonGroup[]} | undefined;
  if (resume && fs.existsSync(paths.report)) {
    existing = JSON.parse(fs.readFileSync(paths.report, "utf8"));
    if (!existing) throw new Error("Existing comparison report is incompatible and was preserved.");
    if (existing.version !== COMPARISON_VERSION || JSON.stringify(existing.config) !== JSON.stringify(config))
      throw new Error("Existing comparison report is incompatible and was preserved; archive it before starting a new run.");
  }
  const old = resume && fs.existsSync(paths.checkpoint) ? parseCheckpoint(fs.readFileSync(paths.checkpoint, "utf8")) : {entries: [], issues: []};
  if (old.issues.length) throw new Error("Malformed comparison checkpoint; artifact preserved.");
  const selected = new Map<string, ComparisonGroup>();
  const source = new Map<string, "report" | "checkpoint">();
  const index = new Map(dataset.map(c => [c.id, c]));
  const previousGroups = Array.isArray(existing?.groups) ? existing.groups : [];
  const usable = (g: ComparisonGroup) => g.entries.every(e => e.record.baseline.error === null &&
    !!e.record.baseline.response?.trim() && e.record.clarify_ai.error === null && e.record.clarify_ai.final_status !== "ERROR");
  for (const group of previousGroups) {
    const c = index.get(group?.case_id);
    if (c && validateComparisonGroup(group, c, config) && usable(group)) {
      selected.set(c.id, group);
      source.set(c.id, "report");
    }
  }

  // Check provenance for every checkpoint entry before any calls or writes.
  // A compatible but invalid record is rejected; unverifiable or mismatched
  // provenance is incompatible and the entire checkpoint is preserved.
  // Valid counts include failed and duplicate compatible entries; duplicate and
  // failed are subsets. Rejected counts invalid records with verified provenance.
  let validCheckpointEntries = 0, rejectedCheckpointEntries = 0, duplicateCheckpointEntries = 0, failedCheckpointEntries = 0;
  const seenCheckpoint = new Set<string>();
  const validCheckpointGroups: ComparisonGroup[] = [];
  for (const raw of old.entries) {
    const group = raw as ComparisonGroup | null;
    const c = group && index.get(group.case_id);
    if (!group || !c || group.version !== COMPARISON_VERSION || !Array.isArray(group.entries) ||
        group.entries.length !== 3) throw new Error("Incompatible or unverifiable comparison checkpoint; artifact preserved.");
    const modes = ["autonomous", "collaborative", "cautious"] as const;
    for (const mode of modes) {
      const found = group.entries.filter(e => e?.mode === mode);
      if (found.length !== 1) throw new Error("Incompatible or unverifiable comparison checkpoint; artifact preserved.");
      const {record, provenance} = found[0];
      const expected = {...makeProvenance(c, config, false), autonomy_mode: mode, comparison_version: COMPARISON_VERSION};
      if (!record || !provenance || JSON.stringify(provenance) !== JSON.stringify(expected) ||
          record.autonomy_mode !== mode || record.dataset !== "dev" || record.case_id !== c.id ||
          record.original_request !== c.original_request || JSON.stringify(record.context) !== JSON.stringify(c.context))
        throw new Error("Incompatible or unverifiable comparison checkpoint; artifact preserved.");
    }
    if (!validateComparisonGroup(group, c, config)) { rejectedCheckpointEntries++; continue; }
    validCheckpointEntries++;
    if (seenCheckpoint.has(c.id)) duplicateCheckpointEntries++;
    seenCheckpoint.add(c.id);
    validCheckpointGroups.push(group);
    if (usable(group)) { selected.set(c.id, group); source.set(c.id, "checkpoint"); }
    else { failedCheckpointEntries++; selected.delete(c.id); source.delete(c.id); }
  }
  let needsNewline = fs.existsSync(paths.checkpoint) && fs.statSync(paths.checkpoint).size > 0 && !fs.readFileSync(paths.checkpoint, "utf8").endsWith("\n");
  const retained = new Map<string, ComparisonGroup>();
  for (const group of previousGroups) {
    const c = index.get(group?.case_id);
    if (c && validateComparisonGroup(group, c, config)) retained.set(c.id, group);
  }
  for (const group of validCheckpointGroups) retained.set(group.case_id, group);
  const groups: ComparisonGroup[] = [];
  let newCalls = 0, newRetries = 0, evaluatedCases = 0, reusedReportCases = 0, reusedCheckpointCases = 0;
  for (const c of chosen) {
    let group = selected.get(c.id);
    if (group) {
      if (source.get(c.id) === "report") reusedReportCases++;
      else reusedCheckpointCases++;
    } else {
      const results = await evaluate(c);
      group = { version: COMPARISON_VERSION, case_id: c.id, entries: results.map(record => ({
        mode: record.autonomy_mode!, provenance: {...makeProvenance(c, config, false),
          autonomy_mode: record.autonomy_mode!, comparison_version: COMPARISON_VERSION}, record,
      })) };
      if (!validateComparisonGroup(group, c, config)) throw new Error("Generated comparison group failed validation.");
      newCalls += results.reduce((sum, r) => sum + r.api_calls, 0);
      newRetries += results.reduce((sum, r) => sum + r.retries, 0);
      evaluatedCases++;
      fs.appendFileSync(paths.checkpoint, (needsNewline ? "\n" : "") + JSON.stringify(group) + "\n");
      needsNewline = false;
    }
    groups.push(group);
    retained.set(c.id, group);
  }
  const runUsage = { evaluated_cases: evaluatedCases, reused_cases: groups.length - evaluatedCases, api_calls: newCalls, retries: newRetries };
  const reportGroups = dataset.map(c => retained.get(c.id)).filter((g): g is ComparisonGroup => !!g);
  const summary = summarizeModeComparison(reportGroups, dataset.length);
  if (chosen.length < dataset.length && summary.status === "completed") summary.status = "partial";
  fs.writeFileSync(paths.report, JSON.stringify({version: COMPARISON_VERSION, config, groups: reportGroups, summary, selected_case_ids: chosen.map(c => c.id),
    run_usage: runUsage, generated_at: new Date().toISOString()}, null, 2));
  return {summary, run_usage: runUsage, malformed: old.issues.length, rejected: rejectedCheckpointEntries,
    checkpoint_counts: {valid: validCheckpointEntries, rejected: rejectedCheckpointEntries,
      duplicate: duplicateCheckpointEntries, failed: failedCheckpointEntries},
    reused_sources: {report: reusedReportCases, checkpoint: reusedCheckpointCases}};
}
