import { readFile } from "node:fs/promises";
import path from "node:path";

import { importShareholdingSnapshot } from "@/server/shareholdings/shareholding-importer";

async function main() {
  const [, , orgNumber, taxYearArg, filePath] = process.argv;

  if (!orgNumber || !taxYearArg || !filePath) {
    throw new Error(
      "Bruk: npx tsx scripts/import-shareholding-snapshot.ts <orgnr> <aar> <filsti>",
    );
  }

  const taxYear = Number.parseInt(taxYearArg, 10);
  if (!Number.isInteger(taxYear)) {
    throw new Error(`Ugyldig aar: ${taxYearArg}`);
  }

  const absolutePath = path.resolve(filePath);
  const rawText = await readFile(absolutePath, "utf8");

  const result = await importShareholdingSnapshot({
    orgNumber,
    taxYear,
    sourceKey: absolutePath,
    rawText,
  });

  console.log(
    JSON.stringify(
      {
        orgNumber,
        taxYear,
        ...result,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
