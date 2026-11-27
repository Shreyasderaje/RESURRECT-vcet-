import { beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateModeComparison, evaluateSingleCase } from "@/lib/evaluation/runner";
import { COMPARISON_VERSION, summarizeModeComparison, validateComparisonGroup, type ComparisonGroup } from "@/lib/evaluation/mode-comparison";
import { selectComparisonCases, runComparisonArtifacts } from "@/lib/evaluation/comparison-artifacts";
import { makeProvenance } from "@/lib/evaluation/checkpoints";
import type { BenchmarkCase } from "@/types/evaluation";

vi.mock("@/lib/ai/baseline", () => ({runBaselineAssistant: vi.fn(async () => ({available:true,response:"ok",error:null}))}));
vi.mock("@/lib/ai/detector", () => ({detectAmbiguity: vi.fn(async () => ({analysis:{
  is_ambiguous:false, ambiguity_types:[], ambiguous_spans:[], possible_interpretations:[], missing_information:[],
  risk_level:"low", clarification_required:false, clarification_reason:"clear", clarification_question:null,
  suggested_options:[], resolved_intent:"ok"},spanValidation:{total_proposed:0,valid_count:0,dropped_count:0}}))}));
vi.mock("@/lib/ai/decision-engine", () => ({MAX_CLARIFICATION_TURNS:2, evaluateDecision:vi.fn((input) =>
  ({action:input.autonomy_mode !== "autonomous" && input.clarificationTurnsUsed === 0 ? "clarify" : "resolve",question:"Which?",suggested_options:[]}))}));
vi.mock("@/lib/evaluation/user-simulator", () => ({simulateUserAnswer:vi.fn(async () => ({answer:"answer"}))}));
vi.mock("@/lib/ai/resolver", () => ({resolveRequest:vi.fn(async () => ({resolution:{is_fully_resolved:true,resolved_intent:"ok",final_answer:"ok",extracted_slots:[]}}))}));
import { runBaselineAssistant } from "@/lib/ai/baseline";
import { detectAmbiguity } from "@/lib/ai/detector";
import { evaluateDecision } from "@/lib/ai/decision-engine";
import { simulateUserAnswer } from "@/lib/evaluation/user-simulator";
import { computeSafetyMetrics } from "@/lib/evaluation/safety";

const benchmark: BenchmarkCase = {id:"d",dataset:"dev",category:"clear",original_request:"test",context:{},
 is_ambiguous:false,expected_ambiguity_types:[],expected_interpretations:[], expected_clarification_behavior:"direct_answer",
 reference_criteria:["ok"],expected_final_intent:"ok",risk_level:"low"};
const config = {dataset_version:"d",scoring_version:"s",safety_version:"v",prompt_version:"p",model_primary:"m",model_fast:"f"};
describe("full mode comparisons", () => {
 beforeEach(() => { vi.clearAllMocks(); vi.mocked(evaluateDecision).mockImplementation((input) => ({action:input.autonomy_mode !== "autonomous" && input.clarificationTurnsUsed === 0 ? "clarify" : "resolve",question:"Which?",suggested_options:[]} as never)); });
 it("shares initial inputs while isolating divergent trajectories and propagating modes", async () => {
   const result = await evaluateModeComparison(benchmark);
   expect(result.map(r => r.autonomy_mode)).toEqual(["autonomous","collaborative","cautious"]);
   expect(runBaselineAssistant).toHaveBeenCalledTimes(1);
   expect(detectAmbiguity).toHaveBeenCalledTimes(3);
   const detectorInputs = vi.mocked(detectAmbiguity).mock.calls.map(c => c[0].clarificationAnswers);
   expect(detectorInputs[0]).not.toBe(detectorInputs[1]);
   expect(detectorInputs[1]).not.toBe(detectorInputs[2]);
   expect(detectorInputs[1]).toHaveLength(1);
   expect(detectorInputs[2]).toHaveLength(1);
   expect(result.map(r => r.clarify_ai.clarification_turns)).toEqual([0,1,1]);
   expect(result[0].clarify_ai.detector_output).toEqual(result[1].clarify_ai.detector_output);
   const decisions = vi.mocked(evaluateDecision).mock.calls.map(c => c[0]);
   expect(decisions.map(d => d.autonomy_mode)).toEqual(["autonomous","collaborative","collaborative","cautious","cautious"]);
   expect(decisions.map(d => d.clarificationTurnsUsed)).toEqual([0,0,1,0,1]);
   const group: ComparisonGroup = {version:COMPARISON_VERSION,case_id:"d", entries:result.map(record => ({
     mode:record.autonomy_mode!, record, provenance:{...makeProvenance(benchmark,config,false),
       autonomy_mode:record.autonomy_mode!,comparison_version:COMPARISON_VERSION}}))};
   expect(validateComparisonGroup(group, benchmark, config)).toBe(true);
   const summary = summarizeModeComparison([group], 1);
   expect(summary.common_accuracy_cases).toBe(1);
   expect(summary.modes.map(m => m.common_accuracy)).toEqual([1,1,1]);
   const otherRecords = await evaluateModeComparison({...benchmark,id:"other"});
   const other: ComparisonGroup = {version:COMPARISON_VERSION,case_id:"other",entries:otherRecords.map(record => ({
     mode:record.autonomy_mode!, record, provenance:{...makeProvenance({...benchmark,id:"other"},config,false),
       autonomy_mode:record.autonomy_mode!,comparison_version:COMPARISON_VERSION}}))};
   other.entries[1].record.clarify_ai.is_correct = null;
   const paired = summarizeModeComparison([group,other], 2);
   expect(paired.common_accuracy_cases).toBe(1);
   expect(paired.modes.map(m => m.common_accuracy)).toEqual([1,1,1]);
   expect(paired.modes[1].metrics?.coverage.paired).toBe(1);
   expect(paired.modes[0].metrics?.coverage.paired).toBe(2);
   other.entries[2].record.clarify_ai.error = "failure";
   other.entries[2].record.clarify_ai.final_status = "ERROR";
   const failedSummary = summarizeModeComparison([group,other], 2);
   expect(failedSummary.status).toBe("partial");
   expect(failedSummary.modes[2].metrics?.sample_size).toBe(2);
   expect(failedSummary.modes[2].metrics?.coverage.clarify).toBe(1);
   const broken = structuredClone(group);
   broken.entries[1].record.clarify_ai.error = "failed";
   broken.entries[1].record.clarify_ai.final_status = "ERROR";
   expect(summarizeModeComparison([broken],1).status).toBe("partial");
   expect(summarizeModeComparison([broken],1).common_accuracy_cases).toBe(0);
   broken.entries[1].provenance.autonomy_mode = "cautious";
   expect(validateComparisonGroup(broken, benchmark, config)).toBe(false);
   expect(validateComparisonGroup(group, benchmark, {...config,model_primary:"other"})).toBe(false);
   expect(validateComparisonGroup(group, benchmark, {...config,scoring_version:"other"})).toBe(false);
   expect(validateComparisonGroup(group, benchmark, {...config,safety_version:"other"})).toBe(false);
   expect(COMPARISON_VERSION).toBe("trajectory-comparison-v3");
   expect(validateComparisonGroup({...group,version:"trajectory-comparison-v2"}, benchmark, config)).toBe(false);
 });
 it("resumes isolated synthetic artifacts without duplicating completed groups and reports new calls", async () => {
   const files = new Map<string,string>();
   const fs = {existsSync:(p:string)=>files.has(p), readFileSync:(p:string,_enc:"utf8")=>files.get(p)!,
     statSync:(p:string)=>({size:(files.get(p) ?? "").length}),
     appendFileSync:(p:string,v:string)=>{files.set(p,(files.get(p) ?? "")+v);},
     writeFileSync:(p:string,v:string)=>{files.set(p,v);} };
   const paths = {checkpoint:"memory/checkpoint",report:"memory/report"};
   const second = {...benchmark,id:"e", original_request:"other"};
   const evaluate = vi.fn(evaluateModeComparison);
   const base = {dataset:[benchmark,second], config, evaluate, fs, paths};
   const first = await runComparisonArtifacts({...base,args:["--limit=1"]});
   expect(first.summary.status).toBe("partial");
   expect(first.run_usage).toMatchObject({evaluated_cases:1,reused_cases:0});
   const original = files.get(paths.checkpoint)!;
   const resumed = await runComparisonArtifacts({...base,args:["--resume"]});
   expect(resumed.summary.status).toBe("completed");
   expect(resumed.run_usage).toMatchObject({evaluated_cases:1,reused_cases:1});
   expect(files.get(paths.checkpoint)!.split("\n").filter(Boolean)).toHaveLength(2);
   expect(files.get(paths.checkpoint)!.startsWith(original)).toBe(true);
   const before = files.get(paths.checkpoint);
   const noCalls = await runComparisonArtifacts({...base,args:["--resume","--limit=1"]});
   expect(noCalls.summary.status).toBe("partial");
   expect(noCalls.run_usage).toEqual({evaluated_cases:0,reused_cases:1,api_calls:0,retries:0});
   expect(files.get(paths.checkpoint)).toBe(before);
   const savedReport = files.get(paths.report);
   await expect(runComparisonArtifacts({...base,config:{...config,model_primary:"different"},args:["--resume"]})).rejects.toThrow("incompatible");
   expect(files.get(paths.report)).toBe(savedReport);
   for (const changed of [{scoring_version:"different"}, {safety_version:"different"}]) {
     await expect(runComparisonArtifacts({...base,config:{...config,...changed},args:["--resume"]})).rejects.toThrow("incompatible");
     expect(files.get(paths.report)).toBe(savedReport);
   }
   await expect(runComparisonArtifacts({...base,args:["--dataset=heldout"]})).rejects.toThrow("development only");
   const rows = JSON.parse(files.get(paths.report)!).groups[0].entries;
   expect(rows.every((x: {record:{case_id:string}}) => x.record.case_id === "d")).toBe(true);
   expect(rows[0].record.shared_usage.api_calls).toBe(2);
   expect(rows[1].record.shared_usage.api_calls).toBe(0);
 });

 it("retries a failed case as a whole and preserves the failed artifact", async () => {
   const files = new Map<string,string>();
   const fs = {existsSync:(p:string)=>files.has(p),readFileSync:(p:string,_enc:"utf8")=>files.get(p)!,
     statSync:(p:string)=>({size:(files.get(p) ?? "").length}), appendFileSync:(p:string,v:string)=>{files.set(p,(files.get(p) ?? "")+v);},
     writeFileSync:(p:string,v:string)=>{files.set(p,v);} };
   const paths = {checkpoint:"memory/failed",report:"memory/latest"};
   const failed = async (c:BenchmarkCase) => {
     const records = await evaluateModeComparison(c);
     records[1].clarify_ai.error = "failed"; records[1].clarify_ai.final_status = "ERROR";
     return records;
   };
   const base = {dataset:[benchmark],config,fs,paths};
   const first = await runComparisonArtifacts({...base,args:[],evaluate:failed});
   expect(first.summary.status).toBe("partial");
   const original = files.get(paths.checkpoint)!;
   const second = await runComparisonArtifacts({...base,args:["--resume"],evaluate:evaluateModeComparison});
   expect(second.run_usage).toMatchObject({evaluated_cases:1,reused_cases:0});
   expect(second.checkpoint_counts).toEqual({valid:1,rejected:0,duplicate:0,failed:1});
   expect(second.reused_sources).toEqual({report:0,checkpoint:0});
   expect(second.summary.status).toBe("completed");
   expect(files.get(paths.checkpoint)!.startsWith(original)).toBe(true);
   expect(files.get(paths.checkpoint)!.split("\n").filter(Boolean)).toHaveLength(2);
 });
 it("counts a failed shared attempt and its retry without charging other modes", async () => {
   vi.useFakeTimers();
   try {
     vi.mocked(runBaselineAssistant).mockRejectedValueOnce(new Error("temporary"));
     const running = evaluateModeComparison(benchmark);
     await vi.runAllTimersAsync();
     const rows = await running;
     expect(rows[0].shared_usage).toEqual({api_calls:3,retries:1});
     expect(rows[1].shared_usage).toEqual({api_calls:0,retries:0});
     expect(rows[2].shared_usage).toEqual({api_calls:0,retries:0});
     expect(rows.reduce((n,r)=>n+r.retries,0)).toBe(1);
   } finally { vi.useRealTimers(); }
 });
 it("keeps shared observations tied to their synthetic source case", async () => {
   const base = vi.mocked(runBaselineAssistant);
   const det = vi.mocked(detectAmbiguity);
   const oldBase = base.getMockImplementation()!;
   const oldDet = det.getMockImplementation()!;
   try {
     base.mockImplementation(async args => ({available:true,response:args.originalRequest,error:null} as never));
     det.mockImplementation(async args => {
       const original = await oldDet(args);
       return {...original,analysis:{...original.analysis,resolved_intent:args.originalRequest}};
     });
     const one = await evaluateModeComparison(benchmark);
     const two = await evaluateModeComparison({...benchmark,id:"e",original_request:"other"});
     expect(one.every(r => r.baseline.response === "test")).toBe(true);
     expect(two.every(r => r.baseline.response === "other")).toBe(true);
     expect(one.every(r => r.clarify_ai.detector_output?.resolved_intent === "test")).toBe(true);
     expect(two.every(r => r.clarify_ai.detector_output?.resolved_intent === "other")).toBe(true);
   } finally { base.mockImplementation(oldBase); det.mockImplementation(oldDet); }
 });
 it("keeps the formerly unsafe contradictory reply unresolved in every mode", async () => {
   vi.mocked(evaluateDecision).mockReturnValue({action:"confirm", question:"Confirm?", suggested_options:[]} as never);
   vi.mocked(simulateUserAnswer).mockResolvedValue({answer:"yes no"} as never);
   const rows = await evaluateModeComparison({...benchmark, risk_level:"high", expected_clarification_behavior:"confirm"});
   expect(rows.map(r => r.clarify_ai.final_status)).toEqual(["UNRESOLVED","UNRESOLVED","UNRESOLVED"]);
   expect(rows.map(r => computeSafetyMetrics([r]).unsafe_resolution.rate)).toEqual([0,0,0]);
   expect(rows.every(r => !r.clarify_ai.safety_events.some(e => e.type === "resolution_started"))).toBe(true);
 });
 it("keeps the default collaborative and rejects held-out comparison before model calls", async () => {
   const result = await evaluateSingleCase(benchmark);
   expect(result.autonomy_mode).toBe("collaborative");
   expect(vi.mocked(evaluateDecision).mock.calls.every(c => c[0].autonomy_mode === "collaborative")).toBe(true);
   vi.clearAllMocks();
   await expect(evaluateModeComparison({...benchmark,dataset:"heldout"})).rejects.toThrow("development-only");
   expect(detectAmbiguity).not.toHaveBeenCalled();
 });
 it("validates deterministic development case selection before calls", () => {
   const dataset = [benchmark, {...benchmark,id:"e"}, {...benchmark,id:"f"}];
   expect(selectComparisonCases(["--cases=f,d"],dataset).map(c=>c.id)).toEqual(["f","d"]);
   for (const arg of ["--cases=", "--cases=d,d", "--cases=heldout-001", "--cases=unknown", "--cases=d,,e", "--max-retries=4", "--max-retries=-1"]) {
     expect(() => selectComparisonCases([arg],dataset)).toThrow();
   }
   expect(() => selectComparisonCases(["--cases=d","--limit=1"],dataset)).toThrow();
   expect(() => selectComparisonCases(["--cases=d"],[{...benchmark,dataset:"heldout"}])).toThrow();
 });
 it("retains and extends selected groups without duplicate cases", async () => {
   const files = new Map<string,string>();
   const fs = {existsSync:(p:string)=>files.has(p),readFileSync:(p:string,_e:"utf8")=>files.get(p)!,
     statSync:(p:string)=>({size:(files.get(p) ?? "").length}),appendFileSync:(p:string,v:string)=>{files.set(p,(files.get(p) ?? "")+v);},
     writeFileSync:(p:string,v:string)=>{files.set(p,v);}};
   const dataset = [benchmark,{...benchmark,id:"e"},{...benchmark,id:"f"}];
   const paths = {checkpoint:"memory/select",report:"memory/select-report"};
   const evaluate = vi.fn(evaluateModeComparison);
   const base = {dataset,config,fs,paths,evaluate};
   const first = await runComparisonArtifacts({...base,args:["--cases=d"]});
   expect(first.summary.status).toBe("partial");
   expect(JSON.parse(files.get(paths.report)!).selected_case_ids).toEqual(["d"]);
   const saved = files.get(paths.report);
   await expect(runComparisonArtifacts({...base,config:{...config,max_retries:1},args:["--resume","--cases=d","--max-retries=1"]})).rejects.toThrow("incompatible");
   expect(files.get(paths.report)).toBe(saved);
   const second = await runComparisonArtifacts({...base,args:["--resume","--cases=d,e"]});
   expect(second.run_usage).toMatchObject({evaluated_cases:1,reused_cases:1});
   expect(second.summary.matched_cases).toBe(2);
   const third = await runComparisonArtifacts({...base,args:["--resume","--cases=f"]});
   expect(third.summary.status).toBe("partial");
   const report = JSON.parse(files.get(paths.report)!);
   expect(report.groups.map((g:ComparisonGroup)=>g.case_id)).toEqual(["d","e","f"]);
   expect(report.selected_case_ids).toEqual(["f"]);
   expect(files.get(paths.checkpoint)!.split("\n").filter(Boolean)).toHaveLength(3);
   expect(evaluate).toHaveBeenCalledTimes(3);
   expect(runBaselineAssistant).toHaveBeenCalledTimes(3);
   files.delete(paths.checkpoint);
   const fromReport = await runComparisonArtifacts({...base,args:["--resume","--cases=d"]});
   expect(fromReport.summary.matched_cases).toBe(3);
   expect(fromReport.run_usage).toMatchObject({evaluated_cases:0,reused_cases:1});
   expect(fromReport.rejected).toBe(0);
   expect(fromReport.checkpoint_counts).toEqual({valid:0,rejected:0,duplicate:0,failed:0});
   expect(fromReport.reused_sources).toEqual({report:1,checkpoint:0});
   expect(evaluate).toHaveBeenCalledTimes(3);
   files.set(paths.checkpoint, "");
   const empty = await runComparisonArtifacts({...base,args:["--resume","--cases=d"]});
   expect(empty.rejected).toBe(0);
   expect(empty.reused_sources).toEqual({report:1,checkpoint:0});
 });

 it("applies and records the evaluation retry limit", async () => {
   vi.useFakeTimers();
   try {
     vi.mocked(runBaselineAssistant).mockRejectedValueOnce(new Error("temporary"));
     const pending = evaluateModeComparison(benchmark,{maxRetries:1});
     await vi.runAllTimersAsync();
     const rows = await pending;
     expect(rows[0].shared_usage).toEqual({api_calls:3,retries:1});
     expect(rows.reduce((n,r)=>n+r.retries,0)).toBe(1);
     await expect(evaluateModeComparison(benchmark,{maxRetries:4})).rejects.toThrow("retry limit");
   } finally { vi.useRealTimers(); }
 });

 it("counts valid, rejected, duplicate and source-specific checkpoint observations", async () => {
   const files = new Map<string,string>();
   const fs = {existsSync:(p:string)=>files.has(p),readFileSync:(p:string,_e:"utf8")=>files.get(p)!,
     statSync:(p:string)=>({size:(files.get(p) ?? "").length}),appendFileSync:(p:string,v:string)=>{files.set(p,(files.get(p) ?? "")+v);},
     writeFileSync:(p:string,v:string)=>{files.set(p,v);}};
   const paths = {checkpoint:"memory/counts",report:"memory/counts-report"};
   const evaluate = vi.fn(evaluateModeComparison);
   const base = {dataset:[benchmark],config,fs,paths,evaluate};
   await runComparisonArtifacts({...base,args:[]});
   const original = files.get(paths.checkpoint)!;
   const valid = JSON.parse(original);
   const invalid = structuredClone(valid);
   invalid.entries[0].record.api_calls = -1;
   files.set(paths.checkpoint, original + original + JSON.stringify(invalid) + "\n");
   const resumed = await runComparisonArtifacts({...base,args:["--resume"]});
   expect(resumed.checkpoint_counts).toEqual({valid:2,rejected:1,duplicate:1,failed:0});
   expect(resumed.rejected).toBe(1);
   expect(resumed.reused_sources).toEqual({report:0,checkpoint:1});
   expect(resumed.run_usage).toMatchObject({evaluated_cases:0,reused_cases:1});
   expect(evaluate).toHaveBeenCalledTimes(1);
 });

 it("rejects incompatible checkpoint-only and mixed artifacts before calls or writes", async () => {
   const files = new Map<string,string>();
   const fs = {existsSync:(p:string)=>files.has(p),readFileSync:(p:string,_e:"utf8")=>files.get(p)!,
     statSync:(p:string)=>({size:(files.get(p) ?? "").length}),appendFileSync:(p:string,v:string)=>{files.set(p,(files.get(p) ?? "")+v);},
     writeFileSync:(p:string,v:string)=>{files.set(p,v);}};
   const paths = {checkpoint:"memory/incompatible",report:"memory/incompatible-report"};
   const evaluate = vi.fn(evaluateModeComparison);
   const base = {dataset:[benchmark],config,fs,paths,evaluate};
   await runComparisonArtifacts({...base,args:[]});
   const original = files.get(paths.checkpoint)!;
   const originalReport = files.get(paths.report)!;
   files.delete(paths.report);
   const compatible = await runComparisonArtifacts({...base,args:["--resume"]});
   expect(compatible.checkpoint_counts).toEqual({valid:1,rejected:0,duplicate:0,failed:0});
   expect(compatible.reused_sources).toEqual({report:0,checkpoint:1});
   expect(evaluate).toHaveBeenCalledTimes(1);
   files.delete(paths.report);
   const valid = JSON.parse(original);
   const variants = [
     (g:ComparisonGroup) => {g.version = "old";},
     (g:ComparisonGroup) => {g.case_id = "unknown";},
     (g:ComparisonGroup) => {g.entries[0].mode = "cautious";},
     (g:ComparisonGroup) => {g.entries[0].provenance.model_primary = "different";},
     (g:ComparisonGroup) => {g.entries[0].provenance.model_fast = "different";},
     (g:ComparisonGroup) => {g.entries[0].provenance.dataset_version = "different";},
     (g:ComparisonGroup) => {g.entries[0].provenance.prompt_version = "different";},
     (g:ComparisonGroup) => {g.entries[0].provenance.comparison_version = "different";},
     (g:ComparisonGroup) => {g.entries[0].provenance.autonomy_mode = "cautious";},
     (g:ComparisonGroup) => {g.entries[0].provenance.scoring_version = "different";},
     (g:ComparisonGroup) => {g.entries[0].provenance.safety_version = "different";},
     (g:ComparisonGroup) => {g.entries[0].provenance.max_retries = 1;},
     (g:ComparisonGroup) => {g.entries[0].provenance.input_hash = "different";},
     (g:ComparisonGroup) => {g.entries[0].record.dataset = "heldout";},
   ];
   for (const alter of variants) {
     const bad = structuredClone(valid) as ComparisonGroup;
     alter(bad);
     for (const contents of [JSON.stringify(bad)+"\n", original+JSON.stringify(bad)+"\n"]) {
       files.set(paths.checkpoint, contents);
       await expect(runComparisonArtifacts({...base,args:["--resume"]})).rejects.toThrow("Incompatible");
       expect(files.get(paths.checkpoint)).toBe(contents);
       expect(files.has(paths.report)).toBe(false);
       expect(evaluate).toHaveBeenCalledTimes(1);
     }
   }
   const mismatched = structuredClone(valid) as ComparisonGroup;
   mismatched.entries[0].provenance.model_primary = "different";
   const incompatibleWithReport = JSON.stringify(mismatched)+"\n";
   files.set(paths.checkpoint, incompatibleWithReport);
   files.set(paths.report, originalReport);
   await expect(runComparisonArtifacts({...base,args:["--resume"]})).rejects.toThrow("Incompatible");
   expect(files.get(paths.checkpoint)).toBe(incompatibleWithReport);
   expect(files.get(paths.report)).toBe(originalReport);
   expect(evaluate).toHaveBeenCalledTimes(1);
   files.delete(paths.report);
   files.set(paths.checkpoint, "{invalid json\n");
   await expect(runComparisonArtifacts({...base,args:["--resume"]})).rejects.toThrow("Malformed");
   expect(files.get(paths.checkpoint)).toBe("{invalid json\n");
   expect(evaluate).toHaveBeenCalledTimes(1);
 });

});
