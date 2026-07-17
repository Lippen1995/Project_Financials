import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: queryRaw,
  },
}));

import {
  getCompanyRoleAssignments,
  getPersonRoles,
} from "@/server/registry/role-search-service";

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

describe("getCompanyRoleAssignments", () => {
  beforeEach(() => {
    queryRaw.mockReset();
  });

  it("includes a small issuer holding when its company is owned by a role person", async () => {
    const issuerFraction = 30_000 / 327_377_982;
    queryRaw.mockImplementation(async (query: { sql?: string }) => {
      const sql = query.sql ?? "";
      if (sql.includes('FROM "RegistryRoleAssignment"')) {
        return [
          {
            holderType: "PERSON",
            personIdentityKey: "ARVID STÅLE PETTERSEN|1957-01-01",
            holderName: "Arvid Ståle Pettersen",
            holderOrgNumber: null,
            birthDate: "1957-01-01",
            roleType: "MEDL",
            roleTypeLabel: "Styremedlem",
            isBoardRole: true,
            deregistered: false,
            personName: "Arvid Ståle Pettersen",
            birthYear: 1957,
          },
        ];
      }
      if (sql.includes('SELECT max("taxYear")')) return [{ year: 2025 }];
      if (sql.includes('SELECT max("totalCompanyShares")')) {
        return [{ total: "327377982" }];
      }
      if (sql.includes('AS "nameKey"')) return [];
      if (sql.includes('AS "holdco"')) {
        return sql.includes("EXISTS")
          ? [{ holdco: "924547308", name: "PI SUBSEA AS", fraction: issuerFraction }]
          : [];
      }
      if (sql.includes('SELECT t."issuer"')) {
        return [
          {
            issuer: "924547308",
            type: "PERSON",
            shOrg: null,
            shName: "ARVID STÅLE PETTERSEN",
            shYear: 1957,
            fraction: 1,
          },
        ];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const roles = await getCompanyRoleAssignments("922493626");

    expect(roles[0]).toEqual(
      expect.objectContaining({
        holderName: "Arvid Ståle Pettersen",
        effectiveShares: 30_000,
        directShares: 0,
        heldVia: "PI SUBSEA AS",
      }),
    );
  });
});
