/**
 * Reads published financials for a company.
 *
 * This is the read half of what used to live inside
 * annual-report-financials-service.ts — a 3,300-line module whose other half is
 * the PDF/OCR extraction pipeline. Every live consumer of published financials
 * (the company page, the public financials gate, Njord's enrich tool) only
 * needed the read, but importing it pulled the whole extraction chain — OCR,
 * page classification, table reconstruction, OpenDataLoader — into the live
 * dependency graph. Splitting the read out lets the extraction side be
 * quarantined without taking the product with it.
 *
 * Nothing here is source-specific. It reads FinancialStatement,
 * PublishedFinancialLineItem and AnnualReportFiling and maps them to the
 * normalised shapes the UI consumes. Which of those rows a caller is *allowed*
 * to show is a separate decision, made by the public source gate in
 * public-financials-service.
 */
import { prisma } from "@/lib/prisma";
import { getHeadlineFinancialStatements } from "@/lib/financial-statements";
import type {
  DataAvailability,
  NormalizedFinancialDocument,
  NormalizedFinancialStatement,
} from "@/lib/types";
import { toSafeNumber } from "@/server/financials/number-utils";

type PublishedFilingRow = {
  id: string;
  fiscalYear: number;
  sourceSystem: string;
  sourceUrl: string;
  status: string;
  discoveredAt: Date;
  downloadedAt: Date | null;
  sourceDocumentHash: string | null;
};

/**
 * Minimal company lookup for financial ingestion.
 *
 * Also defined in annual-report-ingestion-repository, but importing it from
 * there pulled 1,366 lines of OCR ingestion into the live graph for the sake of
 * one findUnique.
 */
export async function findCompanyByOrgNumber(orgNumber: string) {
  return prisma.company.findUnique({
    where: { orgNumber },
    select: {
      id: true,
      orgNumber: true,
      name: true,
      slug: true,
    },
  });
}

export async function getPublishedFinancialsForCompany(orgNumber: string) {
  return prisma.company.findUnique({
    where: { orgNumber },
    select: {
      id: true,
      orgNumber: true,
      name: true,
      financialStatements: {
        orderBy: { fiscalYear: "desc" },
      },
      publishedLineItems: {
        orderBy: [
          { fiscalYear: "desc" },
          { statementType: "asc" },
          { sortOrder: "asc" },
        ],
        select: {
          id: true,
          filingId: true,
          fiscalYear: true,
          statementType: true,
          statementScope: true,
          metricKey: true,
          rawLabel: true,
          originalLabel: true,
          originalValue: true,
          value: true,
          finalInput: true,
          currency: true,
          unitScale: true,
          sourcePage: true,
          sortOrder: true,
          publicationSource: true,
          sourceSystem: true,
          sourceEntityType: true,
          sourceId: true,
        },
      },
      annualReportFilings: {
        orderBy: [{ fiscalYear: "desc" }, { discoveredAt: "desc" }],
      },
      financialCoverage: true,
    },
  });
}

function mapPublishedDocuments(
  filings: PublishedFilingRow[],
): NormalizedFinancialDocument[] {
  return filings.map((filing) => ({
    sourceSystem: filing.sourceSystem,
    sourceEntityType: "annualReportFiling",
    sourceId: filing.id,
    fetchedAt: filing.discoveredAt,
    normalizedAt: filing.downloadedAt ?? filing.discoveredAt,
    rawPayload: { status: filing.status, sourceDocumentHash: filing.sourceDocumentHash },
    year: filing.fiscalYear,
    filingId: filing.id,
    status: filing.status as NormalizedFinancialDocument["status"],
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
    statementScope?: "COMPANY" | "CONSOLIDATED";
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
    statementScope: statement.statementScope ?? "COMPANY",
    revenue: toSafeNumber(statement.revenue),
    operatingProfit: toSafeNumber(statement.operatingProfit),
    netIncome: toSafeNumber(statement.netIncome),
    equity: toSafeNumber(statement.equity),
    assets: toSafeNumber(statement.assets),
  }));
}

export function mapPublishedLineItems(
  items: Array<{
    id: string;
    filingId: string;
    fiscalYear: number;
    statementType: string;
    statementScope: "COMPANY" | "CONSOLIDATED";
    metricKey: string | null;
    rawLabel: string | null;
    originalLabel: string | null;
    originalValue: string | null;
    value: bigint | null;
    finalInput: bigint | null;
    currency: string;
    unitScale: number;
    sourcePage: number | null;
    sortOrder: number;
    publicationSource: "MANUAL_REVIEW" | "MACHINE_EXTRACTION";
    sourceSystem: string | null;
    sourceEntityType: string | null;
    sourceId: string | null;
  }>,
) {
  return items.flatMap((item) => {
    if (
      !(["INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW"] as const).includes(
        item.statementType as "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW",
      )
    )
      return [];
    const sourceValue = toSafeNumber(item.finalInput ?? item.value);
    const scaledValue = sourceValue === null ? null : sourceValue * item.unitScale;
    return [
      {
        id: item.id,
        filingId: item.filingId,
        fiscalYear: item.fiscalYear,
        statementType: item.statementType as
          | "INCOME_STATEMENT"
          | "BALANCE_SHEET"
          | "CASH_FLOW",
        statementScope: item.statementScope,
        metricKey: item.metricKey,
        label: item.rawLabel ?? item.originalLabel ?? item.metricKey ?? "Uten etikett",
        originalValue: item.originalValue,
        value: Number.isSafeInteger(scaledValue) ? scaledValue : null,
        currency: item.currency,
        unitScale: item.unitScale,
        sourcePage: item.sourcePage,
        sortOrder: item.sortOrder,
        publicationSource: item.publicationSource,
        sourceSystem: item.sourceSystem,
        sourceEntityType: item.sourceEntityType,
        sourceId: item.sourceId,
      },
    ];
  });
}

/**
 * Prefer an as-reported line-item value over the headline column when the same
 * concept exists in both, so the figure shown matches the filed statement.
 *
 * Never applied to a structured Brreg statement. Those values come from the
 * registry as exact whole-NOK figures — they are already as-reported, so there
 * is nothing to improve. Line items, by contrast, only ever came from the
 * PDF/OCR estate, and letting them win silently replaced official figures with
 * extracted ones on a statement that still declared `sourceSystem: BRREG`.
 * REITAN's 2024 group revenue showed 111,274,000,000 from a MANUAL_REVIEW line
 * item while the registry said 112,806,000,000. The public source gate could
 * not catch it: it checks the statement's provenance, and the provenance was
 * still Brreg — only the numbers had been swapped.
 */
function isStructuredBrregStatement(statement: NormalizedFinancialStatement) {
  return (
    statement.sourceSystem === "BRREG" &&
    statement.sourceEntityType === "structuredAnnualAccounts"
  );
}

function applyAsReportedHeadlineValues(
  statements: NormalizedFinancialStatement[],
  lineItems: ReturnType<typeof mapPublishedLineItems>,
) {
  const valueFor = (
    statement: NormalizedFinancialStatement,
    statementType: "INCOME_STATEMENT" | "BALANCE_SHEET",
    metricKeys: string[],
  ) =>
    lineItems.find(
      (item) =>
        item.fiscalYear === statement.fiscalYear &&
        item.statementScope === (statement.statementScope ?? "COMPANY") &&
        item.statementType === statementType &&
        item.metricKey !== null &&
        metricKeys.includes(item.metricKey) &&
        item.value !== null,
    )?.value;

  return statements.map((statement) => {
    if (isStructuredBrregStatement(statement)) return statement;

    return {
    ...statement,
    revenue:
      valueFor(statement, "INCOME_STATEMENT", ["revenue", "total_operating_income"]) ??
      statement.revenue,
    operatingProfit:
      valueFor(statement, "INCOME_STATEMENT", ["operating_profit"]) ??
      statement.operatingProfit,
    netIncome:
      valueFor(statement, "INCOME_STATEMENT", ["net_income"]) ?? statement.netIncome,
    equity: valueFor(statement, "BALANCE_SHEET", ["total_equity"]) ?? statement.equity,
    assets: valueFor(statement, "BALANCE_SHEET", ["total_assets"]) ?? statement.assets,
    };
  });
}

function buildPublicAvailability(
  statements: NormalizedFinancialStatement[],
): DataAvailability {
  return statements.length === 0
    ? {
        available: false,
        sourceSystem: "BRREG",
        message:
          "Regnskapstall hentes fra offisielle årsrapporter og oppdateres fortløpende.",
      }
    : {
        available: true,
        sourceSystem: "BRREG",
        message: "Regnskap oppdateres automatisk når nye årsrapporter behandles.",
      };
}

export async function getPublishedAnnualReportFinancials(orgNumber: string) {
  const record = await getPublishedFinancialsForCompany(orgNumber);
  if (!record) {
    return {
      statements: [],
      allScopeStatements: [],
      lineItems: [],
      documents: [],
      availability: {
        available: false,
        sourceSystem: "BRREG",
        message: "Virksomheten finnes ikke i lokal Fjord Insight-lagring ennå.",
      },
    };
  }

  // allScopeStatements keeps both konsern and selskap rows (for the toggle);
  // statements is deduped to one headline statement per year so callers that
  // expect one-per-year (KPIs, distress, trends) are not double-counted.
  const lineItems = mapPublishedLineItems(record.publishedLineItems ?? []);
  const allScopeStatements = applyAsReportedHeadlineValues(
    mapPublishedStatements(record.financialStatements),
    lineItems,
  );
  const statements = getHeadlineFinancialStatements(allScopeStatements);
  const documents = mapPublishedDocuments(record.annualReportFilings);

  return {
    statements,
    allScopeStatements,
    lineItems,
    documents,
    availability: buildPublicAvailability(statements),
  };
}
