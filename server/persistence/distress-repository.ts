import { DistressStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  DistressFilterOptions,
  DistressFinancialSnapshotSummary,
  DistressSearchFilters,
  NormalizedDistressProfile,
} from "@/lib/types";

function toNullableDate(value?: Date | null) {
  return value ?? null;
}

export async function upsertCompanyDistressProfile(companyOrgNumber: string, profile: NormalizedDistressProfile) {
  const company = await prisma.company.findUnique({
    where: { orgNumber: companyOrgNumber },
    select: { id: true },
  });

  if (!company) {
    throw new Error(`Virksomhet ${companyOrgNumber} finnes ikke i databasen.`);
  }

  return prisma.companyDistressProfile.upsert({
    where: { companyId: company.id },
    update: {
      distressStatus: profile.distressStatus as DistressStatus,
      statusStartedAt: toNullableDate(profile.statusStartedAt),
      statusObservedAt: profile.statusObservedAt,
      daysInStatus: profile.daysInStatus ?? null,
      bankruptcyDate: toNullableDate(profile.bankruptcyDate),
      liquidationDate: toNullableDate(profile.liquidationDate),
      forcedProcessDate: toNullableDate(profile.forcedProcessDate),
      reconstructionDate: toNullableDate(profile.reconstructionDate),
      foreignInsolvencyDate: toNullableDate(profile.foreignInsolvencyDate),
      lastAnnouncementPublishedAt: toNullableDate(profile.lastAnnouncementPublishedAt),
      lastAnnouncementTitle: profile.lastAnnouncementTitle ?? null,
      sourceSystem: profile.sourceSystem,
      sourceEntityType: profile.sourceEntityType,
      sourceId: profile.sourceId,
      fetchedAt: profile.fetchedAt,
      normalizedAt: profile.normalizedAt,
      rawPayload: profile.rawPayload ? (profile.rawPayload as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
    create: {
      companyId: company.id,
      distressStatus: profile.distressStatus as DistressStatus,
      statusStartedAt: toNullableDate(profile.statusStartedAt),
      statusObservedAt: profile.statusObservedAt,
      daysInStatus: profile.daysInStatus ?? null,
      bankruptcyDate: toNullableDate(profile.bankruptcyDate),
      liquidationDate: toNullableDate(profile.liquidationDate),
      forcedProcessDate: toNullableDate(profile.forcedProcessDate),
      reconstructionDate: toNullableDate(profile.reconstructionDate),
      foreignInsolvencyDate: toNullableDate(profile.foreignInsolvencyDate),
      lastAnnouncementPublishedAt: toNullableDate(profile.lastAnnouncementPublishedAt),
      lastAnnouncementTitle: profile.lastAnnouncementTitle ?? null,
      sourceSystem: profile.sourceSystem,
      sourceEntityType: profile.sourceEntityType,
      sourceId: profile.sourceId,
      fetchedAt: profile.fetchedAt,
      normalizedAt: profile.normalizedAt,
      rawPayload: profile.rawPayload ? (profile.rawPayload as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });
}

export async function deleteCompanyDistressData(companyOrgNumber: string) {
  const company = await prisma.company.findUnique({
    where: { orgNumber: companyOrgNumber },
    select: { id: true },
  });

  if (!company) {
    return;
  }

  await prisma.$transaction([
    prisma.distressFinancialSnapshot.deleteMany({
      where: { companyId: company.id },
    }),
    prisma.companyDistressProfile.deleteMany({
      where: { companyId: company.id },
    }),
  ]);
}

export async function upsertDistressFinancialSnapshot(
  companyOrgNumber: string,
  snapshot: DistressFinancialSnapshotSummary,
) {
  const company = await prisma.company.findUnique({
    where: { orgNumber: companyOrgNumber },
    select: { id: true },
  });

  if (!company) {
    throw new Error(`Virksomhet ${companyOrgNumber} finnes ikke i databasen.`);
  }

  return prisma.distressFinancialSnapshot.upsert({
    where: { companyId: company.id },
    update: {
      distressStatus: snapshot.distressStatus as DistressStatus,
      daysInStatus: snapshot.daysInStatus ?? null,
      industryCode: snapshot.industryCode ?? null,
      sectorCode: snapshot.sectorCode ?? null,
      sectorLabel: snapshot.sectorLabel ?? null,
      lastReportedYear: snapshot.lastReportedYear ?? null,
      revenue: snapshot.revenue ?? null,
      ebit: snapshot.ebit ?? null,
      netIncome: snapshot.netIncome ?? null,
      equityRatio:
        snapshot.equityRatio === null || snapshot.equityRatio === undefined
          ? null
          : new Prisma.Decimal(snapshot.equityRatio),
      assets: snapshot.assets ?? null,
      interestBearingDebt: snapshot.interestBearingDebt ?? null,
      distressScore: snapshot.distressScore ?? null,
      scoreVersion: snapshot.scoreVersion ?? null,
      dataCoverage: snapshot.dataCoverage ?? null,
      sourceSystem: null,
      sourceEntityType: "distressFinancialSnapshot",
      sourceId: companyOrgNumber,
    },
    create: {
      companyId: company.id,
      distressStatus: snapshot.distressStatus as DistressStatus,
      daysInStatus: snapshot.daysInStatus ?? null,
      industryCode: snapshot.industryCode ?? null,
      sectorCode: snapshot.sectorCode ?? null,
      sectorLabel: snapshot.sectorLabel ?? null,
      lastReportedYear: snapshot.lastReportedYear ?? null,
      revenue: snapshot.revenue ?? null,
      ebit: snapshot.ebit ?? null,
      netIncome: snapshot.netIncome ?? null,
      equityRatio:
        snapshot.equityRatio === null || snapshot.equityRatio === undefined
          ? null
          : new Prisma.Decimal(snapshot.equityRatio),
      assets: snapshot.assets ?? null,
      interestBearingDebt: snapshot.interestBearingDebt ?? null,
      distressScore: snapshot.distressScore ?? null,
      scoreVersion: snapshot.scoreVersion ?? null,
      dataCoverage: snapshot.dataCoverage ?? null,
      sourceSystem: null,
      sourceEntityType: "distressFinancialSnapshot",
      sourceId: companyOrgNumber,
    },
  });
}

export async function getDistressSyncState(key: string) {
  return prisma.distressSyncState.findUnique({
    where: { key },
  });
}

export async function countDistressProfiles() {
  return prisma.companyDistressProfile.count();
}

export async function upsertDistressSyncState(input: {
  key: string;
  lastUpdateId?: number | null;
  lastRunAt?: Date | null;
  lastBootstrapAt?: Date | null;
  etag?: string | null;
  lastModified?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.distressSyncState.upsert({
    where: { key: input.key },
    update: {
      lastUpdateId: input.lastUpdateId ?? null,
      lastRunAt: input.lastRunAt ?? null,
      lastBootstrapAt: input.lastBootstrapAt ?? null,
      etag: input.etag ?? null,
      lastModified: input.lastModified ?? null,
      metadata: input.metadata ?? Prisma.JsonNull,
    },
    create: {
      key: input.key,
      lastUpdateId: input.lastUpdateId ?? null,
      lastRunAt: input.lastRunAt ?? null,
      lastBootstrapAt: input.lastBootstrapAt ?? null,
      etag: input.etag ?? null,
      lastModified: input.lastModified ?? null,
      metadata: input.metadata ?? Prisma.JsonNull,
    },
  });
}

function buildDistressWhere(filters: DistressSearchFilters): Prisma.CompanyDistressProfileWhereInput {
  const hasSnapshotFilters = Boolean(
    (filters.sectorCodes && filters.sectorCodes.length > 0) ||
      filters.lastReportedYearFrom !== undefined ||
      filters.lastReportedYearTo !== undefined,
  );
  const hasStatusFilter = Boolean(filters.status && filters.status.length > 0);
  const hasIndustryFilter = Boolean(filters.industryCodes && filters.industryCodes.length > 0);
  const hasSectorFilter = Boolean(filters.sectorCodes && filters.sectorCodes.length > 0);

  return {
    distressStatus: hasStatusFilter ? { in: filters.status as DistressStatus[] } : undefined,
    daysInStatus: {
      gte: filters.minDaysInStatus ?? undefined,
      lte: filters.maxDaysInStatus ?? undefined,
    },
    company: {
      industryCode: hasIndustryFilter
        ? {
            code: {
              in: filters.industryCodes,
            },
          }
        : filters.industryCodePrefix
          ? {
              code: {
                startsWith: filters.industryCodePrefix,
              },
            }
          : undefined,
      distressFinancialSnapshot: hasSnapshotFilters
        ? {
            is: {
              sectorCode: hasSectorFilter
                ? {
                    in: filters.sectorCodes,
                  }
                : undefined,
              lastReportedYear: {
                gte: filters.lastReportedYearFrom ?? undefined,
                lte: filters.lastReportedYearTo ?? undefined,
              },
            },
          }
        : undefined,
    },
  };
}

export async function listDistressCompanyRecords(filters: DistressSearchFilters) {
  return prisma.companyDistressProfile.findMany({
    where: buildDistressWhere(filters),
    include: {
      company: {
        include: {
          addresses: true,
          industryCode: true,
          distressFinancialSnapshot: true,
        },
      },
    },
  });
}

export async function getDistressCompanyRecord(orgNumberOrSlug: string) {
  return prisma.company.findFirst({
    where: {
      OR: [{ orgNumber: orgNumberOrSlug }, { slug: orgNumberOrSlug }],
    },
    include: {
      addresses: true,
      industryCode: true,
      financialStatements: {
        orderBy: { fiscalYear: "desc" },
      },
      distressProfile: true,
      distressFinancialSnapshot: true,
    },
  });
}

export async function listDistressFinancialBackfillCandidates(limit = 50) {
  return prisma.company.findMany({
    where: {
      distressProfile: {
        isNot: null,
      },
      OR: [
        {
          distressFinancialSnapshot: null,
        },
        {
          distressFinancialSnapshot: {
            lastReportedYear: null,
          },
        },
      ],
    },
    select: {
      orgNumber: true,
      name: true,
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    take: limit,
  });
}

export async function listDistressFilterOptions(): Promise<DistressFilterOptions> {
  const [statuses, companies, sectorSnapshots] = await Promise.all([
    prisma.companyDistressProfile.groupBy({
      by: ["distressStatus"],
      _count: {
        _all: true,
      },
      orderBy: {
        distressStatus: "asc",
      },
    }),
    prisma.company.findMany({
      where: {
        distressProfile: {
          isNot: null,
        },
        industryCodeId: {
          not: null,
        },
      },
      select: {
        industryCode: {
          select: {
            code: true,
            title: true,
          },
        },
      },
    }),
    prisma.distressFinancialSnapshot.findMany({
      where: {
        sectorCode: {
          not: null,
        },
      },
      select: {
        sectorCode: true,
        sectorLabel: true,
      },
    }),
  ]);

  const industryMap = new Map<string, { label: string; count: number }>();
  for (const company of companies) {
    if (!company.industryCode?.code) {
      continue;
    }

    const existing = industryMap.get(company.industryCode.code);
    industryMap.set(company.industryCode.code, {
      label: company.industryCode.title ?? company.industryCode.code,
      count: (existing?.count ?? 0) + 1,
    });
  }

  const sectorMap = new Map<string, { label: string; count: number }>();
  for (const snapshot of sectorSnapshots) {
    if (!snapshot.sectorCode) {
      continue;
    }

    const existing = sectorMap.get(snapshot.sectorCode);
    sectorMap.set(snapshot.sectorCode, {
      label: snapshot.sectorLabel ?? snapshot.sectorCode,
      count: (existing?.count ?? 0) + 1,
    });
  }

  return {
    statuses: statuses.map((status) => ({
      value: status.distressStatus,
      label: status.distressStatus,
      count: status._count._all,
    })),
    industryCodes: [...industryMap.entries()]
      .map(([value, metadata]) => ({
        value,
        label: metadata.label,
        count: metadata.count,
      }))
      .sort((left, right) => left.value.localeCompare(right.value, "nb-NO")),
    sectors: [...sectorMap.entries()]
      .map(([value, metadata]) => ({
        value,
        label: metadata.label,
        count: metadata.count,
      }))
      .sort((left, right) => left.value.localeCompare(right.value, "nb-NO")),
  };
}
