import { prisma } from "@/lib/prisma";
import { SearchFilters } from "@/lib/types";
import { CompanyProvider } from "@/integrations/provider-interface";
import { mapDbCompany, mapDbFinancialStatements, mapDbRoles } from "@/server/mappers/db-mappers";

export class MockProvider implements CompanyProvider {
  async searchCompanies(filters: SearchFilters) {
    const companies = await prisma.company.findMany({
      where: {
        AND: [
          filters.query ? {
            OR: [
              { name: { contains: filters.query, mode: "insensitive" } },
              { orgNumber: { contains: filters.query } },
            ],
          } : {},
          filters.status ? { status: filters.status } : {},
          filters.industryCode ? { industryCode: { code: filters.industryCode } } : {},
          filters.city ? { addresses: { some: { city: { equals: filters.city, mode: "insensitive" } } } } : {},
          filters.minRevenue ? { revenue: { gte: filters.minRevenue } } : {},
          filters.maxRevenue ? { revenue: { lte: filters.maxRevenue } } : {},
          filters.minEmployees ? { employeeCount: { gte: filters.minEmployees } } : {},
          filters.maxEmployees ? { employeeCount: { lte: filters.maxEmployees } } : {},
        ],
      },
      include: {
        addresses: true,
        industryCode: true,
      },
      take: 30,
      orderBy: [{ revenue: "desc" }, { name: "asc" }],
    });

    return companies.map(mapDbCompany);
  }

  async getCompany(orgNumberOrSlug: string) {
    const company = await prisma.company.findFirst({
      where: {
        OR: [{ orgNumber: orgNumberOrSlug }, { slug: orgNumberOrSlug }],
      },
      include: {
        addresses: true,
        industryCode: true,
        roles: { include: { person: true } },
        financialStatements: { orderBy: { fiscalYear: "desc" } },
      },
    });

    return company ? mapDbCompany(company) : null;
  }

  async getRoles(orgNumber: string) {
    const company = await prisma.company.findUnique({
      where: { orgNumber },
      include: {
        roles: { include: { person: true }, orderBy: [{ isBoardRole: "desc" }, { title: "asc" }] },
      },
    });

    return mapDbRoles(company?.roles ?? []);
  }

  async getFinancialStatements(orgNumber: string) {
    const company = await prisma.company.findUnique({
      where: { orgNumber },
      include: {
        financialStatements: {
          orderBy: { fiscalYear: "desc" },
        },
      },
    });

    return mapDbFinancialStatements(company?.financialStatements ?? []);
  }
}