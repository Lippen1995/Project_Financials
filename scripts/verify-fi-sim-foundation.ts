import "@/lib/env";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { financialDatasetActivationService } from "@/server/financials/fi-sim/activation/activation-service";
import { writeSimulatedDataset } from "@/server/financials/fi-sim/generator/dataset-store";
import { generateCompanyFinancials } from "@/server/financials/fi-sim/generator/generator";
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
  declaredAction: "ACTIVATE" | "ROLLBACK" | "DEACTIVATE" = "ACTIVATE",
) {
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      "SET LOCAL app.deployment_environment = 'investor-demo'",
    );
    await transaction.$executeRawUnsafe("SET LOCAL app.fi_sim_enabled = 'on'");
    // The audit trigger refuses a pointer change that nobody claims responsibility for, so an
    // authorised session has to say who is acting, why, and which way the pointer is moving.
    await transaction.$executeRaw`SELECT set_config('app.activation_actor', 'migration-test', true)`;
    await transaction.$executeRaw`SELECT set_config('app.activation_reason', 'FI-SIM foundation verification', true)`;
    await transaction.$executeRaw`SELECT set_config('app.activation_action', ${declaredAction}, true)`;
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

  // A second company exists only for the universe and aggregation reads. Keeping it apart from
  // the anchor company means the statement-level assertions further down stay about one company
  // with one statement, and the "one row per company" pick has something to actually choose from.
  const universeCompany = await prisma.company.create({
    data: {
      id: "fi-sim-universe-company",
      slug: "fi-sim-universe-company",
      orgNumber: "999999992",
      name: "FI-SIM universe verification",
      sourceSystem: "migration-test",
      sourceEntityType: "company",
      sourceId: "fi-sim-universe-company",
      fetchedAt: new Date("2026-08-06T00:00:00.000Z"),
      normalizedAt: new Date("2026-08-06T00:00:00.000Z"),
    },
  });

  for (const fixture of [
    { id: "fi-sim-universe-2024", fiscalYear: 2024, statementScope: "COMPANY" as const, revenue: 40n },
    { id: "fi-sim-universe-2025", fiscalYear: 2025, statementScope: "COMPANY" as const, revenue: 50n },
    { id: "fi-sim-universe-2025-group", fiscalYear: 2025, statementScope: "CONSOLIDATED" as const, revenue: 90n },
  ]) {
    await prisma.financialStatement.create({
      data: {
        id: fixture.id,
        companyId: universeCompany.id,
        fiscalYear: fixture.fiscalYear,
        statementScope: fixture.statementScope,
        revenue: fixture.revenue,
        operatingProfit: 5n,
        sourceSystem: "migration-test",
        sourceEntityType: "financial-statement",
        sourceId: fixture.id,
        fetchedAt: new Date("2026-08-06T00:00:00.000Z"),
        normalizedAt: new Date("2026-08-06T00:00:00.000Z"),
      },
    });
  }

  const groupPreferred = await financialsRepository.searchCompanyUniverse({
    companyIds: [universeCompany.id],
    scopePreference: "CONSOLIDATED",
    limit: 10,
  });
  if (
    groupPreferred.statements.length !== 1 ||
    groupPreferred.statements[0].fiscalYear !== 2025 ||
    groupPreferred.statements[0].statementScope !== "CONSOLIDATED" ||
    groupPreferred.truncated
  ) {
    throw new Error("Universe search did not pick the newest group statement per company");
  }

  const entityPreferred = await financialsRepository.searchCompanyUniverse({
    companyIds: [universeCompany.id],
    scopePreference: "COMPANY",
    limit: 10,
  });
  if (
    entityPreferred.statements.length !== 1 ||
    entityPreferred.statements[0].statementScope !== "COMPANY" ||
    entityPreferred.statements[0].fiscalYear !== 2025
  ) {
    throw new Error("Universe search ignored the caller's entity-scope preference");
  }

  const pinnedYear = await financialsRepository.searchCompanyUniverse({
    companyIds: [universeCompany.id],
    fiscalYear: 2024,
    scopePreference: "COMPANY",
    limit: 10,
  });
  if (pinnedYear.statements.length !== 1 || pinnedYear.statements[0].fiscalYear !== 2024) {
    throw new Error("Universe search did not honour an explicit fiscal year");
  }

  const truncatedUniverse = await financialsRepository.searchCompanyUniverse({
    companyIds: [company.id, universeCompany.id],
    limit: 1,
  });
  if (truncatedUniverse.statements.length !== 1 || !truncatedUniverse.truncated) {
    throw new Error("Universe search did not report a truncated company set");
  }

  const filteredUniverse = await financialsRepository.searchCompanyUniverse({
    companyIds: [universeCompany.id],
    reportedSourceSystems: ["BRREG"],
    limit: 10,
  });
  if (filteredUniverse.statements.length !== 0) {
    throw new Error("Universe search ignored the reported source-system filter");
  }

  const aggregate = await financialsRepository.aggregateCompanyFinancials({
    companyIds: [universeCompany.id],
    fiscalYears: [2025],
  });
  const companyScopeBucket = aggregate.buckets.find(
    (bucket) => bucket.statementScope === "COMPANY",
  );
  const groupScopeBucket = aggregate.buckets.find(
    (bucket) => bucket.statementScope === "CONSOLIDATED",
  );
  if (
    aggregate.buckets.length !== 2 ||
    companyScopeBucket?.revenue.total !== 50n ||
    groupScopeBucket?.revenue.total !== 90n ||
    companyScopeBucket.companyCount !== 1 ||
    companyScopeBucket.currency !== "NOK" ||
    companyScopeBucket.unitScale !== 1
  ) {
    throw new Error("Aggregation did not keep scope, currency and unit buckets apart");
  }
  if (aggregate.financialDatasetVersion !== groupPreferred.financialDatasetVersion) {
    throw new Error("Aggregation and universe search disagreed about the active dataset");
  }
  console.log("Verified live universe search and aggregation in reported mode.");

  // F7 port: generating and storing a dataset must leave every reported record byte-identical.
  // The generator is pure, so the risk is not in its arithmetic but in the write path around it.
  const reportedFingerprint = async () =>
    JSON.stringify(
      {
        statements: await prisma.financialStatement.findMany({ orderBy: { id: "asc" } }),
        lines: await prisma.financialLineItem.findMany({ orderBy: { id: "asc" } }),
        version: (await financialsRepository.getCompaniesFinancialHeadlines({ companyIds: [] }))
          .financialDatasetVersion,
      },
      (_key, value) => (typeof value === "bigint" ? `${value.toString()}n` : value),
    );

  const reportedBeforeGeneration = await reportedFingerprint();
  const generation = generateCompanyFinancials({
    companyId: company.id,
    orgNumber: company.orgNumber,
    registeredAt: new Date("2005-01-01T00:00:00.000Z"),
    signals: { industryCode: "62.010", organisationForm: "AS" },
    fiscalYears: [2025],
    latestCompletedFiscalYear: 2025,
    statementScope: "COMPANY",
    currency: "NOK",
    unitScale: 1,
    anchorsByFiscalYear: {
      2025: [
        {
          conceptKey: "OperatingIncomeTotal",
          reportedFinancialLineItemId: reportedLine.id,
          value: reportedLine.value ?? 0n,
          currency: "NOK",
          unitScale: 1,
        },
      ],
    },
  });
  if (generation.failures.length > 0) {
    throw new Error(
      `Generator failed on the verification company: ${JSON.stringify(generation.failures)}`,
    );
  }

  const generatedReport = await writeSimulatedDataset({
    datasetVersion: "verification-generated-1",
    createdByUserId: "migration-test",
    manifest: {
      reportedDatasetVersion: "reported:verification",
      statementScope: "COMPANY",
      latestCompletedFiscalYear: 2025,
      intentionallyUnmappedConcepts: [],
    },
    generations: [generation],
  });
  if (generatedReport.status !== "VALIDATED" || generatedReport.packageCount !== 1) {
    throw new Error(
      `Generated dataset did not validate: ${JSON.stringify({
        status: generatedReport.status,
        issues: generatedReport.issues,
        exclusions: generatedReport.exclusions,
      })}`,
    );
  }
  if (generatedReport.anchoredLineCount !== 1) {
    throw new Error("The generated dataset did not reference the reported anchor exactly once");
  }
  if ((await reportedFingerprint()) !== reportedBeforeGeneration) {
    throw new Error("Generating a simulated dataset changed a reported financial record");
  }

  await expectDatabaseRejection("mutating a validated generated dataset", () =>
    prisma.simulatedFinancialStatement.updateMany({
      where: { datasetId: generatedReport.datasetId },
      data: { validationStatus: "ERROR" },
    }),
  );
  console.log("Verified generator output, dataset validation and reported-record immutability.");

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

  await expectDatabaseRejection("unaudited pointer change", () =>
    prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        "SET LOCAL app.deployment_environment = 'investor-demo'",
      );
      await transaction.$executeRawUnsafe("SET LOCAL app.fi_sim_enabled = 'on'");
      await transaction.activeFinancialDataset.update({
        where: { id: "global" },
        data: { activationRevision: 4n },
      });
    }),
  );

  // Deactivation goes through the product command, with the demo flag off. Turning the demo off
  // is the safe direction and must not require the flag that turns it on.
  const deactivation = await financialDatasetActivationService.deactivate({
    actorUserId: "migration-test",
    reason: "Foundation verification rollback",
  });
  if (deactivation.datasetMode !== "reported" || deactivation.activationRevision <= 2n) {
    throw new Error("The activation command did not atomically restore the reported pointer");
  }

  const reportedAfterRollback = await financialsRepository.listCompanyStatements(company.id);
  if (
    reportedAfterRollback.length !== 1 ||
    reportedAfterRollback[0].statementOrigin !== "reported"
  ) {
    throw new Error("Authorized rollback did not restore reported reads with the flag off");
  }

  const activations = await financialDatasetActivationService.listActivations(50);
  const deactivations = activations.filter((entry) => entry.action === "DEACTIVATE");
  if (
    activations.length < 3 ||
    deactivations.length !== 1 ||
    deactivations[0].toMode !== "REPORTED" ||
    deactivations[0].actorUserId !== "migration-test" ||
    !deactivations[0].reason ||
    !deactivations[0].databaseUser
  ) {
    throw new Error("The activation audit did not record every pointer change with its actor");
  }
  await expectDatabaseRejection("rewriting the activation audit", () =>
    prisma.financialDatasetActivationAudit.update({
      where: { id: activations[0].id },
      data: { reason: "rewritten" },
    }),
  );
  await expectDatabaseRejection("deleting from the activation audit", () =>
    prisma.financialDatasetActivationAudit.delete({ where: { id: activations[0].id } }),
  );
  console.log(
    `Verified controlled activation and an append-only audit of ${activations.length} pointer changes.`,
  );

  // F10 operational rehearsal: two generated datasets, activated in turn, rolled back to the
  // first, and switched off. Rollback must reactivate the earlier immutable rows rather than
  // rebuild them, and every switch must move the dataset version so caches and stored analyses
  // fall out of date by themselves.
  const secondReport = await writeSimulatedDataset({
    datasetVersion: "verification-generated-2",
    createdByUserId: "migration-test",
    manifest: {
      reportedDatasetVersion: "reported:verification",
      statementScope: "COMPANY",
      latestCompletedFiscalYear: 2025,
      intentionallyUnmappedConcepts: [],
    },
    generations: [generation],
  });

  const versions: string[] = [];
  await withEnabledDemoRead(async () => {
    const first = await financialDatasetActivationService.activate({
      datasetId: generatedReport.datasetId,
      actorUserId: "migration-test",
      reason: "Operational rehearsal: first demo dataset",
    });
    versions.push(first.financialDatasetVersion);
    const afterFirst = await financialsRepository.listCompanyStatements(company.id);
    if (
      afterFirst.length !== 1 ||
      afterFirst[0].statementOrigin === "reported" ||
      afterFirst[0].financialDatasetVersion !== first.financialDatasetVersion
    ) {
      throw new Error("Activating the generated dataset did not change what the product reads");
    }
    if (!afterFirst[0].lines.some((line) => line.valueOrigin === "synthetic")) {
      throw new Error("The activated demo statement exposed no synthetic line to mark");
    }

    const second = await financialDatasetActivationService.activate({
      datasetId: secondReport.datasetId,
      actorUserId: "migration-test",
      reason: "Operational rehearsal: replacement dataset",
    });
    versions.push(second.financialDatasetVersion);

    const rolledBack = await financialDatasetActivationService.rollback({
      actorUserId: "migration-test",
      reason: "Operational rehearsal: rollback",
    });
    versions.push(rolledBack.financialDatasetVersion);
    if (rolledBack.simulatedDatasetId !== generatedReport.datasetId) {
      throw new Error("Rollback did not reactivate the previously activated dataset");
    }
    const afterRollback = await financialsRepository.listCompanyStatements(company.id);
    if (afterRollback[0]?.financialDatasetVersion !== rolledBack.financialDatasetVersion) {
      throw new Error("Rollback did not move the dataset version the product reads");
    }
  });

  const finalDeactivation = await financialDatasetActivationService.deactivate({
    actorUserId: "migration-test",
    reason: "Operational rehearsal: demo over",
  });
  versions.push(finalDeactivation.financialDatasetVersion);
  if (new Set(versions).size !== versions.length) {
    throw new Error(`A dataset switch reused a version: ${versions.join(", ")}`);
  }
  const rehearsalLog = await financialDatasetActivationService.listActivations(4);
  if (
    rehearsalLog.map((entry) => entry.action).join(",") !==
    "DEACTIVATE,ROLLBACK,ACTIVATE,ACTIVATE"
  ) {
    throw new Error(
      `The rehearsal was not audited in order: ${rehearsalLog.map((entry) => entry.action).join(",")}`,
    );
  }
  const reportedAfterRehearsal = await financialsRepository.listCompanyStatements(company.id);
  if (reportedAfterRehearsal[0]?.statementOrigin !== "reported") {
    throw new Error("The rehearsal did not leave the product back on reported figures");
  }
  console.log(
    `Verified the operational rehearsal: activate, replace, rollback and deactivate across ${versions.length} distinct dataset versions.`,
  );

  console.log("FI-SIM foundation migration verification passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
