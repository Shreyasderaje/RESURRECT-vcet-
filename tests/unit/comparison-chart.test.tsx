import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AggregateMetrics } from "@/types/evaluation";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ data, children }: { data: unknown; children: React.ReactNode }) => <div data-testid="chart" data-values={JSON.stringify(data)}>{children}</div>,
  Bar: ({ dataKey }: { dataKey: string }) => <div data-testid="series">{dataKey}</div>,
  CartesianGrid: () => null, Legend: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}));
import { ComparisonChart } from "@/components/evaluation/comparison-chart";
afterEach(cleanup);

describe("rendered comparison chart", () => {
  it("renders missing and measured zero differently and never renders held-out values", () => {
    const metric = { baseline_resolution_accuracy: null, resolution_accuracy: 0,
      baseline_incorrect_assumption_rate: 0, incorrect_assumption_rate: null,
      detection_precision: null, detection_recall: 0, detection_f1: null } as AggregateMetrics;
    const heldout = { ...metric, detection_recall: 0.99 };
    render(<ComparisonChart activeMetrics={metric} devMetrics={metric} heldoutMetrics={heldout} partial />);
    const charts = screen.getAllByTestId("chart");
    const first = JSON.parse(charts[0].getAttribute("data-values")!);
    const second = JSON.parse(charts[1].getAttribute("data-values")!);
    expect(first[0].Baseline).toBeNull();
    expect(first[0].ClarifyAI).toBe(0);
    expect(second[1].Dev).toBe(0);
    expect(second.every((row: {HeldOut: unknown}) => row.HeldOut === null)).toBe(true);
    expect(screen.getByText(/held-out results are locked and unavailable/i)).toBeTruthy();
    expect(screen.getByText(/partial evaluation results/i)).toBeTruthy();
    expect(screen.queryByText("HeldOut")).toBeNull();
    expect(charts[1].getAttribute("data-values")).not.toContain("99");
  });

  it("renders unavailable charts without fabricated values", () => {
    render(<ComparisonChart activeMetrics={null} devMetrics={null} heldoutMetrics={null} />);
    expect(screen.getAllByTestId("chart").map(c => JSON.parse(c.getAttribute("data-values")!))).toEqual([[], []]);
    expect(screen.getByText(/missing values: N\/A/i)).toBeTruthy();
  });
});
