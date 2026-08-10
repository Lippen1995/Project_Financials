import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  financialRuntimeIsolation,
  financialRuntimePrisma,
} from "@/server/financials/financial-runtime-client";

afterEach(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  // Tests must not inherit an operator's active local demo configuration from `.env`.
  vi.stubEnv("FJORD_DEPLOYMENT_ENVIRONMENT", "development");
  vi.stubEnv("FJORD_FINANCIAL_SIMULATION_ENABLED", "false");
});

describe("financial runtime connection", () => {
  it("says plainly when the runtime role's revokes do not bind", () => {
    // The dangerous state is not "unisolated" — it is "unisolated while everyone believes
    // otherwise". The verification port prints this, so a deployment cannot quietly pass the stop
    // criterion on the strength of a REVOKE that no connection is subject to.
    vi.stubEnv("FJORD_FINANCIAL_RUNTIME_DATABASE_URL", "");

    const isolation = financialRuntimeIsolation();

    expect(isolation.isolated).toBe(false);
    expect(isolation.reason).toContain("do not bind");
  });

  it("falls back to the shared connection rather than refusing to serve financials", () => {
    // Taking the product down because a deployment has not been split yet would trade a real
    // outage for a defence-in-depth measure. The fallback is deliberate and reported.
    vi.stubEnv("FJORD_FINANCIAL_RUNTIME_DATABASE_URL", "");

    expect(financialRuntimePrisma()).toBe(prisma);
  });

  it("fails closed when an enabled investor demo lacks the least-privilege connection", () => {
    vi.stubEnv("FJORD_DEPLOYMENT_ENVIRONMENT", "investor-demo");
    vi.stubEnv("FJORD_FINANCIAL_SIMULATION_ENABLED", "true");
    vi.stubEnv("FJORD_FINANCIAL_RUNTIME_DATABASE_URL", "");

    expect(() => financialRuntimePrisma()).toThrow(/dedicated least-privilege connection/i);
  });

  it("reports isolation once a dedicated connection is configured", () => {
    vi.stubEnv(
      "FJORD_FINANCIAL_RUNTIME_DATABASE_URL",
      "postgresql://runtime:secret@localhost:5432/projectx",
    );

    expect(financialRuntimeIsolation()).toMatchObject({ isolated: true });
  });

  it("treats whitespace as unset", () => {
    vi.stubEnv("FJORD_FINANCIAL_RUNTIME_DATABASE_URL", "   ");

    expect(financialRuntimeIsolation().isolated).toBe(false);
    expect(financialRuntimePrisma()).toBe(prisma);
  });
});
