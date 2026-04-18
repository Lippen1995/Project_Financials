import crypto from "node:crypto";
import { AnnualReportFilingStatus, AnnualReportReviewStatus, Prisma } from "@prisma/client";
import { BrregFinancialsProvider } from "@/integrations/brreg/brreg-financials-provider";
import { classifyPages } from "@/integrations/brreg/annual-report-financials/page-classification";
import {
  buildClassificationIssues,
  calculateConfidenceScore,
  canPublishAutomatically,
  hasKnownUnitScale,
} from "@/integrations/brreg/annual-report-financials/publish-gate";
import { buildNormalizedFinancialPayload } from "@/integrations/brreg/annual-report-financials/normalized-payload";
import { extractOcrPages } from "@/integrations/brreg/annual-report-financials/ocr";
import { preflightAnnualReportDocument } from "@/integrations/brreg/annual-report-financials/preflight";
import { reconstructStatementRows } from "@/integrations/brreg/annual-report-financials/table-reconstruction";
import { CanonicalMetricKey, requiredPublishMetricKeys } from "@/integrations/brreg/annual-report-financials/taxonomy";
import { validateCanonicalFacts } from "@/integrations/brreg/annual-report-financials/validation";
import { CanonicalFactCandidate, PageClassification, ValidationIssueDraft } from "@/integrations/brreg/annual-report-financials/types";
import { chooseCanonicalFacts, mapRowsToCanonicalFacts } from "@/integrations/brreg/annual-report-financials/canonical-mapping";
import { mapBrregFinancialStatement } from "@/integrations/brreg/mappers";
import { DataAvailability, NormalizedFinancialDocument, NormalizedFinancialStatement } from "@/lib/types";
import { logRecoverableError } from "@/lib/recoverable-error";
import { LocalAnnualReportArtifactStorage } from "@/server/financials/artifact-storage";
import { toSafeNumber } from "@/server/financials/number-utils";
import {
  completeFinancialExtractionRun,
  claimAnnualReportFilingForProcessing,
  createAnnualReportArtifact,
  createAnnualReportFilingVersion,
  createFinancialExtractionRun,
  createFinancialFacts,
  createFinancialValidationIssues,
  findCompanyByOrgNumber,
  getAnnualReportFilingWithArtifacts,
  getAnnualReportPipelineMetrics,
  getPublishedFinancialsForCompany,
  listCompaniesForFinancialSync,
  listAnnualReportFilingsForReprocessing,
  listLatestAnnualReportFilingsForCompany,
  listPendingAnnualReportFilings,
  listAnnualReportReviews,
  publishFinancialStatementSnapshot,
  registerAnnualReportHashVersion,
  resolveAnnualReportReviewsForFiling,
  updateAnnualReportReviewStatus,
  upsertAnnualReportReview,
  upsertAnnualReportFilingDiscovery,
  upsertCompanyFinancialCoverage,
  updateAnnualReportFiling,
} from "@/server/persistence/annual-report-ingestion-repository";

const provider = new BrregFinancialsProvider();
const artifactStorage = new LocalAnnualReportArtifactStorage();
export const ANNUAL_REPORT_PARSER_VERSION = "annual-report-pipeline-v3";

const computeSha256 = (buffer: Buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const nextCheckDate = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000);
const serializeJsonBuffer = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2), "utf8");

function buildAvailability(statements: NormalizedFinancialStatement[]): DataAvailability {
  return statements.length === 0
    ? {
        available: false,
        sourceSystem: "BRREG",
        message:
          "ProjectX har registrert årsrapporter, men publiserer bare regnskap automatisk når klassifisering, skala og validering passerer.",
      }
    : {
        available: true,
        sourceSystem: "BRREG",
        message:
          "ProjectX viser publiserte regnskapssnapshots bygget fra offisielle Brreg-kopier av årsregnskap med lagret provenance og streng publiseringsgate.",
      };
}

function mapPublishedDocuments(filings: Array<{ id: string; fiscalYear: number; sourceSystem: string; sourceUrl: string; status: AnnualReportFilingStatus; discoveredAt: Date; downloadedAt: Date | null; sourceDocumentHash: string | null }>): NormalizedFinancialDocument[] {
  return filings.map((filing) => ({
    sourceSystem: filing.sourceSystem,
    sourceEntityType: "annualReportFiling",
    sourceId: filing.id,
    fetchedAt: filing.discoveredAt,
    normalizedAt: filing.downloadedAt ?? filing.discoveredAt,
    rawPayload: { status: filing.status, sourceDocumentHash: filing.sourceDocumentHash },
    year: filing.fiscalYear,
    filingId: filing.id,
    status: filing.status,
    downloadedAt: filing.downloadedAt,
    files: [{ type: "aarsregnskap", id: `${filing.fiscalYear}`, label: "Offisiell kopi av årsregnskap", url: filing.sourceUrl }],
  }));
}

function mapPublishedStatements(statements: Array<{ fiscalYear: number; currency: string; revenue: bigint | null; operatingProfit: bigint | null; netIncome: bigint | null; equity: bigint | null; assets: bigint | null; sourceSystem: string; sourceEntityType: string; sourceId: string; fetchedAt: Date; normalizedAt: Date; rawPayload: unknown; sourceFilingId: string | null; sourceExtractionRunId: string | null; qualityStatus: string; qualityScore: number | null; unitScale: number | null; sourcePrecedence: string | null; publishedAt: Date | null }>) {
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
    sourcePrecedence: statement.sourcePrecedence as NormalizedFinancialStatement["sourcePrecedence"],
    publishedAt: statement.publishedAt,
  }));
}

function getNumberAtPath(payload: Record<string, any>, path: string[]) {
  const value = path.reduce<any>((current, key) => current?.[key], payload);
  return typeof value === "number" ? value : null;
}

function buildPublishedCanonicalFacts(payload: Record<string, any>, fiscalYear: number): CanonicalFactCandidate[] {
  const metricPaths: Array<{ metricKey: CanonicalMetricKey; statementType: CanonicalFactCandidate["statementType"]; path: string[] }> = [
    { metricKey: "revenue", statementType: "INCOME_STATEMENT", path: ["resultatregnskapResultat", "driftsresultat", "driftsinntekter", "salgsinntekter"] },
    { metricKey: "other_operating_income", statementType: "INCOME_STATEMENT", path: ["resultatregnskapResultat", "driftsresultat", "driftsinntekter", "annenDriftsinntekt"] },
    { metricKey: "total_operating_income", statementType: "INCOME_STATEMENT", path: ["resultatregnskapResultat", "driftsresultat", "driftsinntekter", "sumDriftsinntekter"] },
    { metricKey: "total_operating_expenses", statementType: "INCOME_STATEMENT", path: ["resultatregnskapResultat", "driftsresultat", "driftskostnad", "sumDriftskostnad"] },
    { metricKey: "operating_profit", statementType: "INCOME_STATEMENT", path: ["resultatregnskapResultat", "driftsresultat", "driftsresultat"] },
    { metricKey: "financial_income", statementType: "INCOME_STATEMENT", path: ["resultatregnskapResultat", "finansresultat", "finansinntekt", "sumFinansinntekter"] },
    { metricKey: "financial_expense", statementType: "INCOME_STATEMENT", path: ["resultatregnskapResultat", "finansresultat", "finanskostnad", "sumFinanskostnad"] },
    { metricKey: "net_financial_items", statementType: "INCOME_STATEMENT", path: ["resultatregnskapResultat", "finansresultat", "nettoFinans"] },
    { metricKey: "profit_before_tax", statementType: "INCOME_STATEMENT", path: ["resultatregnskapResultat", "ordinaertResultatFoerSkattekostnad"] },
    { metricKey: "tax_expense", statementType: "INCOME_STATEMENT", path: ["resultatregnskapResultat", "skattekostnadResultat"] },
    { metricKey: "net_income", statementType: "INCOME_STATEMENT", path: ["resultatregnskapResultat", "aarsresultat"] },
    { metricKey: "total_assets", statementType: "BALANCE_SHEET", path: ["eiendeler", "sumEiendeler"] },
    { metricKey: "total_equity", statementType: "BALANCE_SHEET", path: ["egenkapitalGjeld", "egenkapital", "sumEgenkapital"] },
    { metricKey: "total_liabilities", statementType: "BALANCE_SHEET", path: ["egenkapitalGjeld", "gjeldOversikt", "sumGjeld"] },
    { metricKey: "long_term_liabilities", statementType: "BALANCE_SHEET", path: ["egenkapitalGjeld", "gjeldOversikt", "langsiktigGjeld", "sumLangsiktigGjeld"] },
    { metricKey: "current_liabilities", statementType: "BALANCE_SHEET", path: ["egenkapitalGjeld", "gjeldOversikt", "kortsiktigGjeld", "sumKortsiktigGjeld"] },
    { metricKey: "total_equity_and_liabilities", statementType: "BALANCE_SHEET", path: ["egenkapitalGjeld", "sumEgenkapitalGjeld"] },
  ];
  return metricPaths.flatMap((definition) => {
    const value = getNumberAtPath(payload, definition.path);
    return value === null ? [] : [{ fiscalYear, statementType: definition.statementType, metricKey: definition.metricKey, rawLabel: definition.metricKey, normalizedLabel: definition.metricKey, value, currency: "NOK", unitScale: 1, sourcePage: 0, sourceSection: definition.statementType === "BALANCE_SHEET" ? "STATUTORY_BALANCE" : "STATUTORY_INCOME", sourceRowText: definition.path.join("."), noteReference: null, confidenceScore: 1, precedence: "STATUTORY_NOK", isDerived: false, rawPayload: { path: definition.path } } satisfies CanonicalFactCandidate];
  });
}

async function persistJsonArtifact(input: { filingId: string; artifactType: "PREFLIGHT_JSON" | "CLASSIFICATION_JSON" | "EXTRACTION_JSON" | "NORMALIZED_JSON"; filename: string; payload: unknown }) {
  const buffer = serializeJsonBuffer(input.payload);
  const checksum = computeSha256(buffer);
  const stored = await artifactStorage.putArtifact({ filingId: input.filingId, artifactType: input.artifactType, filename: input.filename, content: buffer });
  await createAnnualReportArtifact({ filingId: input.filingId, artifactType: input.artifactType, storageKey: stored.storageKey, checksum, mimeType: "application/json", metadata: { filename: input.filename } });
}

function logPipelineEvent(event: string, payload: Record<string, unknown>) {
  console.info(
    JSON.stringify({
      scope: "annual-report-financials",
      event,
      at: new Date().toISOString(),
      ...payload,
    }),
  );
}

function buildReviewPayload(input: {
  filingId: string;
  extractionRunId?: string | null;
  classifications: PageClassification[];
  issues: ValidationIssueDraft[];
  selectedFacts?: Map<string, CanonicalFactCandidate>;
}) {
  const pageReferences = Array.from(
    new Set([
      ...input.classifications.map((classification) => classification.pageNumber),
      ...input.issues.flatMap((issue) => {
        const pageNumber = issue.context?.pageNumber;
        return typeof pageNumber === "number" ? [pageNumber] : [];
      }),
      ...(input.selectedFacts
        ? Array.from(input.selectedFacts.values()).flatMap((fact) =>
            typeof fact.sourcePage === "number" ? [fact.sourcePage] : [],
          )
        : []),
    ]),
  ).sort((left, right) => left - right);

  const factSummary = input.selectedFacts
    ? Array.from(input.selectedFacts.values()).map((fact) => ({
        metricKey: fact.metricKey,
        value: fact.value,
        rawLabel: fact.rawLabel,
        sourcePage: fact.sourcePage,
        sourceSection: fact.sourceSection,
        sourcePrecedence: fact.precedence,
      }))
    : [];

  return {
    pageReferences,
    reviewPayload: {
      filingId: input.filingId,
      extractionRunId: input.extractionRunId ?? null,
      blockingIssues: input.issues.map((issue) => ({
        severity: issue.severity,
        ruleCode: issue.ruleCode,
        message: issue.message,
        expectedValue: issue.expectedValue ?? null,
        actualValue: issue.actualValue ?? null,
        context: issue.context ?? null,
      })),
      selectedFacts: factSummary,
      classifications: input.classifications.map((classification) => ({
        pageNumber: classification.pageNumber,
        type: classification.type,
        confidence: classification.confidence,
        unitScale: classification.unitScale,
        unitScaleConfidence: classification.unitScaleConfidence,
        reasons: classification.reasons,
      })),
    },
  };
}

function summarizeBlockingReasons(reviewPayload: Record<string, any> | null | undefined) {
  const blockingIssues = Array.isArray(reviewPayload?.blockingIssues)
    ? reviewPayload.blockingIssues
    : [];
  return blockingIssues.map((issue) => ({
    severity: issue?.severity ?? null,
    ruleCode: issue?.ruleCode ?? null,
    message: issue?.message ?? null,
    pageNumber:
      typeof issue?.context?.pageNumber === "number" ? issue.context.pageNumber : null,
  }));
}

async function ensurePdfArtifact(filingId: string) {
  const filing = await getAnnualReportFilingWithArtifacts(filingId);
  if (!filing) throw new Error(`Fant ikke filing ${filingId}.`);
  const existingPdfArtifact = filing.artifacts.find((artifact) => artifact.artifactType === "PDF");
  if (existingPdfArtifact && filing.sourceDocumentHash) {
    return { filing, pdfBuffer: await artifactStorage.getArtifactBuffer(existingPdfArtifact.storageKey) };
  }

  const download = await provider.downloadAnnualReportPdf(filing.sourceUrl);
  const checksum = computeSha256(download.buffer);
  const versionedFiling = await registerAnnualReportHashVersion({ filingId, checksum, downloadedAt: new Date() });
  const stored = await artifactStorage.putArtifact({ filingId: versionedFiling.id, artifactType: "PDF", filename: `${filing.company.orgNumber}-${filing.fiscalYear}-${checksum.slice(0, 12)}.pdf`, content: download.buffer });
  await createAnnualReportArtifact({ filingId: versionedFiling.id, artifactType: "PDF", storageKey: stored.storageKey, checksum, mimeType: download.mimeType, metadata: { sourceUrl: filing.sourceUrl } });
  const refreshed = await getAnnualReportFilingWithArtifacts(versionedFiling.id);
  if (!refreshed) throw new Error(`Fant ikke oppdatert filing ${versionedFiling.id}.`);
  return { filing: refreshed, pdfBuffer: download.buffer };
}

async function verifyLatestKnownFilingHashes(companyId: string) {
  const latestFilings = await listLatestAnnualReportFilingsForCompany(companyId);
  const candidates = latestFilings.filter((filing) => filing.sourceDocumentHash).sort((left, right) => right.fiscalYear - left.fiscalYear).slice(0, 2);
  const createdVersions = [];
  for (const filing of candidates) {
    try {
      const download = await provider.downloadAnnualReportPdf(filing.sourceUrl);
      const checksum = computeSha256(download.buffer);
      if (checksum === filing.sourceDocumentHash) continue;
      const versioned = await createAnnualReportFilingVersion({ existingFilingId: filing.id, checksum, downloadedAt: new Date() });
      const stored = await artifactStorage.putArtifact({ filingId: versioned.id, artifactType: "PDF", filename: `${filing.companyId}-${filing.fiscalYear}-${checksum.slice(0, 12)}.pdf`, content: download.buffer });
      await createAnnualReportArtifact({ filingId: versioned.id, artifactType: "PDF", storageKey: stored.storageKey, checksum, mimeType: download.mimeType, metadata: { sourceUrl: filing.sourceUrl, detectedBy: "sync-new-filings" } });
      createdVersions.push({ fiscalYear: filing.fiscalYear, previousHash: filing.sourceDocumentHash, newHash: checksum, filingId: versioned.id });
    } catch (error) {
      logRecoverableError("annual-report-financials.verifyLatestKnownFilingHashes", error, { companyId, filingId: filing.id, fiscalYear: filing.fiscalYear });
    }
  }
  return createdVersions;
}

export async function processAnnualReportFiling(
  filingId: string,
  options?: { force?: boolean },
) {
  const claimed = await claimAnnualReportFilingForProcessing(
    filingId,
    options?.force
      ? [
          "DISCOVERED",
          "DOWNLOADED",
          "PREFLIGHTED",
          "EXTRACTED",
          "VALIDATED",
          "FAILED",
          "MANUAL_REVIEW",
          "PUBLISHED",
        ]
      : undefined,
  );
  if (!claimed) {
    const current = await getAnnualReportFilingWithArtifacts(filingId);
    return {
      filingId,
      fiscalYear: current?.fiscalYear ?? null,
      skipped: true,
      reason: current ? `Filing is already in status ${current.status}` : "Filing not found",
      published: current?.status === "PUBLISHED",
    };
  }

  logPipelineEvent("filing.claimed", { filingId, fiscalYear: claimed.fiscalYear, status: claimed.status });
  const { filing, pdfBuffer } = await ensurePdfArtifact(filingId);
  const preflight = await preflightAnnualReportDocument(pdfBuffer);
  await persistJsonArtifact({ filingId: filing.id, artifactType: "PREFLIGHT_JSON", filename: "preflight.json", payload: preflight });
  await updateAnnualReportFiling(filing.id, { preflightedAt: new Date(), unitHints: { hasTextLayer: preflight.hasTextLayer, hasReliableTextLayer: preflight.hasReliableTextLayer }, parserVersionLastTried: ANNUAL_REPORT_PARSER_VERSION, lastError: null });
  logPipelineEvent("filing.preflighted", { filingId: filing.id, fiscalYear: filing.fiscalYear, hasReliableTextLayer: preflight.hasReliableTextLayer });

  const parsedPages = preflight.hasReliableTextLayer ? preflight.parsedPages : await extractOcrPages(pdfBuffer);
  const classifications = classifyPages(parsedPages);
  await persistJsonArtifact({ filingId: filing.id, artifactType: "CLASSIFICATION_JSON", filename: "classification.json", payload: classifications });

  const extractionRun = await createFinancialExtractionRun({ filingId: filing.id, companyId: filing.company.id, parserVersion: ANNUAL_REPORT_PARSER_VERSION, ocrEngine: preflight.hasReliableTextLayer ? "EMBEDDED_TEXT" : "TESSERACT", ocrLanguage: preflight.hasReliableTextLayer ? null : "nor+eng" });

  try {
    const rows = reconstructStatementRows(parsedPages, classifications);
    await updateAnnualReportFiling(filing.id, { extractedAt: new Date() });
    const mapped = mapRowsToCanonicalFacts({ filingFiscalYear: filing.fiscalYear, classifications, rows });
    const validation = validateCanonicalFacts(mapped.facts);
    const classificationIssues = buildClassificationIssues(filing.fiscalYear, classifications);
    const issues = [...classificationIssues, ...mapped.issues, ...validation.issues];
    await updateAnnualReportFiling(filing.id, { validatedAt: new Date() });

    await persistJsonArtifact({ filingId: filing.id, artifactType: "EXTRACTION_JSON", filename: "extraction.json", payload: { rows, mappedFacts: mapped.facts, validationStats: validation.stats } });
    await createFinancialFacts({ extractionRunId: extractionRun.id, filingId: filing.id, companyId: filing.company.id, facts: mapped.facts });
    await createFinancialValidationIssues({ extractionRunId: extractionRun.id, filingId: filing.id, companyId: filing.company.id, fiscalYear: filing.fiscalYear, issues });

    const selectedFacts = validation.selectedFacts;
    const duplicateSupport = validation.stats.duplicateComparisons > 0 ? validation.stats.duplicateMatches / validation.stats.duplicateComparisons : 0;
    const noteSupport = validation.stats.noteComparisons > 0 ? validation.stats.noteMatches / validation.stats.noteComparisons : 0;
    const confidenceScore = calculateConfidenceScore({ classifications, selectedFactCount: selectedFacts.size, validationScore: validation.validationScore, duplicateSupport, noteSupport, issueCount: issues.length });
    const shouldPublish = canPublishAutomatically({ filingFiscalYear: filing.fiscalYear, classifications, selectedFacts, validationIssues: issues, confidenceScore });
    const sourcePrecedence = selectedFacts.get("revenue")?.precedence ?? selectedFacts.get("total_assets")?.precedence ?? "NOTE_DERIVED";
    const normalizedPayload = buildNormalizedFinancialPayload(filing.fiscalYear, selectedFacts);
    const blockingRuleCodes = Array.from(new Set(issues.filter((issue) => issue.severity === "ERROR").map((issue) => issue.ruleCode)));
    const reviewSummary = buildReviewPayload({ filingId: filing.id, extractionRunId: extractionRun.id, classifications, issues, selectedFacts });

    await persistJsonArtifact({ filingId: filing.id, artifactType: "NORMALIZED_JSON", filename: "normalized.json", payload: normalizedPayload });
    await completeFinancialExtractionRun(extractionRun.id, { status: shouldPublish ? "SUCCEEDED" : "MANUAL_REVIEW", finishedAt: new Date(), confidenceScore, validationScore: validation.validationScore, metricsCoverage: { selectedFactCount: selectedFacts.size, requiredMetricCount: requiredPublishMetricKeys.length, duplicateSupport, noteSupport }, rawSummary: { issues, classifications, validationStats: validation.stats } as unknown as Prisma.InputJsonValue });

    if (shouldPublish) {
      const publishedAt = new Date();
      await publishFinancialStatementSnapshot({ companyId: filing.company.id, fiscalYear: filing.fiscalYear, currency: "NOK", revenue: selectedFacts.get("revenue")?.value ?? selectedFacts.get("total_operating_income")?.value ?? null, operatingProfit: selectedFacts.get("operating_profit")?.value ?? null, netIncome: selectedFacts.get("net_income")?.value ?? null, equity: selectedFacts.get("total_equity")?.value ?? null, assets: selectedFacts.get("total_assets")?.value ?? null, sourceSystem: "BRREG", sourceEntityType: "financialStatement", sourceId: `${filing.company.orgNumber}-${filing.fiscalYear}-${filing.id}`, fetchedAt: publishedAt, normalizedAt: publishedAt, rawPayload: normalizedPayload as unknown as Prisma.InputJsonValue, sourceFilingId: filing.id, sourceExtractionRunId: extractionRun.id, qualityStatus: "HIGH_CONFIDENCE", qualityScore: confidenceScore, unitScale: selectedFacts.get("revenue")?.unitScale ?? selectedFacts.get("total_assets")?.unitScale ?? 1, sourcePrecedence, publishedAt });
      await updateAnnualReportFiling(filing.id, { status: "PUBLISHED", publishedSnapshotAt: publishedAt, unitHints: { classifications, hasKnownUnitScale: hasKnownUnitScale(classifications) } });
      await resolveAnnualReportReviewsForFiling(filing.id);
      await upsertCompanyFinancialCoverage({ companyId: filing.company.id, latestDownloadedFiscalYear: filing.fiscalYear, latestPublishedFiscalYear: filing.fiscalYear, latestDiscoveredFiscalYear: filing.fiscalYear, lastCheckedAt: new Date(), nextCheckAt: nextCheckDate(24), coverageStatus: "PUBLISHED", latestSuccessfulFilingId: filing.id });
      logPipelineEvent("filing.published", { filingId: filing.id, fiscalYear: filing.fiscalYear, extractionRunId: extractionRun.id, confidenceScore, sourcePrecedence });
    } else {
      await updateAnnualReportFiling(filing.id, { status: "MANUAL_REVIEW", manualReviewAt: new Date(), lastError: issues.map((issue) => `${issue.ruleCode}: ${issue.message}`).join(" | ").slice(0, 1_000) });
      await upsertAnnualReportReview({
        filingId: filing.id,
        extractionRunId: extractionRun.id,
        companyId: filing.company.id,
        fiscalYear: filing.fiscalYear,
        status: "PENDING_REVIEW",
        qualityScore: confidenceScore,
        sourcePrecedenceAttempted: sourcePrecedence,
        blockingRuleCodes,
        pageReferences: reviewSummary.pageReferences,
        latestActionNote: "Blocked by publish gate",
        reviewPayload: reviewSummary.reviewPayload as unknown as Prisma.InputJsonValue,
      });
      await upsertCompanyFinancialCoverage({ companyId: filing.company.id, latestDownloadedFiscalYear: filing.fiscalYear, latestDiscoveredFiscalYear: filing.fiscalYear, lastCheckedAt: new Date(), nextCheckAt: nextCheckDate(12), coverageStatus: "MANUAL_REVIEW" });
      logPipelineEvent("filing.manual_review", { filingId: filing.id, fiscalYear: filing.fiscalYear, extractionRunId: extractionRun.id, confidenceScore, blockingRuleCodes });
    }

    return { filingId: filing.id, fiscalYear: filing.fiscalYear, confidenceScore, published: shouldPublish, issueCount: issues.length };
  } catch (error) {
    await completeFinancialExtractionRun(extractionRun.id, { status: "FAILED", finishedAt: new Date(), errorMessage: error instanceof Error ? error.message : "Unknown extraction error" });
    await updateAnnualReportFiling(filing.id, { status: "FAILED", failedAt: new Date(), lastError: error instanceof Error ? error.message : "Unknown extraction error" });
    await upsertAnnualReportReview({
      filingId: filing.id,
      extractionRunId: extractionRun.id,
      companyId: filing.company.id,
      fiscalYear: filing.fiscalYear,
      status: "PENDING_REVIEW",
      qualityScore: null,
      sourcePrecedenceAttempted: null,
      blockingRuleCodes: ["PIPELINE_EXCEPTION"],
      pageReferences: [],
      latestActionNote: error instanceof Error ? error.message : "Unknown extraction error",
      reviewPayload: {
        filingId: filing.id,
        extractionRunId: extractionRun.id,
        error: error instanceof Error ? error.message : "Unknown extraction error",
      } as unknown as Prisma.InputJsonValue,
    });
    await upsertCompanyFinancialCoverage({ companyId: filing.company.id, latestDownloadedFiscalYear: filing.fiscalYear, latestDiscoveredFiscalYear: filing.fiscalYear, lastCheckedAt: new Date(), nextCheckAt: nextCheckDate(6), coverageStatus: "FAILED" });
    logPipelineEvent("filing.failed", { filingId: filing.id, fiscalYear: filing.fiscalYear, extractionRunId: extractionRun.id, error: error instanceof Error ? error.message : "Unknown extraction error" });
    throw error;
  }
}

export async function discoverAnnualReportFilingsForCompany(orgNumber: string) {
  const company = await findCompanyByOrgNumber(orgNumber);
  if (!company) throw new Error(`Fant ikke virksomhet ${orgNumber}.`);
  const existingPublished = await getPublishedFinancialsForCompany(orgNumber);
  const filings = await provider.listAnnualReportFilings(orgNumber);
  for (const filing of filings) {
    await upsertAnnualReportFilingDiscovery({ companyId: company.id, fiscalYear: filing.fiscalYear, sourceSystem: filing.sourceSystem, sourceUrl: filing.sourceUrl, sourceDiscoveryKey: filing.sourceDiscoveryKey, sourceIdempotencyKey: filing.sourceIdempotencyKey, sourceDocumentType: filing.sourceDocumentType, discoveredAt: filing.discoveredAt });
  }
  const latestDiscoveredFiscalYear = filings.map((filing) => filing.fiscalYear).sort((left, right) => right - left)[0] ?? null;
  await upsertCompanyFinancialCoverage({
    companyId: company.id,
    latestDiscoveredFiscalYear,
    latestDownloadedFiscalYear: existingPublished?.financialCoverage?.latestDownloadedFiscalYear ?? undefined,
    latestPublishedFiscalYear: existingPublished?.financialCoverage?.latestPublishedFiscalYear ?? undefined,
    latestSuccessfulFilingId: existingPublished?.financialCoverage?.latestSuccessfulFilingId ?? undefined,
    lastCheckedAt: new Date(),
    nextCheckAt: nextCheckDate(24),
    coverageStatus:
      existingPublished?.financialCoverage?.coverageStatus && existingPublished.financialCoverage.coverageStatus !== "UNCHECKED"
        ? existingPublished.financialCoverage.coverageStatus
        : filings.length > 0
          ? "DISCOVERED"
        : "UNCHECKED",
  });
  logPipelineEvent("filing.discovery_completed", {
    orgNumber,
    companyId: company.id,
    discoveredFilings: filings.length,
    latestDiscoveredFiscalYear,
  });
  return { orgNumber, companyName: company.name, discoveredFilings: filings.length, fiscalYears: filings.map((filing) => filing.fiscalYear).sort((left, right) => right - left) };
}

export async function processPendingAnnualReportFilings(options?: { orgNumbers?: string[]; limit?: number; statuses?: AnnualReportFilingStatus[] }) {
  const filings = await listPendingAnnualReportFilings({ orgNumbers: options?.orgNumbers, limit: options?.limit, statuses: options?.statuses });
  const results = [];
  for (const filing of filings) {
    try {
      results.push(await processAnnualReportFiling(filing.id));
    } catch (error) {
      logRecoverableError("annual-report-financials.processPending", error, { filingId: filing.id, orgNumber: filing.company.orgNumber, fiscalYear: filing.fiscalYear });
      results.push({ filingId: filing.id, fiscalYear: filing.fiscalYear, published: false, error: error instanceof Error ? error.message : "Unknown processing error" });
    }
  }
  return results;
}

export async function backfillAnnualReportFilings(options?: { orgNumbers?: string[]; limit?: number }) {
  const companies = await listCompaniesForFinancialSync({ orgNumbers: options?.orgNumbers, limit: options?.limit });
  const discovered = [];
  for (const company of companies) discovered.push(await discoverAnnualReportFilingsForCompany(company.orgNumber));
  const processed = await processPendingAnnualReportFilings({ orgNumbers: options?.orgNumbers });
  logPipelineEvent("backfill.completed", {
    companyCount: companies.length,
    discoveredCount: discovered.reduce((sum, item) => sum + item.discoveredFilings, 0),
    processedCount: processed.length,
  });
  return { discovered, processed };
}

export async function syncNewAnnualReportFilings(options?: { orgNumbers?: string[]; limit?: number }) {
  const companies = await listCompaniesForFinancialSync({ orgNumbers: options?.orgNumbers, onlyDue: true, limit: options?.limit });
  if (companies.length === 0) return { checkedCompanies: 0, discovered: [], versionChecks: [], processed: [] };
  const discovered = [];
  const versionChecks = [];
  for (const company of companies) {
    discovered.push(await discoverAnnualReportFilingsForCompany(company.orgNumber));
    versionChecks.push(...(await verifyLatestKnownFilingHashes(company.id)));
  }
  const processed = await processPendingAnnualReportFilings({ orgNumbers: companies.map((company) => company.orgNumber) });
  logPipelineEvent("sync.completed", {
    checkedCompanies: companies.length,
    discoveredCount: discovered.reduce((sum, item) => sum + item.discoveredFilings, 0),
    versionCheckCount: versionChecks.length,
    processedCount: processed.length,
  });
  return { checkedCompanies: companies.length, discovered, versionChecks, processed };
}

export async function reprocessLowConfidenceAnnualReportFilings(options?: { orgNumbers?: string[]; limit?: number }) {
  return reprocessAnnualReportFilingsByCriteria({
    orgNumbers: options?.orgNumbers,
    maxQualityScore: 0.9,
    limit: options?.limit,
  });
}

export async function listAnnualReportReviewQueue(options?: {
  statuses?: AnnualReportReviewStatus[];
  ruleCodes?: string[];
  orgNumbers?: string[];
  limit?: number;
}) {
  const reviews = await listAnnualReportReviews({
    statuses: options?.statuses ?? ["PENDING_REVIEW", "REPROCESS_REQUESTED"],
    ruleCodes: options?.ruleCodes,
    orgNumbers: options?.orgNumbers,
    limit: options?.limit,
  });

  return reviews.map((review) => {
    const payload =
      review.reviewPayload && typeof review.reviewPayload === "object"
        ? (review.reviewPayload as Record<string, any>)
        : null;

    return {
      reviewId: review.id,
      status: review.status,
      company: review.company,
      fiscalYear: review.fiscalYear,
      filingId: review.filingId,
      extractionRunId: review.extractionRunId,
      filingStatus: review.filing.status,
      qualityScore: review.qualityScore,
      sourcePrecedenceAttempted: review.sourcePrecedenceAttempted,
      blockingIssueCount: review.blockingIssueCount,
      blockingRuleCodes: review.blockingRuleCodes,
      blockingIssues: summarizeBlockingReasons(payload),
      pageReferences: review.pageReferences,
      latestActionNote: review.latestActionNote,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      resolvedAt: review.resolvedAt,
      selectedFacts: Array.isArray(payload?.selectedFacts) ? payload.selectedFacts : [],
      classifications: Array.isArray(payload?.classifications) ? payload.classifications : [],
    };
  });
}

export async function updateAnnualReportReview(
  reviewId: string,
  status: AnnualReportReviewStatus,
  latestActionNote?: string,
) {
  const review = await updateAnnualReportReviewStatus({ reviewId, status, latestActionNote });
  logPipelineEvent("review.updated", {
    reviewId,
    filingId: review.filingId,
    extractionRunId: review.extractionRunId,
    status,
  });
  return review;
}

export async function reprocessAnnualReportFilingById(
  filingId: string,
  options?: { note?: string },
) {
  const filing = await getAnnualReportFilingWithArtifacts(filingId);
  if (!filing) {
    throw new Error(`Fant ikke filing ${filingId}.`);
  }

  if (filing.status === "PROCESSING") {
    return {
      filingId,
      fiscalYear: filing.fiscalYear,
      skipped: true,
      reason: "Filing is already processing",
      published: false,
    };
  }

  const openReviews = filing.reviews.filter((review) =>
    ["PENDING_REVIEW", "REPROCESS_REQUESTED"].includes(review.status),
  );
  for (const review of openReviews) {
    await updateAnnualReportReviewStatus({
      reviewId: review.id,
      status: "REPROCESS_REQUESTED",
      latestActionNote: options?.note ?? "Operator requested reprocessing",
    });
  }

  await updateAnnualReportFiling(filing.id, {
    parserVersionLastTried: ANNUAL_REPORT_PARSER_VERSION,
    lastError: null,
  });
  logPipelineEvent("filing.reprocess_requested", {
    filingId: filing.id,
    fiscalYear: filing.fiscalYear,
    openReviewCount: openReviews.length,
  });
  return processAnnualReportFiling(filing.id, { force: true });
}

export async function reprocessAnnualReportFilingsByCriteria(options?: {
  filingIds?: string[];
  orgNumbers?: string[];
  fiscalYearFrom?: number;
  fiscalYearTo?: number;
  parserVersions?: string[];
  maxQualityScore?: number;
  limit?: number;
  note?: string;
}) {
  const filings = await listAnnualReportFilingsForReprocessing(options);
  const results = [];
  for (const filing of filings) {
    try {
      results.push(
        await reprocessAnnualReportFilingById(filing.id, { note: options?.note }),
      );
    } catch (error) {
      logRecoverableError("annual-report-financials.reprocess", error, {
        filingId: filing.id,
        orgNumber: filing.company.orgNumber,
        fiscalYear: filing.fiscalYear,
      });
      results.push({
        filingId: filing.id,
        fiscalYear: filing.fiscalYear,
        published: false,
        error: error instanceof Error ? error.message : "Unknown reprocessing error",
      });
    }
  }

  return {
    matchedFilings: filings.map((filing) => ({
      filingId: filing.id,
      orgNumber: filing.company.orgNumber,
      fiscalYear: filing.fiscalYear,
      latestParserVersion: filing.extractionRuns[0]?.parserVersion ?? null,
      latestConfidenceScore: filing.extractionRuns[0]?.confidenceScore ?? null,
    })),
    results,
  };
}

export async function inspectCompanyFinancialCoverage(options?: {
  orgNumbers?: string[];
  limit?: number;
  onlyDue?: boolean;
}) {
  const companies = await listCompaniesForFinancialSync({
    orgNumbers: options?.orgNumbers,
    limit: options?.limit,
    onlyDue: options?.onlyDue,
  });

  return companies.map((company) => ({
    companyId: company.id,
    orgNumber: company.orgNumber,
    name: company.name,
    coverage: company.financialCoverage,
  }));
}

export async function listNewlyDiscoveredPendingFilings(options?: {
  orgNumbers?: string[];
  limit?: number;
}) {
  const filings = await listPendingAnnualReportFilings({
    orgNumbers: options?.orgNumbers,
    limit: options?.limit,
    statuses: ["DISCOVERED", "DOWNLOADED", "PREFLIGHTED"],
  });

  return filings.map((filing) => ({
    filingId: filing.id,
    orgNumber: filing.company.orgNumber,
    companyName: filing.company.name,
    fiscalYear: filing.fiscalYear,
    status: filing.status,
    discoveredAt: filing.discoveredAt,
    downloadedAt: filing.downloadedAt,
    sourceUrl: filing.sourceUrl,
    sourceDocumentHash: filing.sourceDocumentHash,
  }));
}

export async function getAnnualReportPipelineOverview(options?: {
  orgNumbers?: string[];
  sampleLimit?: number;
}) {
  const sampleLimit = options?.sampleLimit ?? 20;
  const [metrics, reviewQueue, pendingFilings, dueCoverage] = await Promise.all([
    getAnnualReportPipelineMetrics(),
    listAnnualReportReviewQueue({
      statuses: ["PENDING_REVIEW", "REPROCESS_REQUESTED"],
      orgNumbers: options?.orgNumbers,
      limit: sampleLimit,
    }),
    listNewlyDiscoveredPendingFilings({
      orgNumbers: options?.orgNumbers,
      limit: sampleLimit,
    }),
    inspectCompanyFinancialCoverage({
      orgNumbers: options?.orgNumbers,
      limit: sampleLimit,
      onlyDue: true,
    }),
  ]);

  return {
    parserVersion: ANNUAL_REPORT_PARSER_VERSION,
    metrics,
    reviewQueue,
    pendingFilings,
    dueCoverage,
  };
}

export async function getLatestPublishedStatementProvenance(
  orgNumber: string,
  fiscalYear?: number,
) {
  const record = await getPublishedFinancialsForCompany(orgNumber);
  if (!record) {
    throw new Error(`Fant ikke virksomhet ${orgNumber}.`);
  }

  const statement =
    fiscalYear === undefined
      ? record.financialStatements[0] ?? null
      : record.financialStatements.find((item) => item.fiscalYear === fiscalYear) ?? null;

  if (!statement) {
    return null;
  }

  return {
    company: {
      id: record.id,
      orgNumber: record.orgNumber,
      name: record.name,
    },
    fiscalYear: statement.fiscalYear,
    statementId: statement.id,
    sourceFilingId: statement.sourceFilingId,
    sourceExtractionRunId: statement.sourceExtractionRunId,
    qualityStatus: statement.qualityStatus,
    qualityScore: statement.qualityScore,
    sourcePrecedence: statement.sourcePrecedence,
    unitScale: statement.unitScale,
    publishedAt: statement.publishedAt,
    normalizedAt: statement.normalizedAt,
  };
}

export async function getPublishedAnnualReportFinancials(orgNumber: string): Promise<{ statements: NormalizedFinancialStatement[]; documents: NormalizedFinancialDocument[]; availability: DataAvailability }> {
  const record = await getPublishedFinancialsForCompany(orgNumber);
  if (!record) return { statements: [], documents: [], availability: { available: false, sourceSystem: "BRREG", message: "Virksomheten finnes ikke i lokal ProjectX-lagring ennå." } };
  const statements = mapPublishedStatements(record.financialStatements);
  const documents = mapPublishedDocuments(record.annualReportFilings);
  return { statements, documents, availability: buildAvailability(statements) };
}

export async function syncCompanyAnnualReportFinancials(orgNumber: string) {
  await discoverAnnualReportFilingsForCompany(orgNumber);
  await processPendingAnnualReportFilings({ orgNumbers: [orgNumber] });
  return getPublishedAnnualReportFinancials(orgNumber);
}

export async function validatePublishedAnnualReportFinancials(options?: { orgNumbers?: string[] }) {
  const companies = await listCompaniesForFinancialSync({ orgNumbers: options?.orgNumbers });
  const results: Array<{ orgNumber: string; fiscalYear: number; balanced: boolean }> = [];
  for (const company of companies) {
    const published = await getPublishedFinancialsForCompany(company.orgNumber);
    for (const statement of published?.financialStatements ?? []) {
      const payload = statement.rawPayload as Record<string, any>;
      const normalized = mapBrregFinancialStatement(payload, company.orgNumber);
      const validation = validateCanonicalFacts(buildPublishedCanonicalFacts(payload, statement.fiscalYear));
      results.push({ orgNumber: company.orgNumber, fiscalYear: statement.fiscalYear, balanced: !validation.issues.some((issue) => issue.severity === "ERROR") && normalized.assets !== null && normalized.assets !== undefined && normalized.equity !== null && normalized.equity !== undefined });
    }
  }
  return results;
}
