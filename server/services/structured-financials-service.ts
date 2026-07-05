/**
 * Tier 0 ingestion: publishes FinancialStatement snapshots from
 * Regnskapsregisteret's structured JSON (exact whole-NOK values, latest filed
 * year). No OCR involved — this is the cheapest and most accurate source for
 * headline figures, and its canonical anchor values back OCR validation and
 * ML gold-set generation.
 *
 * Precedence rules:
 *  - Never replaces reviewer-published statements.
 *  - Replaces machine/OCR statements for the same (company, year, scope) —
 *    the structured registry values are exact.
 *  - Published with HIGH_CONFIDENCE / score 1.0 / MACHINE_READABLE precedence,
 *    which the existing publish gate treats as non-replaceable by later OCR
 *    runs (different sourceFilingId + higher quality score).
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { BrregFinancialsProvider } from "@/integrations/brreg/brreg-financials-provider";
import { StructuredAnnualAccounts } from "@/integrations/brreg/structured-regnskap";
import { findCompanyByOrgNumber } from "@/server/persistence/annual-report-ingestion-repository";

const provider = new BrregFinancialsProvider();

const STRUCTURED_SOURCE_SYSTEM = "BRREG";
const STRUCTURED_SOURCE_ENTITY_TYPE = "structuredAnnualAccounts";

function toBigIntOrNull(value: number | null): bigint | null {
  return value === null ? null : BigInt(value);
}

function isReviewedStatement(statement: {
  sourceSystem: string;
  sourceEntityType: string;
  rawPayload: Prisma.JsonValue;
}): boolean {
  const payload =
    statement.rawPayload && typeof statement.rawPayload === "object"
      ? (statement.rawPayload as Record<string, unknown>)
      : null;
  return (
    statement.sourceSystem === "PROJECT_FINANCIALS_REVIEW" ||
    statement.sourceEntityType === "annualReportReviewedFact" ||
    payload?.reviewed === true
  );
}

async function publishStructuredStatement(input: {
  companyId: string;
  accounts: StructuredAnnualAccounts;
  fetchedAt: Date;
}): Promise<"published" | "skipped_reviewed"> {
  const { companyId, accounts, fetchedAt } = input;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.financialStatement.findUnique({
      where: {
        companyId_fiscalYear_statementScope: {
          companyId,
          fiscalYear: accounts.fiscalYear,
          statementScope: accounts.statementScope,
        },
      },
      select: { sourceSystem: true, sourceEntityType: true, rawPayload: true },
    });

    if (existing && isReviewedStatement(existing)) {
      return "skipped_reviewed";
    }

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
      sourceSystem: STRUCTURED_SOURCE_SYSTEM,
      sourceEntityType: STRUCTURED_SOURCE_ENTITY_TYPE,
      sourceId:
        accounts.journalnr ??
        `structured:${accounts.fiscalYear}:${accounts.sourceEntryId ?? "unknown"}`,
      fetchedAt,
      normalizedAt: fetchedAt,
      rawPayload: {
        structuredAnnualAccounts: true,
        canonicalValues: accounts.canonicalValues,
        oppstillingsplan: accounts.oppstillingsplan,
        isParentCompany: accounts.isParentCompany,
        isLiquidationAccounts: accounts.isLiquidationAccounts,
        entry: accounts.rawEntry,
      } as unknown as Prisma.InputJsonValue,
      sourceFilingId: filing?.id ?? null,
      sourceExtractionRunId: null,
      qualityStatus: "HIGH_CONFIDENCE" as const,
      qualityScore: 1,
      unitScale: 1,
      sourcePrecedence: "MACHINE_READABLE" as const,
      publishedAt: fetchedAt,
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

    return "published";
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
  published: number;
  skippedReviewed: number;
  unavailableReason: string | null;
  fiscalYears: number[];
};

export async function ingestStructuredFinancialsForCompany(
  orgNumber: string,
): Promise<StructuredIngestionResult> {
  const company = await findCompanyByOrgNumber(orgNumber);
  if (!company) throw new Error(`Fant ikke virksomhet ${orgNumber}.`);

  const fetchedAt = new Date();
  const { accounts, unavailableReason } = await provider.fetchStructuredAnnualAccounts(orgNumber);

  let published = 0;
  let skippedReviewed = 0;
  const fiscalYears: number[] = [];

  for (const entry of accounts) {
    // Liquidation accounts describe a wind-down period, not a normal fiscal
    // year — skip rather than overwrite ordinary statements.
    if (entry.isLiquidationAccounts) continue;
    const outcome = await publishStructuredStatement({
      companyId: company.id,
      accounts: entry,
      fetchedAt,
    });
    if (outcome === "published") {
      published += 1;
      fiscalYears.push(entry.fiscalYear);
    } else {
      skippedReviewed += 1;
    }
  }

  return { orgNumber, published, skippedReviewed, unavailableReason, fiscalYears };
}
