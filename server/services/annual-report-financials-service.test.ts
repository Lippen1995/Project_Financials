import { beforeEach, describe, expect, it, vi } from "vitest";
import { CanonicalFactCandidate } from "@/integrations/brreg/annual-report-financials/types";
import { CanonicalMetricKey } from "@/integrations/brreg/annual-report-financials/taxonomy";

const providerState = {
  filings: [
    {
      fiscalYear: 2024,
      sourceSystem: "BRREG",
      sourceUrl: "https://example.test/2024.pdf",
      sourceDocumentType: "ANNUAL_REPORT_PDF",
      sourceIdempotencyKey: "BRREG::928846466::2024::annual-report",
      discoveredAt: new Date("2026-04-17T08:00:00.000Z"),
      document: null,
    },
  ],
  pdf: {
    buffer: Buffer.from("fake-pdf"),
    mimeType: "application/pdf",
  },
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
  listCompaniesForFinancialSync: vi.fn(),
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
  listPendingAnnualReportFilings: vi.fn(),
  getPublishedFinancialsForCompany: vi.fn(),
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
      declaredYears: [2024, 2023],
      reasons: ["Resultatregnskap"],
    },
    {
      pageNumber: 3,
      type: "STATUTORY_BALANCE",
      confidence: 0.95,
      unitScale: 1,
      declaredYears: [2024, 2023],
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
];

vi.mock("@/integrations/brreg/annual-report-financials/canonical-mapping", () => ({
  mapRowsToCanonicalFacts: vi.fn(() => ({
    facts: mappedFacts,
    issues: [],
  })),
  chooseCanonicalFacts: vi.fn((facts) => new Map(facts.map((fact: typeof mappedFacts[number]) => [fact.metricKey, fact]))),
}));

vi.mock("@/integrations/brreg/annual-report-financials/validation", () => ({
  validateCanonicalFacts: vi.fn(() => ({
    selectedFacts: new Map(mappedFacts.map((fact) => [fact.metricKey, fact])),
    issues: [],
    validationScore: 0.98,
    hasBlockingErrors: false,
  })),
}));

vi.mock("@/integrations/brreg/annual-report-financials/normalized-payload", () => ({
  buildNormalizedFinancialPayload: vi.fn(() => ({
    regnskapsperiode: { tilDato: "2024-12-31" },
    resultatregnskapResultat: { aarsresultat: 18_221_000 },
    eiendeler: { sumEiendeler: 92_155_000 },
    egenkapitalGjeld: { egenkapital: { sumEgenkapital: 36_372_000 }, sumEgenkapitalGjeld: 92_155_000 },
  })),
}));

describe("annual-report-financials-service", () => {
  beforeEach(() => {
    Object.values(repo).forEach((mocked) => mocked.mockReset());
    providerState.downloadAnnualReportPdf.mockClear();
    repo.findCompanyByOrgNumber.mockResolvedValue({
      id: "company-1",
      orgNumber: "928846466",
      name: "Example AS",
      slug: "928846466-example-as",
    });
    repo.getAnnualReportFilingWithArtifacts.mockResolvedValue({
      id: "filing-1",
      company: {
        id: "company-1",
        orgNumber: "928846466",
        name: "Example AS",
      },
      fiscalYear: 2024,
      sourceUrl: "https://example.test/2024.pdf",
      sourceDocumentHash: null,
      artifacts: [],
    });
    repo.createFinancialExtractionRun.mockResolvedValue({ id: "run-1" });
    repo.createAnnualReportArtifact.mockResolvedValue({ id: "artifact-1" });
    repo.updateAnnualReportFiling.mockResolvedValue({});
    repo.createFinancialFacts.mockResolvedValue(undefined);
    repo.createFinancialValidationIssues.mockResolvedValue(undefined);
    repo.completeFinancialExtractionRun.mockResolvedValue(undefined);
    repo.publishFinancialStatementSnapshot.mockResolvedValue(undefined);
    repo.upsertCompanyFinancialCoverage.mockResolvedValue(undefined);
    repo.upsertAnnualReportFilingDiscovery.mockResolvedValue(undefined);
  });

  it("discovers filings and updates company coverage", async () => {
    const { discoverAnnualReportFilingsForCompany } = await import(
      "@/server/services/annual-report-financials-service"
    );

    const result = await discoverAnnualReportFilingsForCompany("928846466");

    expect(result.discoveredFilings).toBe(1);
    expect(repo.upsertAnnualReportFilingDiscovery).toHaveBeenCalledTimes(1);
    expect(repo.upsertCompanyFinancialCoverage).toHaveBeenCalled();
  });

  it("publishes a validated snapshot when confidence and equations pass", async () => {
    const { processAnnualReportFiling } = await import("@/server/services/annual-report-financials-service");

    const result = await processAnnualReportFiling("filing-1");

    expect(result.published).toBe(true);
    expect(repo.createFinancialFacts).toHaveBeenCalled();
    expect(repo.publishFinancialStatementSnapshot).toHaveBeenCalledTimes(1);
  });

  it("reuses the stored pdf artifact instead of redownloading it", async () => {
    repo.getAnnualReportFilingWithArtifacts.mockResolvedValueOnce({
      id: "filing-1",
      company: {
        id: "company-1",
        orgNumber: "928846466",
        name: "Example AS",
      },
      fiscalYear: 2024,
      sourceUrl: "https://example.test/2024.pdf",
      sourceDocumentHash: "existing-hash",
      artifacts: [
        {
          id: "artifact-1",
          artifactType: "PDF",
          storageKey: "PDF/928846466-2024.pdf",
        },
      ],
    });

    const { processAnnualReportFiling } = await import("@/server/services/annual-report-financials-service");

    await processAnnualReportFiling("filing-1");

    expect(providerState.downloadAnnualReportPdf).not.toHaveBeenCalled();
  });

  it("does not publish when validation leaves a filing in manual review", async () => {
    const validationModule = await import("@/integrations/brreg/annual-report-financials/validation");
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
        },
      ],
      validationScore: 0.4,
      hasBlockingErrors: true,
    });

    const { processAnnualReportFiling } = await import("@/server/services/annual-report-financials-service");
    const result = await processAnnualReportFiling("filing-1");

    expect(result.published).toBe(false);
    expect(repo.publishFinancialStatementSnapshot).not.toHaveBeenCalled();
    expect(repo.updateAnnualReportFiling).toHaveBeenCalled();
  });
});
