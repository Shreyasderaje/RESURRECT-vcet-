import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within, fireEvent, cleanup } from "@testing-library/react";
import EvaluationPage from "@/app/evaluation/page";

vi.mock("@/components/layout/app-header", () => ({AppHeader: () => null}));
vi.mock("@/components/layout/app-sidebar", () => ({AppSidebar: () => null}));
vi.mock("@/components/evaluation/spot-check-button", () => ({SpotCheckButton: () => null}));
const metric = (accuracy:number|null) => ({
  sample_size:2, resolution_accuracy:accuracy, mean_clarification_turns:0,
  detection_recall:0, unnecessary_clarification_rate:null, unresolved_request_rate:0,
  cancelled_request_rate:0, incorrect_assumption_rate:null, api_error_rate:0,
  coverage:{paired:2,paired_assumption:0,clarify:2,direct_answer:2},
  safety:{unsafe_resolution:{rate:0,denominator:2,unavailable:0},
    confirmation_compliance:{rate:null,denominator:0}, confirmation_interruption:{rate:0,denominator:2},
    cancellation_compliance:{rate:null,denominator:0}}
});
const payload = (status:string) => ({
 report:{status:"not_run", cases:[], dev_metrics:null, heldout_metrics:null,
   kappa_status:{cohens_kappa:null,note:"pending"}},
 datasets:{dev_count:80,heldout_count:20,heldout_locked:true},
 spot_check:{enabled:false,has_api_key:false,max_cases:5,daily_limit:0},
 offline_policy_replay:{methodology:"offline_first_decision_replay",sample_size:1,
   modes:[{mode:"autonomous",ambiguity_catch_rate:0,interruption_cost:0}]},
 trajectory_comparison:{status,matched_cases:2,common_accuracy_cases:1,rejected_groups:1,
   modes:["autonomous","collaborative","cautious"].map((mode,index)=>({
     mode, metrics:metric(index===0 ? 0 : index===1 ? 1 : null),common_accuracy:index===0 ? 0 : null,
     initial_ambiguity_catch:{rate:null,denominator:0}, initial_interruption:{rate:0,denominator:2}}))}
});
afterEach(() => {cleanup(); vi.unstubAllGlobals();});
describe("trajectory dashboard", () => {
 it("renders modes with their values, common eligibility, partial status and locked held-out", async () => {
   vi.stubGlobal("fetch", vi.fn(async () => ({ok:true,json:async()=>payload("partial")})));
   render(<EvaluationPage />);
   const section = await screen.findByRole("region",{name:"Autonomy mode comparison"});
   expect(within(section).getByText(/Full simulated trajectories: partial/)).toBeTruthy();
   expect(within(section).getByText(/common accuracy population 1/)).toBeTruthy();
   expect(within(section).getByText(/Offline first-decision replay/)).toBeTruthy();
   const rows = within(section).getAllByRole("row");
   expect(within(rows[1]).getByText("autonomous")).toBeTruthy();
   expect(within(rows[1]).getAllByText(/0.0%/).length).toBeGreaterThan(0);
   expect(within(rows[2]).getByText(/100.0%/)).toBeTruthy();
   expect(within(rows[3]).getAllByText(/N\/A/).length).toBeGreaterThan(0);
   expect(within(rows[1]).getAllByText(/2 eligible/).length).toBeGreaterThan(0);
   fireEvent.click(screen.getByRole("button",{name:/Held-Out Locked/}));
   expect(screen.queryByRole("region",{name:"Autonomy mode comparison"})).toBeNull();
 });
 it("labels unverified comparison and missing observations without fabricating results", async () => {
   const data=payload("unverified");
   data.trajectory_comparison.matched_cases=0;
   data.trajectory_comparison.common_accuracy_cases=0;
   data.trajectory_comparison.modes.forEach(m => { m.metrics = null as never; m.common_accuracy=null; });
   vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>data})));
   render(<EvaluationPage />);
   const section=await screen.findByRole("region",{name:"Autonomy mode comparison"});
   expect(within(section).getByText(/Full simulated trajectories: unverified/)).toBeTruthy();
   expect(within(section).getAllByText(/N\/A/).length).toBeGreaterThan(0);
 });
});
