import type {
  CanonicalFactCandidate,
  PageClassification,
  ReconstructedRow,
} from "@/integrations/brreg/annual-report-financials/types";
import { buildFinancialFactPredictionText } from "@/server/ml/financial-fact-context";
import { predictFinancialFactMetric } from "@/server/ml/ml-inference-client";

export type FinancialFactShadowComparisonRow = {
  sourcePage: number;
  rawLabel: string;
  ruleMetricKey: string;
  mlMetricKey: string | null;
  mlConfidence: number | null;
  agree: boolean;
};

export type FinancialFactShadowComparisonSummary = {
  serviceAvailable: boolean;
  comparedFacts: number;
  agreements: number;
  disagreements: number;
  skipped: number;
  skippedAsReported: number;
  agreementRate: number | null;
  rows: FinancialFactShadowComparisonRow[];
};

export async function runFinancialFactShadowComparison(input: {
  facts: CanonicalFactCandidate[];
  classifications: PageClassification[];
  rows?: ReconstructedRow[];
  maxFacts?: number;
}): Promise<FinancialFactShadowComparisonSummary> {
  const classificationByPage = new Map(
    input.classifications.map((classification) => [classification.pageNumber, classification]),
  );
  const rowsByPage = groupRowsByPage(input.rows ?? []);
  const rows: FinancialFactShadowComparisonRow[] = [];
  let serviceAvailable = true;
  let skipped = 0;
  let skippedAsReported = 0;
  const candidates = input.facts.slice(0, input.maxFacts ?? 200);

  for (let index = 0; index < candidates.length; index += 1) {
    const fact = candidates[index]!;
    if (fact.metricKey.startsWith("as_reported_")) {
      skipped += 1;
      skippedAsReported += 1;
      continue;
    }
    const supportingRow = findSupportingRow(fact, rowsByPage.get(fact.sourcePage) ?? []);
    const rowContext = buildFinancialFactPredictionText({
      fact,
      row: supportingRow,
      classification: classificationByPage.get(fact.sourcePage) ?? null,
      neighborRows: supportingRow
        ? findNeighborRows(supportingRow, rowsByPage.get(fact.sourcePage) ?? [])
        : [],
    });
    if (!rowContext) {
      skipped += 1;
      continue;
    }

    const prediction = await predictFinancialFactMetric({
      rowContext,
      proposedMetricKey: fact.metricKey,
    });
    if (prediction === null) {
      serviceAvailable = false;
      skipped += candidates.length - index;
      break;
    }

    rows.push({
      sourcePage: fact.sourcePage,
      rawLabel: fact.rawLabel,
      ruleMetricKey: fact.metricKey,
      mlMetricKey: prediction.metricKey,
      mlConfidence: prediction.confidence,
      agree: fact.metricKey === prediction.metricKey,
    });
  }

  const comparedFacts = rows.length;
  const agreements = rows.filter((row) => row.agree).length;
  const disagreements = comparedFacts - agreements;

  return {
    serviceAvailable,
    comparedFacts,
    agreements,
    disagreements,
    skipped,
    skippedAsReported,
    agreementRate: comparedFacts === 0 ? null : agreements / comparedFacts,
    rows,
  };
}

function groupRowsByPage(rows: ReconstructedRow[]) {
  const byPage = new Map<number, ReconstructedRow[]>();
  for (const row of rows) {
    const pageRows = byPage.get(row.pageNumber) ?? [];
    pageRows.push(row);
    byPage.set(row.pageNumber, pageRows);
  }
  for (const pageRows of byPage.values()) {
    pageRows.sort((left, right) => left.y - right.y);
  }
  return byPage;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function findSupportingRow(fact: CanonicalFactCandidate, rows: ReconstructedRow[]) {
  const sourceRowText = normalizeText(fact.sourceRowText);
  const rawLabel = normalizeText(fact.rawLabel);
  return (
    rows.find((row) => sourceRowText && normalizeText(row.rowText) === sourceRowText) ??
    rows.find((row) => rawLabel && normalizeText(row.label) === rawLabel) ??
    null
  );
}

function findNeighborRows(row: ReconstructedRow, pageRows: ReconstructedRow[]) {
  const scopedRows = pageRows.filter((candidate) => candidate.sectionType === row.sectionType);
  const index = scopedRows.indexOf(row);
  if (index === -1) return [];
  return scopedRows.slice(Math.max(0, index - 3), Math.min(scopedRows.length, index + 4));
}
