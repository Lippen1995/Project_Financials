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

function getMetricKeyForRow(row: ReconstructedRow) {
  const statementFamily = getStatementFamilyFromSection(row.sectionType);

  if (statementFamily === "NOTE") {
    return (
      findCanonicalMetricKey(row.normalizedLabel, "INCOME_STATEMENT") ??
      findCanonicalMetricKey(row.normalizedLabel, "BALANCE_SHEET")
    );
  }

  return statementFamily ? findCanonicalMetricKey(row.normalizedLabel, statementFamily) : null;
}

function inferYearOrderForClassification(
  filingFiscalYear: number,
  classification: PageClassification | undefined,
) {
  if (!classification) {
    return {
      yearOrder: [filingFiscalYear, filingFiscalYear - 1],
      issues: [
        {
          severity: "ERROR",
          ruleCode: "YEAR_COLUMN_ASSIGNMENT_UNCERTAIN",
          message: "Missing page classification when assigning year columns.",
        },
      ] satisfies ValidationIssueDraft[],
    };
  }

  const candidateYears =
    (classification.yearHeaderYears ?? []).length >= 2
      ? (classification.yearHeaderYears ?? [])
      : (classification.declaredYears ?? []).filter(
          (year) => year >= filingFiscalYear - 2 && year <= filingFiscalYear + 1,
        );

  if (candidateYears.length >= 2) {
    const [firstYear, secondYear] = candidateYears;
    const issues: ValidationIssueDraft[] = [];

    if (firstYear !== filingFiscalYear) {
      issues.push({
        severity: "ERROR",
        ruleCode: "SUSPICIOUS_COLUMN_SWAP",
        message: `Declared year order starts with ${firstYear} instead of filing fiscal year ${filingFiscalYear}.`,
        context: {
          filingFiscalYear,
          candidateYears,
          pageNumber: classification.pageNumber,
        },
      });
    }

    if (!candidateYears.includes(filingFiscalYear)) {
      issues.push({
        severity: "ERROR",
        ruleCode: "YEAR_COLUMN_ASSIGNMENT_UNCERTAIN",
        message: `Filing fiscal year ${filingFiscalYear} is missing from detected year columns.`,
        context: {
          filingFiscalYear,
          candidateYears,
          pageNumber: classification.pageNumber,
        },
      });
    }

    return {
      yearOrder: [firstYear, secondYear] as [number, number],
      issues,
    };
  }

  return {
    yearOrder: [filingFiscalYear, filingFiscalYear - 1] as [number, number],
    issues: [
      {
        severity: "ERROR",
        ruleCode: "YEAR_COLUMN_ASSIGNMENT_UNCERTAIN",
        message: `Could not confidently assign year columns for page ${classification.pageNumber}.`,
        context: {
          filingFiscalYear,
          pageNumber: classification.pageNumber,
          declaredYears: classification.declaredYears,
          yearHeaderYears: classification.yearHeaderYears,
        },
      },
    ] satisfies ValidationIssueDraft[],
  };
}

export function mapRowsToCanonicalFacts(input: {
  filingFiscalYear: number;
  classifications: PageClassification[];
  rows: ReconstructedRow[];
}) {
  const facts: CanonicalFactCandidate[] = [];
  const issues: ValidationIssueDraft[] = [];
  const classificationByPage = new Map(
    input.classifications.map((classification) => [classification.pageNumber, classification]),
  );
  const yearOrderByPage = new Map<number, [number, number]>();

  for (const classification of input.classifications) {
    const requiresYearInference = [
      "STATUTORY_INCOME",
      "STATUTORY_BALANCE",
      "STATUTORY_BALANCE_CONTINUATION",
      "SUPPLEMENTARY_INCOME",
      "SUPPLEMENTARY_BALANCE",
    ].includes(classification.type);

    if (requiresYearInference) {
      const inferred = inferYearOrderForClassification(input.filingFiscalYear, classification);
      yearOrderByPage.set(classification.pageNumber, inferred.yearOrder as [number, number]);
      issues.push(...inferred.issues);
    } else {
      yearOrderByPage.set(classification.pageNumber, [
        input.filingFiscalYear,
        input.filingFiscalYear - 1,
      ]);
    }

    if (classification.hasConflictingUnitSignals) {
      issues.push({
        severity: "ERROR",
        ruleCode: "SCALE_CONFLICT_ON_PAGE",
        message: `Page ${classification.pageNumber} has conflicting unit-scale declarations.`,
        context: {
          pageNumber: classification.pageNumber,
          type: classification.type,
          reasons: classification.reasons,
        },
      });
    }

    if (
      ["STATUTORY_INCOME", "STATUTORY_BALANCE", "STATUTORY_BALANCE_CONTINUATION", "SUPPLEMENTARY_INCOME", "SUPPLEMENTARY_BALANCE"].includes(classification.type) &&
      classification.unitScale === null
    ) {
      issues.push({
        severity: "ERROR",
        ruleCode: "UNIT_SCALE_UNCERTAIN",
        message: `Page ${classification.pageNumber} is classified as a statement page without a confident unit scale.`,
        context: {
          pageNumber: classification.pageNumber,
          type: classification.type,
          unitScaleConfidence: classification.unitScaleConfidence,
        },
      });
    }
  }

  for (const row of input.rows) {
    const classification = classificationByPage.get(row.pageNumber);
    const metricKey = getMetricKeyForRow(row);
    if (!metricKey) {
      continue;
    }

    const statementFamily =
      row.sectionType === "NOTE"
        ? (
            findCanonicalMetricKey(row.normalizedLabel, "INCOME_STATEMENT")
              ? "NOTE"
              : "NOTE"
          )
        : getStatementFamilyFromSection(row.sectionType);
    if (!statementFamily) {
      continue;
    }

    const yearOrder = yearOrderByPage.get(row.pageNumber) ?? [
      input.filingFiscalYear,
      input.filingFiscalYear - 1,
    ];

    for (const valueCell of row.values) {
      const fiscalYear = yearOrder[valueCell.columnIndex] ?? yearOrder[0];
      if (fiscalYear !== input.filingFiscalYear) {
        continue;
      }

      facts.push({
        fiscalYear,
        statementType:
          row.sectionType === "NOTE"
            ? "NOTE"
            : getStatementFamilyFromSection(row.sectionType) ?? "NOTE",
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
        confidenceScore: classification
          ? Number(((row.confidence + classification.confidence) / 2).toFixed(3))
          : row.confidence,
        precedence: getPrecedenceForSection(row.sectionType),
        isDerived: row.sectionType === "NOTE",
        rawPayload: {
          columnIndex: valueCell.columnIndex,
          rawValue: valueCell.value,
          yearOrder,
          classificationType: classification?.type ?? null,
        },
      });
    }
  }

  const extractedMetricKeys = new Set(
    facts.filter((fact) => fact.precedence !== "NOTE_DERIVED").map((fact) => fact.metricKey),
  );
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
