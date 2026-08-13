import {
  Address,
  Company,
  IndustryCode,
  Person,
  Role,
} from "@prisma/client";
import {
  NormalizedCompany,
  NormalizedFinancialStatement,
  NormalizedRole,
} from "@/lib/types";
import {
  buildRegisteredIndustryCode,
  mergeIndustryCodeClassification,
} from "@/lib/industry-code";
import { toSafeNumber } from "@/server/financials/number-utils";
import type { RegistryCompanyFacts } from "@/server/registry/registry-entity-facts";

type FinancialStatementRecord = {
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
  rawPayload?: unknown;
  fiscalYear: number;
  currency: string;
  statementScope: "COMPANY" | "CONSOLIDATED";
  revenue: bigint | number | null;
  operatingProfit: bigint | number | null;
  netIncome: bigint | number | null;
  equity: bigint | number | null;
  assets: bigint | number | null;
};

type CompanyWithRelations = Company & {
  addresses: Address[];
  industryCode: IndustryCode | null;
  roles?: (Role & { person: Person })[];
  financialStatements?: FinancialStatementRecord[];
};

function deriveRoleHolder(role: Role & { person: Person }) {
  const rawPayload =
    typeof role.rawPayload === "object" && role.rawPayload
      ? (role.rawPayload as Record<string, unknown>)
      : null;
  const companyPayload =
    rawPayload && typeof rawPayload.enhet === "object" && rawPayload.enhet
      ? (rawPayload.enhet as Record<string, unknown>)
      : rawPayload && typeof rawPayload.organisasjon === "object" && rawPayload.organisasjon
        ? (rawPayload.organisasjon as Record<string, unknown>)
        : null;
  const companyName =
    companyPayload &&
    (Array.isArray(companyPayload.navn)
      ? companyPayload.navn.filter((value): value is string => typeof value === "string").join(" ")
      : typeof companyPayload.navn === "string"
        ? companyPayload.navn
        : null);

  return {
    holderType: companyPayload ? ("COMPANY" as const) : ("PERSON" as const),
    organization: companyPayload
      ? {
          sourceSystem: "BRREG",
          sourceEntityType: "company",
          sourceId:
            typeof companyPayload.organisasjonsnummer === "string"
              ? companyPayload.organisasjonsnummer
              : companyName ?? role.person.fullName,
          fetchedAt: role.fetchedAt,
          normalizedAt: role.normalizedAt,
          rawPayload: companyPayload,
          name: companyName ?? role.person.fullName,
          orgNumber:
            typeof companyPayload.organisasjonsnummer === "string"
              ? companyPayload.organisasjonsnummer
              : null,
          legalForm:
            companyPayload.organisasjonsform &&
            typeof companyPayload.organisasjonsform === "object" &&
            "kode" in companyPayload.organisasjonsform &&
            typeof companyPayload.organisasjonsform.kode === "string"
              ? companyPayload.organisasjonsform.kode
              : null,
          approvalStatus:
            typeof companyPayload.godkjenningsstatus === "string"
              ? companyPayload.godkjenningsstatus
              : null,
          status:
            typeof companyPayload.erSlettet === "boolean" && companyPayload.erSlettet
              ? "SLETTET"
              : "ACTIVE",
        }
      : null,
  };
}

/**
 * Company.rawPayload only holds a Brreg enhet document for rows written by the older
 * per-company sync; rows promoted from the register mirror carry an empty payload and get
 * these facts from RegistryEntity instead.
 */
function readCapitalField(rawPayload: unknown, field: string): unknown {
  if (typeof rawPayload !== "object" || !rawPayload || !("kapital" in rawPayload)) {
    return null;
  }
  const capital = (rawPayload as { kapital?: unknown }).kapital;
  if (typeof capital !== "object" || !capital || !(field in capital)) {
    return null;
  }
  return (capital as Record<string, unknown>)[field];
}

function readCapitalNumber(rawPayload: unknown, field: string): number | null {
  const value = readCapitalField(rawPayload, field);
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readCapitalText(rawPayload: unknown, field: string): string | null {
  const value = readCapitalField(rawPayload, field);
  return typeof value === "string" && value !== "" ? value : null;
}

function readLastAnnualReportYear(rawPayload: unknown): number | null {
  if (typeof rawPayload !== "object" || !rawPayload || !("sisteInnsendteAarsregnskap" in rawPayload)) {
    return null;
  }
  const value = (rawPayload as { sisteInnsendteAarsregnskap?: unknown }).sisteInnsendteAarsregnskap;
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapDbCompany(
  company: CompanyWithRelations,
  registryFacts?: RegistryCompanyFacts | null,
): NormalizedCompany {
  const registeredIndustryCode = buildRegisteredIndustryCode({
    orgNumber: company.orgNumber,
    industryPayload:
      typeof company.rawPayload === "object" &&
      company.rawPayload &&
      "naeringskode1" in company.rawPayload
        ? company.rawPayload.naeringskode1
        : null,
    fetchedAt: company.fetchedAt,
    normalizedAt: company.normalizedAt,
  });

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
    foundedAt: registryFacts?.foundedAt ?? company.foundedAt,
    website: company.website,
    employeeCount: company.employeeCount,
    description: company.description,
    municipality: company.addresses[0]?.region ?? null,
    vatRegistered: registryFacts?.vatRegistered ?? null,
    statutoryPurpose: registryFacts?.statutoryPurpose ?? null,
    activityDescription: registryFacts?.activityDescription ?? null,
    statutesDate: registryFacts?.statutesDate ?? null,
    languageForm: registryFacts?.languageForm ?? null,
    institutionalSectorCode: registryFacts?.institutionalSectorCode ?? null,
    institutionalSectorDescription: registryFacts?.institutionalSectorDescription ?? null,
    registeredInBusinessRegister: registryFacts?.registeredInBusinessRegister ?? null,
    businessRegisterRegisteredAt: registryFacts?.businessRegisterRegisteredAt ?? null,
    capitalType: registryFacts?.capitalType ?? null,
    shareCapitalRegisteredAt: registryFacts?.shareCapitalRegisteredAt ?? null,
    previousNames: registryFacts?.previousNames ?? [],
    shareCapital: registryFacts?.shareCapital ?? readCapitalNumber(company.rawPayload, "belop"),
    shareCapitalCurrency:
      registryFacts?.shareCapitalCurrency ?? readCapitalText(company.rawPayload, "valuta"),
    shareCount: registryFacts?.shareCount ?? readCapitalNumber(company.rawPayload, "antallAksjer"),
    lastSubmittedAnnualReportYear:
      registryFacts?.lastSubmittedAnnualReportYear ?? readLastAnnualReportYear(company.rawPayload),
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
    industryCode: mergeIndustryCodeClassification(
      registeredIndustryCode,
      company.industryCode
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
    ),
    roles: company.roles ? mapDbRoles(company.roles) : undefined,
    financialStatements: company.financialStatements
      ? mapDbFinancialStatements(company.financialStatements)
      : undefined,
  };
}

export function mapDbRoles(roles: (Role & { person: Person })[]): NormalizedRole[] {
  return roles.map((role) => ({
    ...deriveRoleHolder(role),
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
  statements: readonly FinancialStatementRecord[],
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
    statementScope: statement.statementScope,
    revenue: toSafeNumber(statement.revenue),
    operatingProfit: toSafeNumber(statement.operatingProfit),
    netIncome: toSafeNumber(statement.netIncome),
    equity: toSafeNumber(statement.equity),
    assets: toSafeNumber(statement.assets),
  }));
}
