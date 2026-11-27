import { describe, expect, it } from "vitest";
import devDataset from "../../data/dev-dataset.json";
import heldoutDataset from "../../data/heldout-dataset.json";
import presetScenarios from "../../data/preset-scenarios.json";
import { validateAmbiguousSpans } from "@/lib/ai/detector";
import type { PresetScenario } from "@/types/chat";
import type { BenchmarkCase } from "@/types/evaluation";

describe("benchmark dataset & presets integrity", () => {
  it("has 80 dev cases and 20 held-out cases with unique IDs", () => {
    const dev = devDataset as BenchmarkCase[];
    const heldout = heldoutDataset as BenchmarkCase[];

    expect(dev).toHaveLength(80);
    expect(heldout).toHaveLength(20);

    const allIds = [...dev, ...heldout].map((c) => c.id);
    expect(new Set(allIds).size).toBe(100);
    expect(dev.every((c) => c.dataset === "dev")).toBe(true);
    expect(heldout.every((c) => c.dataset === "heldout")).toBe(true);
  });

  it("includes both clear and ambiguous cases across splits", () => {
    const dev = devDataset as BenchmarkCase[];
    const heldout = heldoutDataset as BenchmarkCase[];

    expect(dev.filter((c) => !c.is_ambiguous).length).toBeGreaterThanOrEqual(15);
    expect(dev.filter((c) => c.is_ambiguous).length).toBeGreaterThanOrEqual(50);
    expect(heldout.filter((c) => !c.is_ambiguous).length).toBeGreaterThanOrEqual(3);
    expect(heldout.filter((c) => c.is_ambiguous).length).toBeGreaterThanOrEqual(15);
  });

  it("ensures all 6 preset scenarios have valid exact-substring spans", () => {
    const presets = presetScenarios as unknown as PresetScenario[];
    expect(presets).toHaveLength(6);

    for (const preset of presets) {
      const turn0 = preset.demo_turns[0].response;
      if (turn0.analysis && turn0.analysis.ambiguous_spans.length > 0) {
        const { stats } = validateAmbiguousSpans(
          preset.initial_request,
          turn0.analysis.ambiguous_spans
        );
        expect(stats.dropped_count).toBe(0);
      }
    }
  });
});
