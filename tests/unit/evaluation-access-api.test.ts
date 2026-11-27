// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import { GET, POST } from "@/app/api/evaluation/route";
vi.mock("node:fs/promises", () => ({ default: { readFile: vi.fn() } }));
describe("evaluation API held-out lock", () => {
  beforeEach(() => vi.clearAllMocks());
  it("rejects held-out requests before requiring credentials or reading the dataset", async () => {
    const request = new NextRequest("http://localhost/api/evaluation", {
      method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({dataset: "heldout"})
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(fs.readFile).not.toHaveBeenCalled();
  });
  it("returns frozen split metadata without reading held-out examples", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("unavailable"));
    const response = await GET();
    const body = await response.json();
    expect(body.datasets.heldout_locked).toBe(true);
    expect(body.datasets.heldout_count).toBe(20);
    expect(vi.mocked(fs.readFile).mock.calls.some(call => String(call[0]).includes("heldout-dataset"))).toBe(false);
  });
  it("does not return held-out records or aggregates from a saved report", async () => {
    vi.mocked(fs.readFile).mockImplementation(async (file) => {
      if (String(file).includes("eval-results")) return JSON.stringify({
        cases: [{ dataset: "dev", case_id: "dev-1" }, { dataset: "heldout", case_id: "hidden" }],
        dev_metrics: { sample_size: 1 }, heldout_metrics: { sample_size: 1 }, combined_metrics: { sample_size: 2 }
      });
      return "[]";
    });
    const body = await (await GET()).json();
    expect(body.report.cases).toEqual([{ dataset: "dev", case_id: "dev-1" }]);
    expect(body.report.heldout_metrics).toBeNull();
    expect(body.report.combined_metrics).toBeNull();
  });
  it("uses dev-only artifacts and returns Not Run when no dev cases are available", async () => {
    vi.mocked(fs.readFile).mockImplementation(async file => String(file).includes("eval-results") ? JSON.stringify({cases: [], status: "completed", dev_metrics: {sample_size: 5}}) : "[]");
    const body = await (await GET()).json();
    expect(body.report.status).toBe("not_run");
    expect(body.report.total_cases).toBe(0);
    expect(body.report.dev_metrics).toBeNull();
    expect(vi.mocked(fs.readFile).mock.calls.some(call => String(call[0]).includes("eval-results-dev-latest.json"))).toBe(true);
    expect(vi.mocked(fs.readFile).mock.calls.some(call => String(call[0]).includes("eval-results-heldout"))).toBe(false);
  });
});
