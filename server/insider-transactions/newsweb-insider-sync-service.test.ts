import { beforeEach, describe, expect, it, vi } from "vitest";

const { registryFindMany } = vi.hoisted(() => ({ registryFindMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    registryEntity: { findMany: registryFindMany },
  },
}));

import { resolveReportingPartyOrgNumber } from "@/server/insider-transactions/newsweb-insider-sync-service";

describe("NewsWeb reporting-party resolution", () => {
  beforeEach(() => registryFindMany.mockReset());

  it("resolves an exact legal name without relying on a broad first-token result cap", async () => {
    registryFindMany.mockResolvedValueOnce([
      { orgNumber: "924547308", name: "PI SUBSEA AS" },
    ]);

    await expect(resolveReportingPartyOrgNumber("PI SUBSEA AS")).resolves.toBe(
      "924547308",
    );
    expect(registryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { equals: "PI SUBSEA AS", mode: "insensitive" } },
      }),
    );
  });
});
