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
import os from "node:os";
import path from "node:path";

import { PDFParse } from "pdf-parse";

import { prisma } from "@/lib/prisma";
import { extractOcrPagesBatched } from "@/integrations/brreg/annual-report-financials/ocr";
import { selectivelyMergeOcrScaleFacts } from "@/integrations/brreg/annual-report-financials/ocr-scale-fact-merge";
import { classifyPages } from "@/integrations/brreg/annual-report-financials/page-classification";
import {
  detectYearColumnAnchorsForPage,
  reconstructStatementRowsGeometryFirst,
  type ColumnAnchor,
} from "@/integrations/brreg/annual-report-financials/geometry-first-reconstruction";
import { mapRowsToCanonicalFacts } from "@/integrations/brreg/annual-report-financials/canonical-mapping";
import { convertNormalizedDocumentToAnnualReportPages } from "@/server/document-understanding/opendataloader-normalizer";
import type {
  AnnualReportParsedInputPage,
  ReconstructedRow,
} from "@/integrations/brreg/annual-report-financials/types";
import type { NormalizedDocument } from "@/server/document-understanding/opendataloader-types";
import { loadMetricDefinitions } from "@/server/services/metric-mapping-service";
import { loadRequiredPublishMetricKeys } from "@/server/services/canonical-registry-service";
import {
  compareFactsToFasit,
  type AccuracyFact,
  type AccuracyResult,
} from "@/server/services/extraction-accuracy-service";
import {
  rankCanonicalAccuracyFacts,
} from "@/server/services/extraction-accuracy-fact-ranker";

type RankableEvalFact = AccuracyFact & {
  rawLabel?: string | null;
  sourceRowText?: string | null;
};

const ARTIFACTS_DIR = "C:/Users/simen/Project_Financials/output/annual-report-artifacts";
const OUT_DIR = path.join(process.cwd(), "output", "benchmarks", "annual-report-extraction-accuracy");
const CACHE_DIR = path.join(
  os.tmpdir(),
  "fjord-insight-annual-report-extraction-accuracy-ocr-cache",
);
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

function normalizedDocumentPathFor(filingId: string): string | null {
  const file = path.join(
    ARTIFACTS_DIR,
    filingId,
    "document_normalized_json",
    "opendataloader-normalized-document.json",
  );
  return fs.existsSync(file) ? file : null;
}

function readArtifactParsedPages(filingId: string): AnnualReportParsedInputPage[] | null {
  const file = normalizedDocumentPathFor(filingId);
  if (!file) return null;
  const payload = JSON.parse(fs.readFileSync(file, "utf8")) as {
    normalizedDocument?: NormalizedDocument;
  };
  if (!payload.normalizedDocument) return null;
  return convertNormalizedDocumentToAnnualReportPages(payload.normalizedDocument);
}

function readFlag(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function cachePathFor(input: {
  filingId: string;
  fiscalYear: number;
  pageNumbers: number[];
  renderScale?: number;
  rotationDegrees?: 0 | 90 | 180 | 270;
  invert?: boolean;
}) {
  const scale = input.renderScale !== undefined
    ? String(input.renderScale)
    : process.env.ANNUAL_REPORT_OCR_RENDER_SCALE ?? "default";
  return cachePathForVariant(input, {
    scale,
    rotationDegrees: input.rotationDegrees,
    invert: input.invert,
  });
}

function cachePathForVariant(
  input: { filingId: string; fiscalYear: number; pageNumbers: number[] },
  variant: {
    scale: string;
    rotationDegrees?: 0 | 90 | 180 | 270;
    invert?: boolean;
  },
) {
  const variantSuffix = [
    `scale-${variant.scale}`,
    variant.rotationDegrees ? `rot-${variant.rotationDegrees}` : null,
    variant.invert ? "invert" : null,
  ]
    .filter(Boolean)
    .join("-");
  return path.join(
    CACHE_DIR,
    `${input.filingId}-${input.fiscalYear}-${variantSuffix}-pages-${input.pageNumbers[0] ?? "none"}-${input.pageNumbers.at(-1) ?? "none"}.json`,
  );
}

function cachePathForScale(
  input: { filingId: string; fiscalYear: number; pageNumbers: number[] },
  scale: string,
) {
  return cachePathForVariant(input, { scale });
}

function legacyCachePathFor(input: { filingId: string; fiscalYear: number; pageNumbers: number[] }) {
  return path.join(
    CACHE_DIR,
    `${input.filingId}-${input.fiscalYear}-pages-${input.pageNumbers[0] ?? "none"}-${input.pageNumbers.at(-1) ?? "none"}.json`,
  );
}

async function readOrExtractOcrPages(input: {
  filingId: string;
  fiscalYear: number;
  pdfBuffer: Buffer;
  pageNumbers: number[];
  useCache: boolean;
  renderScale?: number;
  rotationDegrees?: 0 | 90 | 180 | 270;
  invert?: boolean;
}): Promise<AnnualReportParsedInputPage[]> {
  const cachePath = cachePathFor(input);
  if (input.useCache && fs.existsSync(cachePath)) {
    return JSON.parse(fs.readFileSync(cachePath, "utf8")) as AnnualReportParsedInputPage[];
  }
  const legacyCachePath = legacyCachePathFor(input);
  if (
    input.useCache &&
    input.renderScale === undefined &&
    !input.rotationDegrees &&
    !input.invert &&
    !process.env.ANNUAL_REPORT_OCR_RENDER_SCALE &&
    fs.existsSync(legacyCachePath)
  ) {
    return JSON.parse(fs.readFileSync(legacyCachePath, "utf8")) as AnnualReportParsedInputPage[];
  }

  const result = await extractOcrPagesBatched(
    input.pdfBuffer,
    input.pageNumbers,
    undefined,
    input.renderScale === undefined && !input.rotationDegrees && !input.invert
      ? undefined
      : {
          renderScale: input.renderScale,
          rotationDegrees: input.rotationDegrees,
          invert: input.invert,
        },
  );
  if (input.useCache) {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(result.pages), "utf8");
  }
  return result.pages;
}

function readCachedOcrPagesForScale(input: {
  filingId: string;
  fiscalYear: number;
  pageNumbers: number[];
  scale: string;
}): AnnualReportParsedInputPage[] | null {
  const cachePath = cachePathForScale(input, input.scale);
  if (!fs.existsSync(cachePath)) return null;
  return JSON.parse(fs.readFileSync(cachePath, "utf8")) as AnnualReportParsedInputPage[];
}

function asReportedSlug(input: string) {
  return input
    .replace(/\bsun\b/gi, "sum")
    .replace(/\bregultat\b/gi, "resultat")
    .replace(/[Ææ]/g, "ae")
    .replace(/[Øø]/g, "o")
    .replace(/[Åå]/g, "a")
    .replace(/ÃƒÂ¦/g, "ae")
    .replace(/ÃƒÂ¸/g, "o")
    .replace(/ÃƒÂ¥/g, "a")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function asReportedKeyForLabel(label: string) {
  const normalized = asReportedSlug(label).replace(/_\d{1,2}$/, "");
  if (normalized.endsWith("ordinaert_utbytte")) {
    return "as_reported_ordinaert_utbytte";
  }
  if (normalized.includes("obligasjonslan")) {
    return "as_reported_obligasjonslan";
  }
  if (normalized === "utbytte_l2" || normalized.endsWith("_utbytte_l2")) {
    return "as_reported_utbytte";
  }
  const overrides: Record<string, string> = {
    arsresultat_etter_minoritetsinteresser: "as_reported_arsresultat_etter_minoritetsinteresser",
    minoritetsinteresser: "as_reported_minoritetsinteresser",
    sum_anleggsmidler: "as_reported_sum_anleggsmidler",
    sum_bankinnskudd_kontanter_og_lignende:
      "as_reported_sum_bankinnskudd_kontanter_og_lignende",
    sum_finansielle_anleggsmidler: "as_reported_sum_finansielle_anleggsmidler",
    sum_fordringer: "as_reported_sum_fordringer",
    sum_immaterielle_eiendeler: "as_reported_sum_immaterielle_eiendeler",
    sum_innskutt_egenkapital: "as_reported_sum_innskutt_egenkapital",
    sum_opptjent_egenkapital: "as_reported_sum_opptjent_egenkapital",
    sum_overforinger_og_disponeringer: "as_reported_sum_overforinger_og_disponeringer",
    sum_varer: "as_reported_sum_varer",
    sum_varige_driftsmidler: "as_reported_sum_varige_driftsmidler",
  };
  return overrides[normalized] ?? `as_reported_${normalized || "line"}`;
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

function mapParsedPagesToStatutoryFacts(input: {
  parsedPages: AnnualReportParsedInputPage[];
  filingFiscalYear: number;
  definitions: Awaited<ReturnType<typeof loadMetricDefinitions>>;
  requiredKeys: string[];
}): { facts: AccuracyFact[]; statutoryPages: Set<number> } {
  const { parsedPages, filingFiscalYear, definitions, requiredKeys } = input;
  const classifications = classifyPages(parsedPages);
  const classByPage = new Map(classifications.map((c) => [c.pageNumber, c]));

  const statutoryPages = new Set(
    classifications.filter((c) => STATUTORY_TYPES.has(c.type)).map((c) => c.pageNumber),
  );

  // Reconstruct with geometry-first (the path we are improving; production's
  // primary `reconstructStatementRows` truncates badly on scans — measured at
  // ~0.9% canonical recall). Inherit year anchors into continuation pages that
  // lack their own header, mirroring extraction-loop.
  const sortedOcr = [...parsedPages].sort((a, b) => a.pageNumber - b.pageNumber);
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

  const facts: RankableEvalFact[] = mapped.facts
    .filter((f) => statutoryPages.has(f.sourcePage))
    .map((f) => ({
      metricKey: f.metricKey,
      statementScope: f.statementScope,
      fiscalYear: f.fiscalYear,
      value: String(Math.round(f.value)),
      rawLabel: f.rawLabel,
      sourceRowText: f.sourceRowText,
    }));

  const asReportedOccurrences = new Map<string, number>();
  for (const row of rows) {
    const classification = classByPage.get(row.pageNumber);
    if (!classification || !statutoryPages.has(row.pageNumber)) continue;
    const yearOrder =
      classification.yearHeaderYears.length >= 2
        ? classification.yearHeaderYears
        : [input.filingFiscalYear, input.filingFiscalYear - 1];
    const baseKey = asReportedKeyForLabel(row.label);
    const occurrenceKey = `${classification.statementScope}|${baseKey}`;
    const occurrence = (asReportedOccurrences.get(occurrenceKey) ?? 0) + 1;
    asReportedOccurrences.set(occurrenceKey, occurrence);
    const metricKey = occurrence > 1 ? `${baseKey}_page_${row.pageNumber}_${occurrence}` : baseKey;
    for (const valueCell of row.values) {
      const fiscalYear = yearOrder[valueCell.columnIndex] ?? yearOrder[0] ?? input.filingFiscalYear;
      facts.push({
        metricKey,
        statementScope: classification.statementScope,
        fiscalYear,
        value: String(Math.round(row.unitScale * valueCell.value)),
        rawLabel: row.label,
        sourceRowText: row.rowText,
      });
    }
  }

  return { facts: rankCanonicalAccuracyFacts(facts), statutoryPages };
}

async function extractStatutoryFacts(
  filingId: string,
  buf: Buffer,
  filingFiscalYear: number,
  definitions: Awaited<ReturnType<typeof loadMetricDefinitions>>,
  requiredKeys: string[],
  useCache: boolean,
  forceFreshOcr: boolean,
  mergeOcrScaleCache: string | null,
  mergeOnlyAsReported: boolean,
  selectiveMergeOcrScale: string | null,
  selectiveMergeOcrScaleCache: string | null,
  explicitPageNumbers: number[] | null,
  ocrRotationDegrees: 0 | 90 | 180 | 270 | undefined,
  ocrInvert: boolean,
): Promise<{ facts: AccuracyFact[]; statutoryPages: Set<number> }> {
  const total = await getPageCount(buf);
  const pageNumbers = explicitPageNumbers ?? Array.from({ length: Math.min(total, DEL1_MAX_PAGE) }, (_, i) => i + 1);
  console.log(`  pages considered: ${pageNumbers.length}/${total}`);
  const artifactPages = readArtifactParsedPages(filingId);
  const parsedPages =
    artifactPages !== null && !forceFreshOcr
      ? artifactPages.filter((page) => pageNumbers.includes(page.pageNumber))
      : await readOrExtractOcrPages({
          filingId,
          fiscalYear: filingFiscalYear,
          pdfBuffer: buf,
          pageNumbers,
          useCache,
          rotationDegrees: ocrRotationDegrees,
          invert: ocrInvert,
        });
  console.log(
    `  parsed pages source: ${artifactPages !== null && !forceFreshOcr ? "opendataloader artifact" : "fresh OCR/cache"} (${parsedPages.length} pages)`,
  );

  const primary = mapParsedPagesToStatutoryFacts({
    parsedPages,
    filingFiscalYear,
    definitions,
    requiredKeys,
  });

  if (!mergeOcrScaleCache) {
    if (!selectiveMergeOcrScale && !selectiveMergeOcrScaleCache) {
      return primary;
    }
  }

  const secondaryScale = mergeOcrScaleCache ?? selectiveMergeOcrScale ?? selectiveMergeOcrScaleCache!;
  const parsedSecondaryScale = Number(secondaryScale);
  const cachedSecondaryPages = readCachedOcrPagesForScale({
    filingId,
    fiscalYear: filingFiscalYear,
    pageNumbers,
    scale: secondaryScale,
  });
  const secondaryPages =
    cachedSecondaryPages ??
    (selectiveMergeOcrScaleCache
      ? null
      : Number.isFinite(parsedSecondaryScale) && parsedSecondaryScale >= 1
        ? await readOrExtractOcrPages({
            filingId,
            fiscalYear: filingFiscalYear,
            pdfBuffer: buf,
            pageNumbers,
            useCache,
            renderScale: parsedSecondaryScale,
            rotationDegrees: ocrRotationDegrees,
            invert: ocrInvert,
          })
        : null);
  if (!secondaryPages) {
    console.log(`  merge OCR scale cache: ${secondaryScale} not found`);
    return primary;
  }

  const secondary = mapParsedPagesToStatutoryFacts({
    parsedPages: secondaryPages,
    filingFiscalYear,
    definitions,
    requiredKeys,
  });
  const secondaryFacts = mergeOnlyAsReported
    ? secondary.facts.filter((fact) => fact.metricKey.startsWith("as_reported_"))
    : secondary.facts;
  if ((selectiveMergeOcrScale || selectiveMergeOcrScaleCache) && !mergeOcrScaleCache) {
    const merged = selectivelyMergeOcrScaleFacts(primary.facts, secondaryFacts);
    const statutoryPages = new Set([...primary.statutoryPages, ...secondary.statutoryPages]);
    console.log(
      `  selectively merged OCR scale: ${secondaryScale} ` +
        `(considered=${merged.stats.secondaryFactsConsidered}, ` +
        `replaced=${merged.stats.replacedTruncatedSlots}, ` +
        `addedSiblingYears=${merged.stats.addedSiblingYearSlots}, ` +
        `skippedConflicts=${merged.stats.skippedConflictingSlots}, ` +
        `skippedUnanchored=${merged.stats.skippedUnanchoredSlots})`,
    );
    return { facts: rankCanonicalAccuracyFacts(merged.facts), statutoryPages };
  }
  const byKey = new Map<string, AccuracyFact>();
  for (const fact of [...primary.facts, ...secondaryFacts]) {
    byKey.set(`${fact.metricKey}|${fact.statementScope}|${fact.fiscalYear}|${fact.value}`, fact);
  }
  const statutoryPages = new Set([...primary.statutoryPages, ...secondary.statutoryPages]);
  console.log(`  merged OCR scale cache: ${secondaryScale} (+${secondaryFacts.length} facts)`);
  return { facts: rankCanonicalAccuracyFacts([...byKey.values()]), statutoryPages };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function parsePageRange(value: string | null): number[] | null {
  if (!value) return null;
  const pages = new Set<number>();
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
        throw new Error(`Invalid --page-range segment: ${trimmed}`);
      }
      for (let page = start; page <= end; page += 1) pages.add(page);
      continue;
    }
    const page = Number(trimmed);
    if (!Number.isInteger(page) || page < 1) {
      throw new Error(`Invalid --page-range page: ${trimmed}`);
    }
    pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}

function parseOcrRotation(value: string | null): 0 | 90 | 180 | 270 | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (parsed === 0 || parsed === 90 || parsed === 180 || parsed === 270) {
    return parsed;
  }
  throw new Error("--ocr-rotation must be one of 0, 90, 180, 270");
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const definitions = await loadMetricDefinitions();
  const requiredKeys = [...(await loadRequiredPublishMetricKeys())];
  const requestedFilingId = readFlag("filing-id");
  const requestedFilingIds = new Set(
    (readFlag("filing-ids") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
  const limit = Number(readFlag("limit") ?? "0");
  const useCache = !hasFlag("no-cache");
  const allowFreshOcr = hasFlag("fresh-ocr");
  const mergeOcrScaleCache = readFlag("merge-ocr-scale-cache");
  const selectiveMergeOcrScale = readFlag("selective-merge-ocr-scale");
  const selectiveMergeOcrScaleCache = readFlag("selective-merge-ocr-scale-cache");
  const mergeOnlyAsReported = hasFlag("merge-as-reported-only");
  const explicitPageNumbers = parsePageRange(readFlag("page-range"));
  const ocrRotationDegrees = parseOcrRotation(readFlag("ocr-rotation"));
  const ocrInvert = hasFlag("ocr-invert");

  // Filings that have published fasit. Machine extraction now also publishes
  // line items (publicationSource=MACHINE_EXTRACTION); only reviewer-verified
  // rows count as ground truth, otherwise the eval compares machine to itself.
  const published = await prisma.publishedFinancialLineItem.groupBy({
    by: ["filingId", "companyId"],
    where: { publicationSource: "MANUAL_REVIEW" },
    _count: { _all: true },
  });

  const perFiling: Array<{
    filingId: string;
    company: string | null;
    fiscalYear: number;
    result: AccuracyResult;
  }> = [];

  let processed = 0;
  for (const grp of published) {
    if (requestedFilingId && grp.filingId !== requestedFilingId) continue;
    if (requestedFilingIds.size > 0 && !requestedFilingIds.has(grp.filingId)) continue;
    if (limit > 0 && processed >= limit) break;
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
    if (!allowFreshOcr && !normalizedDocumentPathFor(filing.id)) {
      console.log(`SKIP ${filing.company?.name ?? filing.id}: no normalized document artifact`);
      continue;
    }

    console.log(`\n=== ${filing.company?.name ?? filing.id} FY${filing.fiscalYear} ===`);
    const buf = fs.readFileSync(pdf);
    const { facts: extracted, statutoryPages } = await extractStatutoryFacts(
      filing.id,
      buf,
      filing.fiscalYear,
      definitions,
      requiredKeys,
      useCache,
      allowFreshOcr,
      mergeOcrScaleCache,
      mergeOnlyAsReported,
      selectiveMergeOcrScale,
      selectiveMergeOcrScaleCache,
      explicitPageNumbers,
      ocrRotationDegrees,
      ocrInvert,
    );
    processed++;

    const fasitRows = await prisma.publishedFinancialLineItem.findMany({
      where: {
        filingId: filing.id,
        publicationSource: "MANUAL_REVIEW",
        value: { not: null },
        sourcePage: { in: [...statutoryPages] },
      },
      select: { metricKey: true, statementScope: true, fiscalYear: true, value: true },
    });
    const fasit: AccuracyFact[] = fasitRows.flatMap((r) =>
      r.metricKey && r.value !== null
        ? [{
            metricKey: r.metricKey,
            statementScope: r.statementScope,
            fiscalYear: r.fiscalYear,
            value: r.value.toString(),
          }]
        : [],
    );

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
  let stampedPath = path.join(OUT_DIR, `${stamp}.json`);
  try {
    fs.writeFileSync(stampedPath, JSON.stringify(report, null, 2));
  } catch (error) {
    const fallbackDir = path.join(os.tmpdir(), "fjord-insight-annual-report-extraction-accuracy");
    fs.mkdirSync(fallbackDir, { recursive: true });
    stampedPath = path.join(fallbackDir, `${stamp}.json`);
    fs.writeFileSync(stampedPath, JSON.stringify(report, null, 2));
    console.warn(
      `Could not write report under ${OUT_DIR}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (hasFlag("write-latest")) {
    try {
      fs.writeFileSync(path.join(OUT_DIR, "latest.json"), JSON.stringify(report, null, 2));
    } catch (error) {
      console.warn(`Could not update latest.json: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`\nReport written to ${stampedPath}`);
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
