import fs from "node:fs/promises";
import path from "node:path";

import {
  BASELINE_OCR_FISCAL_YEARS,
  BASELINE_OCR_ORG_NUMBER,
  buildBaselineAnnualReportShadowBatchManifest,
} from "@/server/benchmarking/annual-report-shadow-batch";
import { readFlag, readListFlag } from "@/scripts/financial-script-utils";

async function main() {
  const orgNumber = readFlag("org-number") ?? BASELINE_OCR_ORG_NUMBER;
  const fiscalYears =
    readListFlag("years")?.map((value) => Number(value)).filter(Number.isInteger) ??
    [...BASELINE_OCR_FISCAL_YEARS];
  const outputPath =
    readFlag("output") ??
    path.join(
      process.cwd(),
      "output",
      "benchmarks",
      "annual-report-shadow-batches",
      `baseline-${orgNumber}.json`,
    );

  const manifest = await buildBaselineAnnualReportShadowBatchManifest({
    orgNumber,
    fiscalYears,
    name: readFlag("name"),
  });

  const absoluteOutputPath = path.resolve(process.cwd(), outputPath);
  await fs.mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  await fs.writeFile(
    absoluteOutputPath,
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  console.log(JSON.stringify(manifest, null, 2));
  console.log("");
  console.log(`Baseline manifest written to ${absoluteOutputPath}`);
}

main().catch((error) => {
  const message =
    error instanceof Error
      ? error.message
      : "Kunne ikke velge baseline OCR shadow batch.";

  if (
    message.includes("AnnualReportFiling") &&
    message.includes("does not exist")
  ) {
    console.error(
      "Baseline OCR shadow batch selection krever annual-report-tabellene i databasen. Kjor Prisma-migrasjonene / db push mot riktig database for du velger reelle filings.",
    );
    process.exitCode = 1;
    return;
  }

  console.error(message);
  process.exitCode = 1;
});
