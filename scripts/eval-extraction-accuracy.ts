/**
 * Extraction-accuracy eval — value-level recall + precision vs the published
 * fasit, across every filing that has published line items.
 *
 * Runs the SAME in-process value path production uses for scanned Del 1
 * (extractOcrPages -> classifyPages -> reconstructStatementRowsGeometryFirst ->
 * mapRowsToCanonicalFacts with the DB-backed metric definitions), then compares
 * the canonical metricKey->value facts against PublishedFinancialLineItem at the
 * (metricKey, scope, year) grain. Scope is the Del 1 STATUTORY pages (whole NOK),
 * which is what geometry-first handles; both sides are restricted to those pages.
 *
 * Usage: npx tsx scripts/eval-extraction-accuracy.ts
 */
import fs from "node:fs";
import path from "node:path";

import { PDFParse } from "pdf-parse";

import { prisma } from "@/lib/prisma";
import { extractOcrPages } from "@/integrations/brreg/annual-report-financials/ocr";
import { classifyPages } from "@/integrations/brreg/annual-report-financials/page-classification";
import {
  detectYearColumnAnchorsForPage,
  reconstructStatementRowsGeometryFirst,
  type ColumnAnchor,
} from "@/integrations/brreg/annual-report-financials/geometry-first-reconstruction";
import { mapRowsToCanonicalFacts } from "@/integrations/brreg/annual-report-financials/canonical-mapping";
import type { ReconstructedRow } from "@/integrations/brreg/annual-report-financials/types";
import { loadMetricDefinitions } from "@/server/services/metric-mapping-service";
import { loadRequiredPublishMetricKeys } from "@/server/services/canonical-registry-service";
import {
  compareFactsToFasit,
  type AccuracyFact,
  type AccuracyResult,
} from "@/server/services/extraction-accuracy-service";

const ARTIFACTS_DIR = "C:/Users/simen/Project_Financials/output/annual-report-artifacts";
const OUT_DIR = path.join(process.cwd(), "output", "benchmarks", "annual-report-extraction-accuracy");
const DEL1_MAX_PAGE = 15; // Brønnøysund Del 1 statutory forms sit in the first pages.
const STATUTORY_TYPES = new Set([
  "STATUTORY_INCOME",
  "STATUTORY_BALANCE",
  "STATUTORY_BALANCE_CONTINUATION",
]);

function pdfPathFor(filingId: string): string | null {
  const dir = path.join(ARTIFACTS_DIR, filingId, "pdf");
  if (!fs.existsSync(dir)) return null;
  const name = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith(".pdf"));
  return name ? path.join(dir, name) : null;
}

async function getPageCount(buf: Buffer): Promise<number> {
  const parser = new PDFParse({ data: buf });
  try {
    const info = (await parser.getInfo()) as { total?: number };
    return info.total ?? 0;
  } finally {
    await parser.destroy();
  }
}

async function extractStatutoryFacts(
  buf: Buffer,
  filingFiscalYear: number,
  definitions: Awaited<ReturnType<typeof loadMetricDefinitions>>,
  requiredKeys: string[],
): Promise<{ facts: AccuracyFact[]; statutoryPages: Set<number> }> {
  const total = await getPageCount(buf);
  const pages = Array.from({ length: Math.min(total, DEL1_MAX_PAGE) }, (_, i) => i + 1);
  const ocrPages = await extractOcrPages(buf, pages);
  const classifications = classifyPages(ocrPages);
  const classByPage = new Map(classifications.map((c) => [c.pageNumber, c]));

  const statutoryPages = new Set(
    classifications.filter((c) => STATUTORY_TYPES.has(c.type)).map((c) => c.pageNumber),
  );

  // Reconstruct with geometry-first (the path we are improving; production's
  // primary `reconstructStatementRows` truncates badly on scans — measured at
  // ~0.9% canonical recall). Inherit year anchors into continuation pages that
  // lack their own header, mirroring extraction-loop.
  const sortedOcr = [...ocrPages].sort((a, b) => a.pageNumber - b.pageNumber);
  let lastAnchors: ColumnAnchor[] | undefined;
  const rows: ReconstructedRow[] = [];
  for (const page of sortedOcr) {
    const cls = classByPage.get(page.pageNumber);
    if (!cls || !statutoryPages.has(page.pageNumber)) continue;
    const own = detectYearColumnAnchorsForPage(page);
    if (own.length >= 2) lastAnchors = own;
    const inherited = own.length >= 2 ? undefined : lastAnchors;
    rows.push(...reconstructStatementRowsGeometryFirst(page, cls, inherited));
  }

  const mapped = mapRowsToCanonicalFacts({
    filingFiscalYear,
    classifications,
    rows,
    definitions,
    requiredKeys,
    // The fasit carries both the filing year and the comparative year; measure
    // how much of the prior-year column the extractor recovers (production
    // currently discards it, forcing the reviewer to hand-enter every value).
    emitComparativeYears: true,
  });

  const facts: AccuracyFact[] = mapped.facts
    .filter((f) => statutoryPages.has(f.sourcePage))
    .map((f) => ({
      metricKey: f.metricKey,
      statementScope: f.statementScope,
      fiscalYear: f.fiscalYear,
      value: String(Math.round(f.value)),
    }));

  return { facts, statutoryPages };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const definitions = await loadMetricDefinitions();
  const requiredKeys = [...(await loadRequiredPublishMetricKeys())];

  // Filings that have published fasit.
  const published = await prisma.publishedFinancialLineItem.groupBy({
    by: ["filingId", "companyId"],
    _count: { _all: true },
  });

  const perFiling: Array<{
    filingId: string;
    company: string | null;
    fiscalYear: number;
    result: AccuracyResult;
  }> = [];

  for (const grp of published) {
    const filing = await prisma.annualReportFiling.findUnique({
      where: { id: grp.filingId },
      select: { id: true, fiscalYear: true, company: { select: { name: true, orgNumber: true } } },
    });
    if (!filing) continue;
    const pdf = pdfPathFor(filing.id);
    if (!pdf) {
      console.log(`SKIP ${filing.company?.name ?? filing.id}: no local PDF artifact`);
      continue;
    }

    console.log(`\n=== ${filing.company?.name ?? filing.id} FY${filing.fiscalYear} ===`);
    const buf = fs.readFileSync(pdf);
    const { facts: extracted, statutoryPages } = await extractStatutoryFacts(
      buf,
      filing.fiscalYear,
      definitions,
      requiredKeys,
    );

    const fasitRows = await prisma.publishedFinancialLineItem.findMany({
      where: { filingId: filing.id, value: { not: null }, sourcePage: { in: [...statutoryPages] } },
      select: { metricKey: true, statementScope: true, fiscalYear: true, value: true },
    });
    const fasit: AccuracyFact[] = fasitRows.map((r) => ({
      metricKey: r.metricKey,
      statementScope: r.statementScope,
      fiscalYear: r.fiscalYear,
      value: r.value!.toString(),
    }));

    // Value-level recall (ignore metricKey/scope/year): did extraction READ the
    // fasit number at all, anywhere? Decouples reading quality from mapping.
    const extractedValueSet = new Set(extracted.map((f) => f.value));
    const nonZeroFasit = fasit.filter((f) => f.value !== "0");
    const valueRead = nonZeroFasit.filter((f) => extractedValueSet.has(f.value)).length;
    console.log(
      `  VALUE-level recall (read anywhere): ${pct(nonZeroFasit.length ? valueRead / nonZeroFasit.length : 1)}  (${valueRead}/${nonZeroFasit.length})  | extracted facts total: ${extracted.length}`,
    );

    const result = compareFactsToFasit({ extracted, fasit });
    perFiling.push({
      filingId: filing.id,
      company: filing.company?.name ?? null,
      fiscalYear: filing.fiscalYear,
      result,
    });

    console.log(`  statutory pages: ${[...statutoryPages].sort((a, b) => a - b).join(", ")}`);
    console.log(`  recall (non-zero): ${pct(result.recallNonZero)}  (${result.matchedNonZero}/${result.nonZeroFasitTotal})  | raw incl. ${result.zeroValuedFasit} zero-lines: ${pct(result.recall)}`);
    console.log(`  precision:         ${pct(result.precision)}  (${result.correctTotal}/${result.extractedOnFasitSlots})`);
    if (result.wrong.length) {
      console.log(`  WRONG (confidently incorrect):`);
      for (const w of result.wrong.slice(0, 12)) {
        console.log(`    ${w.metricKey} [${w.statementScope} ${w.fiscalYear}] produced ${w.value}, fasit ${w.producedInstead.join("/")}`);
      }
    }
    const nonZeroMissing = result.missing.filter((m) => !m.isZero);
    if (nonZeroMissing.length) {
      console.log(`  MISSING (non-zero, not produced):`);
      for (const m of nonZeroMissing.slice(0, 12)) {
        console.log(`    ${m.metricKey} [${m.statementScope} ${m.fiscalYear}] fasit ${m.value}`);
      }
    }
  }

  // Aggregate
  const agg = perFiling.reduce(
    (a, p) => {
      a.matchedNonZero += p.result.matchedNonZero;
      a.nonZeroFasitTotal += p.result.nonZeroFasitTotal;
      a.correct += p.result.correctTotal;
      a.extractedOnFasitSlots += p.result.extractedOnFasitSlots;
      return a;
    },
    { matchedNonZero: 0, nonZeroFasitTotal: 0, correct: 0, extractedOnFasitSlots: 0 },
  );
  const overallRecall = agg.nonZeroFasitTotal ? agg.matchedNonZero / agg.nonZeroFasitTotal : 1;
  const overallPrecision = agg.extractedOnFasitSlots ? agg.correct / agg.extractedOnFasitSlots : 1;

  console.log(`\n======== OVERALL (${perFiling.length} filing(s)) ========`);
  console.log(`  recall (non-zero): ${pct(overallRecall)}  (${agg.matchedNonZero}/${agg.nonZeroFasitTotal})`);
  console.log(`  precision:         ${pct(overallPrecision)}  (${agg.correct}/${agg.extractedOnFasitSlots})`);

  const report = {
    version: "annual-report-extraction-accuracy-v1",
    generatedAt: new Date().toISOString(),
    overall: { recallNonZero: overallRecall, precision: overallPrecision, ...agg },
    filings: perFiling,
  };
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(OUT_DIR, "latest.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, `${stamp}.json`), JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${path.join(OUT_DIR, "latest.json")}`);
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
