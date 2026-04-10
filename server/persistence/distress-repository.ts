import { DistressStatus as PrismaDistressStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  DistressFilterOptions,
  DistressFinancialSnapshotSummary,
  DistressOverviewSectorRow,
  DistressOverviewTimelinePoint,
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
      distressStatus: profile.distressStatus as PrismaDistressStatus,
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
      distressStatus: profile.distressStatus as PrismaDistressStatus,
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
      distressStatus: snapshot.distressStatus as PrismaDistressStatus,
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
      distressStatus: snapshot.distressStatus as PrismaDistressStatus,
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
    distressStatus: hasStatusFilter ? { in: filters.status as PrismaDistressStatus[] } : undefined,
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

export async function getDistressOverviewCounts() {
  const recentCutoff = new Date();
  recentCutoff.setDate(recentCutoff.getDate() - 30);

  const [totalActiveCases, statusCounts, withFinancialCoverageCount, recentAnnouncements30d] = await Promise.all([
    prisma.companyDistressProfile.count(),
    prisma.companyDistressProfile.groupBy({
      by: ["distressStatus"],
      _count: {
        _all: true,
      },
    }),
    prisma.distressFinancialSnapshot.count({
      where: {
        dataCoverage: {
          in: ["FINANCIALS_AVAILABLE", "FINANCIALS_PARTIAL"],
        },
      },
    }),
    prisma.companyDistressProfile.count({
      where: {
        lastAnnouncementPublishedAt: {
          gte: recentCutoff,
        },
      },
    }),
  ]);

  const getStatusCount = (status: PrismaDistressStatus) =>
    statusCounts.find((item) => item.distressStatus === status)?._count._all ?? 0;

  return {
    totalActiveCases,
    bankruptcies: getStatusCount("BANKRUPTCY"),
    liquidations: getStatusCount("LIQUIDATION"),
    reconstructions: getStatusCount("RECONSTRUCTION"),
    forcedProcesses: getStatusCount("FORCED_PROCESS"),
    withFinancialCoverageCount,
    recentAnnouncements30d,
  };
}

export async function getDistressStatusDistribution() {
  return prisma.companyDistressProfile.groupBy({
    by: ["distressStatus"],
    _count: {
      _all: true,
    },
    orderBy: {
      distressStatus: "asc",
    },
  });
}

export async function getDistressSectorOverview(limit = 8): Promise<DistressOverviewSectorRow[]> {
  const recentCutoff = new Date();
  recentCutoff.setDate(recentCutoff.getDate() - 30);

  const [totalUniverseCount, snapshots] = await Promise.all([
    prisma.companyDistressProfile.count(),
    prisma.distressFinancialSnapshot.findMany({
      where: {
        sectorCode: {
          not: null,
        },
        company: {
          distressProfile: {
            isNot: null,
          },
        },
      },
      select: {
        sectorCode: true,
        sectorLabel: true,
        dataCoverage: true,
        companyId: true,
        company: {
          select: {
            distressProfile: {
              select: {
                daysInStatus: true,
                lastAnnouncementPublishedAt: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const aggregate = new Map<
    string,
    {
      sectorCode: string;
      sectorLabel: string;
      companyIds: Set<string>;
      withFinancialsCount: number;
      recentAnnouncementsCount: number;
      daysTotal: number;
      daysCount: number;
    }
  >();

  for (const snapshot of snapshots) {
    if (!snapshot.sectorCode) {
      continue;
    }

    const row = aggregate.get(snapshot.sectorCode) ?? {
      sectorCode: snapshot.sectorCode,
      sectorLabel: snapshot.sectorLabel ?? snapshot.sectorCode,
      companyIds: new Set<string>(),
      withFinancialsCount: 0,
      recentAnnouncementsCount: 0,
      daysTotal: 0,
      daysCount: 0,
    };

    if (!row.companyIds.has(snapshot.companyId)) {
      row.companyIds.add(snapshot.companyId);

      const profile = snapshot.company.distressProfile;
      if (profile?.daysInStatus !== null && profile?.daysInStatus !== undefined) {
        row.daysTotal += profile.daysInStatus;
        row.daysCount += 1;
      }

      if (profile?.lastAnnouncementPublishedAt && profile.lastAnnouncementPublishedAt >= recentCutoff) {
        row.recentAnnouncementsCount += 1;
      }
    }

    if (snapshot.dataCoverage && snapshot.dataCoverage !== "NO_FINANCIALS") {
      row.withFinancialsCount += 1;
    }

    aggregate.set(snapshot.sectorCode, row);
  }

  return [...aggregate.values()]
    .map((row) => ({
      sectorCode: row.sectorCode,
      sectorLabel: row.sectorLabel,
      companyCount: row.companyIds.size,
      shareOfUniverse: totalUniverseCount > 0 ? row.companyIds.size / totalUniverseCount : 0,
      avgDaysInStatus: row.daysCount > 0 ? row.daysTotal / row.daysCount : null,
      withFinancialsCount: row.withFinancialsCount,
      latestAnnouncementCount30d: row.recentAnnouncementsCount,
    }))
    .sort((left, right) => right.companyCount - left.companyCount || left.sectorCode.localeCompare(right.sectorCode, "nb-NO"))
    .slice(0, limit);
}

export async function getDistressRecentAnnouncements(limit = 8) {
  return prisma.companyDistressProfile.findMany({
    where: {
      lastAnnouncementPublishedAt: {
        not: null,
      },
    },
    select: {
      distressStatus: true,
      lastAnnouncementTitle: true,
      lastAnnouncementPublishedAt: true,
      company: {
        select: {
          orgNumber: true,
          name: true,
        },
      },
    },
    orderBy: {
      lastAnnouncementPublishedAt: "desc",
    },
    take: limit,
  });
}

export async function getDistressTimelineByMonth(months = 12): Promise<DistressOverviewTimelinePoint[]> {
  const safeMonths = Math.max(1, Math.min(months, 36));
  const startMonth = new Date();
  startMonth.setUTCDate(1);
  startMonth.setUTCHours(0, 0, 0, 0);
  startMonth.setUTCMonth(startMonth.getUTCMonth() - (safeMonths - 1));

  const records = await prisma.companyDistressProfile.findMany({
    where: {
      lastAnnouncementPublishedAt: {
        gte: startMonth,
      },
    },
    select: {
      lastAnnouncementPublishedAt: true,
      distressStatus: true,
    },
  });

  const bucketMap = new Map<string, DistressOverviewTimelinePoint>();

  for (let index = 0; index < safeMonths; index += 1) {
    const bucketDate = new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() + index, 1));
    const bucket = `${bucketDate.getUTCFullYear()}-${String(bucketDate.getUTCMonth() + 1).padStart(2, "0")}`;
    bucketMap.set(bucket, {
      bucket,
      total: 0,
      bankruptcies: 0,
      liquidations: 0,
      reconstructions: 0,
      forcedProcesses: 0,
    });
  }

  for (const record of records) {
    if (!record.lastAnnouncementPublishedAt) {
      continue;
    }

    const bucket = `${record.lastAnnouncementPublishedAt.getUTCFullYear()}-${String(
      record.lastAnnouncementPublishedAt.getUTCMonth() + 1,
    ).padStart(2, "0")}`;
    const timelinePoint = bucketMap.get(bucket);
    if (!timelinePoint) {
      continue;
    }

    timelinePoint.total += 1;
    if (record.distressStatus === "BANKRUPTCY") {
      timelinePoint.bankruptcies += 1;
    } else if (record.distressStatus === "LIQUIDATION") {
      timelinePoint.liquidations += 1;
    } else if (record.distressStatus === "RECONSTRUCTION") {
      timelinePoint.reconstructions += 1;
    } else if (record.distressStatus === "FORCED_PROCESS") {
      timelinePoint.forcedProcesses += 1;
    }
  }

  return [...bucketMap.values()];
}
