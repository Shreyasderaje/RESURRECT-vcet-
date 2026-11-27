import { describe, it, expect } from "vitest";
import { parseEvaluationDataset } from "@/lib/evaluation/dataset-access";
describe("evaluation dataset access", () => {
  it("defaults to development and accepts explicit development", () => {
    expect(parseEvaluationDataset([])).toBe("dev");
    expect(parseEvaluationDataset(["--dataset=dev"])).toBe("dev");
  });
  it("requires explicit authorization for held-out and all", () => {
    expect(() => parseEvaluationDataset(["--dataset=heldout"])).toThrow(/authorize-heldout/);
    expect(() => parseEvaluationDataset(["--dataset=all"])).toThrow(/authorize-heldout/);
    expect(parseEvaluationDataset(["--dataset=heldout", "--authorize-heldout"])).toBe("heldout");
    expect(parseEvaluationDataset(["--dataset=all", "--authorize-heldout"])).toBe("all");
  });
  it("rejects ambiguous, empty, and unrecognized dataset flags", () => {
    expect(() => parseEvaluationDataset(["--dataset=dev", "--dataset=heldout"])).toThrow();
    expect(() => parseEvaluationDataset(["--dataset="])).toThrow();
    expect(() => parseEvaluationDataset(["--dataset=other"])).toThrow();
  });
});
