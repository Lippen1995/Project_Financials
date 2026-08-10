import { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * The database connection financial reads run on.
 *
 * FI-SIM's stop criterion is that the runtime database role can be limited to the live views. The
 * migrations create `fjord_financial_runtime` with exactly those privileges and revoke everything
 * else, and the disposable-database port proves the role is right — but a `REVOKE` protects
 * nothing while the application connects as the database owner. Privileges bind to a connection,
 * not to a comment.
 *
 * So financial reads get their own connection, authenticated as a member of that role. Everything
 * else — ingest, admin, auth, due diligence — keeps the shared client, because it legitimately
 * writes and legitimately reads tables the runtime role must never see.
 *
 * When `FJORD_FINANCIAL_RUNTIME_DATABASE_URL` is unset the shared client is used in ordinary
 * reported development. The investor-demo exception is stricter: once simulation is enabled,
 * financial reads fail closed unless the dedicated role is actually bound to the connection.
 */

const globalForFinancialRuntime = globalThis as unknown as {
  financialRuntimePrisma?: PrismaClient;
};

function runtimeDatabaseUrl() {
  return process.env.FJORD_FINANCIAL_RUNTIME_DATABASE_URL?.trim() ?? "";
}

function enabledInvestorDemo() {
  return (
    process.env.FJORD_DEPLOYMENT_ENVIRONMENT === "investor-demo" &&
    process.env.FJORD_FINANCIAL_SIMULATION_ENABLED === "true"
  );
}

export function financialRuntimeIsolation() {
  const url = runtimeDatabaseUrl();
  return {
    isolated: url.length > 0,
    reason: url.length > 0
      ? "Financial reads use a dedicated least-privilege connection."
      : "FJORD_FINANCIAL_RUNTIME_DATABASE_URL is unset, so financial reads share the application connection and the runtime role's revokes do not bind.",
  };
}

/**
 * Resolved once per process. A second pool is the cost of the isolation, so it is not created
 * unless the deployment has actually asked for one.
 */
export function financialRuntimePrisma(): PrismaClient {
  const url = runtimeDatabaseUrl();
  if (!url) {
    if (enabledInvestorDemo()) {
      throw new Error(
        "Enabled investor-demo financial simulation requires a dedicated least-privilege connection in FJORD_FINANCIAL_RUNTIME_DATABASE_URL.",
      );
    }
    return prisma;
  }
  if (globalForFinancialRuntime.financialRuntimePrisma) {
    return globalForFinancialRuntime.financialRuntimePrisma;
  }
  const client = new PrismaClient({
    log: ["warn", "error"],
    datasources: { db: { url } },
  });
  globalForFinancialRuntime.financialRuntimePrisma = client;
  return client;
}
