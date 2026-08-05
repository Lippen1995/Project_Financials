/**
 * Tier 0 ingestion: publishes FinancialStatement snapshots from
 * Regnskapsregisteret's structured JSON (exact whole-NOK values, latest filed
 * year). No OCR involved — this is the cheapest and most accurate source for
 * headline figures, and its canonical anchor values back OCR validation and
 * ML gold-set generation.
 *
 * Precedence rules:
 *  - Replaces PDF/OCR and reviewer-derived headline statements for the same
 *    (company, year, scope); Brreg is source of truth for these core fields.
 *  - Published with HIGH_CONFIDENCE / score 1.0 / MACHINE_READABLE precedence,
 *    which the existing publish gate treats as non-replaceable by later OCR
 *    runs (different sourceFilingId + higher quality score).
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  BrregFinancialsProvider,
  StructuredAnnualAccountsResult,
} from "@/integrations/brreg/brreg-financials-provider";
import {
  StructuredAnnualAccounts,
  StructuredRegnskapContractError,
} from "@/integrations/brreg/structured-regnskap";
import { logRecoverableError } from "@/lib/recoverable-error";
import type { SourceMetadata } from "@/lib/types";
import { findCompanyByOrgNumber } from "@/server/persistence/annual-report-ingestion-repository";

const provider = new BrregFinancialsProvider();

const STRUCTURED_SOURCE_SYSTEM = "BRREG";
const STRUCTURED_SOURCE_ENTITY_TYPE = "structuredAnnualAccounts";
const AVAILABLE_CACHE_MS = 24 * 60 * 60 * 1000;
const UNAVAILABLE_CACHE_MS = 7 * AVAILABLE_CACHE_MS;
const ERROR_RETRY_BASE_MS = 15 * 60 * 1000;
const ERROR_RETRY_MAX_MS = 6 * 60 * 60 * 1000;

/**
 * PENDING is written by the ingestion queue when a company has been enqueued
 * from the request path but not yet fetched. The ingestion service itself only
 * ever writes the other three.
 */
export type StructuredFinancialFetchStatus =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "ERROR"
  | "PENDING";

export type StructuredFinancialFetchStateRecord = SourceMetadata & {
  status: StructuredFinancialFetchStatus;
  unavailableReason: string | null;
  nextCheckAt: Date;
  failureCount: number;
  latestFiscalYear: number | null;
  lastErrorCode: string | null;
};

export type StructuredFinancialsContext = {
  companyId: string;
  hasStructuredStatements: boolean;
  latestStatementFetchedAt: Date | null;
  latestStructuredFiscalYear?: number | null;
  state: StructuredFinancialFetchStateRecord | null;
};

export type StructuredFinancialFetchStateInput = StructuredFinancialFetchStateRecord & {
  lastCheckedAt: Date;
};

export type StructuredFinancialsRepository = {
  loadContext(orgNumber: string): Promise<StructuredFinancialsContext | null>;
  publish(
    companyId: string,
    accounts: StructuredAnnualAccounts,
  ): Promise<"published" | "skipped_reviewed">;
  saveFetchState(
    companyId: string,
    state: StructuredFinancialFetchStateInput,
  ): Promise<void>;
};

type StructuredFinancialsProviderContract = {
  fetchStructuredAnnualAccounts(orgNumber: string): Promise<StructuredAnnualAccountsResult>;
};

function toBigIntOrNull(value: number | null): bigint | null {
  return value === null ? null : BigInt(value);
}

async function publishStructuredStatement(input: {
  companyId: string;
  accounts: StructuredAnnualAccounts;
}): Promise<"published" | "skipped_reviewed"> {
  const { companyId, accounts } = input;

  return prisma.$transaction(async (tx) => {
    // Provenance link to the PDF filing for the same fiscal year when known.
    const filing = await tx.annualReportFiling.findFirst({
      where: { companyId, fiscalYear: accounts.fiscalYear, isLatestForFiscalYear: true },
      select: { id: true },
    });

    const values = {
      currency: accounts.currency,
      revenue: toBigIntOrNull(accounts.revenue),
      operatingProfit: toBigIntOrNull(accounts.operatingProfit),
      netIncome: toBigIntOrNull(accounts.netIncome),
      equity: toBigIntOrNull(accounts.equity),
      assets: toBigIntOrNull(accounts.assets),
      sourceSystem: accounts.sourceSystem,
      sourceEntityType: accounts.sourceEntityType,
      sourceId: accounts.sourceId,
      fetchedAt: accounts.fetchedAt,
      normalizedAt: accounts.normalizedAt,
      rawPayload: {
        structuredAnnualAccounts: true,
        modelVersion: accounts.modelVersion,
        period: accounts.period,
        amountUnit: accounts.amountUnit,
        unitScale: accounts.unitScale,
        canonicalValues: accounts.canonicalValues,
        oppstillingsplan: accounts.oppstillingsplan,
        isParentCompany: accounts.isParentCompany,
        isLiquidationAccounts: accounts.isLiquidationAccounts,
      } as unknown as Prisma.InputJsonValue,
      sourceFilingId: filing?.id ?? null,
      sourceExtractionRunId: null,
      qualityStatus: "HIGH_CONFIDENCE" as const,
      qualityScore: 1,
      unitScale: accounts.unitScale,
      sourcePrecedence: "MACHINE_READABLE" as const,
      publishedAt: accounts.normalizedAt,
    };

    await tx.financialStatement.upsert({
      where: {
        companyId_fiscalYear_statementScope: {
          companyId,
          fiscalYear: accounts.fiscalYear,
          statementScope: accounts.statementScope,
        },
      },
      update: values,
      create: {
        companyId,
        fiscalYear: accounts.fiscalYear,
        statementScope: accounts.statementScope,
        ...values,
      },
    });

    return "published" as const;
  });
}

/**
 * Anchors for the extraction pipeline: exact canonical values from the
 * structured registry statement for (company, fiscalYear), COMPANY scope.
 */
export async function loadStructuredAnchors(
  companyId: string,
  fiscalYear: number,
): Promise<{ fiscalYear: number; values: Record<string, number> } | null> {
  const statement = await prisma.financialStatement.findFirst({
    where: {
      companyId,
      fiscalYear,
      statementScope: "COMPANY",
      sourceEntityType: STRUCTURED_SOURCE_ENTITY_TYPE,
    },
    select: { rawPayload: true },
  });
  const payload = statement?.rawPayload as { canonicalValues?: Record<string, number> } | null;
  const values = payload?.canonicalValues;
  if (!values || Object.keys(values).length === 0) return null;
  return { fiscalYear, values };
}

export type StructuredIngestionResult = {
  orgNumber: string;
  status: "AVAILABLE" | "UNAVAILABLE" | "STALE" | "ERROR";
  available: boolean;
  fromCache: boolean;
  published: number;
  skippedReviewed: number;
  unavailableReason: string | null;
  fiscalYears: number[];
  errorCode: string | null;
  nextCheckAt: Date;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
};

function addMilliseconds(value: Date, milliseconds: number) {
  return new Date(value.getTime() + milliseconds);
}

function cachedResult(
  orgNumber: string,
  context: StructuredFinancialsContext,
): StructuredIngestionResult {
  const state = context.state;
  if (!state) {
    throw new Error("Mangler cachetilstand for strukturert regnskap.");
  }
  if (state.status === "PENDING") {
    // A queued company has never been fetched, so there is nothing to serve
    // from cache. performEnsureForCompany must always fetch these.
    throw new Error(
      "Ventende hentetilstand skal alltid hentes på nytt, ikke leses fra cache.",
    );
  }

  const hasLastOfficialSnapshot = context.hasStructuredStatements;
  const status =
    state.status === "ERROR"
      ? hasLastOfficialSnapshot
        ? "STALE"
        : "ERROR"
      : state.status;
  const latestFiscalYear =
    state.latestFiscalYear ?? context.latestStructuredFiscalYear ?? null;

  return {
    orgNumber,
    status,
    available: status === "AVAILABLE" || status === "STALE",
    fromCache: true,
    published: 0,
    skippedReviewed: 0,
    unavailableReason:
      status === "UNAVAILABLE" ? state.unavailableReason : null,
    fiscalYears: latestFiscalYear === null ? [] : [latestFiscalYear],
    errorCode: state.lastErrorCode,
    nextCheckAt: state.nextCheckAt,
    sourceSystem: state.sourceSystem,
    sourceEntityType: state.sourceEntityType,
    sourceId: state.sourceId,
    fetchedAt: state.fetchedAt,
    normalizedAt: state.normalizedAt,
  };
}

export function createStructuredFinancialsService(dependencies: {
  repository: StructuredFinancialsRepository;
  provider: StructuredFinancialsProviderContract;
  now?: () => Date;
}) {
  const { repository, provider: sourceProvider } = dependencies;
  const now = dependencies.now ?? (() => new Date());
  const inFlightByOrgNumber = new Map<string, Promise<StructuredIngestionResult>>();

  async function performEnsureForCompany(
    orgNumber: string,
    options: { forceRefresh?: boolean } = {},
  ): Promise<StructuredIngestionResult> {
    const context = await repository.loadContext(orgNumber);
    if (!context) {
      throw new Error(`Fant ikke virksomhet ${orgNumber}.`);
    }

    const checkedAt = now();
    if (
      !options.forceRefresh &&
      context.state &&
      // Queued companies have never been fetched — always go to the source.
      context.state.status !== "PENDING" &&
      (context.state.status !== "AVAILABLE" || context.hasStructuredStatements) &&
      context.state.nextCheckAt.getTime() > checkedAt.getTime()
    ) {
      return cachedResult(orgNumber, context);
    }

    let sourceFetchComplete = false;
    try {
      const sourceResult =
        await sourceProvider.fetchStructuredAnnualAccounts(orgNumber);
      sourceFetchComplete = true;
      const publishableAccounts = sourceResult.accounts.filter(
        (entry) => !entry.isLiquidationAccounts,
      );
      let published = 0;
      let skippedReviewed = 0;

      for (const accounts of publishableAccounts) {
        const outcome = await repository.publish(context.companyId, accounts);
        if (outcome === "published") {
          published += 1;
        } else {
          skippedReviewed += 1;
        }
      }

      const fiscalYears = publishableAccounts
        .map((entry) => entry.fiscalYear)
        .sort((left, right) => right - left);
      const available = fiscalYears.length > 0;
      const status: StructuredFinancialFetchStatus = available
        ? "AVAILABLE"
        : "UNAVAILABLE";
      const unavailableReason =
        available
          ? null
          : sourceResult.unavailableReason ??
            (sourceResult.accounts.length > 0
              ? "Bare avviklingsregnskap er tilgjengelig."
              : "Strukturert regnskap er ikke tilgjengelig.");
      const nextCheckAt = addMilliseconds(
        checkedAt,
        available ? AVAILABLE_CACHE_MS : UNAVAILABLE_CACHE_MS,
      );

      await repository.saveFetchState(context.companyId, {
        status,
        unavailableReason,
        lastCheckedAt: checkedAt,
        nextCheckAt,
        failureCount: 0,
        lastErrorCode: null,
        latestFiscalYear:
          fiscalYears[0] ?? context.latestStructuredFiscalYear ?? null,
        sourceSystem: sourceResult.sourceSystem,
        sourceEntityType: sourceResult.sourceEntityType,
        sourceId: sourceResult.sourceId,
        fetchedAt: sourceResult.fetchedAt,
        normalizedAt: sourceResult.normalizedAt,
        rawPayload: sourceResult.rawPayload,
      });

      return {
        orgNumber,
        status,
        available,
        fromCache: false,
        published,
        skippedReviewed,
        unavailableReason,
        fiscalYears,
        errorCode: null,
        nextCheckAt,
        sourceSystem: sourceResult.sourceSystem,
        sourceEntityType: sourceResult.sourceEntityType,
        sourceId: sourceResult.sourceId,
        fetchedAt: sourceResult.fetchedAt,
        normalizedAt: sourceResult.normalizedAt,
      };
    } catch (error) {
      if (sourceFetchComplete) {
        throw error;
      }
      const failureCount = (context.state?.failureCount ?? 0) + 1;
      const retryDelay = Math.min(
        ERROR_RETRY_BASE_MS * 2 ** (failureCount - 1),
        ERROR_RETRY_MAX_MS,
      );
      const nextCheckAt = addMilliseconds(checkedAt, retryDelay);
      const errorCode =
        error instanceof StructuredRegnskapContractError
          ? "BRREG_CONTRACT_ERROR"
          : "BRREG_UNAVAILABLE";
      const previousSource = context.state;

      await repository.saveFetchState(context.companyId, {
        status: "ERROR",
        unavailableReason: null,
        lastCheckedAt: checkedAt,
        nextCheckAt,
        failureCount,
        lastErrorCode: errorCode,
        latestFiscalYear:
          previousSource?.latestFiscalYear ??
          context.latestStructuredFiscalYear ??
          null,
        sourceSystem: previousSource?.sourceSystem ?? "BRREG",
        sourceEntityType:
          previousSource?.sourceEntityType ??
          "structuredAnnualAccountsError",
        sourceId: previousSource?.sourceId ?? orgNumber,
        fetchedAt: previousSource?.fetchedAt ?? checkedAt,
        normalizedAt: checkedAt,
        rawPayload: {
          errorCode,
          previousSourceFetchedAt:
            previousSource?.fetchedAt.toISOString() ?? null,
        },
      });

      logRecoverableError("structured-financials.ensure", error, {
        orgNumber,
        errorCode,
        failureCount,
        hasLastOfficialSnapshot: context.hasStructuredStatements,
      });

      return {
        orgNumber,
        status: context.hasStructuredStatements ? "STALE" : "ERROR",
        available: context.hasStructuredStatements,
        fromCache: context.hasStructuredStatements,
        published: 0,
        skippedReviewed: 0,
        unavailableReason: context.hasStructuredStatements
          ? null
          : "Brønnøysundregistrenes regnskapstjeneste er midlertidig utilgjengelig.",
        fiscalYears:
          context.latestStructuredFiscalYear !== undefined &&
          context.latestStructuredFiscalYear !== null
            ? [context.latestStructuredFiscalYear]
            : previousSource?.latestFiscalYear !== null &&
                previousSource?.latestFiscalYear !== undefined
              ? [previousSource.latestFiscalYear]
              : [],
        errorCode,
        nextCheckAt,
        sourceSystem: previousSource?.sourceSystem ?? "BRREG",
        sourceEntityType:
          previousSource?.sourceEntityType ?? "structuredAnnualAccountsError",
        sourceId: previousSource?.sourceId ?? orgNumber,
        fetchedAt: previousSource?.fetchedAt ?? checkedAt,
        normalizedAt: checkedAt,
      };
    }
  }

  function ensureForCompany(
    orgNumber: string,
    options: { forceRefresh?: boolean } = {},
  ): Promise<StructuredIngestionResult> {
    const existing = inFlightByOrgNumber.get(orgNumber);
    if (existing) return existing;

    const request = performEnsureForCompany(orgNumber, options);
    inFlightByOrgNumber.set(orgNumber, request);
    const clearRequest = () => {
      if (inFlightByOrgNumber.get(orgNumber) === request) {
        inFlightByOrgNumber.delete(orgNumber);
      }
    };
    void request.then(clearRequest, clearRequest);
    return request;
  }

  return { ensureForCompany };
}

const prismaStructuredFinancialsRepository: StructuredFinancialsRepository = {
  async loadContext(orgNumber) {
    const company = await findCompanyByOrgNumber(orgNumber);
    if (!company) return null;

    const [state, latestStatement] = await Promise.all([
      prisma.structuredFinancialFetchState.findUnique({
        where: { companyId: company.id },
      }),
      prisma.financialStatement.findFirst({
        where: {
          companyId: company.id,
          sourceSystem: STRUCTURED_SOURCE_SYSTEM,
          sourceEntityType: STRUCTURED_SOURCE_ENTITY_TYPE,
        },
        orderBy: [{ fiscalYear: "desc" }, { fetchedAt: "desc" }],
        select: { fiscalYear: true, fetchedAt: true },
      }),
    ]);

    return {
      companyId: company.id,
      hasStructuredStatements: latestStatement !== null,
      latestStatementFetchedAt: latestStatement?.fetchedAt ?? null,
      latestStructuredFiscalYear: latestStatement?.fiscalYear ?? null,
      state: state
        ? {
            status: state.status as StructuredFinancialFetchStatus,
            unavailableReason: state.unavailableReason,
            nextCheckAt: state.nextCheckAt,
            failureCount: state.failureCount,
            latestFiscalYear: state.latestFiscalYear,
            lastErrorCode: state.lastErrorCode,
            sourceSystem: state.sourceSystem,
            sourceEntityType: state.sourceEntityType,
            sourceId: state.sourceId,
            fetchedAt: state.fetchedAt,
            normalizedAt: state.normalizedAt,
            rawPayload: state.rawPayload,
          }
        : null,
    };
  },

  publish(companyId, accounts) {
    return publishStructuredStatement({ companyId, accounts });
  },

  async saveFetchState(companyId, state) {
    const values = {
      status: state.status,
      unavailableReason: state.unavailableReason,
      lastCheckedAt: state.lastCheckedAt,
      nextCheckAt: state.nextCheckAt,
      failureCount: state.failureCount,
      lastErrorCode: state.lastErrorCode,
      latestFiscalYear: state.latestFiscalYear,
      sourceSystem: state.sourceSystem,
      sourceEntityType: state.sourceEntityType,
      sourceId: state.sourceId,
      fetchedAt: state.fetchedAt,
      normalizedAt: state.normalizedAt,
      rawPayload:
        state.rawPayload === undefined
          ? Prisma.JsonNull
          : (state.rawPayload as Prisma.InputJsonValue),
    };

    await prisma.structuredFinancialFetchState.upsert({
      where: { companyId },
      update: values,
      create: { companyId, ...values },
    });
  },
};

const structuredFinancialsService = createStructuredFinancialsService({
  repository: prismaStructuredFinancialsRepository,
  provider,
});

/**
 * Read-only view of what the database knows about a company's structured
 * financials. Performs no external call, so it is safe on the request path.
 */
export async function readStructuredFinancialsState(
  orgNumber: string,
): Promise<StructuredFinancialsContext | null> {
  return prismaStructuredFinancialsRepository.loadContext(orgNumber);
}

/**
 * Read-through fetch: calls Brreg when the cache is cold.
 *
 * Do NOT call this from a request path — the product rule is that user
 * requests read the database and enqueue instead (see
 * structured-financials-queue-service). This remains for background workers
 * and CLI batches.
 */
export async function ensureStructuredFinancialsForCompany(
  orgNumber: string,
): Promise<StructuredIngestionResult> {
  return structuredFinancialsService.ensureForCompany(orgNumber);
}

export async function ingestStructuredFinancialsForCompany(
  orgNumber: string,
): Promise<StructuredIngestionResult> {
  return structuredFinancialsService.ensureForCompany(orgNumber, {
    forceRefresh: true,
  });
}
