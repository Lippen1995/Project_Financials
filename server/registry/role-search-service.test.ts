import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: queryRaw,
  },
}));

import { getPersonRoles } from "@/server/registry/role-search-service";

describe("getPersonRoles", () => {
  beforeEach(() => {
    queryRaw.mockReset();
  });

  it("resolves company names from the Brreg registry mirror when no Company snapshot exists", async () => {
    queryRaw.mockResolvedValueOnce([
      {
        companyOrgNumber: "916603819",
        companyName: "Registrert virksomhetsnavn AS",
        roleType: "LEDE",
        roleTypeLabel: "Styrets leder",
        isBoardRole: true,
        deregistered: false,
        groupLastChanged: null,
      },
    ]);

    const roles = await getPersonRoles("PERSON|1964-01-01");

    expect(roles[0]?.companyName).toBe("Registrert virksomhetsnavn AS");
    const query = queryRaw.mock.calls[0]?.[0] as { sql?: string };
    expect(query.sql).toContain('COALESCE(c."name", re."name") AS "companyName"');
    expect(query.sql).toContain('LEFT JOIN "RegistryEntity" re');
  });
});
