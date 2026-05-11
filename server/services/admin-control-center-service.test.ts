import { describe, expect, it } from "vitest";

import { buildAdminControlCenterModel } from "@/server/services/admin-control-center-service";

function makeRuntime() {
  return {
    packageInstalled: true,
    packageVersion: "2.2.1",
    java: {
      rawVersion: "17",
      majorVersion: 17,
      available: true,
      executablePath: "java",
      pathCandidates: ["java"],
      javaHomePath: null,
      discoveredCandidates: [],
    },
    localModeReady: true,
    hybridConfigured: false,
    localModeReason: "Ready",
    hybridModeReason: "Hybrid URL missing.",
    liveLocalBenchmarkReady: true,
    liveLocalBenchmarkReason: "Ready",
    liveHybridBenchmarkReady: false,
    liveHybridBenchmarkReason: "Hybrid URL missing.",
  };
}

describe("admin-control-center-service", () => {
  it("builds the two expected admin flows with their key routes", async () => {
    const model = await buildAdminControlCenterModel({
      getOverview: async () => ({
        parserVersion: "annual-report-pipeline-v4-opendataloader",
        metrics: {
          filings: [
            { status: "DISCOVERED", _count: { _all: 2 } },
            { status: "PUBLISHED", _count: { _all: 1 } },
            { status: "FAILED", _count: { _all: 1 } },
          ],
          runs: [{ status: "SUCCEEDED", _count: { _all: 3 } }],
          reviews: [{ status: "PENDING_REVIEW", _count: { _all: 2 } }],
          incompleteCoverageCount: 1,
        },
        reviewQueue: [],
        pendingFilings: [],
        dueCoverage: [],
      }) as never,
      listUnifiedConfidence: async () => ({
        items: [],
        total: 0,
        limit: 5,
        offset: 0,
        summary: { total: 0, PASS: 0, WARN: 0, FAIL: 0, INSUFFICIENT_DATA: 0 },
      }),
      inspectRuntime: async () => makeRuntime(),
      readLatestGoldSetRun: async () => null,
      readLatestCalibrationReport: async () => null,
      readLatestTaxonomyReport: async () => null,
      readLatestExtractionFixReport: async () => null,
      now: () => new Date("2026-05-10T12:00:00.000Z"),
    });

    expect(model.title).toBe("Admin Control Center");
    expect(model.attentionTitle).toBe("Hva trenger oppmerksomhet nÃ¥?");
    expect(model.mainFlow.title).toBe("Fra Ã¥rsrapport til tall i databasen");
    expect(model.mainFlow.nodes).toHaveLength(11);
    expect(model.goLiveFlow.title).toBe("Veien mot go-live for ny ekstraksjonsmotor");
    expect(model.goLiveFlow.nodes).toHaveLength(13);
    expect(model.mainFlow.nodes.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "Rapport mottas",
        "Riktig dokument kobles til",
        "PDF-en kvalitetssjekkes",
        "Systemet velger lesemetode",
        "Tall og tekst hentes ut",
        "Resultatene sammenlignes",
        "Systemet vurderer kvaliteten",
        "MÃ¥ rapporten kontrolleres manuelt?",
        "Manuell kontroll",
        "Godkjente tall lagres",
        "Tallene blir tilgjengelige i produktet",
      ]),
    );
    expect(model.goLiveFlow.nodes.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "Bygg representativt testsett",
        "KjÃ¸r shadow batch",
        "GjennomfÃ¸r manuell kontroll",
        "Juster terskler og regler",
        "Klassifiser feiltyper",
        "Rett de viktigste feilene",
        "Lag go/no-go-vurdering",
        "KjÃ¸r canary uten produksjonseffekt",
        "Aktiver routing bak feature flag",
        "Sikre publish gate",
        "OvervÃ¥kning, varsler og kill switch",
        "Begrenset go-live",
        "Gradvis utvidelse",
      ]),
    );
    expect(model.mainFlow.nodes.find((item) => item.key === "manual-review")?.href).toBe(
      "/admin/annual-report-reviews",
    );
    expect(model.mainFlow.nodes.find((item) => item.key === "pdf-quality")?.href).toBe(
      "/admin/pdf-parser-route-quality",
    );
    expect(model.mainFlow.nodes.find((item) => item.key === "parser-choice")?.href).toBe(
      "/admin/pdf-parser-route-recommendation-v2",
    );
    expect(model.goLiveFlow.nodes.find((item) => item.key === "canary-no-effect")?.href).toBe(
      "/admin/pdf-parser-route-canary-preview",
    );
    expect(model.goLiveFlow.nodes.find((item) => item.key === "feature-flag")?.href).toBe(
      "/admin/pdf-parser-route-assignment-preview",
    );
    expect(model.mainFlow.nodes.find((item) => item.key === "artifact-linking")?.href).toBe(
      undefined,
    );
  });

  it("returns explicit unknown and empty states when run data is unavailable", async () => {
    const model = await buildAdminControlCenterModel({
      getOverview: async () => ({
        parserVersion: "annual-report-pipeline-v4-opendataloader",
        metrics: {
          filings: [],
          runs: [],
          reviews: [],
          incompleteCoverageCount: 0,
        },
        reviewQueue: [],
        pendingFilings: [],
        dueCoverage: [],
      }) as never,
      listUnifiedConfidence: async () => ({
        items: [],
        total: 0,
        limit: 5,
        offset: 0,
        summary: { total: 0, PASS: 0, WARN: 0, FAIL: 0, INSUFFICIENT_DATA: 0 },
      }),
      inspectRuntime: async () => makeRuntime(),
      readLatestGoldSetRun: async () => null,
      readLatestCalibrationReport: async () => null,
      readLatestTaxonomyReport: async () => null,
      readLatestExtractionFixReport: async () => null,
      now: () => new Date("2026-05-10T12:00:00.000Z"),
    });

    expect(model.summaryCards.find((item) => item.key === "latest-shadow-batch")?.value).toBe(
      "Ingen data funnet",
    );
    expect(model.summaryCards.find((item) => item.key === "go-live-status")?.value).toBe(
      "Ukjent",
    );
    expect(model.attentionEmptyState).toBe(
      "Ingen Ã¥pne problemer funnet basert pÃ¥ tilgjengelige data.",
    );
    expect(model.attentionItems.some((item) => item.key === "shadow-missing")).toBe(true);
    expect(model.summaryCards.find((item) => item.key === "calibration-status")?.value).toBe(
      "Ingen data funnet",
    );
    expect(model.summaryCards.find((item) => item.key === "failure-taxonomy")?.value).toBe(
      "Ingen data funnet",
    );
  });

  it("surfaces taxonomy summary in admin cards and go-live flow when a report exists", async () => {
    const model = await buildAdminControlCenterModel({
      getOverview: async () => ({
        parserVersion: "annual-report-pipeline-v4-opendataloader",
        metrics: {
          filings: [],
          runs: [],
          reviews: [],
          incompleteCoverageCount: 0,
        },
        reviewQueue: [],
        pendingFilings: [],
        dueCoverage: [],
      }) as never,
      listUnifiedConfidence: async () => ({
        items: [],
        total: 0,
        limit: 5,
        offset: 0,
        summary: { total: 0, PASS: 0, WARN: 0, FAIL: 0, INSUFFICIENT_DATA: 0 },
      }),
      inspectRuntime: async () => makeRuntime(),
      readLatestGoldSetRun: async () => null,
      readLatestTaxonomyReport: async () => ({
        version: "annual-report-unified-failure-taxonomy-v1",
        generatedAt: "2026-05-11T09:30:00.000Z",
        input: {
          runId: "gold-set-2026-05-11",
          generatedBy: "test",
        },
        sourceRun: {
          reviewRoundId: "gold-set-2026-05-11",
          reviewRoundGeneratedAt: "2026-05-11T09:00:00.000Z",
          goldSetRunId: "gold-set-2026-05-11",
          manifestName: "go-live-gold-set",
          gitCommitSha: "abc123",
        },
        evidenceUsed: {
          totalCandidates: 4,
          reviewedCandidates: 2,
          pendingCandidates: 2,
          blockedCandidates: 0,
        },
        summary: {
          totalCandidates: 4,
          totalMappedIssues: 6,
          highSeverityIssueCount: 2,
          issueClassCounts: [
            {
              issueClass: "UNIT_SCALE_UNKNOWN",
              count: 2,
              severity: "HIGH",
              remediationArea: "unit_scale_normalization",
            },
          ],
          severityCounts: {
            HIGH: 2,
            MEDIUM: 3,
            LOW: 1,
          },
          affectedTags: [],
          affectedCanonicalKeys: [],
          firstDivergenceStages: [],
          remediationAreaCounts: [],
          representativeExamples: [],
        },
        issues: [],
        recommendations: {
          pr79ExtractionFixes: ["Prioriter unit-scale-deteksjon og propagasjon i PR79."],
        },
        output: {
          jsonPath: "output/benchmarks/annual-report-unified-failure-taxonomy/latest.json",
          markdownPath: "output/benchmarks/annual-report-unified-failure-taxonomy/latest.md",
        },
        safety: {
          canUseForProductionRouting: false,
          productionRoutingChanged: false,
          productionFactsMutated: false,
          publishAffected: false,
        },
      }),
      now: () => new Date("2026-05-11T10:00:00.000Z"),
    });

    expect(model.summaryCards.find((item) => item.key === "failure-taxonomy")?.value).toBe(
      "UNIT_SCALE_UNKNOWN",
    );
    expect(model.goLiveFlow.nodes.find((item) => item.key === "failure-taxonomy")?.status).toBe(
      "WARNING",
    );
    expect(model.attentionItems.some((item) => item.key === "taxonomy-high-severity")).toBe(true);
  });

  it("surfaces PR79 extraction-fix summary in admin cards and go-live flow when a report exists", async () => {
    const model = await buildAdminControlCenterModel({
      getOverview: async () => ({
        parserVersion: "annual-report-pipeline-v4-opendataloader",
        metrics: {
          filings: [],
          runs: [],
          reviews: [],
          incompleteCoverageCount: 0,
        },
        reviewQueue: [],
        pendingFilings: [],
        dueCoverage: [],
      }) as never,
      listUnifiedConfidence: async () => ({
        items: [],
        total: 0,
        limit: 5,
        offset: 0,
        summary: { total: 0, PASS: 0, WARN: 0, FAIL: 0, INSUFFICIENT_DATA: 0 },
      }),
      inspectRuntime: async () => makeRuntime(),
      readLatestGoldSetRun: async () => null,
      readLatestExtractionFixReport: async () => ({
        version: "annual-report-extraction-fix-report-v1",
        generatedAt: "2026-05-11T11:00:00.000Z",
        status: "POST_FIX_VALIDATION_PENDING",
        targetedIssueClasses: [
          "UNIT_SCALE_MISMATCH",
          "NORWEGIAN_LABEL_MAPPING_ERROR",
          "MULTI_PAGE_BALANCE_ERROR",
        ],
        fixesImplemented: [],
        testsAdded: [],
        evidenceUsed: {
          benchmarkPath: "output/benchmarks/annual-report-golden/latest.json",
          shadowBatchPath: "output/benchmarks/annual-report-shadow-batches/latest.json",
          calibrationReportPath: null,
          taxonomyReportPath: null,
        },
        baselineMetrics: [],
        remainingBlockers: ["OPENDATALOADER_HYBRID_URL is not configured."],
        recommendationsForPr80: [],
        output: {
          jsonPath: "output/benchmarks/annual-report-extraction-fixes/latest.json",
          markdownPath: "output/benchmarks/annual-report-extraction-fixes/latest.md",
        },
        safety: {
          canUseForProductionRouting: false,
          productionRoutingChanged: false,
          productionFactsMutated: false,
          publishAffected: false,
        },
      }),
      now: () => new Date("2026-05-11T12:00:00.000Z"),
    });

    expect(model.summaryCards.find((item) => item.key === "extraction-fixes")?.value).toBe(
      "UNIT_SCALE_MISMATCH",
    );
    expect(model.goLiveFlow.nodes.find((item) => item.key === "fix-errors")?.status).toBe(
      "WARNING",
    );
    expect(model.attentionItems.some((item) => item.key === "pr79-post-fix-blockers")).toBe(true);
  });
});



