import "@/lib/env";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { prisma } from "@/lib/prisma";
import {
  formatMappingCoverageMarkdown,
  mapSimulatedDataset,
} from "@/server/financials/fi-sim/mapping/map-simulated-dataset";

/**
 * Maps a validated simulated dataset through the shared engine.
 *
 * Generation and mapping are two jobs because they answer two questions. Generation decides what
 * the figures are; mapping decides what they are called, and it can be re-run and re-published
 * against frozen figures without touching them. A dataset that has never been mapped shows its
 * as-reported lines and nothing else.
 */

type Options = {
  datasetReference: string;
  dryRun: boolean;
  reportPath: string | null;
  createdByUserId: string | null;
};

function parseOptions(argv: string[]): Options {
  const options: Options = {
    datasetReference: "",
    dryRun: false,
    reportPath: null,
    createdByUserId: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    const requireValue = () => {
      if (!value || value.startsWith("--")) throw new Error(`${argument} krever en verdi.`);
      index += 1;
      return value;
    };

    if (argument === "--dataset") options.datasetReference = requireValue();
    else if (argument === "--report") options.reportPath = requireValue();
    else if (argument === "--mapped-by") options.createdByUserId = requireValue();
    else if (argument === "--dry-run") options.dryRun = true;
    else throw new Error(`Ukjent argument: ${argument}`);
  }

  if (!options.datasetReference) {
    throw new Error("--dataset er påkrevd (datasettversjon eller id).");
  }
  return options;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const result = await mapSimulatedDataset({
    datasetReference: options.datasetReference,
    dryRun: options.dryRun,
    ...(options.createdByUserId ? { createdByUserId: options.createdByUserId } : {}),
  });

  if (options.reportPath) {
    await mkdir(dirname(resolve(options.reportPath)), { recursive: true });
    await writeFile(
      resolve(options.reportPath),
      formatMappingCoverageMarkdown(result, new Date()),
      "utf8",
    );
    console.log(`Mappingrapport skrevet til ${options.reportPath}.`);
  }

  const share = result.coverage.lines === 0
    ? 0
    : (result.coverage.mapped / result.coverage.lines) * 100;
  console.log(
    [
      `Datasett ${result.datasetVersion} (${result.datasetId}), mappingrevisjon ${result.mappingRevision}.`,
      `Linjer: ${result.coverage.lines}. Mappet: ${result.coverage.mapped} (${share.toFixed(1)} %). Umappet: ${result.coverage.unmapped}.`,
      `Metode: ${JSON.stringify(result.coverage.byMethod)}.`,
      result.dryRun
        ? "Tørrkjøring: ingenting er skrevet."
        : `Skrev ${result.written} mappingrader. Aktiver datasettet for å publisere dem.`,
    ].join("\n"),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
