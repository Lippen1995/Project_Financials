import crypto from "node:crypto";

import { AnnualReportFilingStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { BrregFinancialsProvider } from "@/integrations/brreg/brreg-financials-provider";
import { classifyPages } from "@/integrations/brreg/annual-report-financials/page-classification";
import {
  chooseCanonicalFacts,
  mapRowsToCanonicalFacts,
} from "@/integrations/brreg/annual-report-financials/canonical-mapping";
import { buildNormalizedFinancialPayload } from "@/integrations/brreg/annual-report-financials/normalized-payload";
import { extractOcrPages } from "@/integrations/brreg/annual-report-financials/ocr";
import { preflightAnnualReportDocument } from "@/integrations/brreg/annual-report-financials/preflight";
import { reconstructStatementRows } from "@/integrations/brreg/annual-report-financials/table-reconstruction";
import {
  requiredPublishMetricKeys,
  CanonicalMetricKey,
} from "@/integrations/brreg/annual-report-financials/taxonomy";
import { validateCanonicalFacts } from "@/integrations/brreg/annual-report-financials/validation";
import { CanonicalFactCandidate } from "@/integrations/brreg/annual-report-financials/types";
import { logRecoverableError } from "@/lib/recoverable-error";
import { DataAvailability, NormalizedFinancialDocument, NormalizedFinancialStatement } from "@/lib/types";
import { mapBrregFinancialStatement } from "@/integrations/brreg/mappers";
import { LocalAnnualReportArtifactStorage } from "@/server/financials/artifact-storage";
import { toSafeNumber } from "@/server/financials/number-utils";
import {
  createAnnualReportArtifact,
  createFinancialExtractionRun,
  createFinancialFacts,
  createFinancialValidationIssues,
  findCompanyByOrgNumber,
  getAnnualReportFilingWithArtifacts,
  getPublishedFinancialsForCompany,
  listCompaniesForFinancialSync,
  listPendingAnnualReportFilings,
  publishFinancialStatementSnapshot,
  upsertAnnualReportFilingDiscovery,
  upsertCompanyFinancialCoverage,
  updateAnnualReportFiling,
  completeFinancialExtractionRun,
} from "@/server/persistence/annual-report-ingestion-repository";

const provider = new BrregFinancialsProvider();
const artifactStorage = new LocalAnnualReportArtifactStorage();

export const ANNUAL_REPORT_PARSER_VERSION = "annual-report-pipeline-v1";

function computeSha256(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function nextCheckDate(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function serializeJsonBuffer(value: unknown) {
  return Buffer.from(JSON.stringify(value, null, 2), "utf8");
}

function buildAvailability(statements: NormalizedFinancialStatement[]): DataAvailability {
  if (statements.length === 0) {
    return {
      available: false,
      sourceSystem: "BRREG",
      message:
        "ProjectX har registrert årsrapporter, men publiserer bare regnskap automatisk når ekstraksjon, enhetskontroll og validering passerer.",
    };
  }

  return {
    available: true,
    sourceSystem: "BRREG",
    message:
      "ProjectX viser publiserte regnskapssnapshots bygget fra offisielle Brreg-kopier av årsregnskap med lagret provenance og valideringsgate.",
  };
}

function mapPublishedDocuments(
  filings: Array<{
    id: string;
    fiscalYear: number;
    sourceSystem: string;
    sourceUrl: string;
    status: AnnualReportFilingStatus;
    discoveredAt: Date;
    downloadedAt: Date | null;
    sourceDocumentHash: string | null;
  }>,
): NormalizedFinancialDocument[] {
  return filings.map((filing) => ({
    sourceSystem: filing.sourceSystem,
    sourceEntityType: "annualReportFiling",
    sourceId: filing.id,
    fetchedAt: filing.discoveredAt,
    normalizedAt: filing.downloadedAt ?? filing.discoveredAt,
    rawPayload: {
      status: filing.status,
      sourceDocumentHash: filing.sourceDocumentHash,
    },
    year: filing.fiscalYear,
    filingId: filing.id,
    status: filing.status,
    downloadedAt: filing.downloadedAt,
    files: [
      {
        type: "aarsregnskap",
        id: `${filing.fiscalYear}`,
        label: "Offisiell kopi av årsregnskap",
        url: filing.sourceUrl,
      },
    ],
  }));
}

function mapPublishedStatements(
  statements: Array<{
    fiscalYear: number;
    currency: string;
    revenue: bigint | null;
    operatingProfit: bigint | null;
    netIncome: bigint | null;
    equity: bigint | null;
    assets: bigint | null;
    sourceSystem: string;
    sourceEntityType: string;
    sourceId: string;
    fetchedAt: Date;
    normalizedAt: Date;
    rawPayload: unknown;
    sourceFilingId: string | null;
    sourceExtractionRunId: string | null;
    qualityStatus: string;
    qualityScore: number | null;
    unitScale: number | null;
    sourcePrecedence: string | null;
    publishedAt: Date | null;
  }>,
) {
  return statements.map((statement) => ({
    sourceSystem: statement.sourceSystem,
    sourceEntityType: statement.sourceEntityType,
    sourceId: statement.sourceId,
    fetchedAt: statement.fetchedAt,
    normalizedAt: statement.normalizedAt,
    rawPayload: statement.rawPayload,
    fiscalYear: statement.fiscalYear,
    currency: statement.currency,
    revenue: toSafeNumber(statement.revenue),
    operatingProfit: toSafeNumber(statement.operatingProfit),
    netIncome: toSafeNumber(statement.netIncome),
    equity: toSafeNumber(statement.equity),
    assets: toSafeNumber(statement.assets),
    sourceFilingId: statement.sourceFilingId,
    sourceExtractionRunId: statement.sourceExtractionRunId,
    qualityStatus: statement.qualityStatus as NormalizedFinancialStatement["qualityStatus"],
    qualityScore: statement.qualityScore,
    unitScale: statement.unitScale,
    sourcePrecedence:
      statement.sourcePrecedence as NormalizedFinancialStatement["sourcePrecedence"],
    publishedAt: statement.publishedAt,
  }));
}

function calculateConfidenceScore(input: {
  classifications: ReturnType<typeof classifyPages>;
  selectedFactCount: number;
  validationScore: number;
}) {
  const relevantPageScores = input.classifications
    .filter((classification) =>
      [
        "STATUTORY_INCOME",
        "STATUTORY_BALANCE",
        "STATUTORY_BALANCE_CONTINUATION",
        "SUPPLEMENTARY_INCOME",
        "SUPPLEMENTARY_BALANCE",
      ].includes(classification.type),
    )
    .map((classification) => classification.confidence);
  const classificationScore =
    relevantPageScores.length > 0
      ? relevantPageScores.reduce((sum, score) => sum + score, 0) / relevantPageScores.length
      : 0;
  const coverageScore = Math.min(1, input.selectedFactCount / requiredPublishMetricKeys.length);

  return Number(
    (
      classificationScore * 0.35 +
      coverageScore * 0.35 +
      input.validationScore * 0.3
    ).toFixed(4),
  );
}

function getNumberAtPath(payload: Record<string, any>, path: string[]) {
  const value = path.reduce<any>((current, key) => current?.[key], payload);
  return typeof value === "number" ? value : null;
}

function buildPublishedCanonicalFacts(
  payload: Record<string, any>,
  fiscalYear: number,
): CanonicalFactCandidate[] {
  const metricPaths: Array<{
    metricKey: CanonicalMetricKey;
    statementType: CanonicalFactCandidate["statementType"];
    path: string[];
  }> = [
    {
      metricKey: "revenue",
      statementType: "INCOME_STATEMENT",
      path: ["resultatregnskapResultat", "driftsresultat", "driftsinntekter", "salgsinntekter"],
    },
    {
      metricKey: "other_operating_income",
      statementType: "INCOME_STATEMENT",
      path: ["resultatregnskapResultat", "driftsresultat", "driftsinntekter", "annenDriftsinntekt"],
    },
    {
      metricKey: "total_operating_income",
      statementType: "INCOME_STATEMENT",
      path: ["resultatregnskapResultat", "driftsresultat", "driftsinntekter", "sumDriftsinntekter"],
    },
    {
      metricKey: "cost_of_goods_sold",
      statementType: "INCOME_STATEMENT",
      path: ["resultatregnskapResultat", "driftsresultat", "driftskostnad", "varekostnad"],
    },
    {
      metricKey: "payroll_expense",
      statementType: "INCOME_STATEMENT",
      path: ["resultatregnskapResultat", "driftsresultat", "driftskostnad", "loennskostnad"],
    },
    {
      metricKey: "depreciation_amortization",
      statementType: "INCOME_STATEMENT",
      path: ["resultatregnskapResultat", "driftsresultat", "driftskostnad", "avskrivninger"],
    },
    {
      metricKey: "other_operating_expense",
      statementType: "INCOME_STATEMENT",
      path: ["resultatregnskapResultat", "driftsresultat", "driftskostnad", "annenDriftskostnad"],
    },
    {
      metricKey: "total_operating_expenses",
      statementType: "INCOME_STATEMENT",
      path: ["resultatregnskapResultat", "driftsresultat", "driftskostnad", "sumDriftskostnad"],
    },
    {
      metricKey: "operating_profit",
      statementType: "INCOME_STATEMENT",
      path: ["resultatregnskapResultat", "driftsresultat", "driftsresultat"],
    },
    {
      metricKey: "financial_income",
      statementType: "INCOME_STATEMENT",
      path: ["resultatregnskapResultat", "finansresultat", "finansinntekt", "sumFinansinntekter"],
    },
    {
      metricKey: "financial_expense",
      statementType: "INCOME_STATEMENT",
      path: ["resultatregnskapResultat", "finansresultat", "finanskostnad", "sumFinanskostnad"],
    },
    {
      metricKey: "net_financial_items",
      statementType: "INCOME_STATEMENT",
      path: ["resultatregnskapResultat", "finansresultat", "nettoFinans"],
    },
    {
      metricKey: "profit_before_tax",
      statementType: "INCOME_STATEMENT",
      path: ["resultatregnskapResultat", "ordinaertResultatFoerSkattekostnad"],
    },
    {
      metricKey: "tax_expense",
      statementType: "INCOME_STATEMENT",
      path: ["resultatregnskapResultat", "skattekostnadResultat"],
    },
    {
      metricKey: "net_income",
      statementType: "INCOME_STATEMENT",
      path: ["resultatregnskapResultat", "aarsresultat"],
    },
    {
      metricKey: "total_assets",
      statementType: "BALANCE_SHEET",
      path: ["eiendeler", "sumEiendeler"],
    },
    {
      metricKey: "total_equity",
      statementType: "BALANCE_SHEET",
      path: ["egenkapitalGjeld", "egenkapital", "sumEgenkapital"],
    },
    {
      metricKey: "total_liabilities",
      statementType: "BALANCE_SHEET",
      path: ["egenkapitalGjeld", "gjeldOversikt", "sumGjeld"],
    },
    {
      metricKey: "long_term_liabilities",
      statementType: "BALANCE_SHEET",
      path: ["egenkapitalGjeld", "gjeldOversikt", "langsiktigGjeld", "sumLangsiktigGjeld"],
    },
    {
      metricKey: "current_liabilities",
      statementType: "BALANCE_SHEET",
      path: ["egenkapitalGjeld", "gjeldOversikt", "kortsiktigGjeld", "sumKortsiktigGjeld"],
    },
    {
      metricKey: "total_equity_and_liabilities",
      statementType: "BALANCE_SHEET",
      path: ["egenkapitalGjeld", "sumEgenkapitalGjeld"],
    },
  ];

  const facts: CanonicalFactCandidate[] = [];

  for (const definition of metricPaths) {
    const value = getNumberAtPath(payload, definition.path);
    if (value === null) {
      continue;
    }

    facts.push({
      fiscalYear,
      statementType: definition.statementType,
      metricKey: definition.metricKey,
      rawLabel: definition.metricKey,
      normalizedLabel: definition.metricKey,
      value,
      currency: "NOK",
      unitScale: 1,
      sourcePage: 0,
      sourceSection:
        definition.statementType === "BALANCE_SHEET"
          ? "STATUTORY_BALANCE"
          : "STATUTORY_INCOME",
      sourceRowText: definition.path.join("."),
      noteReference: null,
      confidenceScore: 1,
      precedence: "STATUTORY_NOK",
      isDerived: false,
      rawPayload: {
        path: definition.path,
      },
    });
  }

  return facts;
}

function hasKnownUnitScale(classifications: ReturnType<typeof classifyPages>) {
  const primaryPages = classifications.filter((classification) =>
    [
      "STATUTORY_INCOME",
      "STATUTORY_BALANCE",
      "STATUTORY_BALANCE_CONTINUATION",
      "SUPPLEMENTARY_INCOME",
      "SUPPLEMENTARY_BALANCE",
    ].includes(classification.type),
  );

  return primaryPages.length > 0 && primaryPages.every((classification) => classification.unitScale !== null);
}

function canPublishAutomatically(input: {
  classifications: ReturnType<typeof classifyPages>;
  selectedFacts: ReturnType<typeof chooseCanonicalFacts>;
  validationIssues: ReturnType<typeof validateCanonicalFacts>["issues"];
  confidenceScore: number;
}) {
  const hasIncomePage = input.classifications.some((classification) =>
    ["STATUTORY_INCOME", "SUPPLEMENTARY_INCOME"].includes(classification.type),
  );
  const hasBalancePage = input.classifications.some((classification) =>
    [
      "STATUTORY_BALANCE",
      "STATUTORY_BALANCE_CONTINUATION",
      "SUPPLEMENTARY_BALANCE",
    ].includes(classification.type),
  );
  const hasBlockingErrors = input.validationIssues.some((issue) => issue.severity === "ERROR");
  const hasRequiredMetrics = requiredPublishMetricKeys.every((metricKey) =>
    input.selectedFacts.has(metricKey),
  );

  return (
    hasIncomePage &&
    hasBalancePage &&
    hasRequiredMetrics &&
    hasKnownUnitScale(input.classifications) &&
    !hasBlockingErrors &&
    input.confidenceScore >= 0.82
  );
}

async function persistJsonArtifact(input: {
  filingId: string;
  artifactType:
    | "PREFLIGHT_JSON"
    | "CLASSIFICATION_JSON"
    | "EXTRACTION_JSON"
    | "NORMALIZED_JSON";
  filename: string;
  payload: unknown;
}) {
  const buffer = serializeJsonBuffer(input.payload);
  const checksum = computeSha256(buffer);
  const stored = await artifactStorage.putArtifact({
    filingId: input.filingId,
    artifactType: input.artifactType,
    filename: input.filename,
    content: buffer,
  });

  await createAnnualReportArtifact({
    filingId: input.filingId,
    artifactType: input.artifactType,
    storageKey: stored.storageKey,
    checksum,
    mimeType: "application/json",
    metadata: {
      filename: input.filename,
    },
  });
}

async function ensurePdfArtifact(filingId: string) {
  const filing = await getAnnualReportFilingWithArtifacts(filingId);
  if (!filing) {
    throw new Error(`Fant ikke filing ${filingId}.`);
  }

  const existingPdfArtifact = filing.artifacts.find((artifact) => artifact.artifactType === "PDF");
  if (existingPdfArtifact && filing.sourceDocumentHash) {
    return {
      filing,
      pdfBuffer: await artifactStorage.getArtifactBuffer(existingPdfArtifact.storageKey),
    };
  }

  const download = await provider.downloadAnnualReportPdf(filing.sourceUrl);
  const checksum = computeSha256(download.buffer);
  const stored = await artifactStorage.putArtifact({
    filingId,
    artifactType: "PDF",
    filename: `${filing.company.orgNumber}-${filing.fiscalYear}.pdf`,
    content: download.buffer,
  });

  await createAnnualReportArtifact({
    filingId,
    artifactType: "PDF",
    storageKey: stored.storageKey,
    checksum,
    mimeType: download.mimeType,
    metadata: {
      sourceUrl: filing.sourceUrl,
    },
  });

  await updateAnnualReportFiling(filingId, {
    sourceDocumentHash: checksum,
    downloadedAt: new Date(),
    status: "DOWNLOADED",
  });

  return {
    filing: {
      ...filing,
      sourceDocumentHash: checksum,
    },
    pdfBuffer: download.buffer,
  };
}

export async function processAnnualReportFiling(filingId: string) {
  const { filing, pdfBuffer } = await ensurePdfArtifact(filingId);
  const preflight = await preflightAnnualReportDocument(pdfBuffer);

  await persistJsonArtifact({
    filingId,
    artifactType: "PREFLIGHT_JSON",
    filename: "preflight.json",
    payload: preflight,
  });

  await updateAnnualReportFiling(filingId, {
    status: "PREFLIGHTED",
    unitHints: {
      hasTextLayer: preflight.hasTextLayer,
      hasReliableTextLayer: preflight.hasReliableTextLayer,
    },
    parserVersionLastTried: ANNUAL_REPORT_PARSER_VERSION,
    lastError: null,
  });

  const parsedPages = preflight.hasReliableTextLayer
    ? preflight.parsedPages
    : await extractOcrPages(pdfBuffer);
  const classifications = classifyPages(parsedPages);

  await persistJsonArtifact({
    filingId,
    artifactType: "CLASSIFICATION_JSON",
    filename: "classification.json",
    payload: classifications,
  });

  const extractionRun = await createFinancialExtractionRun({
    filingId,
    companyId: filing.company.id,
    parserVersion: ANNUAL_REPORT_PARSER_VERSION,
    ocrEngine: preflight.hasReliableTextLayer ? "EMBEDDED_TEXT" : "TESSERACT",
    ocrLanguage: preflight.hasReliableTextLayer ? null : "nor+eng",
  });

  try {
    const rows = reconstructStatementRows(parsedPages, classifications);
    const mapped = mapRowsToCanonicalFacts({
      filingFiscalYear: filing.fiscalYear,
      classifications,
      rows,
    });
    const validation = validateCanonicalFacts(mapped.facts);

    await persistJsonArtifact({
      filingId,
      artifactType: "EXTRACTION_JSON",
      filename: "extraction.json",
      payload: {
        rows,
        mappedFacts: mapped.facts,
      },
    });

    await createFinancialFacts({
      extractionRunId: extractionRun.id,
      filingId,
      companyId: filing.company.id,
      facts: mapped.facts,
    });

    const issues = [...mapped.issues, ...validation.issues];
    await createFinancialValidationIssues({
      extractionRunId: extractionRun.id,
      filingId,
      companyId: filing.company.id,
      fiscalYear: filing.fiscalYear,
      issues,
    });

    const selectedFacts = validation.selectedFacts;
    const confidenceScore = calculateConfidenceScore({
      classifications,
      selectedFactCount: selectedFacts.size,
      validationScore: validation.validationScore,
    });

    const shouldPublish = canPublishAutomatically({
      classifications,
      selectedFacts,
      validationIssues: issues,
      confidenceScore,
    });

    const sourcePrecedence =
      selectedFacts.get("revenue")?.precedence ??
      selectedFacts.get("total_assets")?.precedence ??
      "NOTE_DERIVED";
    const normalizedPayload = buildNormalizedFinancialPayload(filing.fiscalYear, selectedFacts);

    await persistJsonArtifact({
      filingId,
      artifactType: "NORMALIZED_JSON",
      filename: "normalized.json",
      payload: normalizedPayload,
    });

    await completeFinancialExtractionRun(extractionRun.id, {
      status: shouldPublish ? "SUCCEEDED" : "MANUAL_REVIEW",
      finishedAt: new Date(),
      confidenceScore,
      validationScore: validation.validationScore,
      metricsCoverage: {
        selectedFactCount: selectedFacts.size,
        requiredMetricCount: requiredPublishMetricKeys.length,
      },
      rawSummary: {
        issues,
        classifications,
      } as unknown as Prisma.InputJsonValue,
    });

    if (shouldPublish) {
      const publishedAt = new Date();
      await publishFinancialStatementSnapshot({
        companyId: filing.company.id,
        fiscalYear: filing.fiscalYear,
        currency: "NOK",
        revenue: selectedFacts.get("revenue")?.value ?? selectedFacts.get("total_operating_income")?.value ?? null,
        operatingProfit: selectedFacts.get("operating_profit")?.value ?? null,
        netIncome: selectedFacts.get("net_income")?.value ?? null,
        equity: selectedFacts.get("total_equity")?.value ?? null,
        assets: selectedFacts.get("total_assets")?.value ?? null,
        sourceSystem: "BRREG",
        sourceEntityType: "financialStatement",
        sourceId: `${filing.company.orgNumber}-${filing.fiscalYear}-${filing.id}`,
        fetchedAt: publishedAt,
        normalizedAt: publishedAt,
        rawPayload: normalizedPayload as unknown as Prisma.InputJsonValue,
        sourceFilingId: filing.id,
        sourceExtractionRunId: extractionRun.id,
        qualityStatus: "HIGH_CONFIDENCE",
        qualityScore: confidenceScore,
        unitScale: selectedFacts.get("revenue")?.unitScale ?? selectedFacts.get("total_assets")?.unitScale ?? 1,
        sourcePrecedence,
        publishedAt,
      });

      await updateAnnualReportFiling(filingId, {
        status: "PUBLISHED",
        unitHints: {
          classifications,
          hasKnownUnitScale: hasKnownUnitScale(classifications),
        },
      });

      await upsertCompanyFinancialCoverage({
        companyId: filing.company.id,
        latestDownloadedFiscalYear: filing.fiscalYear,
        latestPublishedFiscalYear: filing.fiscalYear,
        latestDiscoveredFiscalYear: filing.fiscalYear,
        lastCheckedAt: new Date(),
        nextCheckAt: nextCheckDate(24),
        coverageStatus: "PUBLISHED",
        latestSuccessfulFilingId: filing.id,
      });
    } else {
      await updateAnnualReportFiling(filingId, {
        status: "MANUAL_REVIEW",
        lastError: issues.map((issue) => `${issue.ruleCode}: ${issue.message}`).join(" | ").slice(0, 1_000),
      });

      await upsertCompanyFinancialCoverage({
        companyId: filing.company.id,
        latestDownloadedFiscalYear: filing.fiscalYear,
        latestDiscoveredFiscalYear: filing.fiscalYear,
        lastCheckedAt: new Date(),
        nextCheckAt: nextCheckDate(12),
        coverageStatus: "MANUAL_REVIEW",
      });
    }

    return {
      filingId,
      fiscalYear: filing.fiscalYear,
      confidenceScore,
      published: shouldPublish,
      issueCount: issues.length,
    };
  } catch (error) {
    await completeFinancialExtractionRun(extractionRun.id, {
      status: "FAILED",
      finishedAt: new Date(),
      errorMessage: error instanceof Error ? error.message : "Unknown extraction error",
    });

    await updateAnnualReportFiling(filingId, {
      status: "FAILED",
      lastError: error instanceof Error ? error.message : "Unknown extraction error",
    });

    await upsertCompanyFinancialCoverage({
      companyId: filing.company.id,
      latestDownloadedFiscalYear: filing.fiscalYear,
      latestDiscoveredFiscalYear: filing.fiscalYear,
      lastCheckedAt: new Date(),
      nextCheckAt: nextCheckDate(6),
      coverageStatus: "FAILED",
    });

    throw error;
  }
}

export async function discoverAnnualReportFilingsForCompany(orgNumber: string) {
  const company = await findCompanyByOrgNumber(orgNumber);
  if (!company) {
    throw new Error(`Fant ikke virksomhet ${orgNumber}.`);
  }

  const filings = await provider.listAnnualReportFilings(orgNumber);
  for (const filing of filings) {
    await upsertAnnualReportFilingDiscovery({
      companyId: company.id,
      fiscalYear: filing.fiscalYear,
      sourceSystem: filing.sourceSystem,
      sourceUrl: filing.sourceUrl,
      sourceIdempotencyKey: filing.sourceIdempotencyKey,
      sourceDocumentType: filing.sourceDocumentType,
      discoveredAt: filing.discoveredAt,
    });
  }

  const latestDiscoveredFiscalYear =
    filings.map((filing) => filing.fiscalYear).sort((left, right) => right - left)[0] ?? null;
  await upsertCompanyFinancialCoverage({
    companyId: company.id,
    latestDiscoveredFiscalYear,
    lastCheckedAt: new Date(),
    nextCheckAt: nextCheckDate(24),
    coverageStatus: filings.length > 0 ? "DISCOVERED" : "UNCHECKED",
  });

  return {
    orgNumber,
    companyName: company.name,
    discoveredFilings: filings.length,
    fiscalYears: filings.map((filing) => filing.fiscalYear).sort((left, right) => right - left),
  };
}

export async function processPendingAnnualReportFilings(options?: {
  orgNumbers?: string[];
  limit?: number;
  statuses?: AnnualReportFilingStatus[];
}) {
  const filings = await listPendingAnnualReportFilings({
    orgNumbers: options?.orgNumbers,
    limit: options?.limit,
    statuses: options?.statuses,
  });

  const results = [];
  for (const filing of filings) {
    try {
      results.push(await processAnnualReportFiling(filing.id));
    } catch (error) {
      logRecoverableError("annual-report-financials.processPending", error, {
        filingId: filing.id,
        orgNumber: filing.company.orgNumber,
        fiscalYear: filing.fiscalYear,
      });
      results.push({
        filingId: filing.id,
        fiscalYear: filing.fiscalYear,
        published: false,
        error: error instanceof Error ? error.message : "Unknown processing error",
      });
    }
  }

  return results;
}

export async function backfillAnnualReportFilings(options?: {
  orgNumbers?: string[];
  limit?: number;
}) {
  const companies = await listCompaniesForFinancialSync({
    orgNumbers: options?.orgNumbers,
    limit: options?.limit,
  });

  const discovered = [];
  for (const company of companies) {
    discovered.push(await discoverAnnualReportFilingsForCompany(company.orgNumber));
  }

  const processed = await processPendingAnnualReportFilings({
    orgNumbers: options?.orgNumbers,
  });

  return {
    discovered,
    processed,
  };
}

export async function syncNewAnnualReportFilings(options?: {
  orgNumbers?: string[];
  limit?: number;
}) {
  const companies = await listCompaniesForFinancialSync({
    orgNumbers: options?.orgNumbers,
    onlyDue: true,
    limit: options?.limit,
  });

  const discovered = [];
  for (const company of companies) {
    discovered.push(await discoverAnnualReportFilingsForCompany(company.orgNumber));
  }

  const processed = await processPendingAnnualReportFilings({
    orgNumbers: companies.map((company) => company.orgNumber),
  });

  return {
    checkedCompanies: companies.length,
    discovered,
    processed,
  };
}

export async function reprocessLowConfidenceAnnualReportFilings(options?: {
  orgNumbers?: string[];
  limit?: number;
}) {
  return processPendingAnnualReportFilings({
    orgNumbers: options?.orgNumbers,
    limit: options?.limit,
    statuses: ["MANUAL_REVIEW", "FAILED"],
  });
}

export async function getPublishedAnnualReportFinancials(orgNumber: string): Promise<{
  statements: NormalizedFinancialStatement[];
  documents: NormalizedFinancialDocument[];
  availability: DataAvailability;
}> {
  const record = await getPublishedFinancialsForCompany(orgNumber);

  if (!record) {
    return {
      statements: [],
      documents: [],
      availability: {
        available: false,
        sourceSystem: "BRREG",
        message: "Virksomheten finnes ikke i lokal ProjectX-lagring ennå.",
      },
    };
  }

  const statements = mapPublishedStatements(record.financialStatements);
  const documents = mapPublishedDocuments(record.annualReportFilings);

  return {
    statements,
    documents,
    availability: buildAvailability(statements),
  };
}

export async function syncCompanyAnnualReportFinancials(orgNumber: string) {
  await discoverAnnualReportFilingsForCompany(orgNumber);
  await processPendingAnnualReportFilings({ orgNumbers: [orgNumber] });
  return getPublishedAnnualReportFinancials(orgNumber);
}

export async function validatePublishedAnnualReportFinancials(options?: { orgNumbers?: string[] }) {
  const companies = await listCompaniesForFinancialSync({
    orgNumbers: options?.orgNumbers,
  });
  const results: Array<{
    orgNumber: string;
    fiscalYear: number;
    balanced: boolean;
  }> = [];

  for (const company of companies) {
    const published = await getPublishedFinancialsForCompany(company.orgNumber);
    for (const statement of published?.financialStatements ?? []) {
      const payload = statement.rawPayload as Record<string, any>;
      const normalized = mapBrregFinancialStatement(payload, company.orgNumber);
      const validation = validateCanonicalFacts(
        buildPublishedCanonicalFacts(payload, statement.fiscalYear),
      );
      const balanced =
        !validation.issues.some((issue) => issue.severity === "ERROR") &&
        normalized.assets !== null &&
        normalized.assets !== undefined &&
        normalized.equity !== null &&
        normalized.equity !== undefined;
      results.push({
        orgNumber: company.orgNumber,
        fiscalYear: statement.fiscalYear,
        balanced,
      });
    }
  }

  return results;
}
