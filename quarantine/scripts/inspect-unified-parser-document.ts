/**
 * CLI: Inspect a UnifiedParserDocument from a local JSON fixture.
 *
 * Reads a UnifiedParserDocument JSON fixture from disk, validates it,
 * and prints a summary. No live Brreg, no OCR/ODL runtime, no DB required.
 *
 * Usage:
 *   npm run inspect:unified-parser-document -- \
 *     --fixture=<path-to-json> \
 *     [--route=TEXT_LAYER|OCR|OPENDATALOADER_LOCAL|HYBRID] \
 *     [--json] \
 *     [--out=<output-path>]
 *
 * Exit codes:
 *   0  — success
 *   1  — invalid input or validation failure
 */

import { readFileSync, writeFileSync } from "node:fs";

import {
  buildUnifiedParserDocumentFromTextLayer,
  buildUnifiedParserDocumentSummary,
  compactUnifiedParserDocumentForArtifact,
  serializeUnifiedParserDocumentAsJson,
  validateUnifiedParserDocument,
} from "@/integrations/brreg/annual-report-financials/unified-parser-document-model";
import type {
  UnifiedParserDocument,
  UnifiedParserRoute,
} from "@/integrations/brreg/annual-report-financials/unified-parser-document-model";

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readOption(prefix: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const VALID_ROUTES: UnifiedParserRoute[] = [
  "TEXT_LAYER",
  "OCR",
  "OPENDATALOADER_LOCAL",
  "HYBRID",
];

function main() {
  const fixturePath = readOption("--fixture=");
  const routeRaw = readOption("--route=");
  const outPath = readOption("--out=");
  const asJson = hasFlag("--json");

  let doc: UnifiedParserDocument;

  if (fixturePath) {
    // Load from fixture
    let raw: string;
    try {
      raw = readFileSync(fixturePath, "utf-8");
    } catch (e) {
      throw new Error(`Could not read fixture file "${fixturePath}": ${String(e)}`);
    }

    try {
      doc = JSON.parse(raw) as UnifiedParserDocument;
    } catch {
      throw new Error(`Fixture file "${fixturePath}" is not valid JSON.`);
    }
  } else {
    // Build a trivial demo document from the specified route
    const route: UnifiedParserRoute = (routeRaw as UnifiedParserRoute | undefined) ?? "TEXT_LAYER";
    if (!VALID_ROUTES.includes(route)) {
      throw new Error(`--route must be one of ${VALID_ROUTES.join(", ")}, got "${routeRaw ?? ""}".`);
    }

    console.warn(`[inspect-unified-parser-document] No --fixture provided; building minimal demo document for route=${route}.`);
    doc = buildUnifiedParserDocumentFromTextLayer({
      pages: [],
      source: { route },
      shadowOnly: true,
    });
  }

  // Validate
  const { valid, issues } = validateUnifiedParserDocument(doc);
  if (!valid) {
    console.error("Validation FAILED:");
    for (const issue of issues) {
      console.error(`  - ${issue}`);
    }
    process.exitCode = 1;
    return;
  }

  const summary = buildUnifiedParserDocumentSummary(doc);
  const compact = compactUnifiedParserDocumentForArtifact(doc);

  if (asJson) {
    const output = JSON.stringify({ valid, summary, compact }, null, 2);
    if (outPath) {
      writeFileSync(outPath, output, "utf-8");
      console.log(`Output written to ${outPath}`);
    } else {
      console.log(output);
    }
    return;
  }

  console.log(`\nUNIFIED PARSER DOCUMENT INSPECTION`);
  console.log(`  Version          : ${doc.version}`);
  console.log(`  Generated at     : ${doc.generatedAt}`);
  console.log(`  Route            : ${doc.source.route}`);
  console.log(`  Filing ID        : ${doc.source.filingId ?? "—"}`);
  console.log(`  Org number       : ${doc.source.orgNumber ?? "—"}`);
  console.log(`  Fiscal year      : ${String(doc.source.fiscalYear ?? "—")}`);
  console.log(`\n  Metrics:`);
  console.log(`    ${"Page count".padEnd(28)} : ${doc.metrics.pageCount}`);
  console.log(`    ${"Processed pages".padEnd(28)} : ${doc.metrics.processedPageCount}`);
  console.log(`    ${"Text chars".padEnd(28)} : ${doc.metrics.textCharCount}`);
  console.log(`    ${"Table count".padEnd(28)} : ${doc.metrics.tableCount}`);
  console.log(`    ${"Section count".padEnd(28)} : ${doc.metrics.sectionCount}`);
  console.log(`    ${"Warning count".padEnd(28)} : ${doc.metrics.warningCount}`);
  console.log(`    ${"Error count".padEnd(28)} : ${doc.metrics.errorCount}`);
  console.log(`\n  Summary flags:`);
  console.log(`    ${"hasFinancialStatements".padEnd(28)} : ${String(summary.hasFinancialStatements)}`);
  console.log(`    ${"hasBoardReport".padEnd(28)} : ${String(summary.hasBoardReport)}`);
  console.log(`    ${"hasAuditorReport".padEnd(28)} : ${String(summary.hasAuditorReport)}`);
  console.log(`\n  Safety:`);
  console.log(`    ${"canUseForProductionRouting".padEnd(28)} : false`);
  console.log(`    ${"productionRoutingChanged".padEnd(28)} : false`);
  console.log(`    ${"productionFactsMutated".padEnd(28)} : false`);
  console.log(`    ${"publishAffected".padEnd(28)} : false`);
  console.log(`    ${"shadowOnly".padEnd(28)} : ${String(doc.safety.shadowOnly)}`);
  console.log(`\n  Validation       : PASSED`);

  if (doc.sections.length > 0) {
    console.log(`\n  Sections:`);
    for (const s of doc.sections) {
      console.log(`    [${s.kind.padEnd(22)}] pages ${s.pageStart}–${s.pageEnd} (confidence=${String(s.confidence ?? "n/a")})`);
    }
  }

  if (doc.warnings.length > 0) {
    console.log(`\n  Warnings:`);
    for (const w of doc.warnings) {
      console.log(`    - ${w}`);
    }
  }

  if (outPath) {
    writeFileSync(outPath, serializeUnifiedParserDocumentAsJson(compact as unknown as UnifiedParserDocument), "utf-8");
    console.log(`\nCompact artifact written to ${outPath}`);
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
