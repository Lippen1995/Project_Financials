import fs from "node:fs/promises";
import path from "node:path";

import { selectAnnualReportShadowBatchManifest } from "@/server/benchmarking/annual-report-shadow-batch";
import { readFlag, readListFlag, readNumberFlag } from "@/scripts/financial-script-utils";

async function main() {
  const outputPath =
    readFlag("output") ??
    path.join(
      process.cwd(),
      "output",
      "benchmarks",
      "annual-report-shadow-batches",
      "selected-manifest.json",
    );

  const manifest = await selectAnnualReportShadowBatchManifest({
    name: readFlag("name"),
    filingIds: readListFlag("filing-ids"),
    orgNumbers: readListFlag("org-numbers"),
    statuses: readListFlag("statuses"),
    fiscalYearFrom: readNumberFlag("fiscal-year-from"),
    fiscalYearTo: readNumberFlag("fiscal-year-to"),
    reviewStatuses: readListFlag("review-statuses"),
    ruleCodes: readListFlag("rule-codes"),
    desiredTags: readListFlag("tags"),
    onlyLatest: readFlag("only-latest") !== "false",
    requirePdfArtifact: readFlag("require-pdf") !== "false",
    limit: readNumberFlag("limit") ?? 20,
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
  console.log(`Manifest written to ${absoluteOutputPath}`);
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : "Kunne ikke velge annual-report shadow batch.";
  if (
    message.includes("AnnualReportFiling") &&
    message.includes("does not exist")
  ) {
    console.error(
      "Annual-report shadow batch selection requires a database with the annual-report ingestion tables. Kjor Prisma-migrasjonene / db push mot riktig database for du velger reelle filings.",
    );
    process.exitCode = 1;
    return;
  }

  console.error(
    message,
  );
  process.exitCode = 1;
});
