import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  getOwnershipAvailableYears,
  getSubsidiaryTraversal,
  type SubsidiaryTraversal,
} from "@/server/ownership/group-structure-service";
import { defineTool, type RetrievalTool } from "./types";

const inputSchema = z.object({
  parentOrgNumber: z.string().regex(/^\d{9}$/, "parentOrgNumber must be a 9-digit organisation number"),
  years: z.number().int().min(1).max(5),
});

export type EstimateGroupFinancialsInput = z.infer<typeof inputSchema>;

type StatementScope = "COMPANY" | "CONSOLIDATED";

export type GroupFinancialStatementRow = {
  id: string;
  orgNumber: string;
  fiscalYear: number;
  statementScope: StatementScope;
  currency: string;
  operatingProfit: bigint | null;
  netIncome: bigint | null;
  sourceFilingId: string | null;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
};

export type GroupDepreciationRow = {
  id: string;
  orgNumber: string;
  fiscalYear: number;
  filingId: string;
  currency: string;
  finalInput: bigint | null;
  value: bigint | null;
  unitScale: number;
  publicationSource: "MANUAL_REVIEW" | "MACHINE_EXTRACTION";
  publishedAt: Date;
  sourceSystem: string | null;
  sourceEntityType: string | null;
  sourceId: string | null;
  fetchedAt: Date | null;
  normalizedAt: Date | null;
};

export type GroupFinancialsDeps = {
  getCompany: (orgNumber: string) => Promise<{ orgNumber: string; name: string } | null>;
  getOwnershipAvailableYears: () => Promise<number[]>;
  getOwnershipProvenance: (
    taxYear: number,
    parentOrgNumber: string,
  ) => Promise<OwnershipSourceReference | null>;
  getSubsidiaryTraversal: (params: {
    orgNumber: string;
    year: number;
    maxDepth: number;
    maxNodes: number;
  }) => Promise<SubsidiaryTraversal>;
  getLatestFiscalYear: (parentOrgNumber: string) => Promise<number | null>;
  getStatements: (orgNumbers: string[], fiscalYears: number[]) => Promise<GroupFinancialStatementRow[]>;
  getDepreciationRows: (orgNumbers: string[], fiscalYears: number[]) => Promise<GroupDepreciationRow[]>;
};

export type SourceReference = {
  orgNumber: string;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: string;
  normalizedAt: string;
};

export type OwnershipSourceReference = SourceReference & {
  importStatus: "COMPLETED" | "PARTIAL";
};

type MetricResult = {
  complete: boolean;
  coveredEntityCount: number;
  entityCount: number;
  unadjustedAmount: { currency: string; value: string } | null;
  partialAmountsByCurrency: Array<{ currency: string; value: string }>;
  missingOrgNumbers: string[];
  sources: SourceReference[];
};

type OwnershipBasis =
  | "EXACT_YEAR"
  | "NEAREST_PRIOR_YEAR_ASSUMPTION"
  | "EARLIEST_AVAILABLE_YEAR_ASSUMPTION"
  | "NO_OWNERSHIP_DATA";

export type EstimateGroupFinancialsOutput = {
  parent: { orgNumber: string; name: string };
  requestedYears: number;
  answerStatus: "CALCULATED_UNADJUSTED_PRO_FORMA" | "INSUFFICIENT_DATA";
  method: "UNADJUSTED_PRO_FORMA";
  canRepresentConsolidatedAccounts: false;
  methodology: string;
  ebitdaDefinition: string;
  limitations: string[];
  currentOwnershipSnapshot: {
    taxYear: number | null;
    subsidiaryCount: number;
    traversalTruncated: boolean;
    entityOrgNumbers: string[];
    provenance: OwnershipSourceReference | null;
  };
  years: Array<{
    fiscalYear: number;
    ownershipSnapshot: {
      taxYear: number | null;
      basis: OwnershipBasis;
      provenance: OwnershipSourceReference | null;
    };
    ownershipTraversalTruncated: boolean;
    entityCount: number;
    subsidiaryCount: number;
    entityOrgNumbers: string[];
    publishedConsolidatedStatement: (SourceReference & {
      operatingProfit: { currency: string; value: string } | null;
      netIncome: { currency: string; value: string } | null;
    }) | null;
    ebit: MetricResult;
    ebitdaLike: MetricResult;
    netIncome: MetricResult;
  }>;
};

const LIMITATIONS = [
  "Interne transaksjoner og mellomværender er ikke eliminert.",
  "Investering i datterselskap er ikke eliminert mot datterselskapets egenkapital.",
  "Urealiserte interne gevinster, oppkjøpsanalyse, goodwill og merverdier er ikke justert.",
  "Minoritetsinteresser og endringer i konsernkrets gjennom året er ikke beregnet.",
  "Regnskapsprinsipper, perioder og valutaer er ikke harmonisert utover kontrollen som fremgår per nøkkeltall.",
] as const;

function sourceFromStatement(row: GroupFinancialStatementRow): SourceReference {
  return {
    orgNumber: row.orgNumber,
    sourceSystem: row.sourceSystem,
    sourceEntityType: row.sourceEntityType,
    sourceId: row.sourceId,
    fetchedAt: row.fetchedAt.toISOString(),
    normalizedAt: row.normalizedAt.toISOString(),
  };
}

function sourceFromDepreciation(row: GroupDepreciationRow): SourceReference | null {
  if (
    !row.sourceSystem ||
    !row.sourceEntityType ||
    !row.sourceId ||
    !row.fetchedAt ||
    !row.normalizedAt
  ) {
    return null;
  }
  return {
    orgNumber: row.orgNumber,
    sourceSystem: row.sourceSystem,
    sourceEntityType: row.sourceEntityType,
    sourceId: row.sourceId,
    fetchedAt: row.fetchedAt.toISOString(),
    normalizedAt: row.normalizedAt.toISOString(),
  };
}

function chooseOwnershipSnapshot(fiscalYear: number, availableYears: number[]) {
  if (availableYears.length === 0) {
    return { taxYear: null, basis: "NO_OWNERSHIP_DATA" as const };
  }
  if (availableYears.includes(fiscalYear)) {
    return { taxYear: fiscalYear, basis: "EXACT_YEAR" as const };
  }
  const prior = [...availableYears].filter((year) => year < fiscalYear).sort((a, b) => b - a)[0];
  if (prior !== undefined) {
    return { taxYear: prior, basis: "NEAREST_PRIOR_YEAR_ASSUMPTION" as const };
  }
  return {
    taxYear: [...availableYears].sort((a, b) => a - b)[0]!,
    basis: "EARLIEST_AVAILABLE_YEAR_ASSUMPTION" as const,
  };
}

function sumByCurrency(
  values: Array<{ currency: string; value: bigint }>,
): Array<{ currency: string; value: string }> {
  const sums = new Map<string, bigint>();
  for (const item of values) {
    sums.set(item.currency, (sums.get(item.currency) ?? 0n) + item.value);
  }
  return [...sums.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, value]) => ({ currency, value: value.toString() }));
}

function metricResult(params: {
  entityOrgNumbers: string[];
  values: Map<string, { currency: string; value: bigint; sources: SourceReference[] }>;
  graphComplete: boolean;
}): MetricResult {
  const missingOrgNumbers = params.entityOrgNumbers.filter((orgNumber) => !params.values.has(orgNumber));
  const partialAmountsByCurrency = sumByCurrency([...params.values.values()]);
  const complete =
    params.graphComplete &&
    missingOrgNumbers.length === 0 &&
    partialAmountsByCurrency.length === 1;
  return {
    complete,
    coveredEntityCount: params.values.size,
    entityCount: params.entityOrgNumbers.length,
    unadjustedAmount: complete ? partialAmountsByCurrency[0]! : null,
    partialAmountsByCurrency,
    missingOrgNumbers,
    sources: [...params.values.values()].flatMap((item) => item.sources),
  };
}

function chooseDepreciationRow(
  rows: GroupDepreciationRow[],
  statement: GroupFinancialStatementRow,
): GroupDepreciationRow | null {
  if (!statement.sourceFilingId) return null;
  const candidates = rows
    .filter((row) =>
      row.orgNumber === statement.orgNumber &&
      row.fiscalYear === statement.fiscalYear &&
      row.filingId === statement.sourceFilingId,
    )
    .sort((a, b) => {
      const manualA = a.publicationSource === "MANUAL_REVIEW" ? 1 : 0;
      const manualB = b.publicationSource === "MANUAL_REVIEW" ? 1 : 0;
      if (manualA !== manualB) return manualB - manualA;
      return b.publishedAt.getTime() - a.publishedAt.getTime();
    });
  return candidates[0] ?? null;
}

function productionDeps(): GroupFinancialsDeps {
  return {
    async getCompany(orgNumber) {
      const company = await prisma.company.findUnique({
        where: { orgNumber },
        select: { orgNumber: true, name: true },
      });
      if (company) return company;

      // RegistryEntity is the local BrÃ¸nnÃ¸ysund mirror and remains source of truth for the name
      // when the richer Company row has not yet been hydrated.
      const registryCompany = await prisma.registryEntity.findUnique({
        where: { orgNumber },
        select: { orgNumber: true, name: true },
      });
      return registryCompany;
    },
    getOwnershipAvailableYears,
    async getOwnershipProvenance(taxYear, parentOrgNumber) {
      const imported = await prisma.shareholderRegisterImport.findFirst({
        where: {
          taxYear,
          status: { in: ["COMPLETED", "PARTIAL"] },
        },
        orderBy: { completedAt: "desc" },
        select: {
          sourceSystem: true,
          status: true,
          sourceEntityType: true,
          sourceId: true,
          sourceChecksum: true,
          fetchedAt: true,
          normalizedAt: true,
        },
      });
      const graphBuild = await prisma.ownershipEdge.aggregate({
        where: { taxYear },
        _max: { builtAt: true },
      });
      const sourceId = imported?.sourceId ?? imported?.sourceChecksum ?? null;
      if (!imported || !sourceId || !graphBuild._max.builtAt) return null;
      if (imported.status !== "COMPLETED" && imported.status !== "PARTIAL") return null;
      return {
        orgNumber: parentOrgNumber,
        sourceSystem: imported.sourceSystem,
        sourceEntityType: "derivedOwnershipGraph",
        sourceId,
        fetchedAt: imported.fetchedAt.toISOString(),
        normalizedAt: graphBuild._max.builtAt.toISOString(),
        importStatus: imported.status,
      };
    },
    getSubsidiaryTraversal,
    async getLatestFiscalYear(parentOrgNumber) {
      const result = await prisma.financialStatement.aggregate({
        where: {
          statementScope: "COMPANY",
          company: { orgNumber: parentOrgNumber },
        },
        _max: { fiscalYear: true },
      });
      return result._max.fiscalYear;
    },
    async getStatements(orgNumbers, fiscalYears) {
      return prisma.financialStatement.findMany({
        where: {
          fiscalYear: { in: fiscalYears },
          company: { orgNumber: { in: orgNumbers } },
        },
        select: {
          id: true,
          fiscalYear: true,
          statementScope: true,
          currency: true,
          operatingProfit: true,
          netIncome: true,
          sourceFilingId: true,
          sourceSystem: true,
          sourceEntityType: true,
          sourceId: true,
          fetchedAt: true,
          normalizedAt: true,
          company: { select: { orgNumber: true } },
        },
      }).then((rows) => rows.map((row) => ({ ...row, orgNumber: row.company.orgNumber })));
    },
    async getDepreciationRows(orgNumbers, fiscalYears) {
      return prisma.publishedFinancialLineItem.findMany({
        where: {
          fiscalYear: { in: fiscalYears },
          statementScope: "COMPANY",
          metricKey: "depreciation_amortization",
          company: { orgNumber: { in: orgNumbers } },
        },
        select: {
          id: true,
          fiscalYear: true,
          filingId: true,
          currency: true,
          finalInput: true,
          value: true,
          unitScale: true,
          publicationSource: true,
          publishedAt: true,
          sourceSystem: true,
          sourceEntityType: true,
          sourceId: true,
          fetchedAt: true,
          normalizedAt: true,
          company: { select: { orgNumber: true } },
        },
      }).then((rows) => rows.map((row) => ({ ...row, orgNumber: row.company.orgNumber })));
    },
  };
}

export function createEstimateGroupFinancialsTool(
  deps: GroupFinancialsDeps,
): RetrievalTool<EstimateGroupFinancialsInput, EstimateGroupFinancialsOutput> {
  return defineTool({
    name: "estimate_group_financials",
    description:
      "Build a five-year-or-shorter UNADJUSTED pro-forma sum for a Norwegian parent and all controlled " +
      "subsidiaries using ownership snapshots and company-scope accounts. Returns EBIT, an EBITDA-like " +
      "amount (EBIT plus published depreciation/amortisation), net income, coverage and source records. " +
      "This is never a consolidated financial statement: never omit its limitations, never treat partial " +
      "sums as totals, and abstain when complete coverage is unavailable.",
    strict: true,
    inputSchema,
    parameters: {
      type: "object",
      properties: {
        parentOrgNumber: {
          type: "string",
          pattern: "^[0-9]{9}$",
          description: "The resolved 9-digit organisation number of the parent company.",
        },
        years: {
          type: "integer",
          minimum: 1,
          maximum: 5,
          description: "Number of latest fiscal years to analyse, maximum five.",
        },
      },
      required: ["parentOrgNumber", "years"],
      additionalProperties: false,
    },
    async execute({ parentOrgNumber, years }) {
      const parent = await deps.getCompany(parentOrgNumber);
      if (!parent) throw new Error(`Company ${parentOrgNumber} was not found.`);

      const availableOwnershipYears = await deps.getOwnershipAvailableYears();
      const latestOwnershipYear = [...availableOwnershipYears].sort((a, b) => b - a)[0];
      const currentTraversal = latestOwnershipYear === undefined
        ? { orgNumbers: [], truncated: false }
        : await deps.getSubsidiaryTraversal({
          orgNumber: parentOrgNumber,
          year: latestOwnershipYear,
          maxDepth: 8,
          maxNodes: 500,
        });
      const currentOwnershipProvenance = latestOwnershipYear === undefined
        ? null
        : await deps.getOwnershipProvenance(latestOwnershipYear, parentOrgNumber);
      const latestFiscalYear = await deps.getLatestFiscalYear(parentOrgNumber);

      if (latestFiscalYear === null) {
        return {
          parent,
          requestedYears: years,
          answerStatus: "INSUFFICIENT_DATA",
          method: "UNADJUSTED_PRO_FORMA",
          canRepresentConsolidatedAccounts: false,
          methodology: "No fiscal year could be established from published company-scope statements.",
          ebitdaDefinition: "EBIT plus the published depreciation/amortisation line; not an IFRS-defined subtotal.",
          limitations: [...LIMITATIONS],
          currentOwnershipSnapshot: {
            taxYear: latestOwnershipYear ?? null,
            subsidiaryCount: currentTraversal.orgNumbers.length,
            traversalTruncated: currentTraversal.truncated,
            entityOrgNumbers: [parentOrgNumber, ...currentTraversal.orgNumbers],
            provenance: currentOwnershipProvenance,
          },
          years: [],
        };
      }

      const fiscalYears = Array.from({ length: years }, (_, index) => latestFiscalYear - index);
      const memberships = await Promise.all(fiscalYears.map(async (fiscalYear) => {
        const snapshot = chooseOwnershipSnapshot(fiscalYear, availableOwnershipYears);
        const traversal = snapshot.taxYear === null
          ? { orgNumbers: [], truncated: false }
          : await deps.getSubsidiaryTraversal({
            orgNumber: parentOrgNumber,
            year: snapshot.taxYear,
            maxDepth: 8,
            maxNodes: 500,
          });
        const provenance = snapshot.taxYear === null
          ? null
          : await deps.getOwnershipProvenance(snapshot.taxYear, parentOrgNumber);
        return {
          fiscalYear,
          snapshot: { ...snapshot, provenance },
          traversal,
          entityOrgNumbers: [parentOrgNumber, ...traversal.orgNumbers],
        };
      }));
      const allOrgNumbers = [...new Set(memberships.flatMap((item) => item.entityOrgNumbers))];
      const [statements, depreciationRows] = await Promise.all([
        deps.getStatements(allOrgNumbers, fiscalYears),
        deps.getDepreciationRows(allOrgNumbers, fiscalYears),
      ]);

      const yearResults = memberships.map((membership) => {
        const companyStatements = statements.filter((row) =>
          row.fiscalYear === membership.fiscalYear && row.statementScope === "COMPANY",
        );
        const statementByOrgNumber = new Map(companyStatements.map((row) => [row.orgNumber, row]));
        const consolidated = statements.find((row) =>
          row.orgNumber === parentOrgNumber &&
          row.fiscalYear === membership.fiscalYear &&
          row.statementScope === "CONSOLIDATED",
        );
        const graphComplete =
          membership.snapshot.basis === "EXACT_YEAR" &&
          membership.snapshot.provenance?.importStatus === "COMPLETED" &&
          !membership.traversal.truncated &&
          !consolidated;

        const ebitValues = new Map<string, { currency: string; value: bigint; sources: SourceReference[] }>();
        const netIncomeValues = new Map<string, { currency: string; value: bigint; sources: SourceReference[] }>();
        const ebitdaValues = new Map<string, { currency: string; value: bigint; sources: SourceReference[] }>();

        for (const orgNumber of membership.entityOrgNumbers) {
          const statementRow = statementByOrgNumber.get(orgNumber);
          if (!statementRow) continue;
          const statementSource = sourceFromStatement(statementRow);
          if (statementRow.operatingProfit !== null) {
            ebitValues.set(orgNumber, {
              currency: statementRow.currency,
              value: statementRow.operatingProfit,
              sources: [statementSource],
            });
          }
          if (statementRow.netIncome !== null) {
            netIncomeValues.set(orgNumber, {
              currency: statementRow.currency,
              value: statementRow.netIncome,
              sources: [statementSource],
            });
          }
          const depreciationRow = chooseDepreciationRow(depreciationRows, statementRow);
          const depreciationValue = depreciationRow?.finalInput ?? depreciationRow?.value ?? null;
          const depreciationSource = depreciationRow
            ? sourceFromDepreciation(depreciationRow)
            : null;
          if (
            statementRow.operatingProfit !== null &&
            depreciationRow &&
            depreciationValue !== null &&
            depreciationRow.currency === statementRow.currency &&
            depreciationSource
          ) {
            ebitdaValues.set(orgNumber, {
              currency: statementRow.currency,
              value:
                statementRow.operatingProfit +
                (depreciationValue < 0n ? -depreciationValue : depreciationValue),
              sources: [statementSource, depreciationSource],
            });
          }
        }

        return {
          fiscalYear: membership.fiscalYear,
          ownershipSnapshot: membership.snapshot,
          ownershipTraversalTruncated: membership.traversal.truncated,
          entityCount: membership.entityOrgNumbers.length,
          subsidiaryCount: membership.traversal.orgNumbers.length,
          entityOrgNumbers: membership.entityOrgNumbers,
          publishedConsolidatedStatement: consolidated
            ? {
              ...sourceFromStatement(consolidated),
              operatingProfit: consolidated.operatingProfit === null
                ? null
                : { currency: consolidated.currency, value: consolidated.operatingProfit.toString() },
              netIncome: consolidated.netIncome === null
                ? null
                : { currency: consolidated.currency, value: consolidated.netIncome.toString() },
            }
            : null,
          ebit: metricResult({ entityOrgNumbers: membership.entityOrgNumbers, values: ebitValues, graphComplete }),
          ebitdaLike: metricResult({ entityOrgNumbers: membership.entityOrgNumbers, values: ebitdaValues, graphComplete }),
          netIncome: metricResult({ entityOrgNumbers: membership.entityOrgNumbers, values: netIncomeValues, graphComplete }),
        };
      });

      const hasCompleteRequestedPeriod = yearResults.length === years && yearResults.every((year) =>
        year.ebit.complete && year.ebitdaLike.complete && year.netIncome.complete,
      );
      return {
        parent,
        requestedYears: years,
        answerStatus: hasCompleteRequestedPeriod
          ? "CALCULATED_UNADJUSTED_PRO_FORMA"
          : "INSUFFICIENT_DATA",
        method: "UNADJUSTED_PRO_FORMA",
        canRepresentConsolidatedAccounts: false,
        methodology:
          "For each fiscal year, sum company-scope EBIT and net income across the parent and controlled " +
          "subsidiaries in the selected ownership snapshot. EBITDA-like equals EBIT plus the published " +
          "depreciation/amortisation line for the same entity and filing.",
        ebitdaDefinition:
          "EBIT plus the absolute, unit-normalised published depreciation/amortisation expense. This is " +
          "an EBITDA-like analytical measure, not an IFRS-defined subtotal, and the source line may " +
          "include impairment.",
        limitations: [...LIMITATIONS],
        currentOwnershipSnapshot: {
          taxYear: latestOwnershipYear ?? null,
          subsidiaryCount: currentTraversal.orgNumbers.length,
          traversalTruncated: currentTraversal.truncated,
          entityOrgNumbers: [parentOrgNumber, ...currentTraversal.orgNumbers],
          provenance: currentOwnershipProvenance,
        },
        years: yearResults,
      };
    },
  });
}

export const estimateGroupFinancialsTool = createEstimateGroupFinancialsTool(productionDeps());
