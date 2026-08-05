import type {
  AnnualReportUnitScale,
  CanonicalFactCandidate,
} from "@/integrations/brreg/annual-report-financials/types";
import type {
  UnifiedFinancialLineItem,
  UnifiedFinancialStatementExtractionResult,
  UnifiedUnitScale,
} from "@/integrations/brreg/annual-report-financials/unified-financial-statement-extractor";
import type {
  UnifiedNarrativeExtractionResult,
  UnifiedNarrativeSectionKind,
} from "@/integrations/brreg/annual-report-financials/unified-narrative-extractor";
import { normalizeNorwegianText } from "@/lib/norwegian-text";

export type LegacyVsUnifiedComparisonVersion = "legacy-vs-unified-comparison-v1";
export const LEGACY_VS_UNIFIED_COMPARISON_VERSION: LegacyVsUnifiedComparisonVersion =
  "legacy-vs-unified-comparison-v1";

export type FinancialFactMatchKind =
  | "EXACT"
  | "TOLERANCE"
  | "UNIT_SCALE_ADJUSTED"
  | "LABEL_MAPPED"
  | "MISSING_IN_LEGACY"
  | "MISSING_IN_UNIFIED"
  | "CONFLICTING_VALUES"
  | "LOW_CONFIDENCE_AMBIGUOUS";

export type FinancialFactComparison = {
  canonicalKey: string;
  year: number;
  legacyValueNok: string | null;
  unifiedValueNok: string | null;
  deltaNok: string | null;
  match: FinancialFactMatchKind;
  relativeDeviation: number | null;
  legacyLabel: string | null;
  unifiedLabel: string | null;
  legacyUnitScale: number | null;
  unifiedUnitScale: UnifiedUnitScale | null;
};

export type LegacyNarrativeKind = "BOARD_REPORT" | "AUDITOR_REPORT" | "SIGNATURES";

export type NarrativeSectionComparison = {
  kind: LegacyNarrativeKind;
  legacyFound: boolean;
  unifiedFound: boolean;
  unifiedSectionKind: UnifiedNarrativeSectionKind | null;
  textSimilarity: number | null;
};

export type LegacyVsUnifiedComparisonSummary = {
  financialExactMatchCount: number;
  financialScaledMatchCount: number;
  financialMismatchCount: number;
  financialMissingInLegacyCount: number;
  financialMissingInUnifiedCount: number;
  financialLowConfidenceCount: number;
  financialTotalCompared: number;
  narrativeBoardReportCovered: boolean;
  narrativeAuditorReportCovered: boolean;
  narrativeSignaturesCovered: boolean;
  narrativeCoverageScore: number;
};

export type LegacyVsUnifiedComparisonSafety = {
  canUseForProductionRouting: false;
  productionRoutingChanged: false;
  productionFactsMutated: false;
  publishAffected: false;
  shadowOnly: boolean;
};

export type AnnualReportLegacyVsUnifiedComparisonReport = {
  version: LegacyVsUnifiedComparisonVersion;
  generatedAt: string;
  source: {
    filingId: string | null;
    orgNumber: string | null;
    fiscalYear: number | null;
    legacyCandidateCount: number;
    unifiedRoute: string | null;
    unifiedNarrativeRoute: string | null;
  };
  financialComparisons: FinancialFactComparison[];
  narrativeComparisons: NarrativeSectionComparison[];
  summary: LegacyVsUnifiedComparisonSummary;
  warnings: string[];
  safety: LegacyVsUnifiedComparisonSafety;
};

export type AnnualReportLegacyVsUnifiedComparisonInput = {
  legacyCandidates: CanonicalFactCandidate[];
  unifiedFinancial?: UnifiedFinancialStatementExtractionResult | null;
  unifiedNarrative?: UnifiedNarrativeExtractionResult | null;
  meta?: {
    filingId?: string | null;
    orgNumber?: string | null;
    fiscalYear?: number | null;
  };
};

type UnifiedEntry = {
  canonicalKey: string;
  year: number;
  rawLabel: string;
  normalizedLabel: string;
  value: string;
  unitScale: UnifiedUnitScale;
  matchedViaLabel: boolean;
};

const TOLERANCE_THRESHOLD = 0.01;

const NORWEGIAN_LABEL_SYNONYMS: Record<string, string> = {
  "sum driftsinntekter": "revenue",
  driftsinntekter: "revenue",
  salgsinntekter: "revenue",
  driftsresultat: "operating_profit",
  arsresultat: "net_income",
  "sum eiendeler": "total_assets",
  "sum egenkapital": "total_equity",
  "sum gjeld": "total_liabilities",
  "sum egenkapital og gjeld": "total_equity_and_liabilities",
  "bankinnskudd kontanter ol": "cash_and_cash_equivalents",
  "annen kortsiktig gjeld": "current_liabilities_other",
};

function legacyScaleToMultiplier(scale: AnnualReportUnitScale): bigint {
  return BigInt(scale);
}

function unifiedScaleToMultiplier(scale: UnifiedUnitScale): bigint | null {
  switch (scale) {
    case "ONES":
      return 1n;
    case "THOUSANDS":
      return 1000n;
    case "MILLIONS":
      return 1000000n;
    default:
      return null;
  }
}

function canonicalKeyFromLabel(label: string | null): string | null {
  if (!label) {
    return null;
  }
  return NORWEGIAN_LABEL_SYNONYMS[normalizeNorwegianText(label)] ?? null;
}

function parseValueToBigInt(raw: string): bigint | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-" || trimmed === "—" || trimmed === "–") {
    return null;
  }

  let normalized = trimmed.replace(/\u00a0/g, " ").replace(/\s+/g, "");
  let negative = false;
  if (normalized.startsWith("(") && normalized.endsWith(")")) {
    negative = true;
    normalized = normalized.slice(1, -1);
  } else if (normalized.startsWith("-")) {
    negative = true;
    normalized = normalized.slice(1);
  }

  const commaIndex = normalized.lastIndexOf(",");
  if (commaIndex >= 0) {
    const decimals = normalized.slice(commaIndex + 1);
    normalized =
      decimals.length <= 2
        ? normalized.slice(0, commaIndex)
        : normalized.replace(/,/g, "");
  }

  normalized = normalized.replace(/\./g, "").replace(/,/g, "");
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const value = BigInt(normalized);
  return negative ? -value : value;
}

function tokenize(text: string): Set<string> {
  return new Set(
    normalizeNorwegianText(text)
      .split(/\s+/)
      .map((token) => token.replace(/[^a-z0-9]/g, ""))
      .filter((token) => token.length >= 3),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) {
      intersection += 1;
    }
  }
  return intersection / (a.size + b.size - intersection);
}

function buildLegacyMap(legacyCandidates: CanonicalFactCandidate[]) {
  const byKey = new Map<string, CanonicalFactCandidate>();
  const byLabel = new Map<string, CanonicalFactCandidate>();

  for (const candidate of legacyCandidates) {
    const directKey = `${String(candidate.metricKey)}:${candidate.fiscalYear}`;
    const existing = byKey.get(directKey);
    if (!existing || candidate.confidenceScore > existing.confidenceScore) {
      byKey.set(directKey, candidate);
    }

    const labelKey = canonicalKeyFromLabel(candidate.rawLabel) ?? canonicalKeyFromLabel(candidate.normalizedLabel);
    if (labelKey) {
      const composite = `${labelKey}:${candidate.fiscalYear}`;
      const labelExisting = byLabel.get(composite);
      if (!labelExisting || candidate.confidenceScore > labelExisting.confidenceScore) {
        byLabel.set(composite, candidate);
      }
    }
  }

  return { byKey, byLabel };
}

function buildUnifiedMap(unifiedFinancial: UnifiedFinancialStatementExtractionResult) {
  const byKey = new Map<string, UnifiedEntry>();

  for (const statement of unifiedFinancial.statements) {
    for (const item of statement.lineItems) {
      const labelMappedKey =
        canonicalKeyFromLabel(item.originalLabel) ?? canonicalKeyFromLabel(item.normalizedLabel);
      const canonicalKey = item.canonicalKey ?? labelMappedKey;
      if (!canonicalKey) {
        continue;
      }
      const composite = `${canonicalKey}:${item.year}`;
      if (!byKey.has(composite)) {
        byKey.set(composite, {
          canonicalKey,
          year: item.year,
          rawLabel: item.originalLabel,
          normalizedLabel: item.normalizedLabel,
          value: item.value,
          unitScale: item.unitScale,
          matchedViaLabel: item.canonicalKey === null && labelMappedKey !== null,
        });
      }
    }
  }

  return byKey;
}

function compareFinancials(
  legacyCandidates: CanonicalFactCandidate[],
  unifiedFinancial: UnifiedFinancialStatementExtractionResult | null | undefined,
  warnings: string[],
): FinancialFactComparison[] {
  const { byKey: legacyByKey, byLabel: legacyByLabel } = buildLegacyMap(legacyCandidates);

  if (!unifiedFinancial) {
    if (legacyCandidates.length > 0) {
      warnings.push(
        `No unified financial result provided; ${legacyCandidates.length} legacy candidates have no counterpart`,
      );
    }
    return Array.from(legacyByKey.values()).map((candidate) => ({
      canonicalKey: String(candidate.metricKey),
      year: candidate.fiscalYear,
      legacyValueNok: String(BigInt(Math.round(candidate.value)) * legacyScaleToMultiplier(candidate.unitScale)),
      unifiedValueNok: null,
      deltaNok: null,
      match: "MISSING_IN_UNIFIED",
      relativeDeviation: null,
      legacyLabel: candidate.rawLabel,
      unifiedLabel: null,
      legacyUnitScale: candidate.unitScale,
      unifiedUnitScale: null,
    }));
  }

  const unifiedByKey = buildUnifiedMap(unifiedFinancial);
  const processed = new Set<string>();
  const comparisons: FinancialFactComparison[] = [];

  for (const [composite, unified] of unifiedByKey) {
    processed.add(composite);
    const directLegacy = legacyByKey.get(composite);
    const labelMatchedLegacy = directLegacy ?? legacyByLabel.get(composite) ?? null;
    if (!labelMatchedLegacy) {
      comparisons.push({
        canonicalKey: unified.canonicalKey,
        year: unified.year,
        legacyValueNok: null,
        unifiedValueNok: null,
        deltaNok: null,
        match: "MISSING_IN_LEGACY",
        relativeDeviation: null,
        legacyLabel: null,
        unifiedLabel: unified.rawLabel,
        legacyUnitScale: null,
        unifiedUnitScale: unified.unitScale,
      });
      continue;
    }

    const legacyValueNok = BigInt(Math.round(labelMatchedLegacy.value)) * legacyScaleToMultiplier(labelMatchedLegacy.unitScale);
    const unifiedMultiplier = unifiedScaleToMultiplier(unified.unitScale);
    const parsedUnifiedValue = parseValueToBigInt(unified.value);

    if (parsedUnifiedValue === null || unifiedMultiplier === null) {
      comparisons.push({
        canonicalKey: unified.canonicalKey,
        year: unified.year,
        legacyValueNok: String(legacyValueNok),
        unifiedValueNok: null,
        deltaNok: null,
        match: "LOW_CONFIDENCE_AMBIGUOUS",
        relativeDeviation: null,
        legacyLabel: labelMatchedLegacy.rawLabel,
        unifiedLabel: unified.rawLabel,
        legacyUnitScale: labelMatchedLegacy.unitScale,
        unifiedUnitScale: unified.unitScale,
      });
      continue;
    }

    const unifiedValueNok = parsedUnifiedValue * unifiedMultiplier;
    const delta = unifiedValueNok - legacyValueNok;
    const absDelta = delta < 0n ? -delta : delta;
    const denominator = legacyValueNok < 0n ? -legacyValueNok : legacyValueNok;
    const relativeDeviation =
      denominator === 0n ? (delta === 0n ? 0 : 1) : Number((absDelta * 10000n) / denominator) / 10000;

    let match: FinancialFactMatchKind = "CONFLICTING_VALUES";
    if (delta === 0n) {
      if (unified.matchedViaLabel) {
        match = "LABEL_MAPPED";
      } else if (BigInt(labelMatchedLegacy.unitScale) !== unifiedMultiplier) {
        match = "UNIT_SCALE_ADJUSTED";
      } else {
        match = "EXACT";
      }
    } else if (relativeDeviation <= TOLERANCE_THRESHOLD) {
      match = unified.matchedViaLabel ? "LABEL_MAPPED" : "TOLERANCE";
    }

    comparisons.push({
      canonicalKey: unified.canonicalKey,
      year: unified.year,
      legacyValueNok: String(legacyValueNok),
      unifiedValueNok: String(unifiedValueNok),
      deltaNok: String(delta),
      match,
      relativeDeviation,
      legacyLabel: labelMatchedLegacy.rawLabel,
      unifiedLabel: unified.rawLabel,
      legacyUnitScale: labelMatchedLegacy.unitScale,
      unifiedUnitScale: unified.unitScale,
    });
  }

  for (const [composite, candidate] of legacyByKey) {
    if (processed.has(composite)) {
      continue;
    }
    comparisons.push({
      canonicalKey: String(candidate.metricKey),
      year: candidate.fiscalYear,
      legacyValueNok: String(BigInt(Math.round(candidate.value)) * legacyScaleToMultiplier(candidate.unitScale)),
      unifiedValueNok: null,
      deltaNok: null,
      match: "MISSING_IN_UNIFIED",
      relativeDeviation: null,
      legacyLabel: candidate.rawLabel,
      unifiedLabel: null,
      legacyUnitScale: candidate.unitScale,
      unifiedUnitScale: null,
    });
  }

  return comparisons.sort((left, right) =>
    left.year !== right.year ? left.year - right.year : left.canonicalKey.localeCompare(right.canonicalKey),
  );
}

const NARRATIVE_KIND_TO_UNIFIED: Record<LegacyNarrativeKind, UnifiedNarrativeSectionKind[]> = {
  BOARD_REPORT: ["BOARD_REPORT"],
  AUDITOR_REPORT: ["AUDITOR_REPORT", "AUDITOR_OPINION", "AUDITOR_QUALIFICATION"],
  SIGNATURES: ["SIGNATURES"],
};

function compareNarratives(
  unifiedNarrative: UnifiedNarrativeExtractionResult | null | undefined,
  warnings: string[],
): NarrativeSectionComparison[] {
  const kinds: LegacyNarrativeKind[] = ["BOARD_REPORT", "AUDITOR_REPORT", "SIGNATURES"];
  return kinds.map((kind) => {
    const unifiedKinds = NARRATIVE_KIND_TO_UNIFIED[kind];
    const section =
      unifiedNarrative?.sections.find((candidate) => unifiedKinds.includes(candidate.kind)) ?? null;
    if (!section && unifiedNarrative) {
      warnings.push(`Narrative section "${kind}" not found in unified result`);
    }
    return {
      kind,
      legacyFound: section !== null,
      unifiedFound: section !== null,
      unifiedSectionKind: section?.kind ?? null,
      textSimilarity: section ? jaccardSimilarity(tokenize(section.textPreview), tokenize(section.textPreview)) : null,
    };
  });
}

function buildSummary(
  financial: FinancialFactComparison[],
  narrative: NarrativeSectionComparison[],
): LegacyVsUnifiedComparisonSummary {
  const exact = financial.filter((item) => item.match === "EXACT").length;
  const scaled = financial.filter((item) =>
    ["TOLERANCE", "UNIT_SCALE_ADJUSTED", "LABEL_MAPPED"].includes(item.match),
  ).length;
  const mismatches = financial.filter((item) => item.match === "CONFLICTING_VALUES").length;
  const missingInLegacy = financial.filter((item) => item.match === "MISSING_IN_LEGACY").length;
  const missingInUnified = financial.filter((item) => item.match === "MISSING_IN_UNIFIED").length;
  const lowConfidence = financial.filter((item) => item.match === "LOW_CONFIDENCE_AMBIGUOUS").length;

  const boardCovered = narrative.find((item) => item.kind === "BOARD_REPORT")?.unifiedFound ?? false;
  const auditorCovered = narrative.find((item) => item.kind === "AUDITOR_REPORT")?.unifiedFound ?? false;
  const signaturesCovered = narrative.find((item) => item.kind === "SIGNATURES")?.unifiedFound ?? false;

  return {
    financialExactMatchCount: exact,
    financialScaledMatchCount: scaled,
    financialMismatchCount: mismatches,
    financialMissingInLegacyCount: missingInLegacy,
    financialMissingInUnifiedCount: missingInUnified,
    financialLowConfidenceCount: lowConfidence,
    financialTotalCompared: financial.length,
    narrativeBoardReportCovered: boardCovered,
    narrativeAuditorReportCovered: auditorCovered,
    narrativeSignaturesCovered: signaturesCovered,
    narrativeCoverageScore:
      narrative.length === 0 ? 0 : [boardCovered, auditorCovered, signaturesCovered].filter(Boolean).length / narrative.length,
  };
}

function makeSafety(): LegacyVsUnifiedComparisonSafety {
  return {
    canUseForProductionRouting: false,
    productionRoutingChanged: false,
    productionFactsMutated: false,
    publishAffected: false,
    shadowOnly: true,
  };
}

export function compareAnnualReportLegacyVsUnifiedExtraction(
  input: AnnualReportLegacyVsUnifiedComparisonInput,
): AnnualReportLegacyVsUnifiedComparisonReport {
  const { legacyCandidates, unifiedFinancial, unifiedNarrative, meta = {} } = input;
  const warnings: string[] = [];

  if (legacyCandidates.length === 0 && !unifiedFinancial && !unifiedNarrative) {
    warnings.push("Both legacy and unified inputs are empty — nothing to compare");
  }

  const financialComparisons = compareFinancials(legacyCandidates, unifiedFinancial, warnings);
  const narrativeComparisons = compareNarratives(unifiedNarrative, warnings);
  const summary = buildSummary(financialComparisons, narrativeComparisons);
  const firstCandidate = legacyCandidates[0];

  return {
    version: LEGACY_VS_UNIFIED_COMPARISON_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      filingId: meta.filingId ?? unifiedFinancial?.source.filingId ?? null,
      orgNumber: meta.orgNumber ?? unifiedFinancial?.source.orgNumber ?? null,
      fiscalYear: meta.fiscalYear ?? firstCandidate?.fiscalYear ?? unifiedFinancial?.source.fiscalYear ?? null,
      legacyCandidateCount: legacyCandidates.length,
      unifiedRoute: unifiedFinancial?.source.route ?? null,
      unifiedNarrativeRoute: unifiedNarrative?.source.route ?? null,
    },
    financialComparisons,
    narrativeComparisons,
    summary,
    warnings,
    safety: makeSafety(),
  };
}

export type LegacyVsUnifiedComparisonValidationIssue = {
  severity: "ERROR" | "WARNING";
  code: string;
  message: string;
};

export function validateLegacyVsUnifiedComparisonReport(
  report: AnnualReportLegacyVsUnifiedComparisonReport,
): { valid: boolean; issues: LegacyVsUnifiedComparisonValidationIssue[] } {
  const issues: LegacyVsUnifiedComparisonValidationIssue[] = [];

  if (report.safety.canUseForProductionRouting !== false) {
    issues.push({ severity: "ERROR", code: "SAFETY_VIOLATION_ROUTING", message: "canUseForProductionRouting must always be false" });
  }
  if (report.version !== LEGACY_VS_UNIFIED_COMPARISON_VERSION) {
    issues.push({
      severity: "ERROR",
      code: "INVALID_VERSION",
      message: `version must be "${LEGACY_VS_UNIFIED_COMPARISON_VERSION}", got "${report.version}"`,
    });
  }

  const computed =
    report.summary.financialExactMatchCount +
    report.summary.financialScaledMatchCount +
    report.summary.financialMismatchCount +
    report.summary.financialMissingInLegacyCount +
    report.summary.financialMissingInUnifiedCount +
    report.summary.financialLowConfidenceCount;
  if (computed !== report.summary.financialTotalCompared) {
    issues.push({
      severity: "ERROR",
      code: "SUMMARY_COUNT_MISMATCH",
      message: `Summary counts sum (${computed}) does not match totalCompared (${report.summary.financialTotalCompared})`,
    });
  }

  if (report.summary.financialTotalCompared > 0) {
    const mismatchRate = report.summary.financialMismatchCount / report.summary.financialTotalCompared;
    if (mismatchRate > 0.3) {
      issues.push({
        severity: "WARNING",
        code: "HIGH_MISMATCH_RATE",
        message: `Mismatch rate is ${Math.round(mismatchRate * 100)}% (${report.summary.financialMismatchCount}/${report.summary.financialTotalCompared})`,
      });
    }
  }

  return { valid: issues.every((issue) => issue.severity !== "ERROR"), issues };
}

export function serializeLegacyVsUnifiedComparisonReportAsJson(
  report: AnnualReportLegacyVsUnifiedComparisonReport,
): string {
  return JSON.stringify(report, null, 2);
}
