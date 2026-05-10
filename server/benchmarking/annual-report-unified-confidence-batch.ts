import fs from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { CanonicalFactCandidate } from "@/integrations/brreg/annual-report-financials/types";
import { preflightAnnualReportDocument } from "@/integrations/brreg/annual-report-financials/preflight";
import type { PreflightResult } from "@/integrations/brreg/annual-report-financials/types";
import { buildUnifiedExtractionConfidenceGateReport } from "@/server/services/annual-report-unified-extraction-confidence-gate-service";
import type {
  UnifiedExtractionConfidenceGateReport,
  UnifiedExtractionGateCheckResult,
  UnifiedExtractionGateOverallVerdict,
} from "@/server/services/annual-report-unified-extraction-confidence-gate-service";
import { persistUnifiedExtractionConfidenceGateArtifact } from "@/server/services/annual-report-unified-extraction-artifact-service";
import type { UnifiedExtractionArtifactResult } from "@/server/services/annual-report-unified-extraction-artifact-service";
import { runAnnualReportUnifiedShadowExtraction } from "@/server/services/annual-report-unified-shadow-extraction-service";
import type {
  AnnualReportUnifiedShadowInput,
  AnnualReportUnifiedShadowResult,
  AnnualReportUnifiedShadowStepResult,
} from "@/server/services/annual-report-unified-shadow-extraction-service";
import type { AnnualReportUnifiedShadowMode } from "@/server/services/annual-report-unified-shadow-config";
import { LocalAnnualReportArtifactStorage } from "@/server/financials/artifact-storage";
import { getAnnualReportFilingWithArtifacts } from "@/server/persistence/annual-report-ingestion-repository";
import {
  loadPersistedLegacyCandidatesForFiling,
  type LegacyCandidateClassification,
  type LoadedLegacyCandidateSet,
} from "@/server/services/annual-report-legacy-candidate-service";
import { resolveAnnualReportArtifactForFiling } from "@/server/services/annual-report-filing-artifact-resolver";

const manifestEntrySchema = z.object({
  filingId: z.string().min(1),
  orgNumber: z.string().min(1).optional(),
  fiscalYear: z.number().int().optional(),
  label: z.string().min(1).optional(),
  tagHints: z.array(z.string().min(1)).default([]),
  notes: z.string().min(1).optional(),
  legacyFixturePath: z.string().min(1).optional(),
});

const manifestSchema = z.object({
  name: z.string().min(1),
  generatedAt: z.string().optional(),
  notes: z.string().optional(),
  selection: z.record(z.unknown()).optional(),
  entries: z.array(manifestEntrySchema).min(1),
});

export type AnnualReportUnifiedConfidenceBatchManifest = z.infer<typeof manifestSchema>;
export type AnnualReportUnifiedConfidenceBatchManifestEntry = z.infer<typeof manifestEntrySchema>;

export type AnnualReportUnifiedConfidenceBatchCaseResult = {
  caseId: string;
  filingId: string;
  orgNumber: string | null;
  companyName: string | null;
  fiscalYear: number | null;
  label: string;
  tagHints: string[];
  status: "completed" | "skipped" | "error";
  errors: string[];
  warnings: string[];
  durationMs: number;
  legacyCandidateSet: {
    classification: LegacyCandidateClassification;
    candidateCount: number;
    provenance: LoadedLegacyCandidateSet["provenance"];
    diagnostics: LoadedLegacyCandidateSet["diagnostics"];
    preview: Array<{
      metricKey: string;
      fiscalYear: number;
      value: number;
      unitScale: number;
      sourceSection: string;
      confidenceScore: number;
    }>;
  };
  shadow: {
    mode: "DISABLED" | "DRY_RUN" | "PERSIST_ARTIFACTS";
    skipped: boolean;
    totalDurationMs: number | null;
    canUseForProductionRouting: false;
    steps: {
      document: { ok: boolean; durationMs: number | null; error?: string | null } | null;
      financial: { ok: boolean; durationMs: number | null; error?: string | null } | null;
      narrative: { ok: boolean; durationMs: number | null; error?: string | null } | null;
      comparison: { ok: boolean; durationMs: number | null; error?: string | null } | null;
    };
    summary: {
      documentPageCount: number | null;
      documentSectionCount: number | null;
      financialStatementCount: number | null;
      financialLineItemCount: number | null;
      narrativeSectionCount: number | null;
      comparisonFactCount: number | null;
      comparisonExactMatchCount: number | null;
      comparisonMismatchCount: number | null;
      comparisonMatchRate: number | null;
    };
    artifacts?: Record<string, unknown>;
  } | null;
  gate: UnifiedExtractionConfidenceGateReport | null;
  gateSummary: {
    overallVerdict: UnifiedExtractionGateOverallVerdict | null;
    passCount: number;
    warnCount: number;
    failCount: number;
    insufficientDataCount: number;
    blockingCheckCodes: string[];
    warningCheckCodes: string[];
  };
  safety: {
    canUseForProductionRouting: false;
    productionRoutingChanged: false;
    productionFactsMutated: false;
    publishAffected: false;
  };
};

export type AnnualReportUnifiedConfidenceBatchRun = {
  version: "annual-report-unified-confidence-batch-v1";
  generatedAt: string;
  manifest: AnnualReportUnifiedConfidenceBatchManifest;
  config: {
    mode: "DRY_RUN" | "PERSIST_ARTIFACTS";
    persistShadowArtifacts: boolean;
    persistConfidenceGateArtifacts: boolean;
    limit: number | null;
  };
  candidateCounts: Record<LegacyCandidateClassification, number>;
  cases: AnnualReportUnifiedConfidenceBatchCaseResult[];
  summary: {
    totalCases: number;
    completedCases: number;
    skippedCases: number;
    errorCases: number;
    verdictCounts: Record<"PASS" | "WARN" | "FAIL" | "INSUFFICIENT_DATA", number>;
    mostCommonFailingChecks: Array<{ checkCode: string; count: number }>;
    mostCommonWarningChecks: Array<{ checkCode: string; count: number }>;
    averageFinancialLineItemCount: number | null;
    averageNarrativeSectionCount: number | null;
    averageComparisonMatchRate: number | null;
    totalDurationMs: number;
    safetyInvariantViolations: string[];
  };
};

type FilingRecord = NonNullable<Awaited<ReturnType<typeof getAnnualReportFilingWithArtifacts>>>;

export type AnnualReportUnifiedConfidenceBatchInput = {
  manifest: AnnualReportUnifiedConfidenceBatchManifest;
  mode?: "DRY_RUN" | "PERSIST_ARTIFACTS";
  persistShadowArtifacts?: boolean;
  persistConfidenceGateArtifacts?: boolean;
  limit?: number | null;
  sourceCommand?: string | null;
};

export type AnnualReportUnifiedConfidenceBatchDeps = {
  loadFiling?: (filingId: string) => Promise<FilingRecord | null>;
  loadPdfArtifactBuffer?: (storageKey: string) => Promise<Buffer>;
  preflight?: (pdfBuffer: Buffer) => Promise<PreflightResult>;
  runShadowExtraction?: (
    input: AnnualReportUnifiedShadowInput,
  ) => Promise<AnnualReportUnifiedShadowResult>;
  buildGateReport?: typeof buildUnifiedExtractionConfidenceGateReport;
  persistConfidenceGateArtifact?: (input: {
    report: UnifiedExtractionConfidenceGateReport;
    sourceCommand?: string | null;
  }) => Promise<UnifiedExtractionArtifactResult>;
  loadLegacyCandidates?: (filing: FilingRecord) => Promise<LoadedLegacyCandidateSet>;
  loadFixtureLegacyCandidates?: (fixturePath: string) => Promise<CanonicalFactCandidate[]>;
};

const artifactStorage = new LocalAnnualReportArtifactStorage();

function elapsed(start: number) {
  return Date.now() - start;
}

function toCaseLabel(entry: AnnualReportUnifiedConfidenceBatchManifestEntry, filing: FilingRecord | null) {
  if (entry.label) {
    return entry.label;
  }
  if (filing?.company?.name && filing.fiscalYear !== null) {
    return `${filing.company.name} ${filing.fiscalYear}`;
  }
  if (filing?.company?.orgNumber && filing.fiscalYear !== null) {
    return `${filing.company.orgNumber} ${filing.fiscalYear}`;
  }
  return entry.filingId;
}

function stepToSummary(
  step: AnnualReportUnifiedShadowStepResult<true> | null,
): { ok: boolean; durationMs: number | null; error?: string | null } | null {
  if (step === null) {
    return null;
  }
  if (step.ok) {
    return { ok: true, durationMs: step.durationMs, error: null };
  }
  return { ok: false, durationMs: step.durationMs, error: step.error };
}

function artifactResultsToRecord(result: AnnualReportUnifiedShadowResult["artifacts"]) {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(result)) {
    if (value === null) {
      continue;
    }
    if (value.ok) {
      output[key] = {
        ok: true,
        artifactId: value.value.artifactId,
        kind: value.value.kind,
        durationMs: value.durationMs,
        summary: value.value.summary,
      };
      continue;
    }
    output[key] = {
      ok: false,
      error: value.error,
      durationMs: value.durationMs,
    };
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

function buildLegacyCandidatePreview(candidates: CanonicalFactCandidate[]) {
  return candidates.slice(0, 10).map((candidate) => ({
    metricKey: String(candidate.metricKey),
    fiscalYear: candidate.fiscalYear,
    value: candidate.value,
    unitScale: candidate.unitScale,
    sourceSection: candidate.sourceSection,
    confidenceScore: candidate.confidenceScore,
  }));
}

function buildShadowSummary(result: AnnualReportUnifiedShadowResult) {
  const financialStatementCount = result.financial?.statements.length ?? null;
  const financialLineItemCount =
    result.financial?.statements.reduce((count, statement) => count + statement.lineItems.length, 0) ??
    null;
  const comparisonSummary = result.comparison?.summary ?? null;
  const comparisonTotalCompared = comparisonSummary?.financialTotalCompared ?? null;
  const comparisonMatchedCount =
    comparisonSummary === null
      ? null
      : comparisonSummary.financialExactMatchCount + comparisonSummary.financialScaledMatchCount;

  return {
    documentPageCount: result.document?.pages.length ?? null,
    documentSectionCount: result.document?.sections.length ?? null,
    financialStatementCount,
    financialLineItemCount,
    narrativeSectionCount: result.narrative?.sections.length ?? null,
    comparisonFactCount: result.comparison?.financialComparisons.length ?? null,
    comparisonExactMatchCount: comparisonSummary?.financialExactMatchCount ?? null,
    comparisonMismatchCount: comparisonSummary?.financialMismatchCount ?? null,
    comparisonMatchRate:
      comparisonTotalCompared && comparisonTotalCompared > 0 && comparisonMatchedCount !== null
        ? comparisonMatchedCount / comparisonTotalCompared
        : null,
  };
}

function collectSafetyViolations(
  caseResult: AnnualReportUnifiedConfidenceBatchCaseResult,
): string[] {
  const violations: string[] = [];

  if (caseResult.safety.canUseForProductionRouting !== false) {
    violations.push(`${caseResult.caseId}: case.safety.canUseForProductionRouting must be false`);
  }
  if (caseResult.safety.productionRoutingChanged !== false) {
    violations.push(`${caseResult.caseId}: case.safety.productionRoutingChanged must be false`);
  }
  if (caseResult.safety.productionFactsMutated !== false) {
    violations.push(`${caseResult.caseId}: case.safety.productionFactsMutated must be false`);
  }
  if (caseResult.safety.publishAffected !== false) {
    violations.push(`${caseResult.caseId}: case.safety.publishAffected must be false`);
  }
  if (caseResult.shadow && caseResult.shadow.canUseForProductionRouting !== false) {
    violations.push(`${caseResult.caseId}: shadow.canUseForProductionRouting must be false`);
  }
  if (caseResult.gate && caseResult.gate.safety.canUseForProductionRouting !== false) {
    violations.push(`${caseResult.caseId}: gate.safety.canUseForProductionRouting must be false`);
  }

  return violations;
}

function countChecks(
  checks: UnifiedExtractionGateCheckResult[],
): Array<{ checkCode: string; count: number }> {
  const counts = new Map<string, number>();
  for (const check of checks) {
    counts.set(check.checkCode, (counts.get(check.checkCode) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([checkCode, count]) => ({ checkCode, count }))
    .sort((left, right) => right.count - left.count || left.checkCode.localeCompare(right.checkCode));
}

function average(values: Array<number | null>) {
  const numericValues = values.filter((value): value is number => value !== null);
  if (numericValues.length === 0) {
    return null;
  }
  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

export function parseAnnualReportUnifiedConfidenceBatchManifest(raw: unknown) {
  return manifestSchema.parse(raw);
}

export function summarizeAnnualReportUnifiedConfidenceBatch(
  cases: AnnualReportUnifiedConfidenceBatchCaseResult[],
  totalDurationMs: number,
): AnnualReportUnifiedConfidenceBatchRun["summary"] {
  const verdictCounts: AnnualReportUnifiedConfidenceBatchRun["summary"]["verdictCounts"] = {
    PASS: 0,
    WARN: 0,
    FAIL: 0,
    INSUFFICIENT_DATA: 0,
  };

  const failingChecks: UnifiedExtractionGateCheckResult[] = [];
  const warningChecks: UnifiedExtractionGateCheckResult[] = [];
  const safetyInvariantViolations: string[] = [];

  for (const caseResult of cases) {
    if (caseResult.gateSummary.overallVerdict !== null) {
      verdictCounts[caseResult.gateSummary.overallVerdict] += 1;
    }
    if (caseResult.gate !== null) {
      failingChecks.push(...caseResult.gate.blockingChecks);
      warningChecks.push(...caseResult.gate.warningChecks);
    }
    safetyInvariantViolations.push(...collectSafetyViolations(caseResult));
  }

  return {
    totalCases: cases.length,
    completedCases: cases.filter((caseResult) => caseResult.status === "completed").length,
    skippedCases: cases.filter((caseResult) => caseResult.status === "skipped").length,
    errorCases: cases.filter((caseResult) => caseResult.status === "error").length,
    verdictCounts,
    mostCommonFailingChecks: countChecks(failingChecks),
    mostCommonWarningChecks: countChecks(warningChecks),
    averageFinancialLineItemCount: average(
      cases.map((caseResult) => caseResult.shadow?.summary.financialLineItemCount ?? null),
    ),
    averageNarrativeSectionCount: average(
      cases.map((caseResult) => caseResult.shadow?.summary.narrativeSectionCount ?? null),
    ),
    averageComparisonMatchRate: average(
      cases.map((caseResult) => caseResult.shadow?.summary.comparisonMatchRate ?? null),
    ),
    totalDurationMs,
    safetyInvariantViolations,
  };
}

async function defaultLoadFixtureLegacyCandidates(fixturePath: string) {
  const absolutePath = path.resolve(process.cwd(), fixturePath);
  const raw = await fs.readFile(absolutePath, "utf8");
  return JSON.parse(raw) as CanonicalFactCandidate[];
}

export async function runAnnualReportUnifiedConfidenceBatch(
  input: AnnualReportUnifiedConfidenceBatchInput,
  deps: AnnualReportUnifiedConfidenceBatchDeps = {},
): Promise<AnnualReportUnifiedConfidenceBatchRun> {
  const overallStart = Date.now();
  const manifest = parseAnnualReportUnifiedConfidenceBatchManifest(input.manifest);
  const mode = input.mode ?? "DRY_RUN";
  const persistShadowArtifacts = input.persistShadowArtifacts ?? false;
  const persistConfidenceGateArtifacts = input.persistConfidenceGateArtifacts ?? false;
  const limit = input.limit ?? null;

  const loadFiling = deps.loadFiling ?? getAnnualReportFilingWithArtifacts;
  const loadPdfArtifactBuffer =
    deps.loadPdfArtifactBuffer ??
    (async (storageKey: string) => artifactStorage.getArtifactBuffer(storageKey));
  const runPreflight = deps.preflight ?? preflightAnnualReportDocument;
  const runShadowExtraction = deps.runShadowExtraction ?? runAnnualReportUnifiedShadowExtraction;
  const buildGateReport = deps.buildGateReport ?? buildUnifiedExtractionConfidenceGateReport;
  const persistGateArtifact =
    deps.persistConfidenceGateArtifact ?? persistUnifiedExtractionConfidenceGateArtifact;
  const loadLegacyCandidates = deps.loadLegacyCandidates ?? loadPersistedLegacyCandidatesForFiling;
  const loadFixtureLegacyCandidates =
    deps.loadFixtureLegacyCandidates ?? defaultLoadFixtureLegacyCandidates;

  const entries = limit === null ? manifest.entries : manifest.entries.slice(0, limit);
  const cases: AnnualReportUnifiedConfidenceBatchCaseResult[] = [];
  const candidateCounts: AnnualReportUnifiedConfidenceBatchRun["candidateCounts"] = {
    real_legacy_candidate: 0,
    fixture_candidate: 0,
    unavailable_candidate: 0,
    malformed_candidate: 0,
  };

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    const caseStart = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    let status: AnnualReportUnifiedConfidenceBatchCaseResult["status"] = "completed";
    let filing: FilingRecord | null = null;
    let shadowResult: AnnualReportUnifiedShadowResult | null = null;

    try {
      filing = await loadFiling(entry.filingId);
      if (!filing) {
        status = "error";
        errors.push(`Filing not found: ${entry.filingId}`);
      }
    } catch (error) {
      status = "error";
      errors.push(error instanceof Error ? error.message : String(error));
    }

    const caseId = `${entry.filingId}:${index + 1}`;
    const orgNumber = filing?.company.orgNumber ?? entry.orgNumber ?? null;
    const companyName = filing?.company.name ?? null;
    const fiscalYear = filing?.fiscalYear ?? entry.fiscalYear ?? null;
    const label = toCaseLabel(entry, filing);
    let legacyCandidateSet: LoadedLegacyCandidateSet = {
      classification: "unavailable_candidate",
      candidates: [],
      provenance: {
        orgNumber: orgNumber ?? "unknown",
        filingId: entry.filingId,
        fiscalYear: fiscalYear ?? 0,
        filingReportId: null,
        sourceDocumentReference: null,
        sourceArtifactReference: null,
        extractionRoute: null,
        evidenceType: "fallback",
        extractionTimestamp: null,
        artifactTimestamp: null,
        sourceRunId: null,
        source: "published_snapshot",
        lookupDiagnostics: [],
      },
      diagnostics: [
        {
          code: "LEGACY_FACTS_MISSING",
          message: "Legacy candidate loading did not run because the filing could not be loaded.",
        },
      ],
    };

    let gateReport: UnifiedExtractionConfidenceGateReport | null = null;

    if (status !== "error" && filing !== null) {
      if (entry.legacyFixturePath) {
        try {
          const fixtureCandidates = await loadFixtureLegacyCandidates(entry.legacyFixturePath);
          legacyCandidateSet = {
            classification: "fixture_candidate",
            candidates: fixtureCandidates,
            provenance: {
              orgNumber: filing.company.orgNumber,
              filingId: filing.id,
              fiscalYear: filing.fiscalYear,
              filingReportId: filing.sourceIdempotencyKey,
              sourceDocumentReference: entry.legacyFixturePath,
              sourceArtifactReference: entry.legacyFixturePath,
              extractionRoute: "fixture/json",
              evidenceType: "fixture_only",
              extractionTimestamp: null,
              artifactTimestamp: null,
              sourceRunId: null,
              source: "fixture",
              lookupDiagnostics: [],
            },
            diagnostics: [
              {
                code: "LEGACY_FIXTURE_USED",
                message: `Loaded fixture legacy candidates from ${entry.legacyFixturePath}.`,
              },
            ],
          };
        } catch (error) {
          legacyCandidateSet = {
            classification: "malformed_candidate",
            candidates: [],
            provenance: {
              orgNumber: filing.company.orgNumber,
              filingId: filing.id,
              fiscalYear: filing.fiscalYear,
              filingReportId: filing.sourceIdempotencyKey,
              sourceDocumentReference: entry.legacyFixturePath,
              sourceArtifactReference: entry.legacyFixturePath,
              extractionRoute: "fixture/json",
              evidenceType: "fixture_only",
              extractionTimestamp: null,
              artifactTimestamp: null,
              sourceRunId: null,
              source: "fixture",
              lookupDiagnostics: [],
            },
            diagnostics: [
              {
                code: "LEGACY_FACTS_MALFORMED",
                message:
                  error instanceof Error
                    ? `Legacy fixture could not be parsed: ${error.message}`
                    : `Legacy fixture could not be parsed: ${String(error)}`,
              },
            ],
          };
        }
      } else {
        legacyCandidateSet = await loadLegacyCandidates(filing);
      }

      const pdfLookup = resolveAnnualReportArtifactForFiling(filing, filing.artifacts, "PDF");
      const pdfArtifact = pdfLookup.artifact;
      warnings.push(...pdfLookup.diagnostics.map((diagnostic) => diagnostic.message));

      if (legacyCandidateSet.classification === "unavailable_candidate") {
        status = "skipped";
        warnings.push(...legacyCandidateSet.diagnostics.map((diagnostic) => diagnostic.message));
      } else if (legacyCandidateSet.classification === "malformed_candidate") {
        status = "skipped";
        errors.push(...legacyCandidateSet.diagnostics.map((diagnostic) => diagnostic.message));
      } else if (!pdfArtifact) {
        status = "skipped";
        warnings.push("No PDF artifact found for filing; shadow batch case skipped.");
      } else {
        try {
          const pdfBuffer = await loadPdfArtifactBuffer(pdfArtifact.storageKey);
          const preflight = await runPreflight(pdfBuffer);
          shadowResult = await runShadowExtraction({
            filingId: filing.id,
            orgNumber: filing.company.orgNumber,
            fiscalYear: filing.fiscalYear,
            preflight,
            legacyCandidates: legacyCandidateSet.candidates,
            config: {
              mode,
              persistUnifiedParserDocument: persistShadowArtifacts && mode === "PERSIST_ARTIFACTS",
              persistUnifiedFinancialExtraction: persistShadowArtifacts && mode === "PERSIST_ARTIFACTS",
              persistUnifiedNarrativeExtraction: persistShadowArtifacts && mode === "PERSIST_ARTIFACTS",
              persistLegacyVsUnifiedComparison: persistShadowArtifacts && mode === "PERSIST_ARTIFACTS",
            },
            sourceCommand: input.sourceCommand ?? null,
          });
          warnings.push(...shadowResult.warnings);
        } catch (error) {
          status = "error";
          errors.push(
            error instanceof Error
              ? `Shadow extraction failed: ${error.message}`
              : `Shadow extraction failed: ${String(error)}`,
          );
        }
      }
    }

    candidateCounts[legacyCandidateSet.classification] += 1;

    try {
      gateReport = buildGateReport({
        financial: shadowResult?.financial ?? null,
        narrative: shadowResult?.narrative ?? null,
        comparison: shadowResult?.comparison ?? null,
        meta: {
          filingId: entry.filingId,
          orgNumber,
          fiscalYear,
        },
      });
    } catch (error) {
      errors.push(
        error instanceof Error
          ? `Confidence gate failed: ${error.message}`
          : `Confidence gate failed: ${String(error)}`,
      );
      status = "error";
      gateReport = null;
    }

    if (
      gateReport !== null &&
      persistConfidenceGateArtifacts &&
      mode === "PERSIST_ARTIFACTS"
    ) {
      try {
        await persistGateArtifact({
          report: gateReport,
          sourceCommand: input.sourceCommand ?? null,
        });
      } catch (error) {
        errors.push(
          error instanceof Error
            ? `Confidence gate artifact persistence failed: ${error.message}`
            : `Confidence gate artifact persistence failed: ${String(error)}`,
        );
        status = "error";
      }
    }

    cases.push({
      caseId,
      filingId: entry.filingId,
      orgNumber,
      companyName,
      fiscalYear,
      label,
      tagHints: [...entry.tagHints],
      status,
      errors,
      warnings,
      durationMs: elapsed(caseStart),
      legacyCandidateSet: {
        classification: legacyCandidateSet.classification,
        candidateCount: legacyCandidateSet.candidates.length,
        provenance: legacyCandidateSet.provenance,
        diagnostics: legacyCandidateSet.diagnostics,
        preview: buildLegacyCandidatePreview(legacyCandidateSet.candidates),
      },
      shadow:
        shadowResult === null
          ? null
          : {
              mode: shadowResult.mode,
              skipped: shadowResult.skipped,
              totalDurationMs: shadowResult.totalDurationMs,
              canUseForProductionRouting: false,
              steps: {
                document: stepToSummary(shadowResult.steps.document),
                financial: stepToSummary(shadowResult.steps.financial),
                narrative: stepToSummary(shadowResult.steps.narrative),
                comparison: stepToSummary(shadowResult.steps.comparison),
              },
              summary: buildShadowSummary(shadowResult),
              artifacts: artifactResultsToRecord(shadowResult.artifacts),
            },
      gate: gateReport,
      gateSummary: {
        overallVerdict: gateReport?.overallVerdict ?? null,
        passCount: gateReport?.passCount ?? 0,
        warnCount: gateReport?.warnCount ?? 0,
        failCount: gateReport?.failCount ?? 0,
        insufficientDataCount: gateReport?.insufficientDataCount ?? 0,
        blockingCheckCodes: gateReport?.blockingChecks.map((check) => check.checkCode) ?? [],
        warningCheckCodes: gateReport?.warningChecks.map((check) => check.checkCode) ?? [],
      },
      safety: {
        canUseForProductionRouting: false,
        productionRoutingChanged: false,
        productionFactsMutated: false,
        publishAffected: false,
      },
    });
  }

  return {
    version: "annual-report-unified-confidence-batch-v1",
    generatedAt: new Date().toISOString(),
    manifest: {
      ...manifest,
      entries,
    },
    config: {
      mode,
      persistShadowArtifacts,
      persistConfidenceGateArtifacts,
      limit,
    },
    candidateCounts,
    cases,
    summary: summarizeAnnualReportUnifiedConfidenceBatch(cases, elapsed(overallStart)),
  };
}
