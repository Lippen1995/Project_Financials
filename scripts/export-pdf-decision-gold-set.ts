import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  buildPdfDecisionGoldSetSnapshot,
  type PdfDecisionGoldSetSnapshot,
} from "@/server/services/pdf-decision-gold-set-snapshot-service";
import { listPdfDecisionGoldSet } from "@/server/services/pdf-decision-gold-set-service";

function readOption(prefix: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function readNumberOption(prefix: string): number | undefined {
  const value = readOption(prefix);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function writeSnapshot(snapshot: PdfDecisionGoldSetSnapshot) {
  const json = JSON.stringify(snapshot, null, 2);
  const outputPath = readOption("--out=");
  if (!outputPath) {
    console.log(json);
    return;
  }
  const resolved = resolve(process.cwd(), outputPath);
  if (dirname(resolved) === process.cwd() && !outputPath.includes(".json")) {
    throw new Error("--out must point to an explicit JSON file path.");
  }
  writeFileSync(resolved, `${json}\n`, "utf8");
  console.log(`Wrote PDF Decision gold-set snapshot to ${resolved}`);
}

async function main() {
  const items = await listPdfDecisionGoldSet({
    status: readOption("--status=") ?? "APPROVED",
    limit: readNumberOption("--limit="),
    fiscalYear: readNumberOption("--fiscalYear="),
    orgNumber: readOption("--orgNumber="),
  });
  writeSnapshot(buildPdfDecisionGoldSetSnapshot(items));
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
