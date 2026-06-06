import {
  CanonicalMetricKey,
  defaultMetricDefinitions,
  findCanonicalMetricKey,
  getStatementFamilyFromSection,
  MetricDefinition,
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

function getMetricKeyForRow(row: ReconstructedRow, definitions: MetricDefinition[]) {
  const statementFamily = getStatementFamilyFromSection(row.sectionType);
  const liabilitySection = row.liabilitySection ?? null;

  if (statementFamily === "NOTE") {
    return (
      findCanonicalMetricKey(row.normalizedLabel, "INCOME_STATEMENT", null, definitions) ??
      findCanonicalMetricKey(row.normalizedLabel, "BALANCE_SHEET", liabilitySection, definitions)
    );
  }

  return statementFamily
    ? findCanonicalMetricKey(row.normalizedLabel, statementFamily, liabilitySection, definitions)
    : null;
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
  /** Alias mapping to match labels against. Defaults to the built-in list;
   *  the service layer passes the database-backed definitions at runtime. */
  definitions?: MetricDefinition[];
  /** Keys that must be present for the filing to count as complete. Defaults to
   *  the built-in list; the service layer passes the DB-backed registry keys. */
  requiredKeys?: string[];
  /** When true, also emit facts for the comparative (prior-year) column, which
   *  geometry-first already reads. Production defaults to false (publishes the
   *  filing's current year only), but the accuracy eval opts in to measure how
   *  much of the prior-year column the extractor recovers. */
  emitComparativeYears?: boolean;
}) {
  const definitions = input.definitions ?? defaultMetricDefinitions;
  const requiredKeys = input.requiredKeys ?? requiredPublishMetricKeys;
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
    const metricKey = getMetricKeyForRow(row, definitions);
    if (!metricKey) {
      continue;
    }

    const statementFamily =
      row.sectionType === "NOTE"
        ? "NOTE"
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
      if (!input.emitComparativeYears && fiscalYear !== input.filingFiscalYear) {
        continue;
      }

      facts.push({
        fiscalYear,
        statementType:
          row.sectionType === "NOTE"
            ? "NOTE"
            : getStatementFamilyFromSection(row.sectionType) ?? "NOTE",
        // Inherit the scope of the page this row came from. Pages with no
        // classification default to COMPANY (the safe single-statement case).
        statementScope: classification?.statementScope ?? "COMPANY",
        metricKey,
        rawLabel: row.label,
        normalizedLabel: row.normalizedLabel,
        value: row.unitScale * valueCell.value,
        currency: classification?.reportingCurrency ?? "NOK",
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

  const extractedMetricKeys = new Set<string>(
    facts.filter((fact) => fact.precedence !== "NOTE_DERIVED").map((fact) => fact.metricKey),
  );
  const missingPrimaryMetrics = requiredKeys.filter((key) => !extractedMetricKeys.has(key));
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

/**
 * Selects the best fact per metric key. When `scope` is given, only facts of
 * that scope are considered — this keeps consolidated and company numbers
 * from being mixed into one statement. When omitted, all facts are considered
 * (legacy behaviour, used where scope does not matter).
 */
export function chooseCanonicalFacts(
  facts: CanonicalFactCandidate[],
  scope?: CanonicalFactCandidate["statementScope"],
) {
  const selected = new Map<CanonicalMetricKey, CanonicalFactCandidate>();
  const scopedFacts = scope ? facts.filter((fact) => fact.statementScope === scope) : facts;

  for (const fact of scopedFacts) {
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
      // Don't replace a non-zero value with a zero-valued fact of equal or lower rank —
      // OCR extraction from scanned statutory pages frequently yields spurious zeros.
      if (fact.value === 0 && current.value !== 0 && nextRank <= currentRank) {
        continue;
      }
      selected.set(fact.metricKey, fact);
    }
  }

  return selected;
}
