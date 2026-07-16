import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";
import { prisma } from "@/lib/prisma";

type AcceptedBoardReportLabel = {
  text: string;
  pageStart: number | null;
  pageEnd: number | null;
};

function parseAcceptedLabel(value: unknown): AcceptedBoardReportLabel | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.text !== "string" || record.text.trim().length === 0) return null;
  return {
    text: record.text,
    pageStart: typeof record.pageStart === "number" ? record.pageStart : null,
    pageEnd: typeof record.pageEnd === "number" ? record.pageEnd : null,
  };
}

function bigramCounts(value: string): Map<string, number> {
  const normalized = normalizeNorwegianText(value);
  const counts = new Map<string, number>();
  if (normalized.length < 2) {
    if (normalized) counts.set(normalized, 1);
    return counts;
  }
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const bigram = normalized.slice(index, index + 2);
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }
  return counts;
}

function normalizedTextF1(expected: string, actual: string): number {
  const expectedCounts = bigramCounts(expected);
  const actualCounts = bigramCounts(actual);
  const expectedTotal = [...expectedCounts.values()].reduce((sum, value) => sum + value, 0);
  const actualTotal = [...actualCounts.values()].reduce((sum, value) => sum + value, 0);
  if (expectedTotal === 0 || actualTotal === 0) return expectedTotal === actualTotal ? 1 : 0;
  let overlap = 0;
  for (const [bigram, count] of expectedCounts) {
    overlap += Math.min(count, actualCounts.get(bigram) ?? 0);
  }
  const precision = overlap / actualTotal;
  const recall = overlap / expectedTotal;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

async function main() {
  const strict = process.argv.includes("--strict");
  const labels = await prisma.pdfTrainingLabel.findMany({
    where: { labelType: "BOARD_REPORT_TEXT" },
    orderBy: { createdAt: "desc" },
    select: { filingId: true, acceptedValue: true, createdAt: true },
  });
  const latestLabelByFiling = new Map<string, AcceptedBoardReportLabel>();
  for (const label of labels) {
    if (latestLabelByFiling.has(label.filingId)) continue;
    const accepted = parseAcceptedLabel(label.acceptedValue);
    if (accepted) latestLabelByFiling.set(label.filingId, accepted);
  }

  const filingIds = [...latestLabelByFiling.keys()];
  const extractions = filingIds.length
      ? await prisma.boardReportExtraction.findMany({
        where: {
          filingId: { in: filingIds },
          status: "EXTRACTED",
          reviewStatus: "NOT_REQUIRED",
          machineProposalId: null,
        },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const latestExtractionByFiling = new Map<string, (typeof extractions)[number]>();
  for (const extraction of extractions) {
    if (!latestExtractionByFiling.has(extraction.filingId)) {
      latestExtractionByFiling.set(extraction.filingId, extraction);
    }
  }

  const samples = filingIds.map((filingId) => {
    const expected = latestLabelByFiling.get(filingId)!;
    const actual = latestExtractionByFiling.get(filingId) ?? null;
    const textF1 = actual?.text ? normalizedTextF1(expected.text, actual.text) : 0;
    const exactPageBoundary =
      expected.pageStart !== null &&
      expected.pageEnd !== null &&
      actual?.pageStart === expected.pageStart &&
      actual.pageEnd === expected.pageEnd;
    return {
      filingId,
      extractionId: actual?.id ?? null,
      status: actual?.status ?? "MISSING",
      route: actual?.route ?? null,
      textF1: Number(textF1.toFixed(4)),
      exactPageBoundary,
    };
  });
  const extracted = samples.filter((sample) => sample.status === "EXTRACTED");
  // BOARD_REPORT_TEXT labels are positive examples only. They can measure coverage and
  // boundary/text quality, but not false positives. Do not misreport coverage as precision.
  const automaticExtractionRate = samples.length > 0 ? extracted.length / samples.length : 0;
  const exactBoundaryAccuracy =
    extracted.length > 0
      ? extracted.filter((sample) => sample.exactPageBoundary).length / extracted.length
      : 0;
  const medianTextF1 =
    extracted.length > 0
      ? [...extracted].sort((left, right) => left.textF1 - right.textF1)[
          Math.floor(extracted.length / 2)
        ]!.textF1
      : 0;
  const report = {
    version: "board-report-evaluation-v1",
    generatedAt: new Date().toISOString(),
    reviewedSampleCount: samples.length,
    extractedSampleCount: extracted.length,
    metrics: {
      automaticExtractionRate: Number(automaticExtractionRate.toFixed(4)),
      automaticPrecision: null,
      exactPageBoundaryAccuracy: Number(exactBoundaryAccuracy.toFixed(4)),
      medianNormalizedTextF1: Number(medianTextF1.toFixed(4)),
    },
    launchGate: {
      minimumReviewedSamples: 75,
      requiresNegativeExamples: true,
      blockingReasons: [
        ...(samples.length < 75 ? [`Requires at least 75 reviewed positive samples; found ${samples.length}.`] : []),
        "Automatic precision cannot be calculated until reviewed negative examples are available.",
      ],
      passed: false,
    },
    samples,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (strict && !report.launchGate.passed) process.exitCode = 1;
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
