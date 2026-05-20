/**
 * Extraction Pattern Analysis Service
 *
 * Reads reviewer corrections from the past N days and groups them into
 * patterns — "what kind of mistake happened, how often, and on which
 * metric/rule" — so the admin can see the biggest recurring weaknesses
 * in the extractor and prioritise fixes.
 *
 * For reviewers (business view):
 *  - The service never changes anything in the pipeline. It only reads
 *    correction records and writes a summary report.
 *  - A "pattern" is a triplet (metricKey × ruleCode × errorClass). E.g.
 *    "revenue × <none> × UNIT_SCALE_MISS = 42 occurrences" means the
 *    extractor under-reported revenue by a factor of 1000 in 42 different
 *    filings.
 *  - The report ranks patterns by occurrence × severity so the biggest
 *    problems float to the top.
 *  - Patterns with only 1–2 occurrences are dropped — too noisy to act on.
 *
 * Error classification heuristic (proposedValue → acceptedValue):
 *   ratio = accepted / proposed
 *   - proposed is null and accepted is a number    → MISSING_VALUE
 *   - |ratio − 1000| < 0.5% or |ratio − 0.001| < 0.5% → UNIT_SCALE_MISS
 *   - same magnitude (within 50%) but different digits → OCR_NOISE
 *   - same value but different sourcePage          → WRONG_PAGE
 *   - everything else                              → OTHER
 */
import {
  type ExtractionPattern,
  type ExtractionPatternReport,
  ExtractionPatternErrorClass,
  ExtractionPatternReportStatus,
  Prisma,
  PdfTrainingLabelType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { createAdminNotificationIfMissing } from "@/server/services/admin-notification-service";

const MIN_OCCURRENCES_FOR_SIGNIFICANCE = 3;
const MAX_AFFECTED_FILINGS_PER_PATTERN = 50;
const DEFAULT_LOOKBACK_DAYS = 30;

// ──────────────────────────────────────────────────────────────────────────────
// Value extraction
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Extracts a numeric value from a training-label value blob. The same label
 * type can carry the value in different shapes depending on which review flow
 * produced it (accept vs correct). We accept both:
 *   - { value: number }            (accept flow)
 *   - { value: string | number }   (correct flow — value may be a string)
 */
function extractNumericValue(blob: unknown): number | null {
  if (blob === null || blob === undefined) return null;
  if (typeof blob === "number") return Number.isFinite(blob) ? blob : null;
  if (typeof blob === "string") {
    const parsed = Number(blob);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof blob === "object") {
    const record = blob as Record<string, unknown>;
    if ("value" in record) {
      return extractNumericValue(record.value);
    }
  }
  return null;
}

function extractSourcePage(blob: unknown): number | null {
  if (!blob || typeof blob !== "object") return null;
  const record = blob as Record<string, unknown>;
  const candidate = record.sourcePage;
  if (typeof candidate === "number") return candidate;
  if (typeof candidate === "string") {
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractMetricKey(targetRef: unknown): string | null {
  if (!targetRef || typeof targetRef !== "object") return null;
  const record = targetRef as Record<string, unknown>;
  return typeof record.metricKey === "string" ? record.metricKey : null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Classification
// ──────────────────────────────────────────────────────────────────────────────

export function classifyCorrection(
  proposed: unknown,
  accepted: unknown,
): ExtractionPatternErrorClass | null {
  const proposedNum = extractNumericValue(proposed);
  const acceptedNum = extractNumericValue(accepted);

  if (proposedNum === null && acceptedNum === null) return null;

  if (proposedNum === null && acceptedNum !== null) {
    return ExtractionPatternErrorClass.MISSING_VALUE;
  }

  if (proposedNum !== null && acceptedNum !== null) {
    if (proposedNum === acceptedNum) {
      // Same value — only a real correction if sourcePage changed.
      const proposedPage = extractSourcePage(proposed);
      const acceptedPage = extractSourcePage(accepted);
      if (proposedPage !== null && acceptedPage !== null && proposedPage !== acceptedPage) {
        return ExtractionPatternErrorClass.WRONG_PAGE;
      }
      return null;
    }

    if (proposedNum !== 0) {
      const ratio = acceptedNum / proposedNum;
      // ±0.5% tolerance around exactly 1000 or 0.001
      if (Math.abs(ratio - 1000) < 5) return ExtractionPatternErrorClass.UNIT_SCALE_MISS;
      if (Math.abs(ratio - 0.001) < 0.000005) return ExtractionPatternErrorClass.UNIT_SCALE_MISS;
    }

    // Within an order of magnitude (50%–200% range) but not equal: likely OCR.
    const magnitude = Math.abs(acceptedNum) / Math.max(Math.abs(proposedNum), 1);
    if (magnitude >= 0.5 && magnitude <= 2) {
      return ExtractionPatternErrorClass.OCR_NOISE;
    }
  }

  return ExtractionPatternErrorClass.OTHER;
}

// ──────────────────────────────────────────────────────────────────────────────
// Suggested fix copy
// ──────────────────────────────────────────────────────────────────────────────

function suggestedFixForPattern(
  errorClass: ExtractionPatternErrorClass,
  metricKey: string | null,
): string {
  const subject = metricKey ? `'${metricKey}'` : "denne metrikken";
  switch (errorClass) {
    case ExtractionPatternErrorClass.UNIT_SCALE_MISS:
      return `Skala-detektering feiler ofte på ${subject}. Vurder å utvide regex i unit-scale.ts eller å OCR-rense sidehoder bedre.`;
    case ExtractionPatternErrorClass.OCR_NOISE:
      return `OCR leser feil sifre på ${subject}. Vurder å tette igjen forprosessering, eller å sjekke kilde-PDF-er for skannekvalitet.`;
    case ExtractionPatternErrorClass.MISSING_VALUE:
      return `Pipelinen finner ikke ${subject} i det hele tatt. Sjekk om radgjenkjenning eller side-klassifisering misser den relevante seksjonen.`;
    case ExtractionPatternErrorClass.WRONG_PAGE:
      return `${subject} hentes fra feil side. Sjekk side-klassifisering og kolonne-tilordning.`;
    case ExtractionPatternErrorClass.OTHER:
      return `${subject} blir ofte korrigert manuelt. Inspiser eksemplene for å finne et fellestrekk.`;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Aggregation
// ──────────────────────────────────────────────────────────────────────────────

type PatternKey = string;

type PatternAccumulator = {
  metricKey: string | null;
  ruleCode: string | null;
  errorClass: ExtractionPatternErrorClass;
  occurrenceCount: number;
  filingIds: Set<string>;
  // Severity is computed as sum of |proposed - accepted| / max(|accepted|, 1)
  // — a deviation-weighted count.
  severitySum: number;
};

function patternKey(
  metricKey: string | null,
  ruleCode: string | null,
  errorClass: ExtractionPatternErrorClass,
): PatternKey {
  return `${metricKey ?? "_"}::${ruleCode ?? "_"}::${errorClass}`;
}

function computeSeverityContribution(proposed: unknown, accepted: unknown): number {
  const proposedNum = extractNumericValue(proposed);
  const acceptedNum = extractNumericValue(accepted);
  if (acceptedNum === null) return 1;
  if (proposedNum === null) return 1;
  const denominator = Math.max(Math.abs(acceptedNum), 1);
  return Math.min(5, Math.abs(acceptedNum - proposedNum) / denominator);
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

export type RunPatternAnalysisOptions = {
  lookbackDays?: number;
  /** When false (default), still creates the report even if no patterns are significant. */
  skipReportWhenEmpty?: boolean;
  skipNotification?: boolean;
};

export type ExtractionPatternSummary = {
  id: string;
  reportId: string;
  metricKey: string | null;
  ruleCode: string | null;
  errorClass: ExtractionPatternErrorClass;
  occurrenceCount: number;
  severityScore: number;
  affectedFilings: string[];
  suggestedFix: string | null;
};

export type ExtractionPatternReportSummary = {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  generatedAt: Date;
  status: ExtractionPatternReportStatus;
  totalCorrections: number;
  notes: string | null;
  patterns: ExtractionPatternSummary[];
};

function toPatternSummary(pattern: ExtractionPattern): ExtractionPatternSummary {
  return {
    id: pattern.id,
    reportId: pattern.reportId,
    metricKey: pattern.metricKey,
    ruleCode: pattern.ruleCode,
    errorClass: pattern.errorClass,
    occurrenceCount: pattern.occurrenceCount,
    severityScore: pattern.severityScore,
    affectedFilings: pattern.affectedFilings,
    suggestedFix: pattern.suggestedFix,
  };
}

function toReportSummary(
  report: ExtractionPatternReport & { patterns: ExtractionPattern[] },
): ExtractionPatternReportSummary {
  return {
    id: report.id,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    generatedAt: report.generatedAt,
    status: report.status,
    totalCorrections: report.totalCorrections,
    notes: report.notes,
    patterns: report.patterns
      .slice()
      .sort((a, b) => b.severityScore - a.severityScore)
      .map(toPatternSummary),
  };
}

/**
 * Reads recent FACT_VALUE training labels, classifies the corrections, groups
 * them into patterns, and writes a new ExtractionPatternReport. Returns the
 * fresh report — or null if there were no corrections at all in the window.
 */
export async function runPatternAnalysis(
  options: RunPatternAnalysisOptions = {},
): Promise<ExtractionPatternReportSummary | null> {
  const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  const labels = await prisma.pdfTrainingLabel.findMany({
    where: {
      labelType: PdfTrainingLabelType.FACT_VALUE,
      createdAt: { gte: periodStart, lte: periodEnd },
    },
    select: {
      filingId: true,
      targetRef: true,
      proposedValue: true,
      acceptedValue: true,
      sourcePayload: true,
    },
  });

  if (labels.length === 0 && options.skipReportWhenEmpty) {
    return null;
  }

  const accumulators = new Map<PatternKey, PatternAccumulator>();
  let totalCorrections = 0;

  for (const label of labels) {
    const errorClass = classifyCorrection(label.proposedValue, label.acceptedValue);
    if (!errorClass) continue;
    totalCorrections++;

    const metricKey = extractMetricKey(label.targetRef);
    const key = patternKey(metricKey, null, errorClass);
    const existing = accumulators.get(key);
    if (existing) {
      existing.occurrenceCount += 1;
      existing.filingIds.add(label.filingId);
      existing.severitySum += computeSeverityContribution(
        label.proposedValue,
        label.acceptedValue,
      );
    } else {
      accumulators.set(key, {
        metricKey,
        ruleCode: null,
        errorClass,
        occurrenceCount: 1,
        filingIds: new Set([label.filingId]),
        severitySum: computeSeverityContribution(label.proposedValue, label.acceptedValue),
      });
    }
  }

  const significantPatterns = Array.from(accumulators.values()).filter(
    (acc) => acc.occurrenceCount >= MIN_OCCURRENCES_FOR_SIGNIFICANCE,
  );

  // Archive prior ACTIVE reports so the dashboard only shows the latest.
  // The archived rows are kept for trend analysis later.
  const report = await prisma.$transaction(async (tx) => {
    await tx.extractionPatternReport.updateMany({
      where: { status: ExtractionPatternReportStatus.ACTIVE },
      data: { status: ExtractionPatternReportStatus.ARCHIVED },
    });

    const created = await tx.extractionPatternReport.create({
      data: {
        periodStart,
        periodEnd,
        status: ExtractionPatternReportStatus.ACTIVE,
        totalCorrections,
        notes:
          significantPatterns.length === 0
            ? "Ingen signifikante mønstre i denne perioden."
            : null,
        patterns: {
          create: significantPatterns.map((acc) => ({
            metricKey: acc.metricKey,
            ruleCode: acc.ruleCode,
            errorClass: acc.errorClass,
            occurrenceCount: acc.occurrenceCount,
            severityScore: Math.round((acc.severitySum * acc.occurrenceCount) * 100) / 100,
            affectedFilings: Array.from(acc.filingIds).slice(0, MAX_AFFECTED_FILINGS_PER_PATTERN),
            suggestedFix: suggestedFixForPattern(acc.errorClass, acc.metricKey),
          })),
        },
      },
      include: { patterns: true },
    });

    return created;
  });

  if (!options.skipNotification && significantPatterns.length > 0) {
    const top = significantPatterns
      .slice()
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount)[0]!;
    await createAdminNotificationIfMissing({
      type: "PATTERN_DETECTED",
      recipientRole: "ADMIN",
      title: `Nye feilmønstre oppdaget (${significantPatterns.length})`,
      body: `Vanligst: ${top.metricKey ?? "—"} (${top.errorClass}) — ${top.occurrenceCount} forekomster.`,
      linkPath: `/admin/extraction-learning?patternReportId=${report.id}`,
      dedupeKey: `pattern-report:${report.id}`,
      metadata: {
        reportId: report.id,
        patternCount: significantPatterns.length,
        totalCorrections,
      },
    }).catch((error) => {
      console.warn("[extraction-pattern-analysis-service] notification failed", error);
    });
  }

  return toReportSummary(report);
}

export async function getActivePatternReport(): Promise<ExtractionPatternReportSummary | null> {
  const report = await prisma.extractionPatternReport.findFirst({
    where: { status: ExtractionPatternReportStatus.ACTIVE },
    orderBy: { generatedAt: "desc" },
    include: { patterns: true },
  });
  return report ? toReportSummary(report) : null;
}

export async function listRecentPatternReports(
  limit = 10,
): Promise<ExtractionPatternReportSummary[]> {
  const reports = await prisma.extractionPatternReport.findMany({
    orderBy: { generatedAt: "desc" },
    take: limit,
    include: { patterns: true },
  });
  return reports.map(toReportSummary);
}
