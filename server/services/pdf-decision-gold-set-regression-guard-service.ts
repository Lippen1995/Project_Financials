import {
  type PdfDecisionRegressionGuardFailure,
  type PdfDecisionRegressionGuardResult,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-regression-guard";
import { runPdfDecisionGoldSetBenchmark } from "@/server/services/pdf-decision-gold-set-benchmark-service";

export async function runPdfDecisionGoldSetRegressionGuard(input?: {
  limit?: number;
  strict?: boolean;
}): Promise<PdfDecisionRegressionGuardResult> {
  const benchmark = await runPdfDecisionGoldSetBenchmark({
    status: "APPROVED",
    limit: input?.limit ?? 100,
  });
  const failures: PdfDecisionRegressionGuardFailure[] = benchmark.items
    .filter((item) => item.benchmarkOutcome !== "MATCH")
    .filter((item) => input?.strict || item.severity === "ERROR")
    .map((item) => ({
      source: "GOLD_SET",
      name: item.filingId,
      severity: item.severity,
      failures: item.failures,
    }));

  return {
    version: "pdf-decision-regression-guard-v1",
    generatedAt: new Date().toISOString(),
    passed: failures.length === 0,
    fixtureSummary: {
      fixtureCount: 0,
      passedCount: 0,
      failedCount: 0,
    },
    goldSetSummary: {
      totalItems: benchmark.metrics.totalItems,
      matchCount: benchmark.metrics.matchCount,
      mismatchCount: benchmark.metrics.mismatchCount,
      errorCount: benchmark.metrics.errorCount,
    },
    failures,
  };
}
