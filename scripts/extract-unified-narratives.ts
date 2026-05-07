/**
 * CLI: Extract narrative sections from a UnifiedParserDocument JSON fixture.
 *
 * Reads a UnifiedParserDocument fixture from disk, runs the narrative extractor,
 * validates the result, and prints a summary or JSON output.
 *
 * No DB access, no live Brreg, no OCR/ODL runtime. Fixture-only.
 * No file write unless --out is provided.
 *
 * Usage:
 *   npm run extract:unified-narratives -- \
 *     --fixture=<path-to-unified-parser-document.json> \
 *     [--json] \
 *     [--compact] \
 *     [--out=<output-path>]
 *
 * Exit codes:
 *   0  — success (warnings are non-fatal)
 *   1  — invalid input, missing fixture, or validation failure
 */

import { readFileSync, writeFileSync } from "node:fs";

import {
  compactUnifiedNarrativeExtractionResultForArtifact,
  extractUnifiedNarratives,
  serializeUnifiedNarrativeExtractionResultAsJson,
  validateUnifiedNarrativeExtractionResult,
} from "@/integrations/brreg/annual-report-financials/unified-narrative-extractor";
import type {
  UnifiedParserDocument,
} from "@/integrations/brreg/annual-report-financials/unified-parser-document-model";

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readOption(prefix: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function main() {
  const fixturePath = readOption("--fixture=");
  const outPath = readOption("--out=");
  const asJson = hasFlag("--json");
  const asCompact = hasFlag("--compact");

  if (!fixturePath) {
    throw new Error(
      "extract-unified-narratives requires --fixture=<path>. " +
        "Provide a UnifiedParserDocument JSON fixture produced by inspect:unified-parser-document or a builder.",
    );
  }

  let rawContent: string;
  try {
    rawContent = readFileSync(fixturePath, "utf-8");
  } catch (e) {
    throw new Error(`Could not read fixture file "${fixturePath}": ${String(e)}`);
  }

  let doc: UnifiedParserDocument;
  try {
    doc = JSON.parse(rawContent) as UnifiedParserDocument;
  } catch {
    throw new Error(`Fixture file "${fixturePath}" is not valid JSON.`);
  }

  const result = extractUnifiedNarratives(doc);
  const { valid, issues } = validateUnifiedNarrativeExtractionResult(result);

  if (!valid) {
    console.error("Validation FAILED:");
    for (const issue of issues.filter((i) => i.severity === "ERROR")) {
      console.error(`  ✗ [${issue.code}] ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const outputResult = asCompact
    ? compactUnifiedNarrativeExtractionResultForArtifact(result)
    : result;

  if (asJson) {
    const output = JSON.stringify(
      { valid, issues, result: outputResult },
      null,
      2,
    );
    if (outPath) {
      writeFileSync(outPath, output, "utf-8");
      console.log(`Output written to ${outPath}`);
    } else {
      console.log(output);
    }
    return;
  }

  // Human-readable summary
  const m = result.metrics;
  console.log(`\nUNIFIED NARRATIVE EXTRACTION`);
  console.log(`  Route            : ${result.source.route}`);
  console.log(`  Filing ID        : ${result.source.filingId ?? "—"}`);
  console.log(`  Generated at     : ${result.generatedAt}`);
  console.log(`\n  Metrics:`);
  console.log(`    ${"Board report found".padEnd(28)} : ${String(m.boardReportFound)}`);
  console.log(`    ${"Auditor report found".padEnd(28)} : ${String(m.auditorReportFound)}`);
  console.log(`    ${"Auditor opinion found".padEnd(28)} : ${String(m.auditorOpinionFound)}`);
  console.log(`    ${"Qualification found".padEnd(28)} : ${String(m.auditorQualificationFound)}`);
  console.log(`    ${"Emphasis of matter found".padEnd(28)} : ${String(m.emphasisOfMatterFound)}`);
  console.log(`    ${"Going concern signal".padEnd(28)} : ${String(m.goingConcernSignalFound)}`);
  console.log(`    ${"Signatures found".padEnd(28)} : ${String(m.signaturesFound)}`);
  console.log(`    ${"Other information found".padEnd(28)} : ${String(m.otherInformationFound)}`);
  console.log(`    ${"Total signals".padEnd(28)} : ${m.totalSignalCount}`);
  console.log(`    ${"Section count".padEnd(28)} : ${m.sectionCount}`);
  console.log(`    ${"Warnings".padEnd(28)} : ${m.warningCount}`);

  for (const section of result.sections) {
    console.log(`\n  Section: ${section.kind} (confidence=${section.confidence}, provenance=${section.provenance})`);
    console.log(`    Title       : ${section.title ?? "—"}`);
    console.log(`    Pages       : ${section.pageStart ?? "?"} – ${section.pageEnd ?? "?"}`);
    console.log(`    Signals     : ${section.signals.length}`);
    if (section.signals.length > 0) {
      const shown = section.signals.slice(0, 3);
      for (const sig of shown) {
        console.log(`      · "${sig.keyword}" (p.${sig.pageNumber ?? "?"})`);
      }
      if (section.signals.length > 3) {
        console.log(`      … and ${section.signals.length - 3} more`);
      }
    }
    if (section.textPreview) {
      const preview = section.textPreview.slice(0, 120).replace(/\n/g, " ");
      console.log(`    Preview     : ${preview}${section.textPreview.length > 120 ? "…" : ""}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log(`\n  Warnings:`);
    for (const w of result.warnings) {
      console.log(`    ⚠ ${w}`);
    }
  }

  if (issues.some((i) => i.severity === "WARNING")) {
    console.log(`\n  Validation warnings:`);
    for (const issue of issues.filter((i) => i.severity === "WARNING")) {
      console.log(`    ⚠ [${issue.code}] ${issue.message}`);
    }
  }

  console.log(`\n  Safety:`);
  console.log(`    canUseForProductionRouting : false`);
  console.log(`    productionRoutingChanged   : false`);
  console.log(`    productionFactsMutated     : false`);
  console.log(`    publishAffected            : false`);
  console.log(`    shadowOnly                 : ${String(result.safety.shadowOnly)}`);

  if (outPath) {
    writeFileSync(
      outPath,
      serializeUnifiedNarrativeExtractionResultAsJson(outputResult),
      "utf-8",
    );
    console.log(`\nFull result written to ${outPath}`);
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
