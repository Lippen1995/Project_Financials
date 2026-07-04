/**
 * Anchored gold-set builder — "the sums verify the details".
 *
 * Statutory statements are sum trees: every "Sum …" row equals the detail rows
 * above it. Tier 0 gives those sums EXACTLY (structured registry JSON). This
 * script cross-references OCR extraction artifacts against the anchors:
 *
 *  1. Per statement page and per candidate value column, fold rows bottom-up
 *     by exact sum-matching (a "sum" row must equal a contiguous run of items
 *     above it). An exact fold means the detail values are self-consistent.
 *  2. Confirm folded sums against the registry anchors for the filing's
 *     fiscal year. The column with the most anchor hits IS the current-year
 *     column — no classifier needed. Pages with fewer than MIN_ANCHOR_HITS
 *     confirmations are rejected (self-consistency alone can't distinguish
 *     the prior-year column or a wrong unit scale).
 *  3. Every verified detail row becomes a training/eval example:
 *     (rawLabel, value) with canonical metricKey where the alias registry
 *     maps it. Payroll, depreciation, inventory — the non-total lines the
 *     structured JSON itself cannot supervise.
 *
 * Output: output/ml-datasets/anchored-gold-set/latest.jsonl + stats.
 */
import fs from "node:fs";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import {
  findCanonicalMetricKey,
  getStatementFamilyFromSection,
} from "@/integrations/brreg/annual-report-financials/taxonomy";
import { loadMetricDefinitions } from "@/server/services/metric-mapping-service";

const ARTIFACTS_DIR = path.join(process.cwd(), "output", "annual-report-artifacts");
const OUTPUT_DIR = path.join(process.cwd(), "output", "ml-datasets", "anchored-gold-set");
const MIN_ANCHOR_HITS = 2;
const STATEMENT_SECTIONS = new Set([
  "STATUTORY_INCOME",
  "STATUTORY_BALANCE",
  "STATUTORY_BALANCE_CONTINUATION",
  "SUPPLEMENTARY_INCOME",
  "SUPPLEMENTARY_BALANCE",
]);

type ArtifactRow = {
  pageNumber: number;
  sectionType: string;
  unitScale: number;
  label: string;
  normalizedLabel: string;
  rowText?: string;
  y?: number;
  confidence?: number;
  values: { value: number; columnIndex: number }[];
};

type VerifiedRow = {
  orgNumber: string;
  filingId: string;
  fiscalYear: number;
  sourcePage: number;
  sectionType: string;
  rawLabel: string;
  normalizedLabel: string;
  value: number;
  unitScale: number;
  metricKey: string | null;
  isSumRow: boolean;
  anchorConfirmed: boolean;
  verification: "anchored_partition";
};

function readExtractionRows(filingId: string): ArtifactRow[] | null {
  const file = path.join(ARTIFACTS_DIR, filingId, "extraction_json", "extraction.json");
  if (!fs.existsSync(file)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(file, "utf8"));
    const rows = payload?.rows ?? payload?.raw?.rows;
    return Array.isArray(rows) ? (rows as ArtifactRow[]) : null;
  } catch {
    return null;
  }
}

function isSumLabel(normalizedLabel: string): boolean {
  return /^sum\b/.test(normalizedLabel);
}

type FoldItem = { row: ArtifactRow; value: number; members: ArtifactRow[] };

/**
 * Bottom-up sum folding for one page column. Returns the rows verified by
 * exact partition matches plus the folded sum values (for anchor matching).
 */
function foldPageColumn(rows: ArtifactRow[], columnIndex: number) {
  const stack: FoldItem[] = [];
  const verified = new Set<ArtifactRow>();
  const matchedSums: { row: ArtifactRow; value: number }[] = [];

  for (const row of rows) {
    const cell = row.values.find((value) => value.columnIndex === columnIndex);
    if (!cell || !Number.isFinite(cell.value)) continue;
    const scaled = cell.value * (row.unitScale || 1);

    if (isSumLabel(row.normalizedLabel) && stack.length > 0) {
      // Try to match a contiguous run ending at the top of the stack.
      let acc = 0;
      let matchDepth = -1;
      for (let depth = stack.length - 1; depth >= 0; depth -= 1) {
        acc += stack[depth]!.value;
        if (acc === scaled) {
          matchDepth = depth;
          break;
        }
      }
      if (matchDepth >= 0) {
        const consumed = stack.splice(matchDepth);
        const members = consumed.flatMap((item) => [item.row, ...item.members]);
        for (const member of members) verified.add(member);
        verified.add(row);
        matchedSums.push({ row, value: scaled });
        stack.push({ row, value: scaled, members });
        continue;
      }
    }

    stack.push({ row, value: scaled, members: [] });
  }

  return { verified, matchedSums };
}

async function main() {
  const definitions = await loadMetricDefinitions();

  const structured = await prisma.financialStatement.findMany({
    where: { sourceEntityType: "structuredAnnualAccounts" },
    select: {
      companyId: true,
      fiscalYear: true,
      rawPayload: true,
      company: { select: { orgNumber: true } },
    },
  });
  const anchorsByCompanyYear = new Map<string, { orgNumber: string; values: Set<number> }>();
  for (const statement of structured) {
    const payload = statement.rawPayload as { canonicalValues?: Record<string, number> } | null;
    const canonical = payload?.canonicalValues ?? {};
    const values = new Set<number>(Object.values(canonical).filter((v) => v !== 0));
    if (values.size === 0) continue;
    anchorsByCompanyYear.set(`${statement.companyId}:${statement.fiscalYear}`, {
      orgNumber: statement.company.orgNumber,
      values,
    });
  }

  const filings = await prisma.annualReportFiling.findMany({
    where: { status: { in: ["PUBLISHED", "MANUAL_REVIEW"] } },
    select: {
      id: true,
      companyId: true,
      fiscalYear: true,
      company: { select: { orgNumber: true } },
    },
  });

  const verifiedRows: VerifiedRow[] = [];
  let filingsWithAnchors = 0;
  let filingsWithArtifacts = 0;
  let pagesAccepted = 0;
  let pagesRejected = 0;

  for (const filing of filings) {
    const anchors = anchorsByCompanyYear.get(`${filing.companyId}:${filing.fiscalYear}`);
    if (!anchors) continue;
    filingsWithAnchors += 1;

    const rows = readExtractionRows(filing.id);
    if (!rows) continue;
    filingsWithArtifacts += 1;

    const statementRows = rows.filter((row) => STATEMENT_SECTIONS.has(row.sectionType));
    const pages = [...new Set(statementRows.map((row) => row.pageNumber))];

    for (const pageNumber of pages) {
      const pageRows = statementRows
        .filter((row) => row.pageNumber === pageNumber)
        .sort((left, right) => (left.y ?? 0) - (right.y ?? 0));
      const columnIndexes = [
        ...new Set(pageRows.flatMap((row) => row.values.map((value) => value.columnIndex))),
      ];

      let best: {
        columnIndex: number;
        verified: Set<ArtifactRow>;
        anchorHits: number;
        anchorConfirmedSums: Set<ArtifactRow>;
      } | null = null;

      for (const columnIndex of columnIndexes) {
        const { verified, matchedSums } = foldPageColumn(pageRows, columnIndex);
        const anchorConfirmedSums = new Set(
          matchedSums
            .filter((sum) => anchors.values.has(Math.abs(sum.value)))
            .map((sum) => sum.row),
        );
        const anchorHits = anchorConfirmedSums.size;
        if (!best || anchorHits > best.anchorHits) {
          best = { columnIndex, verified, anchorHits, anchorConfirmedSums };
        }
      }

      if (!best || best.anchorHits < MIN_ANCHOR_HITS) {
        pagesRejected += 1;
        continue;
      }
      pagesAccepted += 1;

      for (const row of best.verified) {
        const cell = row.values.find((value) => value.columnIndex === best!.columnIndex);
        if (!cell) continue;
        const statementFamily = getStatementFamilyFromSection(
          row.sectionType as Parameters<typeof getStatementFamilyFromSection>[0],
        );
        const metricKey = statementFamily
          ? findCanonicalMetricKey(row.normalizedLabel, statementFamily, null, definitions)
          : null;
        verifiedRows.push({
          orgNumber: filing.company.orgNumber,
          filingId: filing.id,
          fiscalYear: filing.fiscalYear,
          sourcePage: row.pageNumber,
          sectionType: row.sectionType,
          rawLabel: row.label,
          normalizedLabel: row.normalizedLabel,
          value: cell.value * (row.unitScale || 1),
          unitScale: row.unitScale || 1,
          metricKey: metricKey ?? null,
          isSumRow: isSumLabel(row.normalizedLabel),
          anchorConfirmed: best.anchorConfirmedSums.has(row),
          verification: "anchored_partition",
        });
      }
    }
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outFile = path.join(OUTPUT_DIR, "latest.jsonl");
  fs.writeFileSync(outFile, verifiedRows.map((row) => JSON.stringify(row)).join("\n"), "utf8");

  const detailRows = verifiedRows.filter((row) => !row.isSumRow);
  const byMetric: Record<string, number> = {};
  for (const row of detailRows) {
    const key = row.metricKey ?? "(unmapped)";
    byMetric[key] = (byMetric[key] ?? 0) + 1;
  }
  const stats = {
    generatedAt: new Date().toISOString(),
    filingsWithAnchors,
    filingsWithArtifacts,
    pagesAccepted,
    pagesRejected,
    verifiedRows: verifiedRows.length,
    verifiedDetailRows: detailRows.length,
    detailRowsByMetricKey: Object.fromEntries(
      Object.entries(byMetric).sort((left, right) => right[1] - left[1]),
    ),
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "latest-stats.json"),
    JSON.stringify(stats, null, 2),
    "utf8",
  );
  console.log(JSON.stringify(stats, null, 2));
  console.log(`Dataset: ${outFile}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
