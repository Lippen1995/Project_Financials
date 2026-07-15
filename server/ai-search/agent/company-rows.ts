/**
 * Turn the org numbers the agent surfaced into result-table rows, so the Treffliste can be DRIVEN
 * by the agent instead of by the literal registry search. Order is preserved — it carries the
 * agent's ranking. Rows are built from the registry mirror + published financials, i.e. the same
 * grounded sources the normal search uses, so the table looks and sorts identically.
 */
import { prisma } from "@/lib/prisma";
import type { CompanySearchRow } from "@/lib/company-search-sort";
import { getLatestFinancialsByOrgNumbers } from "@/server/ai-search/tools/enrich";

export async function buildCompanySearchRows(orgNumbers: string[]): Promise<CompanySearchRow[]> {
  if (orgNumbers.length === 0) return [];

  const [entities, financials] = await Promise.all([
    prisma.registryEntity.findMany({
      where: { orgNumber: { in: orgNumbers } },
      select: {
        orgNumber: true,
        name: true,
        status: true,
        naceCode: true,
        naceDescription: true,
        postalPlace: true,
        municipality: true,
        employeeCount: true,
      },
    }),
    getLatestFinancialsByOrgNumbers(orgNumbers),
  ]);

  const byOrg = new Map(entities.map((e) => [e.orgNumber, e]));

  // Map in the agent's order; drop org numbers the mirror does not know (never fabricate a row).
  return orgNumbers.flatMap((orgNumber) => {
    const entity = byOrg.get(orgNumber);
    if (!entity) return [];
    const fin = financials.get(orgNumber) ?? null;

    return [
      {
        orgNumber: entity.orgNumber,
        name: entity.name,
        status: entity.status,
        industry: [entity.naceCode, entity.naceDescription].filter(Boolean).join(" ") || null,
        city: entity.postalPlace ?? entity.municipality ?? null,
        revenue: fin?.revenue ?? null,
        revenueFiscalYear: fin?.fiscalYear ?? null,
        operatingProfit: fin?.operatingProfit ?? null,
        netIncome: fin?.netIncome ?? null,
        employeeCount: entity.employeeCount ?? null,
      } satisfies CompanySearchRow,
    ];
  });
}
