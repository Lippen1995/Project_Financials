import { createHash } from "node:crypto";

import type { AnnualReportArtifact } from "@prisma/client";

import { BrregFinancialsProvider } from "@/integrations/brreg/brreg-financials-provider";
import {
  isValidNorwegianOrganizationNumber,
  normalizeNorwegianOrganizationNumber,
} from "@/lib/norwegian-organization-number";
import {
  extractBoardReport,
  type BoardReportExtractionResult,
  type BoardReportExtractionSource,
} from "@/integrations/brreg/annual-report-financials/board-report-extractor";
import { preflightAnnualReportDocument } from "@/integrations/brreg/annual-report-financials/preflight";
import { buildScannedBoardReportDocument } from "@/integrations/brreg/annual-report-financials/scanned-board-report-document";
import {
  buildUnifiedParserDocumentFromStructuredDocument,
  buildUnifiedParserDocumentFromPreflightResult,
  type UnifiedParserDocument,
} from "@/integrations/brreg/annual-report-financials/unified-parser-document-model";
import { LocalAnnualReportArtifactStorage } from "@/server/financials/artifact-storage";
import {
  createAnnualReportArtifact,
  getAnnualReportFilingWithArtifacts,
} from "@/server/persistence/annual-report-ingestion-repository";
import {
  findLatestBoardReportFilingId,
  persistBoardReportExtraction,
  publishAcceptedBoardReportExtraction,
} from "@/server/persistence/board-report-extraction-repository";
import { parseAnnualReportPdfWithOpenDataLoader } from "@/server/document-understanding/opendataloader-client";
import { resolveOpenDataLoaderConfig } from "@/server/document-understanding/opendataloader-config";

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_PDF_PAGES = 1_000;

export type BoardReportFilingInput = {
  id: string;
  companyId: string;
  fiscalYear: number;
  sourceSystem: string;
  sourceUrl: string;
  sourceDocumentType: string;
  company: { id: string; orgNumber: string; name: string };
  artifacts?: AnnualReportArtifact[];
};

type LoadedOfficialPdf = {
  buffer: Buffer;
  sourceDocumentHash: string;
  fetchedAt: Date;
};

type BuiltDocument = {
  document: UnifiedParserDocument;
  autoPublishEligible: boolean;
  warnings: string[];
};

type BoardReportExtractionDependencies = {
  findFilingId?(orgNumber: string, fiscalYear: number): Promise<string | null>;
  loadFiling(filingId: string): Promise<BoardReportFilingInput | null>;
  loadOfficialPdf(filing: BoardReportFilingInput): Promise<LoadedOfficialPdf>;
  buildDocument(
    pdfBuffer: Buffer,
    filing: BoardReportFilingInput,
  ): Promise<UnifiedParserDocument | BuiltDocument>;
  extract(
    document: UnifiedParserDocument,
    source: BoardReportExtractionSource,
  ): BoardReportExtractionResult;
  persistResult(input: {
    companyId: string;
    result: BoardReportExtractionResult;
  }): Promise<{ id: string; normalizedAt?: Date }>;
  persistArtifacts(input: {
    filingId: string;
    result: BoardReportExtractionResult;
  }): Promise<void>;
  publish(
    extractionId: string,
    options?: { minimumConfidenceExclusive?: number },
  ): Promise<unknown>;
};

export type ExtractBoardReportOptions = {
  persist?: boolean;
  publish?: boolean;
  allowOcrAutoPublish?: boolean;
  publishMinConfidence?: number;
};

export type ExtractBoardReportOutcome = {
  result: BoardReportExtractionResult;
  extractionId: string | null;
  published: boolean;
};

export function boardReportPublicationPolicyTag(minimumConfidenceExclusive: number): string {
  return `publication-policy-gt-${Math.round(minimumConfidenceExclusive * 10_000)}bp-v2`;
}

export class BoardReportExtractionError extends Error {
  constructor(
    readonly code: "SOURCE_UNAVAILABLE" | "FAILED",
    message: string,
  ) {
    super(message);
    this.name = "BoardReportExtractionError";
  }
}

function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function validatePdfBuffer(buffer: Buffer): void {
  if (buffer.length === 0 || buffer.length > MAX_PDF_BYTES) {
    throw new Error(`Annual-report PDF size is outside the allowed range (1-${MAX_PDF_BYTES}).`);
  }
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("Annual-report source is not a valid PDF payload.");
  }
}

function assertOfficialBrregAnnualReportUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Annual-report filing has an invalid source URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "data.brreg.no" ||
    !url.pathname.startsWith("/regnskapsregisteret/regnskap/aarsregnskap/kopi/")
  ) {
    throw new Error("Annual-report filing URL is outside the official Brreg allowlist.");
  }
}

const artifactStorage = new LocalAnnualReportArtifactStorage();
const financialsProvider = new BrregFinancialsProvider();

const defaultDependencies: BoardReportExtractionDependencies = {
  findFilingId: findLatestBoardReportFilingId,
  async loadFiling(filingId) {
    return getAnnualReportFilingWithArtifacts(filingId);
  },

  async loadOfficialPdf(filing) {
    if (filing.sourceSystem !== "BRREG" || filing.sourceDocumentType !== "ANNUAL_REPORT_PDF") {
      throw new Error("Board reports can only be extracted from official Brreg annual-report filings.");
    }
    assertOfficialBrregAnnualReportUrl(filing.sourceUrl);
    const existing = [...(filing.artifacts ?? [])]
      .filter((artifact) => artifact.artifactType === "PDF")
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
    if (existing) {
      const buffer = await artifactStorage.getArtifactBuffer(existing.storageKey);
      validatePdfBuffer(buffer);
      const actualHash = sha256(buffer);
      if (actualHash !== existing.checksum) {
        throw new Error("Stored annual-report PDF checksum does not match its artifact record.");
      }
      return { buffer, sourceDocumentHash: actualHash, fetchedAt: existing.createdAt };
    }

    const download = await financialsProvider.downloadAnnualReportPdf(filing.sourceUrl);
    validatePdfBuffer(download.buffer);
    const sourceDocumentHash = sha256(download.buffer);
    const fetchedAt = new Date();
    const stored = await artifactStorage.putArtifact({
      filingId: filing.id,
      artifactType: "PDF",
      filename: `${filing.company.orgNumber}-${filing.fiscalYear}-${sourceDocumentHash.slice(0, 12)}.pdf`,
      content: download.buffer,
    });
    await createAnnualReportArtifact({
      filingId: filing.id,
      artifactType: "PDF",
      storageKey: stored.storageKey,
      checksum: sourceDocumentHash,
      mimeType: download.mimeType,
      metadata: { sourceUrl: filing.sourceUrl, fetchedAt: fetchedAt.toISOString() },
    });
    return { buffer: download.buffer, sourceDocumentHash, fetchedAt };
  },

  async buildDocument(pdfBuffer, filing) {
    validatePdfBuffer(pdfBuffer);
    const preflight = await preflightAnnualReportDocument(pdfBuffer);
    if (preflight.pageCount > MAX_PDF_PAGES) {
      throw new Error(`Annual-report PDF exceeds the ${MAX_PDF_PAGES}-page safety limit.`);
    }
    const hasMixedImagePages =
      (preflight.diagnostics?.likelyImageOnlyPages.length ?? 0) > 0;
    if (preflight.hasReliableTextLayer && !hasMixedImagePages) {
      return {
        document: buildUnifiedParserDocumentFromPreflightResult({
          preflight,
          route: "TEXT_LAYER",
          source: {
            filingId: filing.id,
            orgNumber: filing.company.orgNumber,
            fiscalYear: filing.fiscalYear,
            documentEngine: "pdfjs",
            parserVersion: "board-report-text-layer-v1",
          },
          shadowOnly: false,
        }),
        autoPublishEligible: true,
        warnings: [],
      };
    }

    const likelyImageOnlyPageCount = preflight.diagnostics?.likelyImageOnlyPages.length ?? 0;
    const isImageOnlyScan = likelyImageOnlyPageCount >= Math.max(1, preflight.pageCount * 0.8);
    if (isImageOnlyScan) {
      const scanned = await buildScannedBoardReportDocument({
        pdfBuffer,
        pageCount: preflight.pageCount,
        source: {
          filingId: filing.id,
          orgNumber: filing.company.orgNumber,
          fiscalYear: filing.fiscalYear,
        },
      });
      return {
        document: scanned.document,
        autoPublishEligible: false,
        warnings: [
          `Document is an image-only scan (${likelyImageOnlyPageCount}/${preflight.pageCount} pages); local OCR was selected directly.`,
          ...scanned.warnings,
          "OCR-derived board-report text must be reviewed before publication.",
        ],
      };
    }

    const openDataLoaderConfig = resolveOpenDataLoaderConfig();
    if (openDataLoaderConfig.enabled) {
      try {
        const parsed = await parseAnnualReportPdfWithOpenDataLoader({
          pdfBuffer,
          sourceFilename: `${filing.company.orgNumber}-${filing.fiscalYear}.pdf`,
          preflight,
          config: openDataLoaderConfig,
        });
        const route =
          parsed.routing.executionMode === "hybrid" ? "HYBRID" : "OPENDATALOADER_LOCAL";
        return {
          document: buildUnifiedParserDocumentFromStructuredDocument({
            parsedPages: parsed.annualReportPages,
            sections: preflight.structuredDocument?.sections ?? [],
            route,
            source: {
              filingId: filing.id,
              orgNumber: filing.company.orgNumber,
              fiscalYear: filing.fiscalYear,
              documentEngine: parsed.engine,
              parserVersion: parsed.engineVersion,
            },
            shadowOnly: false,
          }),
          autoPublishEligible: false,
          warnings: [
            `Document required ${route}; extracted text must be reviewed before publication.`,
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          document: buildUnifiedParserDocumentFromPreflightResult({
            preflight,
            route: "TEXT_LAYER",
            source: {
              filingId: filing.id,
              orgNumber: filing.company.orgNumber,
              fiscalYear: filing.fiscalYear,
              documentEngine: "pdfjs",
              parserVersion: "board-report-text-layer-v1",
            },
            shadowOnly: false,
          }),
          autoPublishEligible: false,
          warnings: [`OpenDataLoader fallback failed: ${message}`],
        };
      }
    }

    return {
      document: buildUnifiedParserDocumentFromPreflightResult({
        preflight,
        route: "TEXT_LAYER",
        source: {
          filingId: filing.id,
          orgNumber: filing.company.orgNumber,
          fiscalYear: filing.fiscalYear,
          documentEngine: "pdfjs",
          parserVersion: "board-report-text-layer-v1",
        },
        shadowOnly: false,
      }),
      autoPublishEligible: false,
      warnings: [
        "The document does not have a reliable text layer and OpenDataLoader is disabled.",
      ],
    };
  },

  extract: extractBoardReport,
  persistResult: persistBoardReportExtraction,

  async persistArtifacts({ filingId, result }) {
    const jsonContent = Buffer.from(JSON.stringify(result, null, 2), "utf8");
    const storedJson = await artifactStorage.putArtifact({
      filingId,
      artifactType: "BOARD_REPORT_EXTRACTION_JSON",
      filename: `${result.sourceDocumentHash.slice(0, 12)}-${result.extractorVersion}.json`,
      content: jsonContent,
    });
    await createAnnualReportArtifact({
      filingId,
      artifactType: "BOARD_REPORT_EXTRACTION_JSON",
      storageKey: storedJson.storageKey,
      checksum: sha256(jsonContent),
      mimeType: "application/json",
      metadata: {
        extractorVersion: result.extractorVersion,
        sourceDocumentHash: result.sourceDocumentHash,
        status: result.status,
      },
    });

    if (["EXTRACTED", "MANUAL_REVIEW"].includes(result.status) && result.text) {
      const storedText = await artifactStorage.putArtifact({
        filingId,
        artifactType: "BOARD_REPORT_TEXT",
        filename: `${result.sourceDocumentHash.slice(0, 12)}-${result.extractorVersion}.txt`,
        content: result.text,
      });
      await createAnnualReportArtifact({
        filingId,
        artifactType: "BOARD_REPORT_TEXT",
        storageKey: storedText.storageKey,
        checksum: sha256(result.text),
        mimeType: "text/plain; charset=utf-8",
        metadata: {
          extractorVersion: result.extractorVersion,
          sourceDocumentHash: result.sourceDocumentHash,
          pageStart: result.pageStart,
          pageEnd: result.pageEnd,
          pageRanges: result.pageRanges,
        },
      });
    }
  },

  publish: publishAcceptedBoardReportExtraction,
};

function isBuiltDocument(value: UnifiedParserDocument | BuiltDocument): value is BuiltDocument {
  return "document" in value;
}

export class BoardReportExtractionService {
  constructor(private readonly dependencies: BoardReportExtractionDependencies = defaultDependencies) {}

  async extractForFiling(
    filingId: string,
    options: ExtractBoardReportOptions = {},
  ): Promise<ExtractBoardReportOutcome> {
    const persist = options.persist ?? true;
    const publish = options.publish ?? false;
    const publishMinConfidence = options.publishMinConfidence ?? 0;
    if (
      !Number.isFinite(publishMinConfidence) ||
      publishMinConfidence < 0 ||
      publishMinConfidence >= 1
    ) {
      throw new Error("Publication confidence threshold must be in the range [0, 1).");
    }
    const filing = await this.dependencies.loadFiling(filingId);
    if (!filing) {
      throw new BoardReportExtractionError(
        "SOURCE_UNAVAILABLE",
        `Annual-report filing not found: ${filingId}`,
      );
    }
    if (filing.sourceSystem !== "BRREG" || filing.sourceDocumentType !== "ANNUAL_REPORT_PDF") {
      throw new Error("Board reports can only be extracted from official Brreg annual-report filings.");
    }

    const pdf = await this.dependencies.loadOfficialPdf(filing);
    validatePdfBuffer(pdf.buffer);
    const builtValue = await this.dependencies.buildDocument(pdf.buffer, filing);
    const built = isBuiltDocument(builtValue)
      ? builtValue
      : { document: builtValue, autoPublishEligible: true, warnings: [] };
    let result = this.dependencies.extract(built.document, {
      sourceSystem: "BRREG",
      sourceEntityType: "ANNUAL_REPORT_PDF",
      sourceId: `${filing.company.orgNumber}-${filing.fiscalYear}`,
      sourceUrl: filing.sourceUrl,
      sourceDocumentHash: pdf.sourceDocumentHash,
      fetchedAt: pdf.fetchedAt.toISOString(),
    });
    result = {
      ...result,
      extractorVersion: `${result.extractorVersion}:${built.document.source.parserVersion ?? built.document.source.route.toLowerCase()}`,
    };

    if (options.allowOcrAutoPublish === true && built.document.source.route === "OCR") {
      result = {
        ...result,
        extractorVersion: `${result.extractorVersion}:${boardReportPublicationPolicyTag(publishMinConfidence)}`,
      };
    }

    const ocrPublicationGatePassed =
      options.allowOcrAutoPublish === true &&
      built.document.source.route === "OCR" &&
      result.status === "EXTRACTED" &&
      result.confidence > publishMinConfidence;

    if (ocrPublicationGatePassed && built.warnings.length > 0) {
      result = {
        ...result,
        warnings: [
          ...result.warnings,
          ...built.warnings.map((message) => ({
            code: "OCR_AUTO_PUBLICATION_POLICY",
            message,
          })),
        ],
      };
    }

    if (!built.autoPublishEligible && result.status === "EXTRACTED" && !ocrPublicationGatePassed) {
      result = {
        ...result,
        status: "MANUAL_REVIEW",
        confidence: Math.min(result.confidence, 0.89),
        warnings: [
          ...result.warnings,
          ...built.warnings.map((message) => ({ code: "UNRELIABLE_TEXT_LAYER", message })),
        ],
      };
    }

    if (!persist) return { result, extractionId: null, published: false };

    const extraction = await this.dependencies.persistResult({
      companyId: filing.companyId,
      result,
    });
    if (extraction.normalizedAt) {
      result = { ...result, normalizedAt: extraction.normalizedAt.toISOString() };
    }
    await this.dependencies.persistArtifacts({ filingId: filing.id, result });

    const shouldPublish =
      publish &&
      result.status === "EXTRACTED" &&
      result.confidence > publishMinConfidence;
    if (shouldPublish) {
      await this.dependencies.publish(extraction.id, {
        minimumConfidenceExclusive: publishMinConfidence,
      });
    }

    return { result, extractionId: extraction.id, published: shouldPublish };
  }

  async extractForCompanyYear(
    orgNumberInput: string,
    fiscalYear: number,
    options: ExtractBoardReportOptions = {},
  ): Promise<ExtractBoardReportOutcome> {
    const orgNumber = normalizeNorwegianOrganizationNumber(orgNumberInput);
    if (!isValidNorwegianOrganizationNumber(orgNumber)) {
      throw new Error("Organization number must be a valid Norwegian organization number.");
    }
    if (!Number.isInteger(fiscalYear) || fiscalYear < 1990 || fiscalYear > new Date().getFullYear()) {
      throw new Error("Fiscal year is outside the supported range.");
    }
    if (!this.dependencies.findFilingId) {
      throw new Error("Company/year filing resolution is not configured.");
    }
    const filingId = await this.dependencies.findFilingId(orgNumber, fiscalYear);
    if (!filingId) {
      throw new BoardReportExtractionError(
        "SOURCE_UNAVAILABLE",
        `No official Brreg annual-report filing found for ${orgNumber}/${fiscalYear}.`,
      );
    }
    return this.extractForFiling(filingId, options);
  }
}
