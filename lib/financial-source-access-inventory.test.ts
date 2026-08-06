import { describe, expect, it } from "vitest";

import { auditFinancialSourceAccess } from "@/lib/financial-source-access-inventory";

describe("auditFinancialSourceAccess", () => {
  it("rejects an unregistered direct Prisma financial read", () => {
    const audit = auditFinancialSourceAccess(
      [
        {
          path: "server/new-dashboard.ts",
          source: "await prisma.financialStatement.findMany({ where: { companyId } });",
        },
      ],
      [],
    );

    expect(audit.violations).toEqual([
      {
        path: "server/new-dashboard.ts",
        sources: ["FinancialStatement"],
      },
    ]);
  });

  it("tracks an explicitly classified legacy reader without hiding its classification", () => {
    const audit = auditFinancialSourceAccess(
      [
        {
          path: "server/legacy-reader.ts",
          source: "await prisma.financialStatement.findMany();",
        },
      ],
      [
        {
          path: "server/legacy-reader.ts",
          sources: ["FinancialStatement"],
          classification: "temporary-runtime-reader",
          rationale: "Migrates to FinancialsRepository in F4.",
        },
      ],
    );

    expect(audit.violations).toEqual([]);
    expect(audit.registeredAccess).toEqual([
      {
        path: "server/legacy-reader.ts",
        sources: ["FinancialStatement"],
        classification: "temporary-runtime-reader",
      },
    ]);
  });

  it("detects relation includes and raw SQL source reads", () => {
    const audit = auditFinancialSourceAccess(
      [
        {
          path: "server/relation-reader.ts",
          source: "prisma.company.findMany({ include: { financialStatements: {} } });",
        },
        {
          path: "server/sql-reader.ts",
          source: 'prisma.$queryRaw`SELECT * FROM "FinancialLineItem"`;',
        },
      ],
      [],
    );

    expect(audit.violations).toEqual([
      { path: "server/relation-reader.ts", sources: ["FinancialStatement"] },
      { path: "server/sql-reader.ts", sources: ["FinancialLineItem"] },
    ]);
  });

  it("reports registrations that no longer have direct source access", () => {
    const audit = auditFinancialSourceAccess(
      [{ path: "server/migrated-reader.ts", source: "return financialsRepository.list();" }],
      [
        {
          path: "server/migrated-reader.ts",
          sources: ["FinancialStatement"],
          classification: "temporary-runtime-reader",
          rationale: "Expected to disappear after migration.",
        },
      ],
    );

    expect(audit.unusedRegistrations).toEqual(["server/migrated-reader.ts"]);
  });

  it("rejects a new source model in an otherwise registered file", () => {
    const audit = auditFinancialSourceAccess(
      [
        {
          path: "server/registered-reader.ts",
          source: `
            await prisma.financialStatement.findMany();
            await prisma.financialLineItem.findMany();
          `,
        },
      ],
      [
        {
          path: "server/registered-reader.ts",
          sources: ["FinancialStatement"],
          classification: "temporary-runtime-reader",
          rationale: "Only the statement access is registered.",
        },
      ],
    );

    expect(audit.violations).toEqual([
      { path: "server/registered-reader.ts", sources: ["FinancialLineItem"] },
    ]);
  });
});
