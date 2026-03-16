import {
  Address,
  Company,
  FinancialStatement,
  IndustryCode,
  Person,
  Role,
} from "@prisma/client";
import { NormalizedCompany, NormalizedFinancialStatement, NormalizedRole } from "@/lib/types";

type CompanyWithRelations = Company & {
  addresses: Address[];
  industryCode: IndustryCode | null;
  roles?: (Role & { person: Person })[];
  financialStatements?: FinancialStatement[];
};

export function mapDbCompany(company: CompanyWithRelations): NormalizedCompany {
  return {
    sourceSystem: company.sourceSystem,
    sourceEntityType: company.sourceEntityType,
    sourceId: company.sourceId,
    fetchedAt: company.fetchedAt,
    normalizedAt: company.normalizedAt,
    rawPayload: company.rawPayload,
    orgNumber: company.orgNumber,
    name: company.name,
    slug: company.slug,
    legalForm: company.legalForm,
    status: company.status,
    registeredAt: company.registeredAt,
    foundedAt: company.foundedAt,
    website: company.website,
    employeeCount: company.employeeCount,
    description: company.description,
    municipality: company.addresses[0]?.region ?? null,
    vatRegistered: null,
    shareCapital:
      typeof company.rawPayload === "object" &&
      company.rawPayload &&
      "kapital" in company.rawPayload &&
      typeof company.rawPayload.kapital === "object" &&
      company.rawPayload.kapital &&
      "belop" in company.rawPayload.kapital
        ? Number(company.rawPayload.kapital.belop)
        : null,
    shareCapitalCurrency:
      typeof company.rawPayload === "object" &&
      company.rawPayload &&
      "kapital" in company.rawPayload &&
      typeof company.rawPayload.kapital === "object" &&
      company.rawPayload.kapital &&
      "valuta" in company.rawPayload.kapital
        ? String(company.rawPayload.kapital.valuta)
        : null,
    shareCount:
      typeof company.rawPayload === "object" &&
      company.rawPayload &&
      "kapital" in company.rawPayload &&
      typeof company.rawPayload.kapital === "object" &&
      company.rawPayload.kapital &&
      "antallAksjer" in company.rawPayload.kapital
        ? Number(company.rawPayload.kapital.antallAksjer)
        : null,
    lastSubmittedAnnualReportYear:
      typeof company.rawPayload === "object" &&
      company.rawPayload &&
      "sisteInnsendteAarsregnskap" in company.rawPayload &&
      company.rawPayload.sisteInnsendteAarsregnskap
        ? Number(company.rawPayload.sisteInnsendteAarsregnskap)
        : null,
    announcementsUrl: `https://w2.brreg.no/kunngjoring/hent_nr.jsp?orgnr=${company.orgNumber}`,
    addresses: company.addresses.map((address) => ({
      sourceSystem: address.sourceSystem,
      sourceEntityType: address.sourceEntityType,
      sourceId: address.sourceId,
      fetchedAt: address.fetchedAt,
      normalizedAt: address.normalizedAt,
      rawPayload: address.rawPayload,
      line1: address.line1,
      line2: address.line2,
      postalCode: address.postalCode,
      city: address.city,
      region: address.region,
      country: address.country,
    })),
    industryCode: company.industryCode
      ? {
          sourceSystem: company.industryCode.sourceSystem,
          sourceEntityType: company.industryCode.sourceEntityType,
          sourceId: company.industryCode.sourceId,
          fetchedAt: company.industryCode.fetchedAt,
          normalizedAt: company.industryCode.normalizedAt,
          rawPayload: company.industryCode.rawPayload,
          code: company.industryCode.code,
          title: company.industryCode.title,
          description: company.industryCode.description,
          level: company.industryCode.level,
          parentCode: null,
        }
      : null,
    roles: company.roles ? mapDbRoles(company.roles) : undefined,
    financialStatements: company.financialStatements
      ? mapDbFinancialStatements(company.financialStatements)
      : undefined,
  };
}

export function mapDbRoles(roles: (Role & { person: Person })[]): NormalizedRole[] {
  return roles.map((role) => ({
    sourceSystem: role.sourceSystem,
    sourceEntityType: role.sourceEntityType,
    sourceId: role.sourceId,
    fetchedAt: role.fetchedAt,
    normalizedAt: role.normalizedAt,
    rawPayload: role.rawPayload,
    title: role.title,
    isBoardRole: role.isBoardRole,
    fromDate: role.fromDate,
    toDate: role.toDate,
    person: {
      sourceSystem: role.person.sourceSystem,
      sourceEntityType: role.person.sourceEntityType,
      sourceId: role.person.sourceId,
      fetchedAt: role.person.fetchedAt,
      normalizedAt: role.person.normalizedAt,
      rawPayload: role.person.rawPayload,
      fullName: role.person.fullName,
      birthYear: role.person.birthYear,
    },
  }));
}

export function mapDbFinancialStatements(
  statements: FinancialStatement[],
): NormalizedFinancialStatement[] {
  return statements.map((statement) => ({
    sourceSystem: statement.sourceSystem,
    sourceEntityType: statement.sourceEntityType,
    sourceId: statement.sourceId,
    fetchedAt: statement.fetchedAt,
    normalizedAt: statement.normalizedAt,
    rawPayload: statement.rawPayload,
    fiscalYear: statement.fiscalYear,
    currency: statement.currency,
    revenue: statement.revenue,
    operatingProfit: statement.operatingProfit,
    netIncome: statement.netIncome,
    equity: statement.equity,
    assets: statement.assets,
  }));
}
