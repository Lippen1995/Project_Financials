import { beforeEach, describe, expect, it, vi } from "vitest";

import { CanonicalFactCandidate } from "@/integrations/brreg/annual-report-financials/types";
import { CanonicalMetricKey } from "@/integrations/brreg/annual-report-financials/taxonomy";
import {
  OpenDataLoaderParseResult,
  OpenDataLoaderResolvedConfig,
  OpenDataLoaderRouteDecision,
} from "@/server/document-understanding/opendataloader-types";

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
    async putArtifact(input: { artifactType: string; filename: string }) {
      return {
        storageKey: `${input.artifactType}/${input.filename}`,
        absolutePath: `/tmp/${input.filename}`,
      };
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

describe("annual-report-financials-service", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(repo).forEach((mocked) => mocked.mockReset());
    providerState.downloadAnnualReportPdf.mockClear();
    openDataLoaderState.parseAnnualReportPdfWithOpenDataLoader.mockClear();
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

  it("populates the manual review queue instead of publishing invalid filings", async () => {
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

    expect(result.published).toBe(false);
    expect(repo.publishFinancialStatementSnapshot).not.toHaveBeenCalled();
    expect(repo.upsertAnnualReportReview).toHaveBeenCalledTimes(1);
    expect(repo.upsertAnnualReportReview.mock.calls[0][0]).toMatchObject({
      filingId: "filing-1",
      extractionRunId: "run-1",
      status: "PENDING_REVIEW",
    });
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
});
