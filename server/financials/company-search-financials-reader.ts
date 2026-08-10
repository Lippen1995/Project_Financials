import { prisma } from "@/lib/prisma";
import {
  financialsRepository,
  type FinancialsRepository,
} from "@/server/financials/financials-repository";
import { toSafeNumber } from "@/server/financials/number-utils";

export type CompanySearchFinancials = {
  revenue: number | null;
  operatingProfit: number | null;
  netIncome: number | null;
  fiscalYear: number | null;
};

/**
 * Latest headline figures per organisation number, for scoring and ranking search results.
 *
 * This used to be a direct FinancialStatement query on the company repository, which left that
 * module both reading and writing the reported source. The write side is a legitimate ingest
 * path and stays there; the read moved here and onto the live dataset, so a search ranking
 * follows whichever dataset is active instead of always ranking on reported figures.
 *
 * Prisma resolves organisation numbers to company ids — company identity, not a financial
 * source. Organisation numbers absent from the Company table simply have no entry, which
 * callers must read as "no figures" rather than zero.
 *
 * The "latest year wins" pick is the repository's universe search rather than a loop here, so
 * ranking no longer loads every line item of every result to read five headline figures, and the
 * tie between an entity statement and a group statement of the same year is decided explicitly:
 * search ranks a company on its own accounts.
 */
export function createCompanySearchFinancialsReader(
  repository: Pick<FinancialsRepository, "searchCompanyUniverse"> = financialsRepository,
) {
  return async function getLatestFinancialsForCompanies(
    orgNumbers: string[],
  ): Promise<Map<string, CompanySearchFinancials>> {
    const lookup = new Map<string, CompanySearchFinancials>();
    if (orgNumbers.length === 0) {
      return lookup;
    }

    const companies = await prisma.company.findMany({
      where: { orgNumber: { in: orgNumbers } },
      select: { id: true, orgNumber: true },
    });
    if (companies.length === 0) {
      return lookup;
    }

    const orgNumberByCompanyId = new Map(
      companies.map((company) => [company.id, company.orgNumber] as const),
    );
    const { statements } = await repository.searchCompanyUniverse({
      companyIds: companies.map((company) => company.id),
      scopePreference: "COMPANY",
      limit: companies.length,
    });

    for (const statement of statements) {
      const orgNumber = orgNumberByCompanyId.get(statement.companyId);
      if (!orgNumber) continue;
      lookup.set(orgNumber, {
        revenue: toSafeNumber(statement.revenue),
        operatingProfit: toSafeNumber(statement.operatingProfit),
        netIncome: toSafeNumber(statement.netIncome),
        fiscalYear: statement.fiscalYear,
      });
    }

    return lookup;
  };
}

export const getLatestFinancialsForCompanies = createCompanySearchFinancialsReader();
