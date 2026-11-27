export type EvaluationDataset = "dev" | "heldout" | "all";

export function parseEvaluationDataset(args: string[]): EvaluationDataset {
  const flags = args.filter(a => a.startsWith("--dataset="));
  if (flags.length > 1) throw new Error("Specify --dataset only once.");
  const dataset = flags.length ? flags[0].slice("--dataset=".length) : "dev";
  if (dataset !== "dev" && dataset !== "heldout" && dataset !== "all") {
    throw new Error("Invalid dataset. Use dev, heldout, or all.");
  }
  if (dataset !== "dev" && !args.includes("--authorize-heldout")) {
    throw new Error("Held-out evaluation requires --authorize-heldout.");
  }
  return dataset;
}
