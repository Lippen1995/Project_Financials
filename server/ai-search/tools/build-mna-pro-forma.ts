import { z } from "zod";

import {
  simulatedAnswerNotice,
  type FinancialDisclosure,
} from "@/lib/financial-simulation-disclosure";
import type { FinancialDatasetMode, FinancialDatasetVersion } from "@/lib/types";
import { norwegianOrganizationNumberSchema } from "@/lib/norwegian-organization-number";
import {
  njordFinancialDataReader,
  type NjordFinancialSnapshot,
} from "@/server/financials/njord-financial-data-reader";
import {
  calculateMnaProForma,
  type MnaBaseFinancials,
  type MnaProFormaAssumptions,
  type MnaProFormaResult,
} from "@/server/mna/pro-forma-calculator";
import { defineTool, type RetrievalTool } from "./types";

const unsignedAmountSchema = z.object({
  valueNok: z.string().regex(/^\d{1,30}$/),
  evidenceText: z.string().trim().min(1).max(240).nullable(),
});
const signedAmountSchema = z.object({
  valueNok: z.string().regex(/^-?\d{1,30}$/),
  evidenceText: z.string().trim().min(1).max(240).nullable(),
});
const nonNegativeRateSchema = z.object({
  valueBps: z.number().int().min(0).max(10_000),
  evidenceText: z.string().trim().min(1).max(240),
});
const signedRateSchema = z.object({
  valueBps: z.number().int().min(-10_000).max(10_000),
  evidenceText: z.string().trim().min(1).max(240),
});
const booleanAssumptionSchema = z.object({
  value: z.boolean(),
  evidenceText: z.string().trim().min(1).max(240).nullable(),
});

const inputSchema = z.object({
  buyerOrgNumber: norwegianOrganizationNumberSchema,
  targetOrgNumber: norwegianOrganizationNumberSchema,
  fiscalYear: z.number().int().min(1990).max(2200).nullable(),
  buyerStatementScope: z.enum(["AUTO", "COMPANY", "CONSOLIDATED"]),
  targetStatementScope: z.enum(["AUTO", "COMPANY", "CONSOLIDATED"]),
  assumptions: z.object({
    purchasePriceNok: unsignedAmountSchema,
    newDebtNok: unsignedAmountSchema,
    newEquityNok: unsignedAmountSchema,
    transactionCostsNok: unsignedAmountSchema,
    fairValueAssetStepUpNok: signedAmountSchema,
    fairValueLiabilityStepUpNok: signedAmountSchema,
    taxableAssetStepUpNok: unsignedAmountSchema,
    taxRateBps: nonNegativeRateSchema.nullable(),
    annualInterestRateBps: nonNegativeRateSchema.nullable(),
    annualPpaDepreciationAmortizationNok: unsignedAmountSchema,
    annualRevenueSynergiesNok: signedAmountSchema,
    revenueSynergyEbitMarginBps: signedRateSchema.nullable(),
    annualCostSynergiesNok: signedAmountSchema,
    buyerBaseDepreciationAmortizationOverrideNok: unsignedAmountSchema.nullable(),
    targetBaseDepreciationAmortizationOverrideNok: unsignedAmountSchema.nullable(),
    includeTransactionCostsInIncomeStatement: booleanAssumptionSchema,
  }),
});

export type BuildMnaProFormaInput = z.infer<typeof inputSchema>;

export type MnaStatementRow = {
  id: string;
  orgNumber: string;
  name: string;
  fiscalYear: number;
  statementScope: "COMPANY" | "CONSOLIDATED";
  currency: string;
  revenue: bigint | null;
  operatingProfit: bigint | null;
  netIncome: bigint | null;
  assets: bigint | null;
  equity: bigint | null;
  sourceFilingId: string | null;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
};

export type MnaDepreciationRow = {
  orgNumber: string;
  filingId: string;
  statementScope: "COMPANY" | "CONSOLIDATED";
  value: bigint;
  currency: string;
  unitScale: number;
  publicationSource: "MANUAL_REVIEW" | "MACHINE_EXTRACTION";
  publishedAt: Date;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
};

export type MnaFinancialSnapshot = {
  financialDatasetMode: FinancialDatasetMode;
  financialDatasetVersion: FinancialDatasetVersion;
  disclosure: FinancialDisclosure;
  statements: MnaStatementRow[];
  depreciationAmortization: MnaDepreciationRow[];
};

export type MnaProFormaToolDeps = {
  getFinancials: (orgNumbers: string[]) => Promise<MnaFinancialSnapshot>;
};

type ToolProvenance = {
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: string;
  normalizedAt: string;
};

type BaseStatementSummary = {
  orgNumber: string;
  name: string;
  fiscalYear?: number;
  statementScope: "COMPANY" | "CONSOLIDATED";
  currency?: string;
  provenance: ToolProvenance;
};

export type BuildMnaProFormaOutput =
  | { status: "INVALID_USER_INPUT_EVIDENCE"; issues: string[] }
  | {
    status: "INSUFFICIENT_BASE_DATA";
    financialDatasetMode: FinancialDatasetMode;
    financialDatasetVersion: FinancialDatasetVersion;
    simulationNotice: string | null;
    fiscalYear?: number;
    missingBaseData: string[];
    baseStatements?: BaseStatementSummary[];
  }
  | MnaProFormaResult & {
    financialDatasetMode: FinancialDatasetMode;
    financialDatasetVersion: FinancialDatasetVersion;
    /** Non-null whenever the pro forma rests on simulated figures. */
    simulationNotice: string | null;
    accessRequirement: "DUE_DILIGENCE";
    method: "UNAUDITED_USER_ASSUMPTION_PRO_FORMA";
    ownershipAssumption: "100_PERCENT_ACQUISITION";
    baseStatements: BaseStatementSummary[];
    baseDepreciationAmortization: Array<{
      orgNumber: string;
      valueNok: string | null;
      origin: "OFFICIAL_FILING" | "USER_INPUT" | "UNAVAILABLE";
      provenance: ToolProvenance | null;
    }>;
    assumptions: Array<{
      key: string;
      value: string;
      unit: "NOK" | "BASIS_POINTS" | "BOOLEAN";
      evidenceText: string | null;
      sourceSystem: "USER_INPUT";
      sourceEntityType: string;
      sourceId: string;
      fetchedAt: string;
      normalizedAt: string;
    }>;
    limitations: string[];
    requiresUserConfirmation: true;
  };

type StatementChoice = "AUTO" | "COMPANY" | "CONSOLIDATED";

const amountParameters = {
  type: "object",
  properties: {
    valueNok: { type: "string", pattern: "^-?[0-9]{1,30}$" },
    evidenceText: {
      type: ["string", "null"],
      description: "Exact quote from the current user query supporting the assumption, including zero.",
    },
  },
  required: ["valueNok", "evidenceText"],
  additionalProperties: false,
} as const;

const unsignedAmountParameters = {
  ...amountParameters,
  properties: {
    ...amountParameters.properties,
    valueNok: { type: "string", pattern: "^[0-9]{1,30}$" },
  },
} as const;

const rateParameters = (minimum: number) => ({
  type: ["object", "null"],
  properties: {
    valueBps: { type: "integer", minimum, maximum: 10_000 },
    evidenceText: { type: "string" },
  },
  required: ["valueBps", "evidenceText"],
  additionalProperties: false,
});

const booleanAssumptionParameters = {
  type: "object",
  properties: {
    value: { type: "boolean" },
    evidenceText: {
      type: ["string", "null"],
      description: "Exact quote from the current user query supporting the treatment choice.",
    },
  },
  required: ["value", "evidenceText"],
  additionalProperties: false,
} as const;

const parameters = {
  type: "object",
  properties: {
    buyerOrgNumber: { type: "string", pattern: "^[0-9]{9}$" },
    targetOrgNumber: { type: "string", pattern: "^[0-9]{9}$" },
    fiscalYear: { type: ["integer", "null"], minimum: 1990, maximum: 2200 },
    buyerStatementScope: { type: "string", enum: ["AUTO", "COMPANY", "CONSOLIDATED"] },
    targetStatementScope: { type: "string", enum: ["AUTO", "COMPANY", "CONSOLIDATED"] },
    assumptions: {
      type: "object",
      properties: {
        purchasePriceNok: unsignedAmountParameters,
        newDebtNok: unsignedAmountParameters,
        newEquityNok: unsignedAmountParameters,
        transactionCostsNok: unsignedAmountParameters,
        fairValueAssetStepUpNok: amountParameters,
        fairValueLiabilityStepUpNok: amountParameters,
        taxableAssetStepUpNok: unsignedAmountParameters,
        taxRateBps: rateParameters(0),
        annualInterestRateBps: rateParameters(0),
        annualPpaDepreciationAmortizationNok: unsignedAmountParameters,
        annualRevenueSynergiesNok: amountParameters,
        revenueSynergyEbitMarginBps: rateParameters(-10_000),
        annualCostSynergiesNok: amountParameters,
        buyerBaseDepreciationAmortizationOverrideNok: {
          ...unsignedAmountParameters,
          type: ["object", "null"],
        },
        targetBaseDepreciationAmortizationOverrideNok: {
          ...unsignedAmountParameters,
          type: ["object", "null"],
        },
        includeTransactionCostsInIncomeStatement: booleanAssumptionParameters,
      },
      required: [
        "purchasePriceNok",
        "newDebtNok",
        "newEquityNok",
        "transactionCostsNok",
        "fairValueAssetStepUpNok",
        "fairValueLiabilityStepUpNok",
        "taxableAssetStepUpNok",
        "taxRateBps",
        "annualInterestRateBps",
        "annualPpaDepreciationAmortizationNok",
        "annualRevenueSynergiesNok",
        "revenueSynergyEbitMarginBps",
        "annualCostSynergiesNok",
        "buyerBaseDepreciationAmortizationOverrideNok",
        "targetBaseDepreciationAmortizationOverrideNok",
        "includeTransactionCostsInIncomeStatement",
      ],
      additionalProperties: false,
    },
  },
  required: [
    "buyerOrgNumber",
    "targetOrgNumber",
    "fiscalYear",
    "buyerStatementScope",
    "targetStatementScope",
    "assumptions",
  ],
  additionalProperties: false,
} as const;

function normalizeEvidence(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("nb-NO");
}

function localizedNumbers(value: string) {
  const matches = value.match(/-?\d{1,3}(?:[ .\u00a0]\d{3})+(?:,\d+)?|-?\d+(?:[.,]\d+)?/g) ?? [];
  return matches.flatMap((match) => {
    const compact = match.replace(/[ \u00a0]/g, "");
    const decimal = compact.includes(",")
      ? compact.replace(/\./g, "").replace(",", ".")
      : /\.\d{3}(?:\.|$)/.test(compact)
        ? compact.replace(/\./g, "")
        : compact;
    const parsed = Number(decimal);
    return Number.isFinite(parsed) ? [parsed] : [];
  });
}

function evidenceSupportsAmount(evidenceText: string, valueNok: string) {
  const normalized = normalizeEvidence(evidenceText);
  if (BigInt(valueNok) === 0n && /\b(ingen|uten|null)\b/.test(normalized)) return true;
  const scale = /\b(mrd|milliard(?:er)?)\b/.test(normalized)
    ? 1_000_000_000
    : /\b(mill|million(?:er)?)\b/.test(normalized)
      ? 1_000_000
      : /\b(tusen|tnok)\b/.test(normalized)
        ? 1_000
        : 1;
  return localizedNumbers(normalized).some((number) => {
    const scaled = number * scale;
    return Number.isSafeInteger(scaled) && BigInt(scaled) === BigInt(valueNok);
  });
}

function evidenceSupportsRate(evidenceText: string, valueBps: number) {
  const normalized = normalizeEvidence(evidenceText);
  const multiplier = /\b(bps|basispunkt(?:er)?)\b/.test(normalized) ? 1 : 100;
  return localizedNumbers(normalized).some((number) => number * multiplier === valueBps);
}

function validateEvidence(query: string, input: BuildMnaProFormaInput) {
  const normalizedQuery = normalizeEvidence(query);
  const issues: string[] = [];
  const assumptions = input.assumptions;
  const amountEntries = Object.entries(assumptions).filter((entry): entry is [string, {
    valueNok: string;
    evidenceText: string | null;
  }] => typeof entry[1] === "object" && entry[1] !== null && "valueNok" in entry[1]);

  for (const [key, assumption] of amountEntries) {
    if (!assumption.evidenceText || !normalizedQuery.includes(normalizeEvidence(assumption.evidenceText))) {
      issues.push(`${key} mangler et eksakt tekstbevis fra brukerens nÃ¥vÃ¦rende spÃ¸rsmÃ¥l.`);
    } else if (!evidenceSupportsAmount(assumption.evidenceText, assumption.valueNok)) {
      issues.push(`${key} har en verdi som ikke samsvarer med tallet i brukerens tekstbevis.`);
    }
  }
  for (const [key, assumption] of [
    ["taxRateBps", assumptions.taxRateBps],
    ["annualInterestRateBps", assumptions.annualInterestRateBps],
    ["revenueSynergyEbitMarginBps", assumptions.revenueSynergyEbitMarginBps],
  ] as const) {
    if (!assumption) continue;
    if (!normalizedQuery.includes(normalizeEvidence(assumption.evidenceText))) {
      issues.push(`${key} mangler et eksakt tekstbevis fra brukerens nÃ¥vÃ¦rende spÃ¸rsmÃ¥l.`);
    } else if (!evidenceSupportsRate(assumption.evidenceText, assumption.valueBps)) {
      issues.push(`${key} har en verdi som ikke samsvarer med satsen i brukerens tekstbevis.`);
    }
  }
  const transactionCostTreatment = assumptions.includeTransactionCostsInIncomeStatement;
  if (
    !transactionCostTreatment.evidenceText ||
    !normalizedQuery.includes(normalizeEvidence(transactionCostTreatment.evidenceText))
  ) {
    issues.push("includeTransactionCostsInIncomeStatement mangler tekstbevis fra brukerens spørsmål.");
  }
  return issues;
}

function pickStatement(
  rows: MnaStatementRow[],
  orgNumber: string,
  fiscalYear: number,
  choice: StatementChoice,
) {
  const candidates = rows.filter((row) =>
    row.orgNumber === orgNumber && row.fiscalYear === fiscalYear,
  );
  if (choice === "AUTO") {
    return candidates.find((row) => row.statementScope === "CONSOLIDATED") ??
      candidates.find((row) => row.statementScope === "COMPANY") ?? null;
  }
  return candidates.find((row) => row.statementScope === choice) ?? null;
}

function commonFiscalYear(
  rows: MnaStatementRow[],
  buyerOrgNumber: string,
  targetOrgNumber: string,
  buyerChoice: StatementChoice,
  targetChoice: StatementChoice,
) {
  const years = [...new Set(rows.map((row) => row.fiscalYear))].sort((a, b) => b - a);
  return years.find((year) =>
    pickStatement(rows, buyerOrgNumber, year, buyerChoice) &&
    pickStatement(rows, targetOrgNumber, year, targetChoice),
  ) ?? null;
}

function statementProvenance(row: MnaStatementRow) {
  return {
    sourceSystem: row.sourceSystem,
    sourceEntityType: row.sourceEntityType,
    sourceId: row.sourceId,
    fetchedAt: row.fetchedAt.toISOString(),
    normalizedAt: row.normalizedAt.toISOString(),
  };
}

function toMnaFinancialSnapshot(snapshot: NjordFinancialSnapshot): MnaFinancialSnapshot {
  return {
    financialDatasetMode: snapshot.financialDatasetMode,
    financialDatasetVersion: snapshot.financialDatasetVersion,
    disclosure: snapshot.disclosure,
    statements: snapshot.statements.map((statement) => ({
      id: statement.liveStatementId,
      orgNumber: statement.orgNumber,
      name: statement.name,
      fiscalYear: statement.fiscalYear,
      statementScope: statement.statementScope,
      currency: statement.currency,
      revenue: statement.revenue,
      operatingProfit: statement.operatingProfit,
      netIncome: statement.netIncome,
      assets: statement.assets,
      equity: statement.equity,
      sourceFilingId: statement.liveStatementId,
      sourceSystem: statement.sourceSystem,
      sourceEntityType: statement.sourceEntityType,
      sourceId: statement.sourceId,
      fetchedAt: statement.fetchedAt,
      normalizedAt: statement.normalizedAt,
    })),
    depreciationAmortization: snapshot.statements.flatMap((statement) => {
      const line = statement.depreciationAmortization;
      if (!line) return [];
      return [{
        orgNumber: statement.orgNumber,
        filingId: statement.liveStatementId,
        statementScope: statement.statementScope,
        value: line.value,
        currency: line.currency,
        unitScale: line.unitScale,
        publicationSource: "MACHINE_EXTRACTION" as const,
        publishedAt: line.normalizedAt,
        sourceSystem: line.sourceSystem,
        sourceEntityType: line.sourceEntityType,
        sourceId: line.sourceId,
        fetchedAt: line.fetchedAt,
        normalizedAt: line.normalizedAt,
      }];
    }),
  };
}

function productionDeps(): MnaProFormaToolDeps {
  return {
    async getFinancials(orgNumbers) {
      return toMnaFinancialSnapshot(
        await njordFinancialDataReader.readCompanies(orgNumbers),
      );
    },
  };
}

function toAssumptions(input: BuildMnaProFormaInput["assumptions"]): MnaProFormaAssumptions {
  return {
    purchasePrice: BigInt(input.purchasePriceNok.valueNok),
    newDebt: BigInt(input.newDebtNok.valueNok),
    newEquity: BigInt(input.newEquityNok.valueNok),
    transactionCosts: BigInt(input.transactionCostsNok.valueNok),
    fairValueAssetStepUp: BigInt(input.fairValueAssetStepUpNok.valueNok),
    fairValueLiabilityStepUp: BigInt(input.fairValueLiabilityStepUpNok.valueNok),
    taxableAssetStepUp: BigInt(input.taxableAssetStepUpNok.valueNok),
    taxRateBps: input.taxRateBps?.valueBps ?? null,
    annualInterestRateBps: input.annualInterestRateBps?.valueBps ?? null,
    annualPpaDepreciationAmortization: BigInt(input.annualPpaDepreciationAmortizationNok.valueNok),
    annualRevenueSynergies: BigInt(input.annualRevenueSynergiesNok.valueNok),
    revenueSynergyEbitMarginBps: input.revenueSynergyEbitMarginBps?.valueBps ?? null,
    annualCostSynergies: BigInt(input.annualCostSynergiesNok.valueNok),
    includeTransactionCostsInIncomeStatement: input.includeTransactionCostsInIncomeStatement.value,
  };
}

export function createBuildMnaProFormaTool(options: {
  userQuery: string;
  deps?: MnaProFormaToolDeps;
}): RetrievalTool<BuildMnaProFormaInput, BuildMnaProFormaOutput> {
  const deps = options.deps ?? productionDeps();
  return defineTool({
    name: "build_mna_pro_forma",
    description:
      "Due-Diligence-only tool that combines official buyer and target accounts with assumptions " +
      "explicitly quoted from the current user query to build an M&A pro-forma income statement and " +
      "closing balance sheet. Use only for 100% acquisitions; never invent an assumption or call the " +
      "output statutory, audited or a valuation opinion.",
    strict: true,
    inputSchema,
    parameters,
    async execute(input) {
      const issues = validateEvidence(options.userQuery, input);
      if (input.buyerOrgNumber === input.targetOrgNumber) {
        issues.push("KjÃ¸per og mÃ¥lselskap kan ikke vÃ¦re samme organisasjonsnummer.");
      }
      if (BigInt(input.assumptions.purchasePriceNok.valueNok) <= 0n) {
        issues.push("purchasePriceNok mÃ¥ vÃ¦re stÃ¸rre enn null.");
      }
      if (issues.length > 0) {
        return { status: "INVALID_USER_INPUT_EVIDENCE" as const, issues };
      }

      const financials = await deps.getFinancials([
        input.buyerOrgNumber,
        input.targetOrgNumber,
      ]);
      const rows = financials.statements;
      const datasetIdentity = {
        financialDatasetMode: financials.financialDatasetMode,
        financialDatasetVersion: financials.financialDatasetVersion,
        simulationNotice: simulatedAnswerNotice(financials.disclosure),
      };
      const fiscalYear = input.fiscalYear ?? commonFiscalYear(
        rows,
        input.buyerOrgNumber,
        input.targetOrgNumber,
        input.buyerStatementScope,
        input.targetStatementScope,
      );
      if (fiscalYear === null) {
        return {
          status: "INSUFFICIENT_BASE_DATA" as const,
          ...datasetIdentity,
          missingBaseData: ["COMMON_FISCAL_YEAR"],
        };
      }
      const buyerRow = pickStatement(
        rows,
        input.buyerOrgNumber,
        fiscalYear,
        input.buyerStatementScope,
      );
      const targetRow = pickStatement(
        rows,
        input.targetOrgNumber,
        fiscalYear,
        input.targetStatementScope,
      );
      if (!buyerRow || !targetRow) {
        return {
          status: "INSUFFICIENT_BASE_DATA" as const,
          ...datasetIdentity,
          fiscalYear,
          missingBaseData: [
            ...(!buyerRow ? [`${input.buyerOrgNumber}.statement`] : []),
            ...(!targetRow ? [`${input.targetOrgNumber}.statement`] : []),
          ],
        };
      }

      const required = ["revenue", "operatingProfit", "netIncome", "assets", "equity"] as const;
      const missingBaseData = [buyerRow, targetRow].flatMap((row) =>
        required.filter((field) => row[field] === null).map((field) => `${row.orgNumber}.${field}`),
      );
      if (missingBaseData.length > 0) {
        return {
          status: "INSUFFICIENT_BASE_DATA" as const,
          ...datasetIdentity,
          fiscalYear,
          missingBaseData,
          baseStatements: [buyerRow, targetRow].map((row) => ({
            orgNumber: row.orgNumber,
            name: row.name,
            statementScope: row.statementScope,
            provenance: statementProvenance(row),
          })),
        };
      }

      const depreciationRows = financials.depreciationAmortization;
      const dAndAFor = (row: MnaStatementRow, override: { valueNok: string } | null) => {
        if (override) {
          return {
            value: BigInt(override.valueNok),
            origin: "USER_INPUT" as const,
            provenance: null,
          };
        }
        const published = depreciationRows
          .filter((item) =>
            item.orgNumber === row.orgNumber &&
            item.filingId === row.sourceFilingId &&
            item.statementScope === row.statementScope &&
            item.currency === row.currency,
          )
          .sort((a, b) => {
            const manualA = a.publicationSource === "MANUAL_REVIEW" ? 1 : 0;
            const manualB = b.publicationSource === "MANUAL_REVIEW" ? 1 : 0;
            if (manualA !== manualB) return manualB - manualA;
            return b.publishedAt.getTime() - a.publishedAt.getTime();
          })[0];
        if (!published) {
          return { value: null, origin: "UNAVAILABLE" as const, provenance: null };
        }
        return {
          value: published.value * BigInt(published.unitScale),
          origin: "OFFICIAL_FILING" as const,
          provenance: {
            sourceSystem: published.sourceSystem,
            sourceEntityType: published.sourceEntityType,
            sourceId: published.sourceId,
            fetchedAt: published.fetchedAt.toISOString(),
            normalizedAt: published.normalizedAt.toISOString(),
          },
        };
      };
      const toBase = (
        row: MnaStatementRow,
        dAndA: bigint | null,
      ): MnaBaseFinancials => ({
        orgNumber: row.orgNumber,
        name: row.name,
        fiscalYear: row.fiscalYear,
        scope: row.statementScope,
        currency: row.currency,
        revenue: row.revenue!,
        ebit: row.operatingProfit!,
        netIncome: row.netIncome!,
        assets: row.assets!,
        equity: row.equity!,
        depreciationAmortization: dAndA,
      });
      const buyerDAndA = dAndAFor(
        buyerRow,
        input.assumptions.buyerBaseDepreciationAmortizationOverrideNok,
      );
      const targetDAndA = dAndAFor(
        targetRow,
        input.assumptions.targetBaseDepreciationAmortizationOverrideNok,
      );
      let calculation;
      try {
        calculation = calculateMnaProForma({
          buyer: toBase(buyerRow, buyerDAndA.value),
          target: toBase(targetRow, targetDAndA.value),
          assumptions: toAssumptions(input.assumptions),
        });
      } catch (error) {
        return {
          status: "INSUFFICIENT_BASE_DATA" as const,
          ...datasetIdentity,
          fiscalYear,
          missingBaseData: [error instanceof Error ? error.message : "CALCULATION_FAILED"],
        };
      }

      const executedAt = new Date().toISOString();
      const assumptionEntries = Object.entries(input.assumptions).flatMap(([key, value]) => {
        if (typeof value !== "object" || value === null || !("evidenceText" in value)) return [];
        const assumptionValue = "valueNok" in value
          ? value.valueNok
          : "valueBps" in value
            ? String(value.valueBps)
            : String(value.value);
        const assumptionUnit: "NOK" | "BASIS_POINTS" | "BOOLEAN" = "valueNok" in value
          ? "NOK"
          : "valueBps" in value
            ? "BASIS_POINTS"
            : "BOOLEAN";
        return [{
          key,
          value: assumptionValue,
          unit: assumptionUnit,
          evidenceText: value.evidenceText,
          sourceSystem: "USER_INPUT" as const,
          sourceEntityType: "mnaProFormaAssumption",
          sourceId: `current-query:${key}`,
          fetchedAt: executedAt,
          normalizedAt: executedAt,
        }];
      });

      return {
        ...calculation,
        ...datasetIdentity,
        accessRequirement: "DUE_DILIGENCE" as const,
        method: "UNAUDITED_USER_ASSUMPTION_PRO_FORMA" as const,
        ownershipAssumption: "100_PERCENT_ACQUISITION" as const,
        baseStatements: [buyerRow, targetRow].map((row) => ({
          orgNumber: row.orgNumber,
          name: row.name,
          fiscalYear: row.fiscalYear,
          statementScope: row.statementScope,
          currency: row.currency,
          provenance: statementProvenance(row),
        })),
        baseDepreciationAmortization: [
          { orgNumber: buyerRow.orgNumber, ...buyerDAndA, valueNok: buyerDAndA.value?.toString() ?? null },
          { orgNumber: targetRow.orgNumber, ...targetDAndA, valueNok: targetDAndA.value?.toString() ?? null },
        ].map(({ value: _value, ...entry }) => entry),
        assumptions: assumptionEntries,
        limitations: [
          "Dette er en ikke-revidert scenarioanalyse, ikke et lovpliktig eller publisert proformaregnskap.",
          "Modellen forutsetter kjÃ¸p av 100 prosent av mÃ¥lselskapet og eliminerer mÃ¥lselskapets bokfÃ¸rte egenkapital.",
          "Goodwill, virkelig verdi, skatt, finansiering og synergier bygger pÃ¥ brukerens forutsetninger og er ikke faglig verifisert.",
          "Nettoresultatet er en forenklet bro fra rapportert Ã¥rsresultat med Ã©n skattesats og Ã©n rente pÃ¥ ny gjeld.",
          "Transaksjonskostnader som resultatføres behandles konservativt som ikke-fradragsberettigede.",
          "Arbeidskapital, kontant/gjeld-justering, minoriteter, earn-out, utsatt skatt utover oppgitte oppjusteringer, valuta og integrasjonsprofil er ikke modellert.",
        ],
        requiresUserConfirmation: true,
      };
    },
  });
}
