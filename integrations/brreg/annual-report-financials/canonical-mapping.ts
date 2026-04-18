import {
  CanonicalMetricKey,
  findCanonicalMetricKey,
  getStatementFamilyFromSection,
  requiredPublishMetricKeys,
} from "@/integrations/brreg/annual-report-financials/taxonomy";
import {
  CanonicalFactCandidate,
  PageClassification,
  ReconstructedRow,
  ValidationIssueDraft,
} from "@/integrations/brreg/annual-report-financials/types";

function getPrecedenceForSection(sectionType: ReconstructedRow["sectionType"]) {
  switch (sectionType) {
    case "STATUTORY_INCOME":
    case "STATUTORY_BALANCE":
    case "STATUTORY_BALANCE_CONTINUATION":
      return "STATUTORY_NOK" as const;
    case "SUPPLEMENTARY_INCOME":
    case "SUPPLEMENTARY_BALANCE":
      return "SUPPLEMENTARY_NOK_THOUSANDS" as const;
    case "NOTE":
      return "NOTE_DERIVED" as const;
    default:
      return "NOTE_DERIVED" as const;
  }
}

function inferYearColumns(
  filingFiscalYear: number,
  classifications: PageClassification[],
) {
  const orderedYears = Array.from(
    new Set(
      classifications
        .flatMap((classification) => classification.declaredYears)
        .filter((year) => year >= filingFiscalYear - 2 && year <= filingFiscalYear + 1),
    ),
  );

  if (orderedYears.includes(filingFiscalYear)) {
    const comparative = orderedYears.find((year) => year !== filingFiscalYear) ?? filingFiscalYear - 1;
    return [filingFiscalYear, comparative] as const;
  }

  return [filingFiscalYear, filingFiscalYear - 1] as const;
}

export function mapRowsToCanonicalFacts(input: {
  filingFiscalYear: number;
  classifications: PageClassification[];
  rows: ReconstructedRow[];
}) {
  const facts: CanonicalFactCandidate[] = [];
  const issues: ValidationIssueDraft[] = [];
  const [primaryYear, comparativeYear] = inferYearColumns(input.filingFiscalYear, input.classifications);
  const declaredYearOrder = input.classifications.find((classification) => classification.declaredYears.length >= 2)
    ?.declaredYears;

  if (declaredYearOrder && declaredYearOrder[0] !== input.filingFiscalYear) {
    issues.push({
      severity: "ERROR",
      ruleCode: "YEAR_COLUMN_ORDER_SUSPICIOUS",
      message: `Declared year order starts with ${declaredYearOrder[0]} instead of filing fiscal year ${input.filingFiscalYear}.`,
      context: {
        filingFiscalYear: input.filingFiscalYear,
        declaredYearOrder,
      },
    });
  }

  for (const row of input.rows) {
    const statementFamily = getStatementFamilyFromSection(row.sectionType);
    if (!statementFamily) {
      continue;
    }

    const metricKey = findCanonicalMetricKey(row.normalizedLabel, statementFamily);
    if (!metricKey) {
      continue;
    }

    for (const valueCell of row.values) {
      const fiscalYear = valueCell.columnIndex === 0 ? primaryYear : comparativeYear;
      if (fiscalYear !== input.filingFiscalYear) {
        continue;
      }

      facts.push({
        fiscalYear,
        statementType: statementFamily,
        metricKey,
        rawLabel: row.label,
        normalizedLabel: row.normalizedLabel,
        value: row.unitScale * valueCell.value,
        currency: "NOK",
        unitScale: row.unitScale,
        sourcePage: row.pageNumber,
        sourceSection: row.sectionType,
        sourceRowText: row.rowText,
        noteReference: row.noteReference,
        confidenceScore: row.confidence,
        precedence: getPrecedenceForSection(row.sectionType),
        isDerived: false,
        rawPayload: {
          columnIndex: valueCell.columnIndex,
          rawValue: valueCell.value,
        },
      });
    }
  }

  const extractedMetricKeys = new Set(facts.map((fact) => fact.metricKey));
  const missingPrimaryMetrics = requiredPublishMetricKeys.filter((key) => !extractedMetricKeys.has(key));
  if (missingPrimaryMetrics.length > 0) {
    issues.push({
      severity: "ERROR",
      ruleCode: "REQUIRED_PRIMARY_METRICS_MISSING",
      message: `Missing primary metrics: ${missingPrimaryMetrics.join(", ")}`,
      context: {
        missingPrimaryMetrics,
      },
    });
  }

  return {
    facts,
    issues,
  };
}

function precedenceRank(precedence: CanonicalFactCandidate["precedence"]) {
  switch (precedence) {
    case "MACHINE_READABLE":
      return 4;
    case "STATUTORY_NOK":
      return 3;
    case "SUPPLEMENTARY_NOK_THOUSANDS":
      return 2;
    case "NOTE_DERIVED":
    default:
      return 1;
  }
}

export function chooseCanonicalFacts(facts: CanonicalFactCandidate[]) {
  const selected = new Map<CanonicalMetricKey, CanonicalFactCandidate>();

  for (const fact of facts) {
    const current = selected.get(fact.metricKey);
    if (!current) {
      selected.set(fact.metricKey, fact);
      continue;
    }

    const currentRank = precedenceRank(current.precedence);
    const nextRank = precedenceRank(fact.precedence);

    if (
      nextRank > currentRank ||
      (nextRank === currentRank && fact.confidenceScore > current.confidenceScore)
    ) {
      selected.set(fact.metricKey, fact);
    }
  }

  return selected;
}
