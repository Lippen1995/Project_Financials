import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { parsePdfDecisionGoldSetSnapshotJson } from "@/server/services/pdf-decision-gold-set-snapshot-service";

function readOption(prefix: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function defaultSnapshotPath() {
  return join(
    process.cwd(),
    "test",
    "fixtures",
    "annual-reports",
    "pdf-decision-gold-set-snapshot",
    "sample-approved-gold-set.json",
  );
}

function snapshotPath() {
  const requested =
    readOption("--file=") ?? process.argv.slice(2).find((arg) => !arg.startsWith("-"));
  return requested ? resolve(process.cwd(), requested) : defaultSnapshotPath();
}

function main() {
  const filePath = snapshotPath();
  const snapshot = parsePdfDecisionGoldSetSnapshotJson(readFileSync(filePath, "utf8"));
  console.log("PDF Decision gold-set snapshot");
  console.log(`File: ${filePath}`);
  console.log(`Items: ${snapshot.itemCount}`);
  console.log("Validation: passed");
  if (!process.env.DATABASE_URL) {
    console.log("DB compare: skipped because DATABASE_URL is not set.");
  } else {
    console.log("DB compare: skipped; this command validates portable snapshot shape only.");
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
