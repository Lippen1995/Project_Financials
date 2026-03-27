import { AddressType, CompanyStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { NormalizedCompany, NormalizedIndustryCode, NormalizedRole } from "@/lib/types";

export async function upsertCompanySnapshot(company: NormalizedCompany) {
  const industryCode =
    company.industryCode &&
    (await prisma.industryCode.upsert({
      where: { code: company.industryCode.code },
      update: {
        title: company.industryCode.title ?? company.industryCode.code,
        description: company.industryCode.description,
        level: company.industryCode.level,
        sourceSystem: company.industryCode.sourceSystem,
        sourceEntityType: company.industryCode.sourceEntityType,
        sourceId: company.industryCode.sourceId,
        fetchedAt: company.industryCode.fetchedAt,
        normalizedAt: company.industryCode.normalizedAt,
        rawPayload: company.industryCode.rawPayload as never,
      },
      create: {
        code: company.industryCode.code,
        title: company.industryCode.title ?? company.industryCode.code,
        description: company.industryCode.description,
        level: company.industryCode.level,
        sourceSystem: company.industryCode.sourceSystem,
        sourceEntityType: company.industryCode.sourceEntityType,
        sourceId: company.industryCode.sourceId,
        fetchedAt: company.industryCode.fetchedAt,
        normalizedAt: company.industryCode.normalizedAt,
        rawPayload: company.industryCode.rawPayload as never,
      },
    }));

  await prisma.company.upsert({
    where: { orgNumber: company.orgNumber },
    update: {
      slug: company.slug,
      name: company.name,
      legalForm: company.legalForm,
      status: company.status as CompanyStatus,
      registeredAt: company.registeredAt,
      foundedAt: company.foundedAt,
      website: company.website,
      employeeCount: company.employeeCount,
      revenue: null,
      operatingProfit: null,
      netIncome: null,
      equity: null,
      description: company.description,
      sourceSystem: company.sourceSystem,
      sourceEntityType: company.sourceEntityType,
      sourceId: company.sourceId,
      fetchedAt: company.fetchedAt,
      normalizedAt: company.normalizedAt,
      rawPayload: company.rawPayload as never,
      industryCodeId: industryCode?.id,
      addresses: {
        deleteMany: {},
        create: company.addresses.map((address) => ({
          type: AddressType.BUSINESS,
          line1: address.line1,
          line2: address.line2,
          postalCode: address.postalCode,
          city: address.city,
          region: address.region,
          country: address.country,
          sourceSystem: address.sourceSystem,
          sourceEntityType: address.sourceEntityType,
          sourceId: address.sourceId,
          fetchedAt: address.fetchedAt,
          normalizedAt: address.normalizedAt,
          rawPayload: address.rawPayload as never,
        })),
      },
    },
    create: {
      slug: company.slug,
      orgNumber: company.orgNumber,
      name: company.name,
      legalForm: company.legalForm,
      status: company.status as CompanyStatus,
      registeredAt: company.registeredAt,
      foundedAt: company.foundedAt,
      website: company.website,
      employeeCount: company.employeeCount,
      revenue: null,
      operatingProfit: null,
      netIncome: null,
      equity: null,
      description: company.description,
      sourceSystem: company.sourceSystem,
      sourceEntityType: company.sourceEntityType,
      sourceId: company.sourceId,
      fetchedAt: company.fetchedAt,
      normalizedAt: company.normalizedAt,
      rawPayload: company.rawPayload as never,
      industryCodeId: industryCode?.id,
      addresses: {
        create: company.addresses.map((address) => ({
          type: AddressType.BUSINESS,
          line1: address.line1,
          line2: address.line2,
          postalCode: address.postalCode,
          city: address.city,
          region: address.region,
          country: address.country,
          sourceSystem: address.sourceSystem,
          sourceEntityType: address.sourceEntityType,
          sourceId: address.sourceId,
          fetchedAt: address.fetchedAt,
          normalizedAt: address.normalizedAt,
          rawPayload: address.rawPayload as never,
        })),
      },
    },
  });
}

export async function upsertIndustryCodeSnapshot(industryCode: NormalizedIndustryCode) {
  return prisma.industryCode.upsert({
    where: { code: industryCode.code },
    update: {
      title: industryCode.title ?? industryCode.code,
      description: industryCode.description,
      level: industryCode.level,
      sourceSystem: industryCode.sourceSystem,
      sourceEntityType: industryCode.sourceEntityType,
      sourceId: industryCode.sourceId,
      fetchedAt: industryCode.fetchedAt,
      normalizedAt: industryCode.normalizedAt,
      rawPayload: industryCode.rawPayload as never,
    },
    create: {
      code: industryCode.code,
      title: industryCode.title ?? industryCode.code,
      description: industryCode.description,
      level: industryCode.level,
      sourceSystem: industryCode.sourceSystem,
      sourceEntityType: industryCode.sourceEntityType,
      sourceId: industryCode.sourceId,
      fetchedAt: industryCode.fetchedAt,
      normalizedAt: industryCode.normalizedAt,
      rawPayload: industryCode.rawPayload as never,
    },
  });
}

export async function getCachedCompany(orgNumberOrSlug: string, maxAgeHours: number) {
  const company = await prisma.company.findFirst({
    where: {
      AND: [
        { sourceSystem: "BRREG" },
        { OR: [{ orgNumber: orgNumberOrSlug }, { slug: orgNumberOrSlug }] },
      ],
    },
    include: {
      addresses: true,
      industryCode: true,
      roles: {
        where: { sourceSystem: "BRREG" },
        include: { person: true },
        orderBy: [{ isBoardRole: "desc" }, { title: "asc" }],
      },
      financialStatements: { orderBy: { fiscalYear: "desc" } },
    },
  });

  if (!company) {
    return null;
  }

  const ageMs = Date.now() - company.fetchedAt.getTime();
  return ageMs <= maxAgeHours * 60 * 60 * 1000 ? company : null;
}

export async function getCachedRoles(orgNumber: string, maxAgeHours: number) {
  const company = await prisma.company.findUnique({
    where: { orgNumber },
    include: {
      roles: {
        where: { sourceSystem: "BRREG" },
        include: { person: true },
        orderBy: [{ isBoardRole: "desc" }, { title: "asc" }],
      },
    },
  });

  if (!company || company.roles.length === 0) {
    return null;
  }

  const freshestRole = company.roles.reduce((latest, role) =>
    role.fetchedAt > latest.fetchedAt ? role : latest,
  );
  const ageMs = Date.now() - freshestRole.fetchedAt.getTime();
  return ageMs <= maxAgeHours * 60 * 60 * 1000 ? company.roles : null;
}

export async function upsertRolesSnapshot(companyOrgNumber: string, roles: NormalizedRole[]) {
  const company = await prisma.company.findUnique({
    where: { orgNumber: companyOrgNumber },
  });

  if (!company) {
    return;
  }

  await prisma.role.deleteMany({
    where: { companyId: company.id },
  });

  for (const role of roles) {
    const existingPerson = await prisma.person.findFirst({
      where: { sourceId: role.person.sourceId },
    });

    const person = existingPerson
      ? await prisma.person.update({
          where: { id: existingPerson.id },
          data: {
            fullName: role.person.fullName,
            birthYear: role.person.birthYear,
            sourceSystem: role.person.sourceSystem,
            sourceEntityType: role.person.sourceEntityType,
            fetchedAt: role.person.fetchedAt,
            normalizedAt: role.person.normalizedAt,
            rawPayload: role.person.rawPayload as never,
          },
        })
      : await prisma.person.create({
          data: {
            fullName: role.person.fullName,
            birthYear: role.person.birthYear,
            sourceSystem: role.person.sourceSystem,
            sourceEntityType: role.person.sourceEntityType,
            sourceId: role.person.sourceId,
            fetchedAt: role.person.fetchedAt,
            normalizedAt: role.person.normalizedAt,
            rawPayload: role.person.rawPayload as never,
          },
        });

    await prisma.role.create({
      data: {
        companyId: company.id,
        personId: person.id,
        title: role.title,
        isBoardRole: role.isBoardRole,
        fromDate: role.fromDate,
        toDate: role.toDate,
        sourceSystem: role.sourceSystem,
        sourceEntityType: role.sourceEntityType,
        sourceId: role.sourceId,
        fetchedAt: role.fetchedAt,
        normalizedAt: role.normalizedAt,
        rawPayload: role.rawPayload as never,
      },
    });
  }
}

export async function getLatestFinancialsForCompanies(orgNumbers: string[]) {
  if (orgNumbers.length === 0) {
    return new Map<string, { revenue: number | null; fiscalYear: number | null }>();
  }

  const statements = await prisma.financialStatement.findMany({
    where: {
      company: {
        orgNumber: {
          in: orgNumbers,
        },
      },
    },
    orderBy: [{ companyId: "asc" }, { fiscalYear: "desc" }],
    select: {
      revenue: true,
      fiscalYear: true,
      company: {
        select: {
          orgNumber: true,
        },
      },
    },
  });

  const lookup = new Map<string, { revenue: number | null; fiscalYear: number | null }>();

  for (const statement of statements) {
    const orgNumber = statement.company.orgNumber;
    if (!lookup.has(orgNumber)) {
      lookup.set(orgNumber, {
        revenue: statement.revenue,
        fiscalYear: statement.fiscalYear,
      });
    }
  }

  return lookup;
}
