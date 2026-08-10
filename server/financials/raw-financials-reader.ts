import {
  SIMULATED_EXPORT_DISCLAIMER,
  buildFinancialDisclosure,
  type FinancialDisclosure,
} from "@/lib/financial-simulation-disclosure";
import { prisma } from "@/lib/prisma";
import type {
  FinancialDatasetMode,
  FinancialDatasetVersion,
  FinancialStatementOrigin,
  FinancialValueOrigin,
} from "@/lib/types";
import {
  financialsRepository,
  type FinancialsRepository,
} from "@/server/financials/financials-repository";

type CompanyIdentity = { id: string };
const STRUCTURED_BRREG_ENTITY_TYPE = "structuredAnnualAccounts";

function isPublicRawStatement(statement: {
  statementOrigin: FinancialStatementOrigin;
  sourceSystem: string;
  sourceEntityType: string;
}) {
  return (
    statement.statementOrigin !== "reported" ||
    (
      statement.sourceSystem === "BRREG" &&
      statement.sourceEntityType === STRUCTURED_BRREG_ENTITY_TYPE
    )
  );
}

const statementScopeOrder = { COMPANY: 0, CONSOLIDATED: 1 } as const;
const statementTypeOrder = { INCOME_STATEMENT: 0, BALANCE_SHEET: 1 } as const;

function compareStatements(
  left: { fiscalYear: number; statementScope: "COMPANY" | "CONSOLIDATED"; liveStatementId: string },
  right: { fiscalYear: number; statementScope: "COMPANY" | "CONSOLIDATED"; liveStatementId: string },
) {
  return (
    right.fiscalYear - left.fiscalYear ||
    statementScopeOrder[left.statementScope] - statementScopeOrder[right.statementScope] ||
    left.liveStatementId.localeCompare(right.liveStatementId)
  );
}

function compareLines(left: RawFinancialLine, right: RawFinancialLine) {
  return (
    right.fiscalYear - left.fiscalYear ||
    statementScopeOrder[left.statementScope] - statementScopeOrder[right.statementScope] ||
    statementTypeOrder[left.statementType] - statementTypeOrder[right.statementType] ||
    left.rowIndex - right.rowIndex ||
    left.liveLineId.localeCompare(right.liveLineId)
  );
}

export type RawFinancialStatement = {
  liveStatementId: string;
  reportedStatementId: string | null;
  fiscalYear: number;
  statementScope: "COMPANY" | "CONSOLIDATED";
  statementOrigin: FinancialStatementOrigin;
  financialDatasetVersion: FinancialDatasetVersion;
  taxonomyVersion: string | null;
  generatorVersion: string | null;
  currency: string;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
};

export type RawFinancialLine = {
  id: string;
  liveLineId: string;
  liveStatementId: string;
  reportedFinancialLineItemId: string | null;
  fiscalYear: number;
  statementType: "INCOME_STATEMENT" | "BALANCE_SHEET";
  statementScope: "COMPANY" | "CONSOLIDATED";
  originalLabel: string;
  originalValue: string;
  parsedValue: string | null;
  canonicalKey: string | null;
  conceptKey: string | null;
  currency: string;
  unitScale: number;
  sourcePage: null;
  rowIndex: number;
  extractionRoute: null;
  confidence: null;
  publicationSource: "LIVE_REPORTED" | "FI_SIM";
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  sourceExtractionRunId: null;
  fetchedAt: Date;
  normalizedAt: Date;
  publishedAt: null;
  valueOrigin: FinancialValueOrigin;
  statementOrigin: FinancialStatementOrigin;
  financialDatasetVersion: FinancialDatasetVersion;
  taxonomyVersion: string | null;
  generatorVersion: string | null;
  derivationRuleId: string | null;
};

export type RawCompanyFinancials = {
  source: "live";
  datasetMode: FinancialDatasetMode;
  financialDatasetVersion: FinancialDatasetVersion;
  /**
   * Travels with the payload rather than being left to the caller to reconstruct. A raw extract is
   * the surface most likely to be pasted somewhere else, so the disclaimer has to be inside it.
   */
  disclosure: FinancialDisclosure & { disclaimer: string | null };
  statements: RawFinancialStatement[];
  data: RawFinancialLine[];
};

export function createRawFinancialsReader(
  companyStore: {
    findCompany(companyReference: string): Promise<CompanyIdentity | null>;
  },
  repository: Pick<FinancialsRepository, "getCompaniesFinancials">,
) {
  return {
    async readCompany(input: {
      companyReference: string;
      fiscalYear?: number;
    }): Promise<RawCompanyFinancials | null> {
      const company = await companyStore.findCompany(input.companyReference);
      if (!company) return null;

      const snapshot = await repository.getCompaniesFinancials({
        companyIds: [company.id],
        ...(input.fiscalYear === undefined ? {} : { fiscalYear: input.fiscalYear }),
      });
      const statements = snapshot.statements
        .filter(isPublicRawStatement)
        .sort(compareStatements);

      const disclosure = buildFinancialDisclosure(snapshot);
      return {
        source: "live",
        datasetMode: snapshot.datasetMode,
        financialDatasetVersion: snapshot.financialDatasetVersion,
        disclosure: {
          ...disclosure,
          disclaimer: disclosure.simulated ? SIMULATED_EXPORT_DISCLAIMER : null,
        },
        statements: statements.map((statement) => ({
          liveStatementId: statement.liveStatementId,
          reportedStatementId: statement.reportedStatementId,
          fiscalYear: statement.fiscalYear,
          statementScope: statement.statementScope,
          statementOrigin: statement.statementOrigin,
          financialDatasetVersion: statement.financialDatasetVersion,
          taxonomyVersion: statement.taxonomyVersion,
          generatorVersion: statement.generatorVersion,
          currency: statement.currency,
          sourceSystem: statement.sourceSystem,
          sourceEntityType: statement.sourceEntityType,
          sourceId: statement.sourceId,
          fetchedAt: statement.fetchedAt,
          normalizedAt: statement.normalizedAt,
        })),
        data: statements.flatMap((statement) =>
          statement.lines.map((line) => ({
            id: line.liveLineId,
            liveLineId: line.liveLineId,
            liveStatementId: line.liveStatementId,
            reportedFinancialLineItemId: line.reportedFinancialLineItemId,
            fiscalYear: statement.fiscalYear,
            statementType: line.statementType,
            statementScope: statement.statementScope,
            originalLabel: line.sourceLabel ?? line.conceptKey ?? line.metricKey ?? "",
            originalValue: line.value?.toString() ?? "",
            parsedValue: line.value?.toString() ?? null,
            canonicalKey: line.metricKey,
            conceptKey: line.conceptKey,
            currency: line.currency,
            unitScale: line.unitScale,
            sourcePage: null,
            rowIndex: line.sortOrder,
            extractionRoute: null,
            confidence: null,
            publicationSource:
              line.valueOrigin === "synthetic" ? "FI_SIM" as const : "LIVE_REPORTED" as const,
            sourceSystem: line.sourceSystem,
            sourceEntityType: line.sourceEntityType,
            sourceId: line.sourceId,
            sourceExtractionRunId: null,
            fetchedAt: line.fetchedAt,
            normalizedAt: line.normalizedAt,
            publishedAt: null,
            valueOrigin: line.valueOrigin,
            statementOrigin: line.statementOrigin,
            financialDatasetVersion: line.financialDatasetVersion,
            taxonomyVersion: line.taxonomyVersion,
            generatorVersion: line.generatorVersion,
            derivationRuleId: line.derivationRuleId,
          })),
        ).sort(compareLines),
      };
    },
  };
}

export const rawFinancialsReader = createRawFinancialsReader(
  {
    async findCompany(companyReference) {
      return prisma.company.findFirst({
        where: {
          OR: [{ slug: companyReference }, { orgNumber: companyReference }],
        },
        select: { id: true },
      });
    },
  },
  financialsRepository,
);

export type RawFinancialsReader = typeof rawFinancialsReader;
