import fs from "node:fs";
import path from "node:path";

/**
 * Computes Cohen's kappa between two independent annotators' ambiguity labels.
 * Usage:
 *   npm run compute-kappa -- path/to/annotator1.json path/to/annotator2.json
 *
 * Each JSON file should be an array of { id: string, is_ambiguous: boolean }.
 */
export function computeCohensKappa(
  labelsA: boolean[],
  labelsB: boolean[]
): number | null {
  if (labelsA.length === 0 || labelsA.length !== labelsB.length) {
    return null;
  }

  const n = labelsA.length;
  let bothTrue = 0;
  let bothFalse = 0;
  let aTrueBFalse = 0;
  let aFalseBTrue = 0;

  for (let i = 0; i < n; i += 1) {
    if (labelsA[i] && labelsB[i]) bothTrue += 1;
    else if (!labelsA[i] && !labelsB[i]) bothFalse += 1;
    else if (labelsA[i] && !labelsB[i]) aTrueBFalse += 1;
    else aFalseBTrue += 1;
  }

  const po = (bothTrue + bothFalse) / n;
  const pATrue = (bothTrue + aTrueBFalse) / n;
  const pBTrue = (bothTrue + aFalseBTrue) / n;
  const pAFalse = (bothFalse + aFalseBTrue) / n;
  const pBFalse = (bothFalse + aTrueBFalse) / n;
  const pe = pATrue * pBTrue + pAFalse * pBFalse;

  if (1 - pe === 0) return null;
  return Number(((po - pe) / (1 - pe)).toFixed(4));
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log("Cohen's Kappa Status: PENDING");
    console.log(
      "Two independent annotator label files have not been provided yet."
    );
    console.log(
      "Usage: npm run compute-kappa -- <annotator-a.json> <annotator-b.json>"
    );
    process.exit(0);
  }

  const fileA = path.resolve(process.cwd(), args[0]);
  const fileB = path.resolve(process.cwd(), args[1]);

  if (!fs.existsSync(fileA) || !fs.existsSync(fileB)) {
    console.error("Annotator file(s) not found.");
    process.exit(1);
  }

  const dataA = JSON.parse(fs.readFileSync(fileA, "utf8")) as Array<{
    id: string;
    is_ambiguous: boolean;
  }>;
  const dataB = JSON.parse(fs.readFileSync(fileB, "utf8")) as Array<{
    id: string;
    is_ambiguous: boolean;
  }>;

  const mapB = new Map(dataB.map((item) => [item.id, item.is_ambiguous]));
  const alignedA: boolean[] = [];
  const alignedB: boolean[] = [];

  for (const item of dataA) {
    if (mapB.has(item.id)) {
      alignedA.push(item.is_ambiguous);
      alignedB.push(mapB.get(item.id)!);
    }
  }

  const kappa = computeCohensKappa(alignedA, alignedB);
  if (kappa === null) {
    console.log("Cohen's Kappa: N/A (insufficient overlapping labels or zero variance)");
    process.exit(0);
  }

  console.log(`Aligned cases: ${alignedA.length}`);
  console.log(`Cohen's Kappa: ${kappa}`);
}

if (require.main === module) {
  main();
}
