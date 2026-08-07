import "@/lib/env";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { financialsRepository } from "@/server/financials/financials-repository";

// Test-only fixtures are confined to a name-guarded disposable database. They
// are never seed data and cannot be run against a product database.

function assertDisposableDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (!databaseName.startsWith("fi_sim_migration_test_")) {
    throw new Error(
      `Refusing FI-SIM migration verification against non-disposable database ${databaseName}`,
    );
  }
}

async function expectDatabaseRejection(label: string, action: () => Promise<unknown>) {
  try {
    await action();
  } catch {
    console.log(`Verified rejection: ${label}`);
    return;
  }
  throw new Error(`Expected database rejection: ${label}`);
}

async function withAuthorizedDemoActivation(
  action: (transaction: Prisma.TransactionClient) => Promise<void>,
) {
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      "SET LOCAL app.deployment_environment = 'investor-demo'",
    );
    await transaction.$executeRawUnsafe("SET LOCAL app.fi_sim_enabled = 'on'");
    await action(transaction);
  });
}

async function withEnabledDemoRead<T>(action: () => Promise<T>) {
  const previousEnvironment = process.env.FJORD_DEPLOYMENT_ENVIRONMENT;
  const previousFeatureFlag = process.env.FJORD_FINANCIAL_SIMULATION_ENABLED;
  process.env.FJORD_DEPLOYMENT_ENVIRONMENT = "investor-demo";
  process.env.FJORD_FINANCIAL_SIMULATION_ENABLED = "true";

  try {
    return await action();
  } finally {
    if (previousEnvironment === undefined) {
      delete process.env.FJORD_DEPLOYMENT_ENVIRONMENT;
    } else {
      process.env.FJORD_DEPLOYMENT_ENVIRONMENT = previousEnvironment;
    }
    if (previousFeatureFlag === undefined) {
      delete process.env.FJORD_FINANCIAL_SIMULATION_ENABLED;
    } else {
      process.env.FJORD_FINANCIAL_SIMULATION_ENABLED = previousFeatureFlag;
    }
  }
}

async function main() {
  assertDisposableDatabase();

  const [runtimePermissions] = await prisma.$queryRaw<
    Array<{
      canReadReportedSource: boolean;
      canReadSimulatedSource: boolean;
      canReadDatasetMetadata: boolean;
      canReadLegacyStatements: boolean;
      canReadLegacyLines: boolean;
      canReadLiveStatements: boolean;
      canReadLiveLines: boolean;
    }>
  >`
    SELECT
      has_table_privilege('fjord_financial_runtime', '"FinancialStatement"', 'SELECT')
        AS "canReadReportedSource",
      has_table_privilege('fjord_financial_runtime', '"SimulatedFinancialStatement"', 'SELECT')
        AS "canReadSimulatedSource",
      has_table_privilege('fjord_financial_runtime', 'live_financial_dataset_v1', 'SELECT')
        AS "canReadDatasetMetadata",
      has_table_privilege('fjord_financial_runtime', 'live_financial_statements_v1', 'SELECT')
        AS "canReadLegacyStatements",
      has_table_privilege('fjord_financial_runtime', 'live_financial_statements_v2', 'SELECT')
        AS "canReadLiveStatements",
      has_table_privilege('fjord_financial_runtime', 'live_financial_line_items_v1', 'SELECT')
        AS "canReadLegacyLines",
      has_table_privilege('fjord_financial_runtime', 'live_financial_line_items_v2', 'SELECT')
        AS "canReadLiveLines"
  `;
  if (
    runtimePermissions.canReadReportedSource ||
    runtimePermissions.canReadSimulatedSource ||
    !runtimePermissions.canReadDatasetMetadata ||
    runtimePermissions.canReadLegacyStatements ||
    runtimePermissions.canReadLegacyLines ||
    !runtimePermissions.canReadLiveStatements ||
    !runtimePermissions.canReadLiveLines
  ) {
    throw new Error("Runtime role privileges do not enforce live-view-only financial reads");
  }

  const company = await prisma.company.create({
    data: {
      id: "fi-sim-test-company",
      slug: "fi-sim-test-company",
      orgNumber: "999999991",
      name: "FI-SIM migration verification",
      sourceSystem: "migration-test",
      sourceEntityType: "company",
      sourceId: "fi-sim-test-company",
      fetchedAt: new Date("2026-08-06T00:00:00.000Z"),
      normalizedAt: new Date("2026-08-06T00:00:00.000Z"),
    },
  });

  await prisma.financialStatement.create({
    data: {
      id: "fi-sim-reported-statement",
      companyId: company.id,
      fiscalYear: 2025,
      statementScope: "COMPANY",
      revenue: 100n,
      operatingProfit: 20n,
      netIncome: 15n,
      equity: 60n,
      assets: 100n,
      sourceSystem: "migration-test",
      sourceEntityType: "financial-statement",
      sourceId: "fi-sim-reported-statement",
      fetchedAt: new Date("2026-08-06T00:00:00.000Z"),
      normalizedAt: new Date("2026-08-06T00:00:00.000Z"),
    },
  });

  const reportedLine = await prisma.financialLineItem.create({
    data: {
      id: "fi-sim-reported-line",
      companyId: company.id,
      fiscalYear: 2025,
      statementScope: "COMPANY",
      statementType: "INCOME_STATEMENT",
      sourceKey: "reported-total-income",
      sourceLabel: "Sum driftsinntekter",
      metricKey: "total_operating_revenue",
      value: 100n,
      sourceSystem: "migration-test",
      sourceEntityType: "financial-line",
      sourceId: "fi-sim-reported-line",
      fetchedAt: new Date("2026-08-06T00:00:00.000Z"),
      normalizedAt: new Date("2026-08-06T00:00:00.000Z"),
    },
  });

  const dataset = await prisma.simulatedFinancialDataset.create({
    data: {
      id: "fi-sim-dataset",
      datasetVersion: "verification-1",
      taxonomyVersion: "FI-SIM-2026.1",
      generatorVersion: "generator-1",
      assumptionVersion: "assumptions-1",
      profileVersion: "profiles-1",
      manifest: { purpose: "migration verification" },
      createdByUserId: "migration-test",
    },
  });

  await expectDatabaseRejection("building dataset activation", () =>
    withAuthorizedDemoActivation(async (transaction) => {
      await transaction.activeFinancialDataset.create({
        data: {
          mode: "SIMULATED",
          simulatedDatasetId: dataset.id,
          activationRevision: 1n,
          activatedAt: new Date(),
          activatedByUserId: "migration-test",
        },
      });
    }),
  );

  const statement = await prisma.simulatedFinancialStatement.create({
    data: {
      id: "fi-sim-statement",
      datasetId: dataset.id,
      companyId: company.id,
      fiscalYear: 2025,
      statementScope: "COMPANY",
      statementType: "INCOME_STATEMENT",
      statementOrigin: "HYBRID",
      profile: "SERVICE",
      profileRuleId: "service-default-1",
      periodStart: new Date("2025-01-01T00:00:00.000Z"),
      periodEnd: new Date("2025-12-31T00:00:00.000Z"),
      validationStatus: "VALID",
      validationResult: { identities: "passed" },
    },
  });

  await expectDatabaseRejection("line with reported and synthetic values", () =>
    prisma.simulatedFinancialLine.create({
      data: {
        statementId: statement.id,
        conceptKey: "InvalidXorLine",
        conceptQName: "urn:fjord-insight:taxonomy:fi-sim:2026.1#InvalidXorLine",
        taxonomyVersion: "FI-SIM-2026.1",
        sourceLabel: "Ugyldig linje",
        presentationRole: "service-income",
        reportedFinancialLineItemId: reportedLine.id,
        syntheticValue: 1n,
        generatorVersion: "generator-1",
      },
    }),
  );

  await expectDatabaseRejection("foreign taxonomy QName", () =>
    prisma.simulatedFinancialLine.create({
      data: {
        statementId: statement.id,
        conceptKey: "ForeignConcept",
        conceptQName: "ifrs-full:Revenue",
        taxonomyVersion: "FI-SIM-2026.1",
        sourceLabel: "Ugyldig taksonomilinje",
        presentationRole: "service-income",
        syntheticValue: 1n,
        generatorVersion: "generator-1",
      },
    }),
  );

  await prisma.simulatedFinancialLine.createMany({
    data: [
      {
        id: "fi-sim-anchor-line",
        statementId: statement.id,
        conceptKey: "OperatingIncomeTotal",
        conceptQName: "urn:fjord-insight:taxonomy:fi-sim:2026.1#OperatingIncomeTotal",
        taxonomyVersion: "FI-SIM-2026.1",
        sourceLabel: "Sum driftsinntekter",
        presentationRole: "service-income",
        reportedFinancialLineItemId: reportedLine.id,
        generatorVersion: "generator-1",
      },
      {
        id: "fi-sim-synthetic-line",
        statementId: statement.id,
        conceptKey: "PersonnelExpense",
        conceptQName: "urn:fjord-insight:taxonomy:fi-sim:2026.1#PersonnelExpense",
        taxonomyVersion: "FI-SIM-2026.1",
        sourceLabel: "Personalkostnader",
        presentationRole: "service-income",
        syntheticValue: 80n,
        derivationRuleId: "operating-result-residual-1",
        generatorVersion: "generator-1",
      },
    ],
  });

  const balanceStatement = await prisma.simulatedFinancialStatement.create({
    data: {
      id: "fi-sim-balance-statement",
      datasetId: dataset.id,
      companyId: company.id,
      fiscalYear: 2025,
      statementScope: "COMPANY",
      statementType: "BALANCE_SHEET",
      statementOrigin: "SIMULATED",
      profile: "SERVICE",
      profileRuleId: "service-default-1",
      periodStart: new Date("2025-01-01T00:00:00.000Z"),
      periodEnd: new Date("2025-12-31T00:00:00.000Z"),
      validationStatus: "VALID",
      validationResult: { identities: "passed" },
    },
  });
  await prisma.simulatedFinancialLine.create({
    data: {
      id: "fi-sim-balance-line",
      statementId: balanceStatement.id,
      conceptKey: "AssetsTotal",
      conceptQName: "urn:fjord-insight:taxonomy:fi-sim:2026.1#AssetsTotal",
      taxonomyVersion: "FI-SIM-2026.1",
      sourceLabel: "Sum eiendeler",
      presentationRole: "service-balance",
      syntheticValue: 100n,
      derivationRuleId: "balance-identity-1",
      generatorVersion: "generator-1",
    },
  });

  await prisma.simulatedFinancialDataset.update({
    where: { id: dataset.id },
    data: {
      status: "VALIDATED",
      validatedAt: new Date(),
      validationResult: { statements: 1, status: "passed" },
    },
  });

  await expectDatabaseRejection("validated financial line mutation", () =>
    prisma.simulatedFinancialLine.update({
      where: { id: "fi-sim-synthetic-line" },
      data: { syntheticValue: 79n },
    }),
  );

  await expectDatabaseRejection("flag-off simulated dataset activation", () =>
    prisma.activeFinancialDataset.create({
      data: {
        mode: "SIMULATED",
        simulatedDatasetId: dataset.id,
        activationRevision: 1n,
        activatedAt: new Date(),
        activatedByUserId: "migration-test",
      },
    }),
  );

  await withAuthorizedDemoActivation(async (transaction) => {
    await transaction.activeFinancialDataset.create({
      data: {
        mode: "SIMULATED",
        simulatedDatasetId: dataset.id,
        activationRevision: 1n,
        activatedAt: new Date(),
        activatedByUserId: "migration-test",
      },
    });
  });

  const reportedWhileFlagOff = await financialsRepository.getCompanyFinancials({
    companyId: company.id,
  });

  // A wildcard-bearing ID used to match the active dataset through SQL LIKE
  // and could duplicate rows or attach the wrong provenance.
  await prisma.simulatedFinancialDataset.create({
    data: {
      id: "fi%sim-dataset",
      datasetVersion: "verification-collision-1",
      taxonomyVersion: "FI-SIM-2026.1",
      generatorVersion: "generator-collision-1",
      assumptionVersion: "assumptions-collision-1",
      profileVersion: "profiles-collision-1",
      manifest: { purpose: "exact dataset join verification" },
      createdByUserId: "migration-test",
    },
  });
  if (
    reportedWhileFlagOff.datasetMode !== "reported" ||
    !/^reported:[1-9]\d*$/.test(reportedWhileFlagOff.financialDatasetVersion) ||
    reportedWhileFlagOff.statements.length !== 1 ||
    reportedWhileFlagOff.statements[0].statementOrigin !== "reported" ||
    reportedWhileFlagOff.statements[0].sourceSystem !== "migration-test"
  ) {
    throw new Error("Live views did not fail closed to reported data while the flag was off");
  }

  const reportedRevisionBefore = Number(
    reportedWhileFlagOff.financialDatasetVersion.split(":")[1],
  );
  await prisma.$transaction(async (transaction) => {
    await transaction.financialStatement.update({
      where: { id: "fi-sim-reported-statement" },
      data: { normalizedAt: new Date("2026-08-06T00:00:00.000Z") },
    });
    await transaction.financialLineItem.update({
      where: { id: "fi-sim-reported-line" },
      data: { sortOrder: 0 },
    });
  });
  const reportedAfterOneTransaction = await financialsRepository.getCompanyFinancials({
    companyId: company.id,
  });
  if (
    reportedAfterOneTransaction.financialDatasetVersion !==
    `reported:${reportedRevisionBefore + 1}`
  ) {
    throw new Error("Reported revision was not coalesced to one bump per transaction");
  }

  const liveBeforeMappingSnapshot = await withEnabledDemoRead(() =>
    financialsRepository.getCompanyFinancials({ companyId: company.id }),
  );
  const liveBeforeMapping = liveBeforeMappingSnapshot.statements;
  if (
    liveBeforeMappingSnapshot.datasetMode !== "simulated" ||
    liveBeforeMappingSnapshot.financialDatasetVersion !==
      "simulated:fi-sim-dataset:1" ||
    liveBeforeMapping.length !== 1 ||
    liveBeforeMapping[0].statementOrigin !== "hybrid" ||
    liveBeforeMapping[0].sourceSystem !== "FI-SIM" ||
    liveBeforeMapping[0].revenue !== 100n ||
    liveBeforeMapping[0].assets !== 100n ||
    liveBeforeMapping[0].lines.find((line) => line.liveLineId === "simulated:fi-sim-anchor-line")
      ?.value !== 100n ||
    liveBeforeMapping[0].lines.find(
      (line) => line.liveLineId === "simulated:fi-sim-synthetic-line",
    )?.valueOrigin !== "synthetic" ||
    liveBeforeMapping[0].lines.find(
      (line) => line.liveLineId === "simulated:fi-sim-synthetic-line",
    )?.derivationRuleId !== "operating-result-residual-1" ||
    liveBeforeMapping[0].lines.find(
      (line) => line.liveLineId === "simulated:fi-sim-anchor-line",
    )?.sourceEntityType !== "financial-line"
  ) {
    throw new Error("Live views did not resolve the expected hybrid statement");
  }

  await prisma.simulatedFinancialLineMapping.create({
    data: {
      lineId: "fi-sim-synthetic-line",
      mappingRevision: 1n,
      metricKey: "salary_costs",
      mappingMethod: "migration-verification",
      mappedByUserId: "migration-test",
    },
  });
  await expectDatabaseRejection("mapping history mutation", () =>
    prisma.simulatedFinancialLineMapping.update({
      where: {
        lineId_mappingRevision: {
          lineId: "fi-sim-synthetic-line",
          mappingRevision: 1n,
        },
      },
      data: { metricKey: "other_operating_costs" },
    }),
  );
  await withAuthorizedDemoActivation(async (transaction) => {
    await transaction.activeFinancialDataset.update({
      where: { id: "global" },
      data: {
        activationRevision: 2n,
        mappingRevision: 1n,
        activatedAt: new Date(),
      },
    });
  });

  const liveAfterMapping = await withEnabledDemoRead(() =>
    financialsRepository.listCompanyStatements(company.id),
  );
  if (
    liveAfterMapping[0].financialDatasetVersion !== "simulated:fi-sim-dataset:2" ||
    liveAfterMapping[0].lines.find(
      (line) => line.liveLineId === "simulated:fi-sim-synthetic-line",
    )?.metricKey !== "salary_costs"
  ) {
    throw new Error("Live views did not expose the active append-only mapping revision");
  }

  await expectDatabaseRejection("non-increasing activation revision", () =>
    withAuthorizedDemoActivation(async (transaction) => {
      await transaction.activeFinancialDataset.update({
        where: { id: "global" },
        data: { activationRevision: 2n },
      });
    }),
  );

  await prisma.activeFinancialDataset.update({
    where: { id: "global" },
    data: {
      mode: "REPORTED",
      simulatedDatasetId: null,
      activationRevision: 3n,
      activatedAt: new Date(),
      activatedByUserId: "migration-test",
    },
  });

  const reportedAfterRollback = await financialsRepository.listCompanyStatements(company.id);
  if (
    reportedAfterRollback.length !== 1 ||
    reportedAfterRollback[0].statementOrigin !== "reported"
  ) {
    throw new Error("Authorized rollback did not restore reported reads with the flag off");
  }

  console.log("FI-SIM foundation migration verification passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
