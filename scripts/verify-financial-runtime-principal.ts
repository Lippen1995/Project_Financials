import "@/lib/env";

import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { financialRuntimeIsolation } from "@/server/financials/financial-runtime-client";

/**
 * Proves the runtime database role actually binds, from FI-SIM plan F8.
 *
 * `verify-fi-sim-foundation` already asks the catalog whether `fjord_financial_runtime` has the
 * right privileges. That is a statement about the role. This is a statement about a *connection*:
 * it creates a login role that is a member of the runtime role, connects as it, and finds out
 * what that connection can actually read. A privilege check that never opens a session cannot
 * tell the difference between a role that is correctly restricted and a role nobody uses.
 *
 * Everything happens inside a disposable database. The probe role is dropped again on the way out,
 * including when an assertion fails.
 */

function assertDisposableDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (!/^(fi_sim_migration_test_|gl_511_rehearsal_)/.test(databaseName)) {
    throw new Error(
      `Refusing to create a probe role against ${databaseName}. Use a disposable database.`,
    );
  }
  return databaseUrl;
}

async function expectDenied(label: string, action: () => Promise<unknown>) {
  try {
    await action();
  } catch {
    console.log(`  denied: ${label}`);
    return;
  }
  throw new Error(`The runtime connection was allowed to read ${label}`);
}

async function main() {
  const databaseUrl = assertDisposableDatabase();
  const isolation = financialRuntimeIsolation();
  console.log(
    `Process configuration: ${isolation.isolated ? "isolated" : "NOT isolated"} — ${isolation.reason}`,
  );

  const roleName = `fi_sim_runtime_probe_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const password = randomUUID();
  await prisma.$executeRawUnsafe(
    `CREATE ROLE "${roleName}" LOGIN PASSWORD '${password}' IN ROLE fjord_financial_runtime`,
  );

  const probeUrl = new URL(databaseUrl);
  probeUrl.username = roleName;
  probeUrl.password = password;
  const probe = new PrismaClient({
    log: ["error"],
    datasources: { db: { url: probeUrl.toString() } },
  });

  try {
    // What it must be able to do: every product read goes through these three views.
    const dataset = await probe.$queryRawUnsafe<Array<{ datasetMode: string }>>(
      `SELECT "datasetMode" FROM live_financial_dataset_v1`,
    );
    if (dataset.length !== 1) {
      throw new Error("The runtime connection could not read the live dataset view");
    }
    await probe.$queryRawUnsafe(`SELECT 1 FROM live_financial_statements_v2 LIMIT 1`);
    await probe.$queryRawUnsafe(`SELECT 1 FROM live_financial_line_items_v2 LIMIT 1`);
    console.log("  allowed: the three live views");

    // What it must not be able to do. Reading the source directly is the thing the whole live-view
    // architecture exists to prevent, and writing anything at all is outside its purpose.
    await expectDenied("FinancialStatement", () =>
      probe.$queryRawUnsafe(`SELECT 1 FROM "FinancialStatement" LIMIT 1`),
    );
    await expectDenied("FinancialLineItem", () =>
      probe.$queryRawUnsafe(`SELECT 1 FROM "FinancialLineItem" LIMIT 1`),
    );
    await expectDenied("PublishedFinancialLineItem", () =>
      probe.$queryRawUnsafe(`SELECT 1 FROM "PublishedFinancialLineItem" LIMIT 1`),
    );
    await expectDenied("SimulatedFinancialLine", () =>
      probe.$queryRawUnsafe(`SELECT 1 FROM "SimulatedFinancialLine" LIMIT 1`),
    );
    await expectDenied("ActiveFinancialDataset", () =>
      probe.$queryRawUnsafe(`SELECT 1 FROM "ActiveFinancialDataset" LIMIT 1`),
    );
    await expectDenied("the activation audit", () =>
      probe.$queryRawUnsafe(`SELECT 1 FROM "FinancialDatasetActivationAudit" LIMIT 1`),
    );
    await expectDenied("a write to the reported core", () =>
      probe.$executeRawUnsafe(
        `UPDATE "FinancialStatement" SET "revenue" = 1 WHERE "id" = 'does-not-exist'`,
      ),
    );

    console.log("Financial runtime principal verification passed.");
  } finally {
    await probe.$disconnect();
    await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS "${roleName}"`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
