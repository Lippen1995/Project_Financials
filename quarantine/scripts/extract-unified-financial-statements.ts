/**
 * CLI: Extract financial statements from a UnifiedParserDocument JSON fixture.
 *
 * Reads a UnifiedParserDocument fixture from disk, runs the hardened extractor,
 * validates the result, and prints a summary.
 *
 * No DB access, no live Brreg, no OCR/ODL runtime. Fixture-only.
 * No file write unless --out is provided.
 *
 * Usage:
 *   npm run extract:unified-financial-statements -- \
 *     --fixture=<path-to-unified-parser-document.json> \
 *     [--fiscal-year=2024] \
 *     [--json] \
 *     [--out=<output-path>]
 *
 * Exit codes:
 *   0  — success (warnings are non-fatal)
 *   1  — invalid input, missing fixture, or validation failure
 */

import { readFileSync, writeFileSync } from "node:fs";

import {
  extractUnifiedFinancialStatements,
  serializeUnifiedFinancialStatementExtractionResultAsJson,
  validateUnifiedFinancialStatementExtractionResult,
  validateUnifiedFinancialStatements,
} from "@/integrations/brreg/annual-report-financials/unified-financial-statement-extractor";
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
  const fiscalYearRaw = readOption("--fiscal-year=");
  const outPath = readOption("--out=");
  const asJson = hasFlag("--json");

  if (!fixturePath) {
    throw new Error(
      "extract-unified-financial-statements requires --fixture=<path>. " +
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

  let fiscalYear: number | undefined;
  if (fiscalYearRaw !== undefined) {
    fiscalYear = parseInt(fiscalYearRaw, 10);
    if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
      throw new Error(`--fiscal-year must be a 4-digit year, got: ${fiscalYearRaw}`);
    }
  }

  const result = extractUnifiedFinancialStatements(doc, { fiscalYear });
  const { valid, issues: structuralIssues } = validateUnifiedFinancialStatementExtractionResult(result);
  const { issues: statementIssues } = validateUnifiedFinancialStatements(result);

  if (!valid) {
    console.error("Structural validation FAILED:");
    for (const issue of structuralIssues) {
      console.error(`  - ${issue}`);
    }
    process.exitCode = 1;
    return;
  }

  if (asJson) {
    const output = JSON.stringify(
      { valid, structuralIssues, statementIssues, result },
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

  const m = result.metrics;
  console.log(`\nUNIFIED FINANCIAL STATEMENT EXTRACTION`);
  console.log(`  Route            : ${result.source.route}`);
  console.log(`  Filing ID        : ${result.source.filingId ?? "—"}`);
  console.log(`  Generated at     : ${result.generatedAt}`);
  console.log(`\n  Metrics:`);
  console.log(`    ${"Candidate tables".padEnd(28)} : ${m.candidateTableCount}`);
  console.log(`    ${"Parsed line items".padEnd(28)} : ${m.parsedLineItemCount}`);
  console.log(`    ${"Canonical mapped".padEnd(28)} : ${m.canonicalMappedCount}`);
  console.log(`    ${"Unmapped".padEnd(28)} : ${m.unmappedCount}`);
  console.log(`    ${"Warnings".padEnd(28)} : ${m.warningCount}`);
  console.log(`    ${"Errors".padEnd(28)} : ${m.errorCount}`);

  for (const stmt of result.statements) {
    const years = [...new Set(stmt.lineItems.map((i) => i.year))].sort((a, b) => a - b);
    console.log(`\n  Statement: ${stmt.kind} (confidence=${stmt.confidence})`);
    console.log(`    Pages       : ${stmt.pageNumbers.join(", ") || "—"}`);
    console.log(`    Years       : ${years.join(", ") || "—"}`);
    console.log(`    Line items  : ${stmt.lineItems.length}`);
    const mapped = stmt.lineItems.filter((i) => !!i.canonicalKey).length;
    console.log(`    Mapped      : ${mapped}/${stmt.lineItems.length}`);
    if (stmt.warnings.length > 0) {
      for (const w of stmt.warnings) {
        console.log(`    ⚠ ${w}`);
      }
    }

    // Show first few items
    const shown = stmt.lineItems.slice(0, 5);
    for (const item of shown) {
      const key = item.canonicalKey ?? "(unmapped)";
      const scale = item.unitScale !== "UNKNOWN" ? ` [${item.unitScale}]` : "";
      console.log(
        `      [${item.year}] ${item.originalLabel.slice(0, 30).padEnd(30)} → ${key.padEnd(35)} = ${item.value}${scale}`,
      );
    }
    if (stmt.lineItems.length > 5) {
      console.log(`      … and ${stmt.lineItems.length - 5} more`);
    }
  }

  if (statementIssues.length > 0) {
    console.log(`\n  Statement-level validation issues:`);
    for (const issue of statementIssues) {
      const icon = issue.severity === "ERROR" ? "✗" : "⚠";
      console.log(`    ${icon} [${issue.code}] ${issue.message}`);
    }
  }

  console.log(`\n  Safety:`);
  console.log(`    canUseForProductionRouting : false`);
  console.log(`    productionRoutingChanged   : false`);
  console.log(`    productionFactsMutated     : false`);
  console.log(`    publishAffected            : false`);
  console.log(`    shadowOnly                 : true`);

  if (outPath) {
    writeFileSync(outPath, serializeUnifiedFinancialStatementExtractionResultAsJson(result), "utf-8");
    console.log(`\nFull result written to ${outPath}`);
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
