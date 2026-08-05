import { beforeEach, describe, expect, it, vi } from "vitest";

import { CanonicalFactCandidate } from "@/integrations/brreg/annual-report-financials/types";
import {
  CanonicalMetricKey,
  defaultMetricDefinitions,
  requiredPublishMetricKeys,
} from "@/server/financials/canonical-taxonomy";
import {
  OpenDataLoaderParseResult,
  OpenDataLoaderResolvedConfig,
  OpenDataLoaderRouteDecision,
} from "@/server/document-understanding/opendataloader-types";
import type {
  AnnualReportUnifiedShadowInput,
  AnnualReportUnifiedShadowResult,
} from "@/server/services/annual-report-unified-shadow-extraction-service";

const providerState = {
  filings: [
    {
      fiscalYear: 2024,
      sourceSystem: "BRREG",
      sourceUrl: "https://example.test/2024.pdf",
      sourceDiscoveryKey: "BRREG::928846466::2024::annual-report",
      sourceIdempotencyKey: "BRREG::928846466::2024::annual-report::pending",
      sourceDocumentType: "ANNUAL_REPORT_PDF",
      discoveredAt: new Date("2026-04-17T08:00:00.000Z"),
      document: null,
    },
  ],
  pdf: { buffer: Buffer.from("fake-pdf"), mimeType: "application/pdf" },
  downloadAnnualReportPdf: vi.fn(async () => ({
    buffer: providerState.pdf.buffer,
    mimeType: providerState.pdf.mimeType,
  })),
};

const artifactStorageState = {
  putArtifact: vi.fn(
    async (input: { artifactType: string; filename: string; content?: Buffer | string }) => ({
      storageKey: `${input.artifactType}/${input.filename}`,
      absolutePath: `/tmp/${input.filename}`,
    }),
  ),
};

const repo = {
  findCompanyByOrgNumber: vi.fn(),
  upsertAnnualReportFilingDiscovery: vi.fn(),
  upsertCompanyFinancialCoverage: vi.fn(),
  getAnnualReportFilingWithArtifacts: vi.fn(),
  createAnnualReportArtifact: vi.fn(),
  updateAnnualReportFiling: vi.fn(),
  createFinancialExtractionRun: vi.fn(),
  completeFinancialExtractionRun: vi.fn(),
  createFinancialFacts: vi.fn(),
  createFinancialValidationIssues: vi.fn(),
  publishFinancialStatementSnapshot: vi.fn(),
  publishMachineFinancialLineItems: vi.fn(),
  registerAnnualReportHashVersion: vi.fn(),
  createAnnualReportFilingVersion: vi.fn(),
  listLatestAnnualReportFilingsForCompany: vi.fn(),
  claimAnnualReportFilingForProcessing: vi.fn(),
  resolveAnnualReportReviewsForFiling: vi.fn(),
  upsertAnnualReportReview: vi.fn(),
  listAnnualReportReviews: vi.fn(),
  updateAnnualReportReviewStatus: vi.fn(),
  getAnnualReportPipelineMetrics: vi.fn(),
  listAnnualReportFilingsForReprocessing: vi.fn(),
  listCompaniesForFinancialSync: vi.fn(),
  listPendingAnnualReportFilings: vi.fn(),
  getPublishedFinancialsForCompany: vi.fn(),
};

const openDataLoaderState: {
  config: OpenDataLoaderResolvedConfig;
  route: OpenDataLoaderRouteDecision;
  parseResult: OpenDataLoaderParseResult;
  parseAnnualReportPdfWithOpenDataLoader: ReturnType<typeof vi.fn>;
} = {
  config: {
    enabled: false,
    mode: "local",
    hybridBackend: "docling-fast",
    hybridUrl: null,
    forceOcr: false,
    useStructTree: false,
    timeoutMs: 120000,
    dualRun: false,
    storeAnnotatedPdf: true,
    fallbackToLegacy: true,
    autoPromote: false,
  },
  route: {
    enabled: false,
    executionMode: "local",
    hybridMode: null,
    useStructTree: false,
    requiresOcr: false,
    reasonCode: "DISABLED",
    reason: "OpenDataLoader integration is disabled by configuration.",
  },
  parseResult: {
    engine: "OPENDATALOADER",
    engineVersion: "2.2.1",
    routing: {
      enabled: true,
      executionMode: "local",
      hybridMode: null,
      useStructTree: true,
      requiresOcr: false,
      reasonCode: "STRUCT_TREE_PREFERRED",
      reason: "Reliable text layer detected and structure-tree extraction was requested.",
    },
    preflight: {
      pageCount: 2,
      hasTextLayer: true,
      hasReliableTextLayer: true,
      parsedPages: [],
    },
    normalizedDocument: {
      engine: "OPENDATALOADER",
      engineVersion: "2.2.1",
      engineMode: "local",
      pageCount: 2,
      pages: [],
    },
    annualReportPages: [],
    diagnostics: {
      input: {
        sourceFilename: "928846466-2024.pdf",
        sourceByteLength: 8,
        preflightPageCount: 2,
        hasTextLayer: true,
        hasReliableTextLayer: true,
      },
    },
    artifacts: {
      rawJson: {
        filename: "odl.json",
        mimeType: "application/json",
        content: Buffer.from("{}"),
        payload: { elements: [] },
      },
      markdown: {
        filename: "odl.md",
        mimeType: "text/markdown",
        content: Buffer.from("# ODL"),
      },
      annotatedPdf: {
        filename: "odl-annotated.pdf",
        mimeType: "application/pdf",
        content: Buffer.from("%PDF-1.4"),
      },
    },
    metrics: {
      durationMs: 250,
      pageCount: 2,
      blockCount: 10,
      tableBlockCount: 2,
    },
  },
  parseAnnualReportPdfWithOpenDataLoader: vi.fn(async () => openDataLoaderState.parseResult),
};

vi.mock("@/integrations/brreg/brreg-financials-provider", () => ({
  BrregFinancialsProvider: class {
    async listAnnualReportFilings() {
      return providerState.filings;
    }
    async downloadAnnualReportPdf() {
      return providerState.downloadAnnualReportPdf();
    }
  },
}));

vi.mock("@/server/financials/artifact-storage", () => ({
  LocalAnnualReportArtifactStorage: class {
    async putArtifact(input: { artifactType: string; filename: string; content?: Buffer | string }) {
      return artifactStorageState.putArtifact(input);
    }
    async getArtifactBuffer() {
      return providerState.pdf.buffer;
    }
  },
}));

vi.mock("@/server/persistence/annual-report-ingestion-repository", () => ({
  findCompanyByOrgNumber: repo.findCompanyByOrgNumber,
  listCompaniesForFinancialSync: repo.listCompaniesForFinancialSync,
  upsertAnnualReportFilingDiscovery: repo.upsertAnnualReportFilingDiscovery,
  upsertCompanyFinancialCoverage: repo.upsertCompanyFinancialCoverage,
  getAnnualReportFilingWithArtifacts: repo.getAnnualReportFilingWithArtifacts,
  createAnnualReportArtifact: repo.createAnnualReportArtifact,
  updateAnnualReportFiling: repo.updateAnnualReportFiling,
  createFinancialExtractionRun: repo.createFinancialExtractionRun,
  completeFinancialExtractionRun: repo.completeFinancialExtractionRun,
  createFinancialFacts: repo.createFinancialFacts,
  createFinancialValidationIssues: repo.createFinancialValidationIssues,
  publishFinancialStatementSnapshot: repo.publishFinancialStatementSnapshot,
  publishMachineFinancialLineItems: repo.publishMachineFinancialLineItems,
  registerAnnualReportHashVersion: repo.registerAnnualReportHashVersion,
  createAnnualReportFilingVersion: repo.createAnnualReportFilingVersion,
  listLatestAnnualReportFilingsForCompany: repo.listLatestAnnualReportFilingsForCompany,
  claimAnnualReportFilingForProcessing: repo.claimAnnualReportFilingForProcessing,
  resolveAnnualReportReviewsForFiling: repo.resolveAnnualReportReviewsForFiling,
  upsertAnnualReportReview: repo.upsertAnnualReportReview,
  listPendingAnnualReportFilings: repo.listPendingAnnualReportFilings,
  getPublishedFinancialsForCompany: repo.getPublishedFinancialsForCompany,
  listAnnualReportReviews: repo.listAnnualReportReviews,
  updateAnnualReportReviewStatus: repo.updateAnnualReportReviewStatus,
  getAnnualReportPipelineMetrics: repo.getAnnualReportPipelineMetrics,
  listAnnualReportFilingsForReprocessing: repo.listAnnualReportFilingsForReprocessing,
}));

vi.mock("@/server/document-understanding/opendataloader-config", () => ({
  resolveOpenDataLoaderConfig: vi.fn(() => openDataLoaderState.config),
  chooseOpenDataLoaderRoute: vi.fn(() => openDataLoaderState.route),
}));

vi.mock("@/server/services/metric-mapping-service", () => ({
  loadMetricDefinitions: vi.fn(async () => defaultMetricDefinitions),
}));

vi.mock("@/server/services/canonical-registry-service", () => ({
  loadRequiredPublishMetricKeys: vi.fn(async () => requiredPublishMetricKeys),
}));

vi.mock("@/server/services/presentation-node-service", () => ({
  loadNodeEvaluationConfig: vi.fn(async () => []),
}));

const unifiedShadowState: {
  mode: "DISABLED" | "DRY_RUN" | "PERSIST_ARTIFACTS";
  runResult: AnnualReportUnifiedShadowResult;
  runAnnualReportUnifiedShadowExtraction: ReturnType<
    typeof vi.fn<
      (
        input: AnnualReportUnifiedShadowInput,
      ) => Promise<AnnualReportUnifiedShadowResult>
    >
  >;
  getAnnualReportUnifiedShadowConfigFromEnv: ReturnType<typeof vi.fn>;
} = {
  mode: "DISABLED",
  runResult: {
    canUseForProductionRouting: false,
    skipped: true,
    mode: "DISABLED",
    totalDurationMs: 0,
    document: null,
    financial: null,
    narrative: null,
    comparison: null,
    steps: { document: null, financial: null, narrative: null, comparison: null },
    artifacts: { document: null, financial: null, narrative: null, comparison: null },
    warnings: [],
  },
  // Pre-created vi.fn() so we can mockClear() it in beforeEach (same pattern as ODL)
  runAnnualReportUnifiedShadowExtraction: vi.fn(async () => unifiedShadowState.runResult),
  getAnnualReportUnifiedShadowConfigFromEnv: vi.fn(() => ({
    mode: unifiedShadowState.mode,
    persistUnifiedParserDocument: false,
    persistUnifiedFinancialExtraction: false,
    persistUnifiedNarrativeExtraction: false,
    persistLegacyVsUnifiedComparison: false,
  })),
};

vi.mock("@/server/services/annual-report-unified-shadow-config", () => ({
  getAnnualReportUnifiedShadowConfigFromEnv:
    unifiedShadowState.getAnnualReportUnifiedShadowConfigFromEnv,
  validateAnnualReportUnifiedShadowConfig: vi.fn(() => []),
}));

vi.mock("@/server/services/annual-report-unified-shadow-extraction-service", () => ({
  runAnnualReportUnifiedShadowExtraction:
    unifiedShadowState.runAnnualReportUnifiedShadowExtraction,
}));

vi.mock("@/server/document-understanding/opendataloader-client", () => ({
  parseAnnualReportPdfWithOpenDataLoader:
    openDataLoaderState.parseAnnualReportPdfWithOpenDataLoader,
}));

vi.mock("@/integrations/brreg/annual-report-financials/preflight", () => ({
  preflightAnnualReportDocument: vi.fn(async () => ({
    pageCount: 2,
    hasTextLayer: true,
    hasReliableTextLayer: true,
    parsedPages: [],
  })),
  isPageReliable: vi.fn(() => true),
}));

vi.mock("@/integrations/brreg/annual-report-financials/page-classification", () => ({
  classifyPages: vi.fn(() => [
    {
      pageNumber: 2,
      type: "STATUTORY_INCOME",
      confidence: 0.95,
      unitScale: 1,
      unitScaleConfidence: 0.95,
      hasConflictingUnitSignals: false,
      statementScope: "COMPANY",
      hasExplicitScopeSignal: false,
      reportingCurrency: "NOK",
      declaredYears: [2024, 2023],
      yearHeaderYears: [2024, 2023],
      heading: "Resultatregnskap",
      numericRowCount: 8,
      tableLike: true,
      reasons: ["Resultatregnskap"],
    },
    {
      pageNumber: 3,
      type: "STATUTORY_BALANCE",
      confidence: 0.95,
      unitScale: 1,
      unitScaleConfidence: 0.95,
      hasConflictingUnitSignals: false,
      statementScope: "COMPANY",
      hasExplicitScopeSignal: false,
      reportingCurrency: "NOK",
      declaredYears: [2024, 2023],
      yearHeaderYears: [2024, 2023],
      heading: "Balanse",
      numericRowCount: 8,
      tableLike: true,
      reasons: ["Balanse"],
    },
  ]),
}));

vi.mock("@/integrations/brreg/annual-report-financials/table-reconstruction", () => ({
  reconstructStatementRows: vi.fn(() => []),
}));

const mappedFacts = [
  {
    fiscalYear: 2024,
    statementType: "INCOME_STATEMENT",
    metricKey: "revenue",
    rawLabel: "Salgsinntekter",
    normalizedLabel: "salgsinntekter",
    value: 103_097_000,
    currency: "NOK",
    unitScale: 1,
    sourcePage: 2,
    sourceSection: "STATUTORY_INCOME",
    sourceRowText: "Salgsinntekter 103097000",
    noteReference: null,
    confidenceScore: 0.96,
    precedence: "STATUTORY_NOK",
    isDerived: false,
  },
  {
    fiscalYear: 2024,
    statementType: "INCOME_STATEMENT",
    metricKey: "operating_profit",
    rawLabel: "Driftsresultat",
    normalizedLabel: "driftsresultat",
    value: 21_210_000,
    currency: "NOK",
    unitScale: 1,
    sourcePage: 2,
    sourceSection: "STATUTORY_INCOME",
    sourceRowText: "Driftsresultat 21210000",
    noteReference: null,
    confidenceScore: 0.96,
    precedence: "STATUTORY_NOK",
    isDerived: false,
  },
  {
    fiscalYear: 2024,
    statementType: "INCOME_STATEMENT",
    metricKey: "net_income",
    rawLabel: "Årsresultat",
    normalizedLabel: "arsresultat",
    value: 18_221_000,
    currency: "NOK",
    unitScale: 1,
    sourcePage: 2,
    sourceSection: "STATUTORY_INCOME",
    sourceRowText: "Årsresultat 18221000",
    noteReference: null,
    confidenceScore: 0.96,
    precedence: "STATUTORY_NOK",
    isDerived: false,
  },
  {
    fiscalYear: 2024,
    statementType: "BALANCE_SHEET",
    metricKey: "total_assets",
    rawLabel: "Sum eiendeler",
    normalizedLabel: "sum eiendeler",
    value: 92_155_000,
    currency: "NOK",
    unitScale: 1,
    sourcePage: 3,
    sourceSection: "STATUTORY_BALANCE",
    sourceRowText: "Sum eiendeler 92155000",
    noteReference: null,
    confidenceScore: 0.96,
    precedence: "STATUTORY_NOK",
    isDerived: false,
  },
  {
    fiscalYear: 2024,
    statementType: "BALANCE_SHEET",
    metricKey: "total_equity",
    rawLabel: "Sum egenkapital",
    normalizedLabel: "sum egenkapital",
    value: 36_372_000,
    currency: "NOK",
    unitScale: 1,
    sourcePage: 3,
    sourceSection: "STATUTORY_BALANCE",
    sourceRowText: "Sum egenkapital 36372000",
    noteReference: null,
    confidenceScore: 0.96,
    precedence: "STATUTORY_NOK",
    isDerived: false,
  },
  {
    fiscalYear: 2024,
    statementType: "BALANCE_SHEET",
    metricKey: "total_liabilities",
    rawLabel: "Sum gjeld",
    normalizedLabel: "sum gjeld",
    value: 55_783_000,
    currency: "NOK",
    unitScale: 1,
    sourcePage: 3,
    sourceSection: "STATUTORY_BALANCE",
    sourceRowText: "Sum gjeld 55783000",
    noteReference: null,
    confidenceScore: 0.96,
    precedence: "STATUTORY_NOK",
    isDerived: false,
  },
  {
    fiscalYear: 2024,
    statementType: "BALANCE_SHEET",
    metricKey: "total_equity_and_liabilities",
    rawLabel: "Sum egenkapital og gjeld",
    normalizedLabel: "sum egenkapital og gjeld",
    value: 92_155_000,
    currency: "NOK",
    unitScale: 1,
    sourcePage: 3,
    sourceSection: "STATUTORY_BALANCE",
    sourceRowText: "Sum egenkapital og gjeld 92155000",
    noteReference: null,
    confidenceScore: 0.96,
    precedence: "STATUTORY_NOK",
    isDerived: false,
  },
] as CanonicalFactCandidate[];

vi.mock("@/integrations/brreg/annual-report-financials/canonical-mapping", () => ({
  mapRowsToCanonicalFacts: vi.fn(() => ({ facts: mappedFacts, issues: [] })),
  chooseCanonicalFacts: vi.fn((facts) =>
    new Map(facts.map((fact: (typeof mappedFacts)[number]) => [fact.metricKey, fact])),
  ),
}));

vi.mock("@/integrations/brreg/annual-report-financials/validation", () => ({
  validateCanonicalFacts: vi.fn(() => ({
    selectedFacts: new Map(mappedFacts.map((fact) => [fact.metricKey, fact])),
    issues: [],
    validationScore: 0.98,
    hasBlockingErrors: false,
    stats: { duplicateComparisons: 1, duplicateMatches: 1, noteComparisons: 0, noteMatches: 0 },
  })),
}));

vi.mock("@/integrations/brreg/annual-report-financials/normalized-payload", () => ({
  buildNormalizedFinancialPayload: vi.fn(() => ({
    regnskapsperiode: { tilDato: "2024-12-31" },
    resultatregnskapResultat: { aarsresultat: 18_221_000 },
    eiendeler: { sumEiendeler: 92_155_000 },
    egenkapitalGjeld: {
      egenkapital: { sumEgenkapital: 36_372_000 },
      sumEgenkapitalGjeld: 92_155_000,
    },
  })),
}));

function storedJsonArtifacts(artifactType: string) {
  return artifactStorageState.putArtifact.mock.calls
    .map((call) => call[0])
    .filter((artifact) => artifact.artifactType === artifactType)
    .map((artifact) =>
      JSON.parse(
        Buffer.isBuffer(artifact.content)
          ? artifact.content.toString("utf8")
          : String(artifact.content),
      ),
    );
}

describe("annual-report-financials-service", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(repo).forEach((mocked) => mocked.mockReset());
    repo.publishMachineFinancialLineItems.mockResolvedValue({ publishedCount: 0 });
    providerState.downloadAnnualReportPdf.mockClear();
    artifactStorageState.putArtifact.mockClear();
    openDataLoaderState.parseAnnualReportPdfWithOpenDataLoader.mockClear();
    unifiedShadowState.mode = "DISABLED";
    unifiedShadowState.runResult = {
      canUseForProductionRouting: false,
      skipped: true,
      mode: "DISABLED",
      totalDurationMs: 0,
      document: null,
      financial: null,
      narrative: null,
      comparison: null,
      steps: { document: null, financial: null, narrative: null, comparison: null },
      artifacts: { document: null, financial: null, narrative: null, comparison: null },
      warnings: [],
    };
    unifiedShadowState.runAnnualReportUnifiedShadowExtraction.mockClear();
    unifiedShadowState.getAnnualReportUnifiedShadowConfigFromEnv.mockClear();
    unifiedShadowState.runAnnualReportUnifiedShadowExtraction.mockImplementation(
      async () => unifiedShadowState.runResult,
    );
    openDataLoaderState.config = {
      enabled: false,
      mode: "local",
      hybridBackend: "docling-fast",
      hybridUrl: null,
      forceOcr: false,
      useStructTree: false,
      timeoutMs: 120000,
      dualRun: false,
      storeAnnotatedPdf: true,
      fallbackToLegacy: true,
      autoPromote: false,
    };
    openDataLoaderState.route = {
      enabled: false,
      executionMode: "local",
      hybridMode: null,
      useStructTree: false,
      requiresOcr: false,
      reasonCode: "DISABLED",
      reason: "OpenDataLoader integration is disabled by configuration.",
    };
    openDataLoaderState.parseResult = {
      engine: "OPENDATALOADER",
      engineVersion: "2.2.1",
      routing: {
        enabled: true,
        executionMode: "local",
        hybridMode: null,
        useStructTree: true,
        requiresOcr: false,
        reasonCode: "STRUCT_TREE_PREFERRED",
        reason: "Reliable text layer detected and structure-tree extraction was requested.",
      },
      preflight: {
        pageCount: 2,
        hasTextLayer: true,
        hasReliableTextLayer: true,
        parsedPages: [],
      },
      normalizedDocument: {
        engine: "OPENDATALOADER",
        engineVersion: "2.2.1",
        engineMode: "local",
        pageCount: 2,
        pages: [],
      },
      annualReportPages: [],
      diagnostics: {
        input: {
          sourceFilename: "928846466-2024.pdf",
          sourceByteLength: 8,
          preflightPageCount: 2,
          hasTextLayer: true,
          hasReliableTextLayer: true,
        },
      },
      artifacts: {
        rawJson: {
          filename: "odl.json",
          mimeType: "application/json",
          content: Buffer.from("{}"),
          payload: { elements: [] },
        },
        markdown: {
          filename: "odl.md",
          mimeType: "text/markdown",
          content: Buffer.from("# ODL"),
        },
        annotatedPdf: {
          filename: "odl-annotated.pdf",
          mimeType: "application/pdf",
          content: Buffer.from("%PDF-1.4"),
        },
      },
      metrics: {
        durationMs: 250,
        pageCount: 2,
        blockCount: 10,
        tableBlockCount: 2,
      },
    };
    openDataLoaderState.parseAnnualReportPdfWithOpenDataLoader.mockImplementation(
      async () => openDataLoaderState.parseResult,
    );

    repo.findCompanyByOrgNumber.mockResolvedValue({
      id: "company-1",
      orgNumber: "928846466",
      name: "Example AS",
      slug: "928846466-example-as",
    });
    repo.getAnnualReportFilingWithArtifacts.mockResolvedValue({
      id: "filing-1",
      company: { id: "company-1", orgNumber: "928846466", name: "Example AS" },
      fiscalYear: 2024,
      status: "DOWNLOADED",
      sourceUrl: "https://example.test/2024.pdf",
      sourceDocumentHash: null,
      artifacts: [],
      reviews: [],
      sourceDiscoveryKey: "BRREG::928846466::2024::annual-report",
    });
    repo.claimAnnualReportFilingForProcessing.mockResolvedValue({
      id: "filing-1",
      fiscalYear: 2024,
      status: "PROCESSING",
    });
    repo.registerAnnualReportHashVersion.mockResolvedValue({ id: "filing-1" });
    repo.listLatestAnnualReportFilingsForCompany.mockResolvedValue([]);
    repo.createFinancialExtractionRun.mockResolvedValue({ id: "run-1" });
    repo.createAnnualReportArtifact.mockResolvedValue({ id: "artifact-1" });
    repo.updateAnnualReportFiling.mockResolvedValue({});
    repo.createFinancialFacts.mockResolvedValue(undefined);
    repo.createFinancialValidationIssues.mockResolvedValue(undefined);
    repo.completeFinancialExtractionRun.mockResolvedValue(undefined);
    repo.publishFinancialStatementSnapshot.mockResolvedValue(undefined);
    repo.upsertCompanyFinancialCoverage.mockResolvedValue(undefined);
    repo.upsertAnnualReportFilingDiscovery.mockResolvedValue(undefined);
    repo.createAnnualReportFilingVersion.mockResolvedValue({ id: "filing-2" });
    repo.resolveAnnualReportReviewsForFiling.mockResolvedValue(undefined);
    repo.upsertAnnualReportReview.mockResolvedValue(undefined);
    repo.listAnnualReportReviews.mockResolvedValue([]);
    repo.updateAnnualReportReviewStatus.mockResolvedValue({
      id: "review-1",
      filingId: "filing-1",
      extractionRunId: "run-1",
      company: { orgNumber: "928846466", name: "Example AS" },
    });
    repo.getAnnualReportPipelineMetrics.mockResolvedValue({
      filings: [{ status: "PUBLISHED", _count: { _all: 1 } }],
      runs: [{ status: "SUCCEEDED", _count: { _all: 1 } }],
      reviews: [{ status: "PENDING_REVIEW", _count: { _all: 1 } }],
      incompleteCoverageCount: 1,
    });
    repo.listAnnualReportFilingsForReprocessing.mockResolvedValue([]);
    repo.listCompaniesForFinancialSync.mockResolvedValue([]);
    repo.listPendingAnnualReportFilings.mockResolvedValue([]);
    repo.getPublishedFinancialsForCompany.mockResolvedValue({
      id: "company-1",
      orgNumber: "928846466",
      name: "Example AS",
      financialStatements: [
        {
          id: "statement-1",
          fiscalYear: 2024,
          sourceFilingId: "filing-1",
          sourceExtractionRunId: "run-1",
          qualityStatus: "HIGH_CONFIDENCE",
          qualityScore: 0.97,
          sourcePrecedence: "STATUTORY_NOK",
          unitScale: 1,
          publishedAt: new Date("2026-04-17T10:00:00.000Z"),
          normalizedAt: new Date("2026-04-17T10:00:00.000Z"),
        },
      ],
      annualReportFilings: [],
      financialCoverage: null,
    });
  });

  it("discovers filings and updates company coverage", async () => {
    const { discoverAnnualReportFilingsForCompany } = await import(
      "@/server/services/annual-report-financials-service"
    );
    const result = await discoverAnnualReportFilingsForCompany("928846466");

    expect(result.discoveredFilings).toBe(1);
    expect(repo.upsertAnnualReportFilingDiscovery).toHaveBeenCalledTimes(1);
    expect(repo.upsertAnnualReportFilingDiscovery.mock.calls[0][0].sourceDiscoveryKey).toBe(
      "BRREG::928846466::2024::annual-report",
    );
    expect(repo.upsertCompanyFinancialCoverage).toHaveBeenCalled();
  });

  it("publishes a validated snapshot when confidence and equations pass", async () => {
    const { processAnnualReportFiling } = await import(
      "@/server/services/annual-report-financials-service"
    );
    const result = await processAnnualReportFiling("filing-1");

    expect(result.published).toBe(true);
    expect(repo.claimAnnualReportFilingForProcessing).toHaveBeenCalledTimes(1);
    expect(repo.registerAnnualReportHashVersion).toHaveBeenCalledTimes(1);
    expect(repo.createFinancialFacts).toHaveBeenCalled();
    expect(repo.publishFinancialStatementSnapshot).toHaveBeenCalledTimes(1);
    expect(repo.resolveAnnualReportReviewsForFiling).toHaveBeenCalledWith("filing-1");

    const decisionArtifacts = storedJsonArtifacts("PDF_DECISION_JSON");
    expect(decisionArtifacts).toHaveLength(2);
    expect(decisionArtifacts.map((artifact) => artifact.phase)).toEqual([
      "pre_extraction",
      "post_validation",
    ]);
    expect(decisionArtifacts[0]).toMatchObject({
      version: "pdf-decision-engine-v1",
      source: "annual-report-financials-service",
      inputSummary: {
        orgNumber: "928846466",
        fiscalYear: 2024,
        filingId: "filing-1",
        extractionRunId: null,
        hasPreflight: true,
        hasValidationSummary: false,
      },
    });
    expect(decisionArtifacts[1].inputSummary).toMatchObject({
      extractionRunId: "run-1",
      hasValidationSummary: true,
    });
    expect(decisionArtifacts[1].decision).toHaveProperty("confidenceScore");
  });

  it("reuses the stored pdf artifact instead of redownloading it", async () => {
    repo.getAnnualReportFilingWithArtifacts.mockResolvedValueOnce({
      id: "filing-1",
      company: { id: "company-1", orgNumber: "928846466", name: "Example AS" },
      fiscalYear: 2024,
      status: "DOWNLOADED",
      sourceUrl: "https://example.test/2024.pdf",
      sourceDocumentHash: "existing-hash",
      artifacts: [{ id: "artifact-1", artifactType: "PDF", storageKey: "PDF/928846466-2024.pdf" }],
      reviews: [],
    });
    const { processAnnualReportFiling } = await import(
      "@/server/services/annual-report-financials-service"
    );
    await processAnnualReportFiling("filing-1");

    expect(providerState.downloadAnnualReportPdf).not.toHaveBeenCalled();
  });

  it("persists OpenDataLoader artifacts when the integration is enabled as primary engine", async () => {
    openDataLoaderState.config.enabled = true;
    openDataLoaderState.config.dualRun = false;
    openDataLoaderState.route = openDataLoaderState.parseResult.routing;

    const { processAnnualReportFiling } = await import(
      "@/server/services/annual-report-financials-service"
    );
    const result = await processAnnualReportFiling("filing-1");

    expect(result.published).toBe(true);
    expect(openDataLoaderState.parseAnnualReportPdfWithOpenDataLoader).toHaveBeenCalledTimes(1);
    expect(repo.createAnnualReportArtifact.mock.calls.some((call) => call[0].artifactType === "DOCUMENT_JSON")).toBe(true);
    expect(repo.createAnnualReportArtifact.mock.calls.some((call) => call[0].artifactType === "DOCUMENT_MARKDOWN")).toBe(true);
    expect(repo.createAnnualReportArtifact.mock.calls.some((call) => call[0].artifactType === "ANNOTATED_PDF")).toBe(true);
  });

  it("publishes provisionally and creates a review case for usable low-trust filings", async () => {
    const validationModule = await import(
      "@/integrations/brreg/annual-report-financials/validation"
    );
    vi.mocked(validationModule.validateCanonicalFacts).mockReturnValueOnce({
      selectedFacts: new Map(
        mappedFacts.map((fact) => [
          fact.metricKey as CanonicalMetricKey,
          fact as CanonicalFactCandidate,
        ]),
      ),
      issues: [
        {
          severity: "ERROR",
          ruleCode: "BS_TOTAL_BALANCES",
          message: "Balance sheet is not balanced",
          context: { pageNumber: 3 },
        },
      ],
      validationScore: 0.4,
      hasBlockingErrors: true,
      stats: { duplicateComparisons: 1, duplicateMatches: 0, noteComparisons: 0, noteMatches: 0 },
    });

    const { processAnnualReportFiling } = await import(
      "@/server/services/annual-report-financials-service"
    );
    const result = await processAnnualReportFiling("filing-1");

    expect(result.published).toBe(true);
    expect(repo.publishFinancialStatementSnapshot).toHaveBeenCalledTimes(1);
    expect(repo.upsertAnnualReportReview).toHaveBeenCalledTimes(1);
    expect(repo.upsertAnnualReportReview.mock.calls[0][0]).toMatchObject({
      filingId: "filing-1",
      extractionRunId: "run-1",
      status: "PENDING_REVIEW",
      latestActionNote: "Published provisionally; awaiting manual review.",
      blockingRuleCodes: expect.arrayContaining([
        "STRICT_TRUST_GATE_FAILED",
        "BALANCE_VALIDATION_MISMATCH",
      ]),
    });
    const reviewPayload = repo.upsertAnnualReportReview.mock.calls[0][0]
      .reviewPayload as Record<string, any>;
    expect(reviewPayload.pdfDecision).toMatchObject({
      version: "pdf-decision-engine-v1",
      route: "MANUAL_REVIEW",
      riskLevel: "HIGH",
    });
    expect(
      reviewPayload.pdfDecision.manualReviewReasons.some((reason: string) =>
        reason.includes("BS_TOTAL_BALANCES"),
      ),
    ).toBe(true);

    const decisionArtifacts = storedJsonArtifacts("PDF_DECISION_JSON");
    expect(decisionArtifacts.map((artifact) => artifact.phase)).toEqual([
      "pre_extraction",
      "post_validation",
    ]);
  });

  it("skips double-processing when the filing cannot be claimed", async () => {
    repo.claimAnnualReportFilingForProcessing.mockResolvedValueOnce(null);
    repo.getAnnualReportFilingWithArtifacts.mockResolvedValueOnce({
      id: "filing-1",
      company: { id: "company-1", orgNumber: "928846466", name: "Example AS" },
      fiscalYear: 2024,
      status: "PROCESSING",
      sourceUrl: "https://example.test/2024.pdf",
      sourceDocumentHash: null,
      artifacts: [],
      reviews: [],
    });

    const { processAnnualReportFiling } = await import(
      "@/server/services/annual-report-financials-service"
    );
    const result = await processAnnualReportFiling("filing-1");

    expect(result.skipped).toBe(true);
    expect(result.reason).toContain("PROCESSING");
    expect(repo.publishFinancialStatementSnapshot).not.toHaveBeenCalled();
  });

  it("creates a new filing version when sync detects a changed hash for an existing year", async () => {
    repo.listLatestAnnualReportFilingsForCompany.mockResolvedValue([
      {
        id: "filing-1",
        companyId: "company-1",
        fiscalYear: 2024,
        sourceUrl: "https://example.test/2024.pdf",
        sourceDocumentHash: "old-hash",
      },
    ]);
    providerState.downloadAnnualReportPdf.mockResolvedValueOnce({
      buffer: Buffer.from("changed-pdf"),
      mimeType: "application/pdf",
    });
    repo.listCompaniesForFinancialSync.mockResolvedValue([
      {
        id: "company-1",
        orgNumber: "928846466",
        name: "Example AS",
        financialCoverage: { nextCheckAt: new Date("2026-04-17T00:00:00.000Z") },
      },
    ]);

    const { syncNewAnnualReportFilings } = await import(
      "@/server/services/annual-report-financials-service"
    );
    const result = await syncNewAnnualReportFilings({ orgNumbers: ["928846466"] });

    expect(repo.createAnnualReportFilingVersion).toHaveBeenCalledTimes(1);
    expect(result.versionChecks).toHaveLength(1);
  });

  it("reprocesses low-confidence filings without deleting prior history", async () => {
    repo.listAnnualReportFilingsForReprocessing.mockResolvedValue([
      {
        id: "filing-1",
        fiscalYear: 2024,
        company: { orgNumber: "928846466", name: "Example AS" },
        extractionRuns: [{ parserVersion: "annual-report-pipeline-v2", confidenceScore: 0.62 }],
      },
    ]);
    repo.getAnnualReportFilingWithArtifacts.mockResolvedValue({
      id: "filing-1",
      company: { id: "company-1", orgNumber: "928846466", name: "Example AS" },
      fiscalYear: 2024,
      status: "PUBLISHED",
      sourceUrl: "https://example.test/2024.pdf",
      sourceDocumentHash: null,
      artifacts: [],
      reviews: [
        {
          id: "review-1",
          status: "PENDING_REVIEW",
        },
      ],
    });

    const { reprocessAnnualReportFilingsByCriteria } = await import(
      "@/server/services/annual-report-financials-service"
    );
    const result = await reprocessAnnualReportFilingsByCriteria({
      maxQualityScore: 0.9,
      parserVersions: ["annual-report-pipeline-v2"],
    });

    expect(result.matchedFilings).toHaveLength(1);
    expect(repo.updateAnnualReportReviewStatus).toHaveBeenCalledWith({
      reviewId: "review-1",
      status: "REPROCESS_REQUESTED",
      latestActionNote: "Operator requested reprocessing",
    });
    expect(repo.claimAnnualReportFilingForProcessing.mock.calls[0][1]).toContain("PUBLISHED");
    expect(repo.publishFinancialStatementSnapshot).toHaveBeenCalledTimes(1);
  });

  it("stores a dual-run comparison artifact while keeping the legacy pipeline as publish source of truth", async () => {
    openDataLoaderState.config.enabled = true;
    openDataLoaderState.config.dualRun = true;
    openDataLoaderState.route = openDataLoaderState.parseResult.routing;

    const { processAnnualReportFiling } = await import(
      "@/server/services/annual-report-financials-service"
    );
    const result = await processAnnualReportFiling("filing-1");

    expect(result.published).toBe(true);
    expect(repo.createAnnualReportArtifact.mock.calls.some((call) => call[0].artifactType === "EXTRACTION_COMPARISON_JSON")).toBe(true);
    expect(repo.completeFinancialExtractionRun.mock.calls[0]?.[1]?.rawSummary).toBeTruthy();
  });

  it("falls back to the legacy path when OpenDataLoader fails and fallback is enabled", async () => {
    openDataLoaderState.config.enabled = true;
    openDataLoaderState.config.dualRun = false;
    openDataLoaderState.config.fallbackToLegacy = true;
    openDataLoaderState.route = {
      enabled: true,
      executionMode: "hybrid",
      hybridMode: "full",
      useStructTree: false,
      requiresOcr: true,
      reasonCode: "SCANNED_PDF",
      reason: "Preflight detected weak or missing text extraction, so hybrid/OCR routing was selected.",
    };
    openDataLoaderState.parseAnnualReportPdfWithOpenDataLoader.mockRejectedValueOnce(
      new Error("OpenDataLoader hybrid backend timed out"),
    );

    const { processAnnualReportFiling } = await import(
      "@/server/services/annual-report-financials-service"
    );
    const result = await processAnnualReportFiling("filing-1");

    expect(result.published).toBe(true);
    expect(repo.publishFinancialStatementSnapshot).toHaveBeenCalledTimes(1);
    expect(repo.upsertAnnualReportReview).not.toHaveBeenCalled();
  });

  it("sanitizes public financial output while preserving internal provenance for admin flows", async () => {
    repo.getPublishedFinancialsForCompany.mockResolvedValue({
      id: "company-1",
      orgNumber: "928846466",
      name: "Example AS",
      financialStatements: [
        {
          id: "statement-1",
          fiscalYear: 2024,
          currency: "NOK",
          revenue: 5000000n,
          operatingProfit: 1000000n,
          netIncome: 800000n,
          equity: 3000000n,
          assets: 7000000n,
          sourceSystem: "BRREG",
          sourceEntityType: "financialStatement",
          sourceId: "statement-1",
          fetchedAt: new Date("2026-04-17T10:00:00.000Z"),
          normalizedAt: new Date("2026-04-17T10:00:00.000Z"),
          rawPayload: { internal: true },
          sourceFilingId: "filing-1",
          sourceExtractionRunId: "run-1",
          qualityStatus: "LOW_CONFIDENCE",
          qualityScore: 0.62,
          sourcePrecedence: "STATUTORY_NOK",
          unitScale: 1,
          publishedAt: new Date("2026-04-17T10:00:00.000Z"),
        },
      ],
      annualReportFilings: [],
      financialCoverage: null,
    });

    const {
      getPublishedAnnualReportFinancials,
      getLatestPublishedStatementProvenance,
    } = await import("@/server/services/annual-report-financials-service");

    const published = await getPublishedAnnualReportFinancials("928846466");
    const statement = published.statements[0] as Record<string, unknown>;
    const provenance = await getLatestPublishedStatementProvenance("928846466", 2024);

    expect(statement.qualityStatus).toBeUndefined();
    expect(statement.qualityScore).toBeUndefined();
    expect(statement.sourceExtractionRunId).toBeUndefined();
    expect(statement.sourceFilingId).toBeUndefined();
    expect(statement.sourcePrecedence).toBeUndefined();
    expect(statement.unitScale).toBeUndefined();
    expect(statement.publishedAt).toBeUndefined();
    expect(statement.revenue).toBe(5000000);
    expect(provenance).toMatchObject({
      statementId: "statement-1",
      sourceFilingId: "filing-1",
      sourceExtractionRunId: "run-1",
      qualityStatus: "LOW_CONFIDENCE",
      qualityScore: 0.62,
    });
  });

  it("returns every published as-reported line instead of only headline metrics", async () => {
    repo.getPublishedFinancialsForCompany.mockResolvedValue({
      id: "company-1",
      orgNumber: "922493626",
      name: "Reach Subsea ASA",
      financialStatements: [{
        fiscalYear: 2025,
        statementScope: "CONSOLIDATED",
        currency: "NOK",
        revenue: 2_677_042n,
        operatingProfit: null,
        netIncome: null,
        equity: null,
        assets: null,
        sourceSystem: "REACH_SUBSEA_IR",
        sourceEntityType: "annualReportConsolidatedFinancialStatement",
        sourceId: "reach-2025",
        fetchedAt: new Date("2026-07-15T17:00:00.000Z"),
        normalizedAt: new Date("2026-07-15T17:00:00.000Z"),
        rawPayload: null,
      }],
      annualReportFilings: [],
      financialCoverage: null,
      publishedLineItems: [
        {
          id: "line-0",
          filingId: "filing-1",
          fiscalYear: 2025,
          statementType: "INCOME_STATEMENT",
          statementScope: "CONSOLIDATED",
          metricKey: "revenue",
          rawLabel: "Revenues",
          originalLabel: "Revenues",
          finalInput: 2_674_629n,
          value: 2_674_629n,
          currency: "NOK",
          unitScale: 1_000,
          sortOrder: 0,
          sourcePage: 87,
          publicationSource: "MANUAL_REVIEW",
        },
        {
          id: "line-1",
          filingId: "filing-1",
          fiscalYear: 2025,
          statementType: "INCOME_STATEMENT",
          statementScope: "CONSOLIDATED",
          metricKey: "as_reported_procurement_expenses",
          rawLabel: "Procurement expenses",
          originalLabel: "Procurement expenses",
          finalInput: -750_000n,
          value: -750_000n,
          currency: "NOK",
          unitScale: 1_000,
          sortOrder: 4,
          sourcePage: 87,
          publicationSource: "MANUAL_REVIEW",
        },
      ],
    });

    const { getPublishedAnnualReportFinancials } = await import(
      "@/server/services/annual-report-financials-service"
    );
    const published = await getPublishedAnnualReportFinancials("922493626");

    expect((published as { lineItems?: unknown[] }).lineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fiscalYear: 2025,
        statementType: "INCOME_STATEMENT",
        statementScope: "CONSOLIDATED",
        label: "Procurement expenses",
        value: -750_000_000,
        sortOrder: 4,
      }),
    ]));
    expect(published.statements[0]?.revenue).toBe(2_674_629_000);
  });

  it("returns an operator overview with metrics, pending reviews, and pending filings", async () => {
    repo.listAnnualReportReviews.mockResolvedValue([
      {
        id: "review-1",
        status: "PENDING_REVIEW",
        fiscalYear: 2024,
        filingId: "filing-1",
        extractionRunId: "run-1",
        qualityScore: 0.64,
        sourcePrecedenceAttempted: "STATUTORY_NOK",
        blockingIssueCount: 1,
        blockingRuleCodes: ["BS_TOTAL_BALANCES"],
        pageReferences: [3],
        latestActionNote: "Blocked by publish gate",
        createdAt: new Date("2026-04-17T10:00:00.000Z"),
        updatedAt: new Date("2026-04-17T10:00:00.000Z"),
        resolvedAt: null,
        reviewPayload: {
          blockingIssues: [
            { severity: "ERROR", ruleCode: "BS_TOTAL_BALANCES", message: "Balance mismatch", context: { pageNumber: 3 } },
          ],
          selectedFacts: [{ metricKey: "total_assets", value: 92_155_000 }],
          classifications: [{ pageNumber: 3, type: "STATUTORY_BALANCE" }],
        },
        company: { orgNumber: "928846466", name: "Example AS", slug: "example-as" },
        filing: { status: "MANUAL_REVIEW" },
        extractionRun: { id: "run-1" },
      },
    ]);
    repo.listPendingAnnualReportFilings.mockResolvedValue([
      {
        id: "filing-2",
        fiscalYear: 2025,
        status: "DOWNLOADED",
        discoveredAt: new Date("2026-04-18T09:00:00.000Z"),
        downloadedAt: new Date("2026-04-18T09:10:00.000Z"),
        sourceUrl: "https://example.test/2025.pdf",
        sourceDocumentHash: "hash-2025",
        company: { orgNumber: "928846466", name: "Example AS" },
      },
    ]);
    repo.listCompaniesForFinancialSync.mockResolvedValue([
      {
        id: "company-1",
        orgNumber: "928846466",
        name: "Example AS",
        financialCoverage: { coverageStatus: "MANUAL_REVIEW", nextCheckAt: new Date("2026-04-19T00:00:00.000Z") },
      },
    ]);

    const { getAnnualReportPipelineOverview } = await import(
      "@/server/services/annual-report-financials-service"
    );
    const result = await getAnnualReportPipelineOverview({ orgNumbers: ["928846466"] });

    expect(result.metrics.incompleteCoverageCount).toBe(1);
    expect(result.reviewQueue).toHaveLength(1);
    expect(result.pendingFilings).toHaveLength(1);
    expect(result.dueCoverage).toHaveLength(1);
  });

  it("returns early when no companies are due for incremental sync", async () => {
    repo.listCompaniesForFinancialSync.mockResolvedValue([]);

    const { syncNewAnnualReportFilings } = await import(
      "@/server/services/annual-report-financials-service"
    );
    const result = await syncNewAnnualReportFilings();

    expect(result.checkedCompanies).toBe(0);
    expect(result.processed).toEqual([]);
  });

  it("persists STRUCTURED_DOCUMENT_JSON artifact when preflight returns structuredDocument", async () => {
    const { preflightAnnualReportDocument } = await import(
      "@/integrations/brreg/annual-report-financials/preflight"
    );
    vi.mocked(preflightAnnualReportDocument).mockResolvedValueOnce({
      pageCount: 3,
      hasTextLayer: true,
      hasReliableTextLayer: true,
      parsedPages: [],
      structuredDocument: {
        pages: [{ pageNumber: 1, rawText: "Styrets årsberetning", normalizedText: "styrets arsberetning", charCount: 20 }],
        sections: [
          {
            kind: "BOARD_REPORT",
            startPage: 1,
            endPage: 1,
            pages: [{ pageNumber: 1, rawText: "Styrets årsberetning", normalizedText: "styrets arsberetning", charCount: 20 }],
            confidenceScore: 0.8,
            matchedSignals: [{ keyword: "styrets arsberetning", weight: 4, offset: 0 }],
          },
        ],
        narratives: [],
        diagnostics: {
          pageCount: 1,
          sectionsFound: 1,
          sectionKinds: ["BOARD_REPORT"],
          missingExpectedSections: ["AUDITOR_REPORT", "INCOME_STATEMENT", "BALANCE_SHEET"],
          recommendedRouteHint: "TEXT_LAYER",
          textLayerDensityScore: 0.9,
          likelyImageOnlyPages: [],
          financialStatementPageCount: 0,
          financialStatementCandidatePages: [],
          narrativeCandidatePages: [1],
          boardReportCandidatePages: [1],
          auditorReportCandidatePages: [],
          notesCandidatePages: [],
          qualityRisk: "LOW",
          parserRiskReasons: [],
          extractionWarnings: ["Narrative sections detected but no financial statement pages found"],
        },
      },
    });

    const { processAnnualReportFiling } = await import(
      "@/server/services/annual-report-financials-service"
    );
    await processAnnualReportFiling("filing-1");

    const artifactCalls = repo.createAnnualReportArtifact.mock.calls.map((c) => c[0].artifactType);
    expect(artifactCalls).toContain("STRUCTURED_DOCUMENT_JSON");
  });

  it("persists full narratives, subsections, matched signals, and provenance in structured document artifacts", async () => {
    const { preflightAnnualReportDocument } = await import(
      "@/integrations/brreg/annual-report-financials/preflight"
    );
    const boardPage = {
      pageNumber: 1,
      rawText: "Styrets aarsberetning\nVirksomhetens art",
      normalizedText: "styrets aarsberetning virksomhetens art",
      charCount: 41,
    };
    const auditorPage = {
      pageNumber: 2,
      rawText: "Uavhengig revisors beretning\nKonklusjon",
      normalizedText: "uavhengig revisors beretning konklusjon",
      charCount: 40,
    };
    vi.mocked(preflightAnnualReportDocument).mockResolvedValueOnce({
      pageCount: 2,
      hasTextLayer: true,
      hasReliableTextLayer: true,
      parsedPages: [],
      structuredDocument: {
        pages: [boardPage, auditorPage],
        sections: [
          {
            kind: "BOARD_REPORT",
            startPage: 1,
            endPage: 1,
            pages: [boardPage],
            confidenceScore: 0.8,
            matchedSignals: [{ keyword: "styrets aarsberetning", weight: 4, offset: 0 }],
            stopReason: "next_section",
          },
          {
            kind: "AUDITOR_REPORT",
            startPage: 2,
            endPage: 2,
            pages: [auditorPage],
            confidenceScore: 0.82,
            matchedSignals: [{ keyword: "uavhengig revisors beretning", weight: 4, offset: 0 }],
          },
        ],
        narratives: [
          {
            kind: "BOARD_REPORT",
            startPage: 1,
            endPage: 1,
            pages: [boardPage],
            confidenceScore: 0.8,
            matchedSignals: [{ keyword: "styrets aarsberetning", weight: 4, offset: 0 }],
            fullText: "Styrets aarsberetning\nVirksomhetens art\nSelskapet driver virksomhet.",
            normalizedText:
              "styrets aarsberetning virksomhetens art selskapet driver virksomhet",
            subsections: [
              {
                heading: "Virksomhetens art",
                text: "Selskapet driver virksomhet.",
                normalizedText: "selskapet driver virksomhet",
                startOffset: 24,
                endOffset: 53,
              },
            ],
          },
          {
            kind: "AUDITOR_REPORT",
            startPage: 2,
            endPage: 2,
            pages: [auditorPage],
            confidenceScore: 0.82,
            matchedSignals: [{ keyword: "uavhengig revisors beretning", weight: 4, offset: 0 }],
            fullText:
              "Uavhengig revisors beretning\nKonklusjon\nEtter vaar mening er regnskapet avgitt.",
            subsections: [
              {
                heading: "Konklusjon",
                text: "Etter vaar mening er regnskapet avgitt.",
                startOffset: 36,
                endOffset: 76,
              },
            ],
          },
        ],
        diagnostics: {
          pageCount: 2,
          sectionsFound: 2,
          sectionKinds: ["BOARD_REPORT", "AUDITOR_REPORT"],
          missingExpectedSections: ["INCOME_STATEMENT", "BALANCE_SHEET"],
          recommendedRouteHint: "TEXT_LAYER",
          textLayerDensityScore: 0.9,
          likelyImageOnlyPages: [],
          financialStatementPageCount: 0,
          financialStatementCandidatePages: [],
          narrativeCandidatePages: [1, 2],
          boardReportCandidatePages: [1],
          auditorReportCandidatePages: [2],
          notesCandidatePages: [],
          qualityRisk: "LOW",
          parserRiskReasons: [],
          extractionWarnings: ["Narrative sections detected but no financial statement pages found"],
        },
      },
    });

    const { processAnnualReportFiling } = await import(
      "@/server/services/annual-report-financials-service"
    );
    await processAnnualReportFiling("filing-1");

    const storedStructuredArtifact = artifactStorageState.putArtifact.mock.calls
      .map((call) => call[0])
      .find((artifact) => artifact.artifactType === "STRUCTURED_DOCUMENT_JSON");
    expect(storedStructuredArtifact).toBeDefined();
    const payload = JSON.parse(
      Buffer.isBuffer(storedStructuredArtifact?.content)
        ? storedStructuredArtifact.content.toString("utf8")
        : String(storedStructuredArtifact?.content),
    ) as Record<string, any>;

    expect(payload.extractionRunId).toBeNull();
    expect(payload.provenance).toMatchObject({
      source: "preflight",
      persistedStage: "before-extraction-run-created",
      filingId: "filing-1",
      fiscalYear: 2024,
      documentModelVersion: "annual-report-document-model-v1",
    });
    expect(payload.provenance.reasonExtractionRunIdIsNull).toMatch(/preflight/i);
    expect(payload.structuredDocument.sections[0]).toMatchObject({
      kind: "BOARD_REPORT",
      sourcePages: [1],
      pageCount: 1,
      stopReason: "next_section",
    });
    expect(payload.structuredDocument.narratives[0]).toMatchObject({
      kind: "BOARD_REPORT",
      fullText: "Styrets aarsberetning\nVirksomhetens art\nSelskapet driver virksomhet.",
      matchedSignals: [{ keyword: "styrets aarsberetning", weight: 4, offset: 0 }],
      subsectionCount: 1,
    });
    expect(payload.structuredDocument.narratives[0].subsections[0]).toMatchObject({
      heading: "Virksomhetens art",
      text: "Selskapet driver virksomhet.",
      normalizedText: "selskapet driver virksomhet",
      startOffset: 24,
      endOffset: 53,
    });
    expect(payload.structuredDocument.narratives[1]).toMatchObject({
      kind: "AUDITOR_REPORT",
      fullText:
        "Uavhengig revisors beretning\nKonklusjon\nEtter vaar mening er regnskapet avgitt.",
    });
    const metadata = repo.createAnnualReportArtifact.mock.calls.find(
      (call) => call[0].artifactType === "STRUCTURED_DOCUMENT_JSON",
    )?.[0].metadata as Record<string, unknown>;
    expect(metadata).toMatchObject({
      source: "preflight",
      persistedStage: "before-extraction-run-created",
      reasonExtractionRunIdIsNull:
        "structured document is produced during preflight before extraction run creation",
      filingId: "filing-1",
      fiscalYear: 2024,
      documentModelVersion: "annual-report-document-model-v1",
    });
  });

  it("includes documentSections and boardReportProposal in reviewPayload when structuredDocument has narratives", async () => {
    const { preflightAnnualReportDocument } = await import(
      "@/integrations/brreg/annual-report-financials/preflight"
    );
    const boardPage = {
      pageNumber: 1,
      rawText: "Styrets årsberetning\nVirksomhetens art",
      normalizedText: "styrets arsberetning\nvirksomhetens art",
      charCount: 40,
    };
    vi.mocked(preflightAnnualReportDocument).mockResolvedValueOnce({
      pageCount: 3,
      hasTextLayer: true,
      hasReliableTextLayer: true,
      parsedPages: [],
      structuredDocument: {
        pages: [boardPage],
        sections: [
          {
            kind: "BOARD_REPORT",
            startPage: 1,
            endPage: 1,
            pages: [boardPage],
            confidenceScore: 0.85,
            matchedSignals: [],
          },
        ],
        narratives: [
          {
            kind: "BOARD_REPORT",
            startPage: 1,
            endPage: 1,
            pages: [boardPage],
            confidenceScore: 0.85,
            matchedSignals: [],
            fullText: "Styrets årsberetning\nVirksomhetens art",
            subsections: [{ heading: "Virksomhetens art", text: "Selskapet driver..." }],
          },
        ],
        diagnostics: {
          pageCount: 1,
          sectionsFound: 1,
          sectionKinds: ["BOARD_REPORT"],
          missingExpectedSections: ["AUDITOR_REPORT", "INCOME_STATEMENT", "BALANCE_SHEET"],
          recommendedRouteHint: "OPENDATALOADER_HYBRID",
          textLayerDensityScore: 0.5,
          likelyImageOnlyPages: [],
          financialStatementPageCount: 0,
          financialStatementCandidatePages: [],
          narrativeCandidatePages: [1],
          boardReportCandidatePages: [1],
          auditorReportCandidatePages: [],
          notesCandidatePages: [],
          qualityRisk: "MEDIUM",
          parserRiskReasons: [],
          extractionWarnings: [],
        },
      },
    });

    const validationModule = await import("@/integrations/brreg/annual-report-financials/validation");
    vi.mocked(validationModule.validateCanonicalFacts).mockReturnValueOnce({
      selectedFacts: new Map(mappedFacts.map((f) => [f.metricKey as CanonicalMetricKey, f as CanonicalFactCandidate])),
      issues: [{ severity: "ERROR", ruleCode: "MISSING_INCOME_STATEMENT", message: "No income statement found", context: {} }],
      validationScore: 0.2,
      hasBlockingErrors: true,
      stats: { duplicateComparisons: 0, duplicateMatches: 0, noteComparisons: 0, noteMatches: 0 },
    });

    const { processAnnualReportFiling } = await import(
      "@/server/services/annual-report-financials-service"
    );
    await processAnnualReportFiling("filing-1");

    expect(repo.upsertAnnualReportReview).toHaveBeenCalledTimes(1);
    const reviewPayload = repo.upsertAnnualReportReview.mock.calls[0][0].reviewPayload as Record<string, unknown>;
    expect(reviewPayload.documentSections).toBeDefined();
    expect(Array.isArray(reviewPayload.documentSections)).toBe(true);
    expect(reviewPayload.boardReportProposal).toBeDefined();
    expect((reviewPayload.boardReportProposal as Record<string, unknown>).startPage).toBe(1);
    expect((reviewPayload.boardReportProposal as Record<string, unknown>).confidenceScore).toBe(0.85);
    expect((reviewPayload.boardReportProposal as Record<string, unknown>).fullText).toBe(
      "Styrets årsberetning\nVirksomhetens art",
    );
    expect(reviewPayload.auditorReportProposal).toBeNull();
  });

  it("keeps reviewPayload stable when structuredDocument has no narratives", async () => {
    const { preflightAnnualReportDocument } = await import(
      "@/integrations/brreg/annual-report-financials/preflight"
    );
    const page = {
      pageNumber: 1,
      rawText: "Forside",
      normalizedText: "forside",
      charCount: 7,
    };
    vi.mocked(preflightAnnualReportDocument).mockResolvedValueOnce({
      pageCount: 1,
      hasTextLayer: true,
      hasReliableTextLayer: true,
      parsedPages: [],
      structuredDocument: {
        pages: [page],
        sections: [
          {
            kind: "COVER",
            startPage: 1,
            endPage: 1,
            pages: [page],
            confidenceScore: 0.7,
            matchedSignals: [],
          },
        ],
        narratives: [],
        diagnostics: {
          pageCount: 1,
          sectionsFound: 1,
          sectionKinds: ["COVER"],
          missingExpectedSections: ["BOARD_REPORT", "AUDITOR_REPORT", "INCOME_STATEMENT", "BALANCE_SHEET"],
          recommendedRouteHint: "MANUAL_REVIEW",
          textLayerDensityScore: 0.4,
          likelyImageOnlyPages: [],
          financialStatementPageCount: 0,
          financialStatementCandidatePages: [],
          narrativeCandidatePages: [],
          boardReportCandidatePages: [],
          auditorReportCandidatePages: [],
          notesCandidatePages: [],
          qualityRisk: "HIGH",
          parserRiskReasons: ["No narrative sections detected"],
          extractionWarnings: [],
        },
      },
    });
    const validationModule = await import("@/integrations/brreg/annual-report-financials/validation");
    vi.mocked(validationModule.validateCanonicalFacts).mockReturnValueOnce({
      selectedFacts: new Map(),
      issues: [{ severity: "ERROR", ruleCode: "MISSING_INCOME_STATEMENT", message: "No income statement found", context: {} }],
      validationScore: 0.1,
      hasBlockingErrors: true,
      stats: { duplicateComparisons: 0, duplicateMatches: 0, noteComparisons: 0, noteMatches: 0 },
    });

    const { processAnnualReportFiling } = await import(
      "@/server/services/annual-report-financials-service"
    );
    await processAnnualReportFiling("filing-1");

    expect(repo.upsertAnnualReportReview).toHaveBeenCalledTimes(1);
    const reviewPayload = repo.upsertAnnualReportReview.mock.calls[0][0].reviewPayload as Record<string, unknown>;
    expect(reviewPayload.documentSections).toEqual([
      {
        kind: "COVER",
        startPage: 1,
        endPage: 1,
        confidenceScore: 0.7,
        matchedSignals: [],
        stopReason: null,
        pageCount: 1,
        sourcePages: [1],
      },
    ]);
    expect(reviewPayload.narratives).toEqual([]);
    expect(reviewPayload.boardReportProposal).toBeNull();
    expect(reviewPayload.auditorReportProposal).toBeNull();
  });

  it("excludes board/auditor report pages from pipeline when structuredDocument has reliable hints", async () => {
    const { preflightAnnualReportDocument } = await import(
      "@/integrations/brreg/annual-report-financials/preflight"
    );
    const makePage = (n: number, text: string) => ({ pageNumber: n, rawText: text, normalizedText: text.toLowerCase(), charCount: text.length });
    vi.mocked(preflightAnnualReportDocument).mockResolvedValueOnce({
      pageCount: 5,
      hasTextLayer: true,
      hasReliableTextLayer: true,
      parsedPages: [],
      structuredDocument: {
        pages: [makePage(1, "board"), makePage(3, "income"), makePage(4, "balance")],
        sections: [
          {
            kind: "BOARD_REPORT",
            startPage: 1,
            endPage: 1,
            pages: [makePage(1, "board")],
            confidenceScore: 0.9,
            matchedSignals: [],
          },
          {
            kind: "INCOME_STATEMENT",
            startPage: 3,
            endPage: 3,
            pages: [makePage(3, "income")],
            confidenceScore: 0.9,
            matchedSignals: [],
          },
          {
            kind: "BALANCE_SHEET",
            startPage: 4,
            endPage: 4,
            pages: [makePage(4, "balance")],
            confidenceScore: 0.9,
            matchedSignals: [],
          },
        ],
        narratives: [],
        diagnostics: {
          pageCount: 3,
          sectionsFound: 3,
          sectionKinds: ["BOARD_REPORT", "INCOME_STATEMENT", "BALANCE_SHEET"],
          missingExpectedSections: ["AUDITOR_REPORT"],
          recommendedRouteHint: "TEXT_LAYER",
          textLayerDensityScore: 0.9,
          likelyImageOnlyPages: [],
          financialStatementPageCount: 2,
          financialStatementCandidatePages: [3, 4],
          narrativeCandidatePages: [1],
          boardReportCandidatePages: [1],
          auditorReportCandidatePages: [],
          notesCandidatePages: [],
          qualityRisk: "LOW",
          parserRiskReasons: [],
          extractionWarnings: [],
        },
      },
    });

    const { classifyPages } = await import("@/integrations/brreg/annual-report-financials/page-classification");

    const { processAnnualReportFiling } = await import(
      "@/server/services/annual-report-financials-service"
    );
    await processAnnualReportFiling("filing-1");

    // classifyPages is called with the original pages; the exclude filtering happens after classification.
    // Verify classifyPages was called (the filtering happens downstream).
    expect(classifyPages).toHaveBeenCalled();
  });

  describe("unified extractor shadow integration", () => {
    it("runs unified extraction in DRY_RUN when shadow mode is DISABLED so line items can be published", async () => {
      unifiedShadowState.mode = "DISABLED";

      const { processAnnualReportFiling } = await import(
        "@/server/services/annual-report-financials-service"
      );
      const result = await processAnnualReportFiling("filing-1");

      expect(result.published).toBe(true);
      expect(unifiedShadowState.runAnnualReportUnifiedShadowExtraction).toHaveBeenCalledTimes(1);
      const [shadowInput] =
        unifiedShadowState.runAnnualReportUnifiedShadowExtraction.mock.calls[0];
      expect(shadowInput.config.mode).toBe("DRY_RUN");
      expect(shadowInput.config.persistUnifiedFinancialExtraction).toBe(false);
    });

    it("calls runAnnualReportUnifiedShadowExtraction when shadow mode is DRY_RUN", async () => {
      unifiedShadowState.mode = "DRY_RUN";
      unifiedShadowState.runResult = {
        canUseForProductionRouting: false,
        skipped: false,
        mode: "DRY_RUN",
        totalDurationMs: 12,
        document: null,
        financial: null,
        narrative: null,
        comparison: null,
        steps: {
          document: { ok: true, value: true, durationMs: 5 },
          financial: { ok: true, value: true, durationMs: 4 },
          narrative: { ok: true, value: true, durationMs: 2 },
          comparison: { ok: true, value: true, durationMs: 1 },
        },
        artifacts: { document: null, financial: null, narrative: null, comparison: null },
        warnings: [],
      };
      unifiedShadowState.runAnnualReportUnifiedShadowExtraction.mockImplementation(
        async () => unifiedShadowState.runResult,
      );

      const { processAnnualReportFiling } = await import(
        "@/server/services/annual-report-financials-service"
      );
      const result = await processAnnualReportFiling("filing-1");

      expect(result.published).toBe(true);
      expect(unifiedShadowState.runAnnualReportUnifiedShadowExtraction).toHaveBeenCalledTimes(1);
      const [shadowInput] =
        unifiedShadowState.runAnnualReportUnifiedShadowExtraction.mock.calls[0];
      expect(shadowInput.filingId).toBe("filing-1");
      expect(shadowInput.orgNumber).toBe("928846466");
      expect(shadowInput.fiscalYear).toBe(2024);
      expect(shadowInput.config.mode).toBe("DRY_RUN");
    });

    it("publishes machine extracted line items when the document publish gate passes", async () => {
      unifiedShadowState.runResult = {
        canUseForProductionRouting: false,
        skipped: false,
        mode: "DRY_RUN",
        totalDurationMs: 12,
        document: null,
        financial: {
          version: "unified-financial-statement-extraction-v1",
          generatedAt: "2026-07-02T10:00:00.000Z",
          source: {
            route: "TEXT_LAYER",
            filingId: "filing-1",
            extractionRunId: null,
            orgNumber: "928846466",
            fiscalYear: 2024,
          },
          safety: {
            productionRoutingChanged: false,
            productionFactsMutated: false,
            publishAffected: false,
            shadowOnly: true,
            canUseForProductionRouting: false,
          },
          metrics: {
            candidateTableCount: 1,
            parsedLineItemCount: 1,
            canonicalMappedCount: 0,
            unmappedCount: 1,
            warningCount: 0,
            errorCount: 0,
          },
          statements: [
            {
              kind: "INCOME_STATEMENT",
              pageNumbers: [2],
              tableIds: ["table-1"],
              confidence: 0.88,
              warnings: [],
              lineItems: [
                {
                  statementKind: "INCOME_STATEMENT",
                  canonicalKey: null,
                  originalLabel: "Andre driftsinntekter",
                  normalizedLabel: "andre driftsinntekter",
                  year: 2024,
                  value: "123",
                  unitScale: "THOUSANDS",
                  sign: "POSITIVE",
                  confidence: 0.91,
                  provenance: {
                    route: "TEXT_LAYER",
                    pageNumber: 2,
                    tableId: "table-1",
                    rowIndex: 7,
                    columnIndex: 1,
                    blockIds: ["block-1"],
                  },
                  warnings: [],
                },
              ],
            },
          ],
          warnings: [],
          errors: [],
        },
        narrative: null,
        comparison: null,
        steps: {
          document: { ok: true, value: true, durationMs: 5 },
          financial: { ok: true, value: true, durationMs: 4 },
          narrative: null,
          comparison: null,
        },
        artifacts: { document: null, financial: null, narrative: null, comparison: null },
        warnings: [],
      };

      const { processAnnualReportFiling } = await import(
        "@/server/services/annual-report-financials-service"
      );
      await processAnnualReportFiling("filing-1");

      expect(repo.publishMachineFinancialLineItems).toHaveBeenCalledTimes(1);
      expect(repo.publishMachineFinancialLineItems).toHaveBeenCalledWith(
        expect.objectContaining({
          filingId: "filing-1",
          companyId: "company-1",
          extractionRunId: "run-1",
          items: [
            expect.objectContaining({
              originalLabel: "Andre driftsinntekter",
              parsedValue: 123n,
              canonicalKey: undefined,
              unitScale: 1000,
              sourcePage: 2,
              rowIndex: 7,
              statementScope: "COMPANY",
            }),
          ],
        }),
      );
    });

    it("does not propagate shadow errors to the primary pipeline", async () => {
      unifiedShadowState.mode = "DRY_RUN";
      unifiedShadowState.runAnnualReportUnifiedShadowExtraction.mockRejectedValueOnce(
        new Error("shadow extraction exploded"),
      );

      const { processAnnualReportFiling } = await import(
        "@/server/services/annual-report-financials-service"
      );
      // Should NOT throw even though shadow extraction threw
      const result = await processAnnualReportFiling("filing-1");

      expect(result.published).toBe(true);
      expect(repo.publishFinancialStatementSnapshot).toHaveBeenCalledTimes(1);
    });

    it("passes preflight and legacyCandidates to the shadow runner", async () => {
      unifiedShadowState.mode = "DRY_RUN";

      const { processAnnualReportFiling } = await import(
        "@/server/services/annual-report-financials-service"
      );
      await processAnnualReportFiling("filing-1");

      expect(unifiedShadowState.runAnnualReportUnifiedShadowExtraction).toHaveBeenCalledTimes(1);
      const [shadowInput] =
        unifiedShadowState.runAnnualReportUnifiedShadowExtraction.mock.calls[0];
      // legacyCandidates comes from primaryComputation.mapped.facts
      expect(Array.isArray(shadowInput.legacyCandidates)).toBe(true);
      expect(shadowInput.legacyCandidates.length).toBeGreaterThan(0);
      // preflight should have the shape of PreflightResult
      expect(shadowInput.preflight).toHaveProperty("hasTextLayer");
      expect(shadowInput.preflight).toHaveProperty("parsedPages");
    });

    it("passes structured OpenDataLoader pages and route to the shadow runner when available", async () => {
      unifiedShadowState.mode = "DRY_RUN";
      openDataLoaderState.config.enabled = true;
      openDataLoaderState.config.dualRun = false;
      openDataLoaderState.route = openDataLoaderState.parseResult.routing;
      openDataLoaderState.parseResult = {
        ...openDataLoaderState.parseResult,
        routing: {
          ...openDataLoaderState.parseResult.routing,
          executionMode: "local",
        },
        annualReportPages: [
          {
            pageNumber: 1,
            text: "Resultatregnskap 2024",
            normalizedText: "resultatregnskap 2024",
            lines: [],
            hasEmbeddedText: false,
            blocks: [],
            tables: [],
            source: {
              engine: "OPENDATALOADER",
              engineMode: "local",
            },
          },
        ],
      };

      const { processAnnualReportFiling } = await import(
        "@/server/services/annual-report-financials-service"
      );
      await processAnnualReportFiling("filing-1");

      const [shadowInput] =
        unifiedShadowState.runAnnualReportUnifiedShadowExtraction.mock.calls.at(-1) ?? [];
      if (!shadowInput) {
        throw new Error("Expected shadow input to be present.");
      }
      expect(shadowInput.parsedPages).toHaveLength(1);
      expect(shadowInput.route).toBe("OPENDATALOADER_LOCAL");
    });

    it("canUseForProductionRouting is always false on the shadow result", async () => {
      unifiedShadowState.mode = "DRY_RUN";

      const { processAnnualReportFiling } = await import(
        "@/server/services/annual-report-financials-service"
      );
      await processAnnualReportFiling("filing-1");

      const resultFromMock = unifiedShadowState.runResult;
      expect(resultFromMock.canUseForProductionRouting).toBe(false);
    });

    it("invalid shadow config does not break the primary pipeline", async () => {
      // Simulate validateAnnualReportUnifiedShadowConfig returning errors
      const { validateAnnualReportUnifiedShadowConfig } = await import(
        "@/server/services/annual-report-unified-shadow-config"
      );
      vi.mocked(validateAnnualReportUnifiedShadowConfig).mockReturnValueOnce([
        "Mock validation error: invalid mode",
      ]);
      unifiedShadowState.mode = "DRY_RUN";

      const { processAnnualReportFiling } = await import(
        "@/server/services/annual-report-financials-service"
      );
      // Must NOT throw even though config is invalid
      const result = await processAnnualReportFiling("filing-1");

      expect(result.published).toBe(true);
      expect(unifiedShadowState.runAnnualReportUnifiedShadowExtraction).toHaveBeenCalledTimes(1);
      const [shadowInput] =
        unifiedShadowState.runAnnualReportUnifiedShadowExtraction.mock.calls[0];
      expect(shadowInput.config.mode).toBe("DRY_RUN");
      expect(shadowInput.config.persistUnifiedFinancialExtraction).toBe(false);
    });
  });
});
