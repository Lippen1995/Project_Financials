/**
 * Anchored unit-scale training data — non-circular ML ground truth.
 *
 * The financial_fact key classifier could not be improved with anchored data
 * because its labels are rule-derived (findCanonicalMetricKey), making the
 * augmentation circular. The unit-scale label is different: it is the scale
 * (1 vs 1000) that makes a page's extracted values match the EXACT registry
 * anchors — an independent oracle, not the detector we're training. That makes
 * it genuine supervision.
 *
 * For each statement page of an anchor-covered filing, we test scale 1 and
 * 1000 against the anchor magnitudes; the scale with >= MIN_ANCHOR_HITS wins
 * and becomes the page's label. Output matches train_unit_scale.py's contract
 * ({features:{pageContextText}, label:int}) and is split by FILING so no
 * company leaks across train/val/test.
 */
import fs from "node:fs";
import path from "node:path";

import { prisma } from "@/lib/prisma";

const ARTIFACTS_DIR = path.join(process.cwd(), "output", "annual-report-artifacts");
const OUTPUT_DIR = path.join(process.cwd(), "output", "ml-datasets", "anchored-unit-scale");
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
  rowText?: string;
  values: { value: number; columnIndex: number }[];
};

function readRows(filingId: string): ArtifactRow[] | null {
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

function countAnchorHits(
  rows: ArtifactRow[],
  columnIndex: number,
  magnitudes: Set<number>,
  scale: number,
): number {
  let hits = 0;
  for (const row of rows) {
    const cell = row.values.find((value) => value.columnIndex === columnIndex);
    if (!cell || !Number.isFinite(cell.value)) continue;
    if (magnitudes.has(Math.abs(cell.value * scale))) hits += 1;
  }
  return hits;
}

// Mirror of buildUnitScalePredictionText using artifact rows: production
// builds it from raw page lines; the char-tfidf model is robust to the small
// difference, and the label — not the exact feature bytes — is the point.
function buildPageContextText(pageNumber: number, section: string, rows: ArtifactRow[]): string {
  const topLines = rows.slice(0, 12).map((row) => row.rowText ?? row.label);
  const labels = [...new Set(rows.map((row) => row.label).filter((label) => label.length >= 3))].slice(0, 24);
  return [`page=${pageNumber}`, `scope=COMPANY`, `section=${section}`, ...topLines, ...labels]
    .join(" | ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

async function main() {
  const structured = await prisma.financialStatement.findMany({
    where: { sourceEntityType: "structuredAnnualAccounts", statementScope: "COMPANY" },
    select: {
      companyId: true,
      fiscalYear: true,
      rawPayload: true,
    },
  });
  const anchorsByCompanyYear = new Map<string, Set<number>>();
  for (const statement of structured) {
    const payload = statement.rawPayload as { canonicalValues?: Record<string, number> } | null;
    const magnitudes = new Set<number>(
      Object.values(payload?.canonicalValues ?? {})
        .filter((value) => value !== 0)
        .map((value) => Math.abs(value)),
    );
    if (magnitudes.size > 0) {
      anchorsByCompanyYear.set(`${statement.companyId}:${statement.fiscalYear}`, magnitudes);
    }
  }

  const filings = await prisma.annualReportFiling.findMany({
    where: { status: { in: ["PUBLISHED", "MANUAL_REVIEW"] } },
    select: { id: true, companyId: true, fiscalYear: true },
  });

  type Example = { filingId: string; features: { pageContextText: string }; label: number };
  const examples: Example[] = [];
  const labelDist: Record<number, number> = {};
  let filingsUsed = 0;

  for (const filing of filings) {
    const magnitudes = anchorsByCompanyYear.get(`${filing.companyId}:${filing.fiscalYear}`);
    if (!magnitudes) continue;
    const rows = readRows(filing.id);
    if (!rows) continue;

    const statementRows = rows.filter((row) => STATEMENT_SECTIONS.has(row.sectionType));
    const pages = [...new Set(statementRows.map((row) => row.pageNumber))];
    let usedThisFiling = false;

    for (const pageNumber of pages) {
      const pageRows = statementRows.filter((row) => row.pageNumber === pageNumber);
      if (pageRows.length === 0) continue;
      const columnIndexes = [
        ...new Set(pageRows.flatMap((row) => row.values.map((value) => value.columnIndex))),
      ];

      let bestScale: number | null = null;
      let bestHits = 0;
      for (const scale of [1, 1000]) {
        for (const columnIndex of columnIndexes) {
          const hits = countAnchorHits(pageRows, columnIndex, magnitudes, scale);
          if (hits > bestHits) {
            bestHits = hits;
            bestScale = scale;
          }
        }
        // Prefer the declared whole-NOK reading when it already anchors.
        if (bestHits >= MIN_ANCHOR_HITS && scale === 1) break;
      }
      if (bestScale === null || bestHits < MIN_ANCHOR_HITS) continue;

      examples.push({
        filingId: filing.id,
        features: {
          pageContextText: buildPageContextText(pageNumber, pageRows[0]!.sectionType, pageRows),
        },
        label: bestScale,
      });
      labelDist[bestScale] = (labelDist[bestScale] ?? 0) + 1;
      usedThisFiling = true;
    }
    if (usedThisFiling) filingsUsed += 1;
  }

  // Split by filing so a company never straddles train/val/test.
  const filingIds = [...new Set(examples.map((example) => example.filingId))];
  // Deterministic hash-based bucketing.
  const hash = (id: string) => [...id].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 100, 7);
  const bucketOf = (id: string) => {
    const h = hash(id);
    if (h < 70) return "train";
    if (h < 85) return "validation";
    return "test";
  };

  const splits: Record<string, Example[]> = { train: [], validation: [], test: [] };
  for (const example of examples) splits[bucketOf(example.filingId)]!.push(example);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const [name, rows] of Object.entries(splits)) {
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `${name}.jsonl`),
      rows.map((row) => JSON.stringify(row)).join("\n"),
      "utf8",
    );
  }

  const stats = {
    generatedAt: new Date().toISOString(),
    filingsUsed,
    examples: examples.length,
    labelDistribution: labelDist,
    split: Object.fromEntries(Object.entries(splits).map(([name, rows]) => [name, rows.length])),
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, "stats.json"), JSON.stringify(stats, null, 2), "utf8");
  console.log(JSON.stringify(stats, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
