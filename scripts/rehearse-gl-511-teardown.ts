import "@/lib/env";

import { readFileSync } from "node:fs";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import { financialDatasetActivationService } from "@/server/financials/fi-sim/activation/activation-service";
import { writeSimulatedDataset } from "@/server/financials/fi-sim/generator/dataset-store";
import { generateCompanyFinancials } from "@/server/financials/fi-sim/generator/generator";
import { mapSimulatedDataset } from "@/server/financials/fi-sim/mapping/map-simulated-dataset";
import { financialsRepository } from "@/server/financials/financials-repository";

/**
 * F11: the GL-511 teardown, rehearsed.
 *
 * The point is not to remove the simulation layer — it is to find out, before an investor demo
 * rather than after one, whether removing it leaves a working product. So this builds a realistic
 * simulated dataset, activates it, maps it, switches back to reported, records exactly what the
 * product returns, applies the teardown, and then requires the same answers from a database that
 * no longer has a simulation layer at all.
 *
 * It refuses to run anywhere but a disposable database, for the obvious reason.
 */

const TEARDOWN_SQL = path.join(process.cwd(), "prisma/teardown/gl-511/migration.sql");

function assertDisposableDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (!databaseName.startsWith("gl_511_rehearsal_")) {
    throw new Error(
      `Refusing to rehearse the teardown against ${databaseName}. The database name must start with gl_511_rehearsal_.`,
    );
  }
}

/**
 * Postgres will not take several statements in one prepared statement, so the teardown is applied
 * one statement at a time. Splitting on semicolons is only safe because this file has no dollar-
 * quoted function bodies — it drops functions, it does not define them — so that is asserted
 * rather than assumed.
 */
function teardownStatements(sql: string) {
  if (sql.includes("$$")) {
    throw new Error(
      "The teardown SQL contains a dollar-quoted body and can no longer be split on semicolons.",
    );
  }
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function stable(value: unknown) {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? `${item.toString()}n` : item,
  );
}

async function objectsNamed(kind: "table" | "view" | "type" | "routine", names: string[]) {
  const present = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    kind === "table"
      ? `SELECT table_name AS name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name = ANY($1)`
      : kind === "view"
        ? `SELECT table_name AS name FROM information_schema.views WHERE table_schema='public' AND table_name = ANY($1)`
        : kind === "type"
          ? `SELECT typname AS name FROM pg_type WHERE typname = ANY($1)`
          : `SELECT routine_name AS name FROM information_schema.routines WHERE routine_schema='public' AND routine_name = ANY($1)`,
    names,
  );
  return present.map((row) => row.name).sort();
}

/**
 * Every column anywhere in the schema that stores a financial dataset version, checked for rows
 * that still point at a simulated one. Driven off information_schema rather than a hand-written
 * list, so a table added later is covered without anyone remembering to add it here.
 */
async function simulatedDatasetReferences() {
  const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('financialDatasetVersion', 'financialDatasetMode')
    ORDER BY table_name, column_name
  `;

  const offending: Array<{ table: string; column: string; rows: number }> = [];
  for (const column of columns) {
    const [row] = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM "${column.table_name}" WHERE "${column.column_name}" LIKE 'simulated%'`,
    );
    if ((row?.count ?? 0n) > 0n) {
      offending.push({
        table: column.table_name,
        column: column.column_name,
        rows: Number(row!.count),
      });
    }
  }
  return { checkedColumns: columns.length, offending };
}

async function withDemoSession<T>(action: () => Promise<T>) {
  process.env.FJORD_DEPLOYMENT_ENVIRONMENT = "investor-demo";
  process.env.FJORD_FINANCIAL_SIMULATION_ENABLED = "true";
  try {
    return await action();
  } finally {
    delete process.env.FJORD_DEPLOYMENT_ENVIRONMENT;
    delete process.env.FJORD_FINANCIAL_SIMULATION_ENABLED;
  }
}

async function main() {
  assertDisposableDatabase();

  const observedAt = new Date("2026-08-09T00:00:00.000Z");
  const company = await prisma.company.create({
    data: {
      id: "gl-511-company",
      slug: "gl-511-company",
      orgNumber: "999999881",
      name: "GL-511 rehearsal",
      sourceSystem: "rehearsal",
      sourceEntityType: "company",
      sourceId: "gl-511-company",
      fetchedAt: observedAt,
      normalizedAt: observedAt,
    },
  });
  // A second company with no financial data at all, so the honest empty state is rehearsed too.
  const emptyCompany = await prisma.company.create({
    data: {
      id: "gl-511-empty",
      slug: "gl-511-empty",
      orgNumber: "999999882",
      name: "GL-511 rehearsal without figures",
      sourceSystem: "rehearsal",
      sourceEntityType: "company",
      sourceId: "gl-511-empty",
      fetchedAt: observedAt,
      normalizedAt: observedAt,
    },
  });

  await prisma.financialStatement.create({
    data: {
      id: "gl-511-statement",
      companyId: company.id,
      fiscalYear: 2025,
      statementScope: "COMPANY",
      revenue: 1_000n,
      operatingProfit: 200n,
      netIncome: 150n,
      equity: 600n,
      assets: 1_000n,
      sourceSystem: "BRREG",
      sourceEntityType: "structuredAnnualAccounts",
      sourceId: "gl-511-statement",
      fetchedAt: observedAt,
      normalizedAt: observedAt,
    },
  });
  const reportedLine = await prisma.financialLineItem.create({
    data: {
      id: "gl-511-line",
      companyId: company.id,
      fiscalYear: 2025,
      statementScope: "COMPANY",
      statementType: "INCOME_STATEMENT",
      sourceKey: "gl-511-total-income",
      sourceLabel: "Sum driftsinntekter",
      metricKey: "total_operating_income",
      value: 1_000n,
      sourceSystem: "BRREG",
      sourceEntityType: "structuredAnnualAccountsLine",
      sourceId: "gl-511-line",
      fetchedAt: observedAt,
      normalizedAt: observedAt,
    },
  });

  // Build the layer we are about to remove, so the rehearsal removes something real.
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
    throw new Error(`Rehearsal setup failed: ${JSON.stringify(generation.failures)}`);
  }
  const dataset = await writeSimulatedDataset({
    datasetVersion: "gl-511-rehearsal",
    createdByUserId: "gl-511",
    manifest: {
      reportedDatasetVersion: "reported:rehearsal",
      statementScope: "COMPANY",
      latestCompletedFiscalYear: 2025,
      intentionallyUnmappedConcepts: [],
    },
    generations: [generation],
  });
  await mapSimulatedDataset({
    datasetReference: dataset.datasetId,
    dryRun: false,
    createdByUserId: "gl-511",
  });
  await withDemoSession(async () => {
    await financialDatasetActivationService.activate({
      datasetId: dataset.datasetId,
      actorUserId: "gl-511",
      reason: "Rehearsal: activate before tearing down",
    });
    const simulated = await financialsRepository.listCompanyStatements(company.id);
    if (simulated[0]?.statementOrigin === "reported") {
      throw new Error("Rehearsal setup did not actually put the product on simulated figures");
    }
  });
  await financialDatasetActivationService.deactivate({
    actorUserId: "gl-511",
    reason: "Rehearsal: back to reported before teardown",
  });

  // What the product answers with the simulation layer still present but inactive. This is the
  // output the teardown must not change.
  const before = {
    statements: await financialsRepository.listCompanyStatements(company.id),
    empty: await financialsRepository.getCompanyFinancials({ companyId: emptyCompany.id }),
    universe: await financialsRepository.searchCompanyUniverse({
      companyIds: [company.id, emptyCompany.id],
      limit: 10,
    }),
    aggregate: await financialsRepository.aggregateCompanyFinancials({
      companyIds: [company.id],
    }),
  };
  if (before.statements.length !== 1 || before.empty.statements.length !== 0) {
    throw new Error("Rehearsal baseline is not what it should be before teardown");
  }

  const statements = teardownStatements(readFileSync(TEARDOWN_SQL, "utf8"));
  console.log(`Baseline captured. Applying the GL-511 teardown (${statements.length} statements)…`);
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  // Redefining a view invalidates every cached plan that referenced the old one, and Postgres
  // answers the next query on that connection with "cached plan must not change result type"
  // rather than re-planning. Dropping the pool is what a deployment does by restarting the
  // application; the checklist says so, because a teardown applied under a running process
  // produces exactly this error and it looks like the teardown broke the product.
  await prisma.$disconnect();

  // 1. The simulation layer is gone.
  const remainingTables = await objectsNamed("table", [
    "SimulatedFinancialDataset",
    "SimulatedFinancialStatement",
    "SimulatedFinancialLine",
    "SimulatedFinancialLineMapping",
    "SimulatedMetricAlias",
    "ActiveFinancialDataset",
    "FinancialDatasetActivationAudit",
  ]);
  if (remainingTables.length > 0) {
    throw new Error(`Teardown left simulation tables behind: ${remainingTables.join(", ")}`);
  }
  const remainingTypes = await objectsNamed("type", [
    "SimulatedFinancialDatasetStatus",
    "SimulatedFinancialStatementOrigin",
    "SimulatedFinancialValidationStatus",
    "FinancialSimulationProfile",
    "FinancialDatasetActivationAction",
    "FinancialDatasetMode",
  ]);
  if (remainingTypes.length > 0) {
    throw new Error(`Teardown left simulation enums behind: ${remainingTypes.join(", ")}`);
  }
  const remainingRoutines = await objectsNamed("routine", [
    "guard_simulated_dataset_validation_and_immutability",
    "guard_simulated_statement_mutation",
    "guard_and_validate_simulated_line_mutation",
    "guard_simulated_mapping_history_mutation",
    "validate_active_financial_dataset_pointer",
    "record_financial_dataset_activation",
    "guard_financial_dataset_activation_audit",
  ]);
  if (remainingRoutines.length > 0) {
    throw new Error(`Teardown left simulation guards behind: ${remainingRoutines.join(", ")}`);
  }

  // 2. The reported core and its revision survive. Dropping them would strip the provenance off
  //    every reported record that already carries a "reported:<n>" version.
  const survivors = await objectsNamed("table", ["FinancialStatement", "FinancialLineItem", "FinancialDatasetRevision"]);
  if (survivors.length !== 3) {
    throw new Error(`Teardown removed part of the reported core: ${survivors.join(", ")}`);
  }
  const liveViews = await objectsNamed("view", [
    "live_financial_dataset_v1",
    "live_financial_statements_v2",
    "live_financial_line_items_v2",
  ]);
  if (liveViews.length !== 3) {
    throw new Error(`Teardown did not leave the live views in place: ${liveViews.join(", ")}`);
  }

  // 3. The product answers exactly as before.
  const after = {
    statements: await financialsRepository.listCompanyStatements(company.id),
    empty: await financialsRepository.getCompanyFinancials({ companyId: emptyCompany.id }),
    universe: await financialsRepository.searchCompanyUniverse({
      companyIds: [company.id, emptyCompany.id],
      limit: 10,
    }),
    aggregate: await financialsRepository.aggregateCompanyFinancials({
      companyIds: [company.id],
    }),
  };
  for (const key of ["statements", "empty", "universe", "aggregate"] as const) {
    if (stable(before[key]) !== stable(after[key])) {
      throw new Error(
        `Teardown changed what the product returns for ${key}.\nBefore: ${stable(before[key])}\nAfter:  ${stable(after[key])}`,
      );
    }
  }
  if (after.empty.statements.length !== 0 || after.empty.datasetMode !== "reported") {
    throw new Error("A company without figures no longer shows an honest reported empty state");
  }

  // 4. Nothing anywhere still points at a simulated dataset version.
  const references = await simulatedDatasetReferences();
  if (references.checkedColumns === 0) {
    throw new Error("The simulated-reference check found no versioned columns to check");
  }
  if (references.offending.length > 0) {
    throw new Error(
      `Records still reference a simulated dataset: ${JSON.stringify(references.offending)}`,
    );
  }

  // 5. The runtime role still reads the views and still cannot read a source table.
  const [permissions] = await prisma.$queryRaw<
    Array<{ canReadViews: boolean; canReadSource: boolean }>
  >`
    SELECT
      has_table_privilege('fjord_financial_runtime', 'live_financial_statements_v2', 'SELECT')
        AND has_table_privilege('fjord_financial_runtime', 'live_financial_line_items_v2', 'SELECT')
        AND has_table_privilege('fjord_financial_runtime', 'live_financial_dataset_v1', 'SELECT')
        AS "canReadViews",
      has_table_privilege('fjord_financial_runtime', '"FinancialStatement"', 'SELECT')
        OR has_table_privilege('fjord_financial_runtime', '"FinancialLineItem"', 'SELECT')
        AS "canReadSource"
  `;
  if (!permissions?.canReadViews || permissions.canReadSource) {
    throw new Error(
      `Runtime role privileges are wrong after teardown: ${JSON.stringify(permissions)}`,
    );
  }

  console.log(
    [
      "GL-511 teardown rehearsal passed.",
      `  Simulation tables, enums and guards removed: ${7 + 6 + 7} objects checked.`,
      `  Live views kept their names and answered identically for ${before.statements.length} statement(s).`,
      "  A company without figures still shows a reported empty state.",
      `  ${references.checkedColumns} dataset-version columns checked; none reference a simulated dataset.`,
      "  Runtime role reads the views and no source table.",
    ].join("\n"),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
