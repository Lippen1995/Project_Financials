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
} from "@/server/financials/canonical-taxonomy";
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

type ResidualSuspect = {
  sumRow: ArtifactRow;
  sumValue: number;
  residual: number;
  detailRows: { row: ArtifactRow; value: number }[];
  /** Rows whose value corrected by the residual has the dropped-leading-digit
   *  signature (true value's digits END WITH the read value's digits). */
  leadingDigitCandidates: { row: ArtifactRow; readValue: number; correctedValue: number }[];
};

/**
 * Bottom-up sum folding for one page column. Returns the rows verified by
 * exact partition matches, the folded sum values (for anchor matching), and
 * near-miss sums with their residuals (for suspect-cell localization).
 */
function foldPageColumn(rows: ArtifactRow[], columnIndex: number) {
  const stack: FoldItem[] = [];
  const verified = new Set<ArtifactRow>();
  const matchedSums: { row: ArtifactRow; value: number }[] = [];
  const residualSuspects: ResidualSuspect[] = [];

  for (const row of rows) {
    const cell = row.values.find((value) => value.columnIndex === columnIndex);
    if (!cell || !Number.isFinite(cell.value)) continue;
    const scaled = cell.value * (row.unitScale || 1);

    if (isSumLabel(row.normalizedLabel) && stack.length > 0) {
      // Try to match a contiguous run ending at the top of the stack.
      let acc = 0;
      let matchDepth = -1;
      let bestResidual: { residual: number; depth: number } | null = null;
      for (let depth = stack.length - 1; depth >= 0; depth -= 1) {
        acc += stack[depth]!.value;
        if (acc === scaled) {
          matchDepth = depth;
          break;
        }
        const residual = scaled - acc;
        if (!bestResidual || Math.abs(residual) < Math.abs(bestResidual.residual)) {
          bestResidual = { residual, depth };
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
      if (bestResidual && bestResidual.residual !== 0) {
        const detailRows = stack
          .slice(bestResidual.depth)
          .map((item) => ({ row: item.row, value: item.value }));
        const leadingDigitCandidates = detailRows
          .filter(({ value }) => value > 0 && bestResidual!.residual > 0)
          .map(({ row: detailRow, value }) => ({
            row: detailRow,
            readValue: value,
            correctedValue: value + bestResidual!.residual,
          }))
          .filter(
            ({ readValue, correctedValue }) =>
              String(correctedValue).length > String(readValue).length &&
              String(correctedValue).endsWith(String(readValue)),
          );
        residualSuspects.push({
          sumRow: row,
          sumValue: scaled,
          residual: bestResidual.residual,
          detailRows,
          leadingDigitCandidates,
        });
      }
    }

    stack.push({ row, value: scaled, members: [] });
  }

  return { verified, matchedSums, residualSuspects };
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
  const trainingFacts: Record<string, unknown>[] = [];
  const suspects: Record<string, unknown>[] = [];
  const aliasCandidates = new Map<
    string,
    { label: string; statementFamily: string; count: number; orgNumbers: Set<string> }
  >();
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
        residualSuspects: ResidualSuspect[];
      } | null = null;

      for (const columnIndex of columnIndexes) {
        const { verified, matchedSums, residualSuspects } = foldPageColumn(pageRows, columnIndex);
        const anchorConfirmedSums = new Set(
          matchedSums
            .filter((sum) => anchors.values.has(Math.abs(sum.value)))
            .map((sum) => sum.row),
        );
        const anchorHits = anchorConfirmedSums.size;
        if (!best || anchorHits > best.anchorHits) {
          best = { columnIndex, verified, anchorHits, anchorConfirmedSums, residualSuspects };
        }
      }

      if (!best || best.anchorHits < MIN_ANCHOR_HITS) {
        pagesRejected += 1;
        continue;
      }
      pagesAccepted += 1;

      // Residual localization on the accepted column: near-miss sums point at
      // the exact rows OCR misread — hard negatives and tier-2 repair targets.
      for (const suspect of best.residualSuspects) {
        suspects.push({
          orgNumber: filing.company.orgNumber,
          filingId: filing.id,
          fiscalYear: filing.fiscalYear,
          sourcePage: pageNumber,
          sumLabel: suspect.sumRow.label,
          sumValue: suspect.sumValue,
          residual: suspect.residual,
          detailRows: suspect.detailRows.map(({ row, value }) => ({
            label: row.label,
            value,
          })),
          leadingDigitCandidates: suspect.leadingDigitCandidates.map(
            ({ row, readValue, correctedValue }) => ({
              label: row.label,
              readValue,
              correctedValue,
            }),
          ),
        });
      }

      for (const [rowIndex, row] of pageRows.entries()) {
        if (!best.verified.has(row)) continue;
        const cell = row.values.find((value) => value.columnIndex === best!.columnIndex);
        if (!cell) continue;
        const nearbyRows = pageRows
          .slice(Math.max(0, rowIndex - 1), rowIndex + 3)
          .filter((nearby) => nearby !== row)
          .map((nearby) => nearby.label);
        const statementFamily = getStatementFamilyFromSection(
          row.sectionType as Parameters<typeof getStatementFamilyFromSection>[0],
        );
        const metricKey = statementFamily
          ? findCanonicalMetricKey(row.normalizedLabel, statementFamily, null, definitions)
          : null;
        if (!metricKey && statementFamily && !isSumLabel(row.normalizedLabel)) {
          // Value-verified but unmapped: alias candidate. Strip trailing note
          // references so "Lønnskostnad 1" and "Lønnskostnad 4" collapse.
          const cleanLabel = row.normalizedLabel.replace(/(\s+\d[\d.,]*)+\s*$/g, "").trim();
          if (cleanLabel.length >= 4) {
            const key = `${statementFamily}:${cleanLabel}`;
            const existing = aliasCandidates.get(key) ?? {
              label: cleanLabel,
              statementFamily,
              count: 0,
              orgNumbers: new Set<string>(),
            };
            existing.count += 1;
            existing.orgNumbers.add(filing.company.orgNumber);
            aliasCandidates.set(key, existing);
          }
        }
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

        // Training example in the financial-facts JSONL shape consumed by
        // docker/ml-inference/train_financial_fact.py.
        if (metricKey) {
          const scaledValue = cell.value * (row.unitScale || 1);
          trainingFacts.push({
            filingId: filing.id,
            features: {
              factContextText: [
                `page=${row.pageNumber}`,
                `fiscalYear=${filing.fiscalYear}`,
                `scope=COMPANY`,
                `unitScale=${row.unitScale || 1}`,
                `label=${row.label}`,
                `nearbyRowCount=${nearbyRows.length}`,
                ...nearbyRows.map((label, index) => `nearbyRow${index + 1}=${label}`),
              ].join(" | "),
              rawLabel: row.label,
              sourceRowText: row.rowText ?? null,
              sourcePage: row.pageNumber,
              fiscalYear: filing.fiscalYear,
              statementType: getStatementFamilyFromSection(
                row.sectionType as Parameters<typeof getStatementFamilyFromSection>[0],
              ),
              statementScope: "COMPANY",
              sourceSection: row.sectionType,
              noteReference: null,
              unitScale: row.unitScale || 1,
              value: scaledValue,
              proposedMetricKey: null,
              nearbyRows,
            },
            label: metricKey,
            proposedLabel: null,
            source: "anchored_partition",
          });
        }
      }
    }
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outFile = path.join(OUTPUT_DIR, "latest.jsonl");
  fs.writeFileSync(outFile, verifiedRows.map((row) => JSON.stringify(row)).join("\n"), "utf8");
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "training-facts.jsonl"),
    trainingFacts.map((fact) => JSON.stringify(fact)).join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "residual-suspects.jsonl"),
    suspects.map((suspect) => JSON.stringify(suspect)).join("\n"),
    "utf8",
  );
  const rankedAliasCandidates = [...aliasCandidates.values()]
    .filter((candidate) => candidate.count >= 3 && candidate.orgNumbers.size >= 2)
    .sort((left, right) => right.count - left.count)
    .map((candidate) => ({
      label: candidate.label,
      statementFamily: candidate.statementFamily,
      proposedKey: `as_reported_${candidate.label.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
      count: candidate.count,
      companies: candidate.orgNumbers.size,
    }));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "alias-candidates.json"),
    JSON.stringify(rankedAliasCandidates, null, 2),
    "utf8",
  );

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
    trainingFacts: trainingFacts.length,
    residualSuspects: suspects.length,
    aliasCandidates: rankedAliasCandidates.length,
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
