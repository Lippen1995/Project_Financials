import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { FI_SIM_TAXONOMY_VERSION } from "../catalog/concepts";
import { FI_SIM_PROFILE_RULESET_VERSION } from "../catalog/profile-selection";
import { FI_SIM_ASSUMPTION_VERSION } from "./assumptions";
import {
  FI_SIM_GENERATOR_VERSION,
  type FiSimCompanyGeneration,
  type FiSimGeneratedPackage,
  type FiSimGeneratedStatement,
} from "./generator";
import { validatePackage, type FiSimValidationIssue } from "./validator";

/**
 * Persistence for a generated dataset, from spec section 9.2 step 9.
 *
 * The lifecycle is the point of this module: a dataset is written `BUILDING`, validated, and then
 * moved to `VALIDATED` in one update. After that it is immutable — the database triggers enforce
 * that, so this module cannot weaken it by accident, and an activated demo can never quietly
 * change under a viewer.
 *
 * A package that does not validate, or that carries a residual big enough to need a human, is not
 * written at all. It is listed in the manifest as excluded. That is a deliberate trade: the
 * alternative is a dataset that cannot be activated because one statement out of ten thousand is
 * waiting for review.
 */

export type FiSimDatasetExclusion = {
  companyId: string;
  orgNumber: string;
  fiscalYear: number | null;
  reason: string;
  code: string;
};

export type FiSimDatasetReport = {
  datasetId: string;
  datasetVersion: string;
  status: "VALIDATED" | "BUILDING";
  companyCount: number;
  statementCount: number;
  packageCount: number;
  profileCounts: Record<string, number>;
  anchoredLineCount: number;
  syntheticLineCount: number;
  exclusions: FiSimDatasetExclusion[];
  issues: FiSimValidationIssue[];
};

export type FiSimDatasetManifest = {
  /**
   * The reported dataset version the anchors were frozen from. The taxonomy, generator,
   * assumption and profile versions are columns on the dataset row, not manifest fields, so there
   * is exactly one place to read them from.
   */
  reportedDatasetVersion: string;
  statementScope: "COMPANY" | "CONSOLIDATED";
  latestCompletedFiscalYear: number;
  /**
   * Concepts left deliberately unmapped so the demo can show the mapping feature working, from
   * spec section 11. Listed, never chosen at random.
   */
  intentionallyUnmappedConcepts: string[];
  exclusions: FiSimDatasetExclusion[];
};

type Writer = PrismaClient | Prisma.TransactionClient;

function statementRows(pkg: FiSimGeneratedPackage, statement: FiSimGeneratedStatement) {
  return {
    companyId: pkg.companyId,
    fiscalYear: pkg.fiscalYear,
    statementScope: pkg.statementScope,
    statementType: statement.statementFamily,
    statementOrigin: statement.statementOrigin,
    profile: pkg.profile,
    profileRuleId: pkg.profileRuleId,
    periodStart: pkg.periodStart,
    periodEnd: pkg.periodEnd,
    currency: pkg.currency,
    unitScale: pkg.unitScale,
    validationStatus: "VALID" as const,
    residualAmount: statement.residuals.length === 0
      ? null
      : statement.residuals.reduce((sum, residual) => sum + residual.amount, 0n),
    validationResult: {
      seed: pkg.seed,
      residuals: statement.residuals.map((residual) => ({
        identityId: residual.identityId,
        conceptKey: residual.conceptKey,
        amount: residual.amount.toString(),
        severity: residual.severity,
      })),
      bridge: {
        openingAccumulatedResults: pkg.bridge.openingAccumulatedResults.toString(),
        profitForPeriod: pkg.bridge.profitForPeriod.toString(),
        assumedDistribution: pkg.bridge.assumedDistribution.toString(),
        explicitCapitalAdjustment: pkg.bridge.explicitCapitalAdjustment.toString(),
        closingAccumulatedResults: pkg.bridge.closingAccumulatedResults.toString(),
      },
    } satisfies Prisma.InputJsonValue,
    lines: {
      create: statement.lines.map((line) => ({
        conceptKey: line.conceptKey,
        conceptQName: line.conceptQName,
        taxonomyVersion: FI_SIM_TAXONOMY_VERSION,
        sourceLabel: line.sourceLabel,
        presentationRole: line.presentationRole,
        reportedFinancialLineItemId: line.reportedFinancialLineItemId,
        syntheticValue: line.syntheticValue,
        currency: pkg.currency,
        unitScale: pkg.unitScale,
        sortOrder: line.sortOrder,
        derivationRuleId: line.derivationRuleId,
        generatorVersion: FI_SIM_GENERATOR_VERSION,
      })),
    },
  };
}

export async function writeSimulatedDataset(
  params: {
    datasetVersion: string;
    createdByUserId: string;
    manifest: Omit<FiSimDatasetManifest, "exclusions">;
    generations: readonly FiSimCompanyGeneration[];
  },
  client: Writer = prisma,
): Promise<FiSimDatasetReport> {
  const exclusions: FiSimDatasetExclusion[] = [];
  const issues: FiSimValidationIssue[] = [];
  const publishable: FiSimGeneratedPackage[] = [];

  for (const generation of params.generations) {
    for (const failure of generation.failures) {
      exclusions.push({
        companyId: generation.companyId,
        orgNumber: generation.orgNumber,
        fiscalYear: failure.fiscalYear,
        reason: failure.message,
        code: failure.code,
      });
    }
    for (const pkg of generation.packages) {
      const validation = validatePackage(pkg);
      if (!validation.valid) {
        issues.push(...validation.issues);
        exclusions.push({
          companyId: pkg.companyId,
          orgNumber: pkg.orgNumber,
          fiscalYear: pkg.fiscalYear,
          reason: validation.issues.map((issue) => issue.message).join("; "),
          code: "FAILED_VALIDATION",
        });
        continue;
      }
      if (pkg.validationStatus !== "VALID") {
        exclusions.push({
          companyId: pkg.companyId,
          orgNumber: pkg.orgNumber,
          fiscalYear: pkg.fiscalYear,
          reason: "The statement carries a residual that needs manual review",
          code: "MANUAL_REVIEW",
        });
        continue;
      }
      publishable.push(pkg);
    }
  }

  // The database requires both statements of a period, so a company is published for the years it
  // has complete packages for and excluded for the rest. Nothing half-written reaches a dataset.
  const dataset = await client.simulatedFinancialDataset.create({
    data: {
      datasetVersion: params.datasetVersion,
      status: "BUILDING",
      taxonomyVersion: FI_SIM_TAXONOMY_VERSION,
      generatorVersion: FI_SIM_GENERATOR_VERSION,
      assumptionVersion: FI_SIM_ASSUMPTION_VERSION,
      profileVersion: FI_SIM_PROFILE_RULESET_VERSION,
      createdByUserId: params.createdByUserId,
      manifest: { ...params.manifest, exclusions } satisfies Prisma.InputJsonValue,
    },
  });

  const profileCounts: Record<string, number> = {};
  let anchoredLineCount = 0;
  let syntheticLineCount = 0;

  for (const pkg of publishable) {
    profileCounts[pkg.profile] = (profileCounts[pkg.profile] ?? 0) + 1;
    for (const statement of [pkg.income, pkg.balance]) {
      for (const line of statement.lines) {
        if (line.reportedFinancialLineItemId !== null) anchoredLineCount += 1;
        else syntheticLineCount += 1;
      }
      await client.simulatedFinancialStatement.create({
        data: { datasetId: dataset.id, ...statementRows(pkg, statement) },
      });
    }
  }

  const report: FiSimDatasetReport = {
    datasetId: dataset.id,
    datasetVersion: params.datasetVersion,
    status: publishable.length > 0 ? "VALIDATED" : "BUILDING",
    companyCount: new Set(publishable.map((pkg) => pkg.companyId)).size,
    statementCount: publishable.length * 2,
    packageCount: publishable.length,
    profileCounts,
    anchoredLineCount,
    syntheticLineCount,
    exclusions,
    issues,
  };

  if (publishable.length === 0) {
    // A dataset with no statements cannot validate, and should not: there is nothing to show.
    return report;
  }

  await client.simulatedFinancialDataset.update({
    where: { id: dataset.id },
    data: {
      status: "VALIDATED",
      validatedAt: new Date(),
      validationResult: {
        packageCount: report.packageCount,
        statementCount: report.statementCount,
        companyCount: report.companyCount,
        profileCounts,
        anchoredLineCount,
        syntheticLineCount,
        excludedCount: exclusions.length,
      } satisfies Prisma.InputJsonValue,
    },
  });

  return report;
}
