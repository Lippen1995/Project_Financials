import crypto from "node:crypto";

import type { AnnualReportUnifiedConfidenceBatchRun } from "@/server/benchmarking/annual-report-unified-confidence-batch";
import { runAnnualReportUnifiedConfidenceBatch } from "@/server/benchmarking/annual-report-unified-confidence-batch";
import type { AnnualReportGoldSetManifest } from "@/server/benchmarking/annual-report-gold-set";
import { parseAnnualReportGoldSetManifest, validateAnnualReportGoldSetManifest } from "@/server/benchmarking/annual-report-gold-set";

export type AnnualReportGoldSetShadowRun = {
  version: "annual-report-gold-set-shadow-run-v1";
  runId: string;
  generatedAt: string;
  gitCommitSha: string | null;
  environment: {
    nodeEnv: string | null;
    opendataloaderMode: string | null;
    opendataloaderEnabled: string | null;
  };
  manifest: {
    name: string;
    version: AnnualReportGoldSetManifest["version"];
    hash: string;
    validation: ReturnType<typeof validateAnnualReportGoldSetManifest>;
  };
  routeConfiguration: {
    mode: "DRY_RUN" | "PERSIST_ARTIFACTS";
    persistShadowArtifacts: boolean;
    persistConfidenceGateArtifacts: boolean;
  };
  parserRuntimeDiagnostics: {
    opendataloaderMode: string | null;
    opendataloaderEnabled: string | null;
  };
  batch: AnnualReportUnifiedConfidenceBatchRun;
  summary: {
    passCount: number;
    warnCount: number;
    failCount: number;
    skipCount: number;
    parityCount: number;
    divergenceCount: number;
    manualReviewCandidates: string[];
    evidenceQualityByTag: Record<string, Record<string, number>>;
  };
};

function hashManifest(manifest: AnnualReportGoldSetManifest) {
  return crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

export async function runAnnualReportGoldSetShadowBatch(input: {
  manifest: AnnualReportGoldSetManifest;
  gitCommitSha?: string | null;
  mode?: "DRY_RUN" | "PERSIST_ARTIFACTS";
  persistShadowArtifacts?: boolean;
  persistConfidenceGateArtifacts?: boolean;
}) {
  const manifest = parseAnnualReportGoldSetManifest(input.manifest);
  const validation = validateAnnualReportGoldSetManifest(manifest);
  const batchManifest = {
    name: manifest.name,
    generatedAt: manifest.generatedAt,
    notes: "Generated from annual-report go-live gold-set manifest.",
    entries: manifest.entries
      .filter((entry) => entry.filingId)
      .map((entry) => ({
        filingId: entry.filingId!,
        orgNumber: entry.orgNumber ?? undefined,
        fiscalYear: entry.accountingYear ?? undefined,
        label: entry.companyName ?? entry.orgNumber ?? entry.filingId!,
        tagHints: entry.expectedTags,
        notes: entry.reasonForInclusion,
      })),
  };

  const batch = await runAnnualReportUnifiedConfidenceBatch({
    manifest: batchManifest,
    mode: input.mode ?? "PERSIST_ARTIFACTS",
    persistShadowArtifacts: input.persistShadowArtifacts ?? true,
    persistConfidenceGateArtifacts: input.persistConfidenceGateArtifacts ?? true,
    sourceCommand: "annual-report-gold-set-shadow-run",
  });

  const evidenceQualityByTag = batch.cases.reduce<Record<string, Record<string, number>>>((acc, item) => {
    for (const tag of item.tagHints) {
      acc[tag] ??= {};
      const key = item.legacyCandidateSet.classification;
      acc[tag]![key] = (acc[tag]![key] ?? 0) + 1;
    }
    return acc;
  }, {});

  const parityCount = batch.cases.filter(
    (item) =>
      item.shadow?.summary.comparisonMismatchCount === 0 &&
      item.shadow?.summary.comparisonMatchRate !== null,
  ).length;
  const divergenceCount = batch.cases.filter(
    (item) => (item.shadow?.summary.comparisonMismatchCount ?? 0) > 0,
  ).length;
  const manualReviewCandidates = batch.cases
    .filter(
      (item) =>
        item.gateSummary.overallVerdict === "FAIL" ||
        item.gateSummary.overallVerdict === "WARN" ||
        item.legacyCandidateSet.classification !== "real_legacy_candidate",
    )
    .map((item) => item.filingId);

  return {
    version: "annual-report-gold-set-shadow-run-v1",
    runId: `gold-set-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    generatedAt: new Date().toISOString(),
    gitCommitSha: input.gitCommitSha ?? null,
    environment: {
      nodeEnv: process.env.NODE_ENV ?? null,
      opendataloaderMode: process.env.OPENDATALOADER_MODE ?? null,
      opendataloaderEnabled: process.env.OPENDATALOADER_ENABLED ?? null,
    },
    manifest: {
      name: manifest.name,
      version: manifest.version,
      hash: hashManifest(manifest),
      validation,
    },
    routeConfiguration: {
      mode: input.mode ?? "PERSIST_ARTIFACTS",
      persistShadowArtifacts: input.persistShadowArtifacts ?? true,
      persistConfidenceGateArtifacts: input.persistConfidenceGateArtifacts ?? true,
    },
    parserRuntimeDiagnostics: {
      opendataloaderMode: process.env.OPENDATALOADER_MODE ?? null,
      opendataloaderEnabled: process.env.OPENDATALOADER_ENABLED ?? null,
    },
    batch,
    summary: {
      passCount: batch.summary.verdictCounts.PASS,
      warnCount: batch.summary.verdictCounts.WARN,
      failCount: batch.summary.verdictCounts.FAIL,
      skipCount: batch.summary.skippedCases,
      parityCount,
      divergenceCount,
      manualReviewCandidates,
      evidenceQualityByTag,
    },
  } satisfies AnnualReportGoldSetShadowRun;
}

export function renderAnnualReportGoldSetShadowRunMarkdown(run: AnnualReportGoldSetShadowRun) {
  const lines = [
    "# Annual-report gold-set shadow run",
    "",
    `Run ID: ${run.runId}`,
    `Generated at: ${run.generatedAt}`,
    `Manifest: ${run.manifest.name}`,
    `Manifest hash: ${run.manifest.hash}`,
    `Git commit: ${run.gitCommitSha ?? "unknown"}`,
    "",
    "## Summary",
    "",
    `- PASS: ${run.summary.passCount}`,
    `- WARN: ${run.summary.warnCount}`,
    `- FAIL: ${run.summary.failCount}`,
    `- Skipped: ${run.summary.skipCount}`,
    `- Parity: ${run.summary.parityCount}`,
    `- Divergence: ${run.summary.divergenceCount}`,
    `- Manual review candidates: ${run.summary.manualReviewCandidates.join(", ") || "none"}`,
    "",
    "## Manifest readiness",
    "",
    `- Production ready: ${run.manifest.validation.productionReady ? "yes" : "no"}`,
    ...run.manifest.validation.errors.map((error) => `- ERROR: ${error}`),
    ...run.manifest.validation.warnings.map((warning) => `- WARN: ${warning}`),
    "",
  ];

  return lines.join("\n");
}
