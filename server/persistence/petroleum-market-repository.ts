import { prisma } from "@/lib/prisma";
import { PetroleumEntityType } from "@/lib/types";
import {
  PetroleumCoreSyncPayload,
  PetroleumEventsSyncPayload,
  PetroleumMetricsSyncPayload,
  PetroleumPublicationsSyncPayload,
} from "@/server/services/petroleum-market-types";

const CHUNK_SIZE = 500;

function chunkArray<T>(items: T[], size = CHUNK_SIZE) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function createManyInChunks<T>(items: T[], run: (chunk: T[]) => Promise<unknown>) {
  for (const chunk of chunkArray(items)) {
    await run(chunk);
  }
}

export async function getCompanySlugLookup(orgNumbers: string[]) {
  if (orgNumbers.length === 0) {
    return new Map<string, { orgNumber: string; slug: string }>();
  }

  const companies = await prisma.company.findMany({
    where: {
      orgNumber: {
        in: orgNumbers,
      },
    },
    select: {
      orgNumber: true,
      slug: true,
    },
  });

  return new Map(companies.map((company) => [company.orgNumber, company]));
}

export async function getPetroleumSyncState(key: string) {
  return prisma.petroleumSyncState.findUnique({
    where: { key },
  });
}

export async function upsertPetroleumSyncState(input: {
  key: string;
  status: string;
  errorMessage?: string | null;
  metadata?: unknown;
  markSuccess?: boolean;
}) {
  const now = new Date();

  return prisma.petroleumSyncState.upsert({
    where: { key: input.key },
    update: {
      lastRunAt: now,
      lastSuccessAt: input.markSuccess ? now : undefined,
      status: input.status,
      errorMessage: input.errorMessage ?? null,
      metadata: (input.metadata ?? null) as never,
    },
    create: {
      key: input.key,
      lastRunAt: now,
      lastSuccessAt: input.markSuccess ? now : null,
      status: input.status,
      errorMessage: input.errorMessage ?? null,
      metadata: (input.metadata ?? null) as never,
    },
  });
}

export async function replacePetroleumCoreData(payload: PetroleumCoreSyncPayload) {
  await prisma.$transaction(
    async (tx) => {
      await tx.petroleumSurvey.deleteMany();
      await tx.petroleumTuf.deleteMany();
      await tx.petroleumFacility.deleteMany();
      await tx.petroleumLicence.deleteMany();
      await tx.petroleumDiscovery.deleteMany();
      await tx.petroleumField.deleteMany();
      await tx.petroleumWellbore.deleteMany();
      await tx.petroleumCompanyLink.deleteMany();

      await createManyInChunks(payload.companyLinks, (chunk) =>
        tx.petroleumCompanyLink.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
      await createManyInChunks(payload.fields, (chunk) =>
        tx.petroleumField.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
      await createManyInChunks(payload.discoveries, (chunk) =>
        tx.petroleumDiscovery.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
      await createManyInChunks(payload.licences, (chunk) =>
        tx.petroleumLicence.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
      await createManyInChunks(payload.facilities, (chunk) =>
        tx.petroleumFacility.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
      await createManyInChunks(payload.tufs, (chunk) =>
        tx.petroleumTuf.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
      await createManyInChunks(payload.surveys, (chunk) =>
        tx.petroleumSurvey.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
      await createManyInChunks(payload.wellbores, (chunk) =>
        tx.petroleumWellbore.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
    },
    {
      maxWait: 30_000,
      timeout: 600_000,
    },
  );
}

export async function replacePetroleumMetricsData(payload: PetroleumMetricsSyncPayload) {
  await prisma.$transaction(
    async (tx) => {
      await tx.petroleumInvestmentSnapshot.deleteMany();
      await tx.petroleumReserveSnapshot.deleteMany();
      await tx.petroleumProductionPoint.deleteMany();

      await createManyInChunks(payload.productionPoints, (chunk) =>
        tx.petroleumProductionPoint.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
      await createManyInChunks(payload.reserveSnapshots, (chunk) =>
        tx.petroleumReserveSnapshot.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
      await createManyInChunks(payload.investmentSnapshots, (chunk) =>
        tx.petroleumInvestmentSnapshot.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
    },
    {
      maxWait: 30_000,
      timeout: 600_000,
    },
  );
}

export async function replacePetroleumEventsForSource(
  source: "HAVTIL" | "GASSCO" | "PETREG",
  payload: PetroleumEventsSyncPayload,
) {
  await prisma.$transaction(
    async (tx) => {
      await tx.petroleumEvent.deleteMany({
        where: { source },
      });

      await createManyInChunks(payload.events, (chunk) =>
        tx.petroleumEvent.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
    },
    {
      maxWait: 30_000,
      timeout: 600_000,
    },
  );
}

export async function replacePetroleumPublicationData(payload: PetroleumPublicationsSyncPayload) {
  await prisma.$transaction(
    async (tx) => {
      await tx.petroleumForecastSnapshot.deleteMany();
      await tx.petroleumPublicationSnapshot.deleteMany();

      await createManyInChunks(payload.forecasts, (chunk) =>
        tx.petroleumForecastSnapshot.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
      await createManyInChunks(payload.publications, (chunk) =>
        tx.petroleumPublicationSnapshot.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
    },
    {
      maxWait: 30_000,
      timeout: 600_000,
    },
  );
}

export async function listPetroleumCompanyLinks() {
  return prisma.petroleumCompanyLink.findMany();
}

export async function listPetroleumFields() {
  return prisma.petroleumField.findMany();
}

export async function listPetroleumDiscoveries() {
  return prisma.petroleumDiscovery.findMany();
}

export async function listPetroleumLicences() {
  return prisma.petroleumLicence.findMany();
}

export async function listPetroleumFacilities() {
  return prisma.petroleumFacility.findMany();
}

export async function listPetroleumTufs() {
  return prisma.petroleumTuf.findMany();
}

export async function listPetroleumSurveys() {
  return prisma.petroleumSurvey.findMany();
}

export async function listPetroleumWellbores() {
  return prisma.petroleumWellbore.findMany();
}

export async function listPetroleumProductionPoints() {
  return prisma.petroleumProductionPoint.findMany();
}

export async function listPetroleumReserveSnapshots() {
  return prisma.petroleumReserveSnapshot.findMany();
}

export async function listPetroleumInvestmentSnapshots() {
  return prisma.petroleumInvestmentSnapshot.findMany();
}

export async function listPetroleumEvents() {
  return prisma.petroleumEvent.findMany({
    orderBy: {
      publishedAt: "desc",
    },
  });
}

export async function listPetroleumForecastSnapshots() {
  return prisma.petroleumForecastSnapshot.findMany({
    orderBy: {
      publishedAt: "desc",
    },
  });
}

export async function listPetroleumPublicationSnapshots() {
  return prisma.petroleumPublicationSnapshot.findMany({
    orderBy: {
      publishedAt: "desc",
    },
  });
}

export async function replacePetroleumMarketSeriesData(input: {
  series: Array<Record<string, unknown>>;
  observations: Array<Record<string, unknown>>;
}) {
  await prisma.$transaction(
    async (tx) => {
      await tx.petroleumMarketObservation.deleteMany();
      await tx.petroleumMarketSeries.deleteMany();

      await createManyInChunks(input.series, (chunk) =>
        tx.petroleumMarketSeries.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
      const persistedSeries = await tx.petroleumMarketSeries.findMany({
        select: { id: true, slug: true },
      });
      const seriesIdBySlug = new Map(persistedSeries.map((item) => [item.slug, item.id]));
      const observationRows = input.observations
        .map((item) => {
          const row = item as Record<string, unknown> & { seriesSlug?: string };
          const seriesSlug = row.seriesSlug;
          if (!seriesSlug) {
            return null;
          }

          const seriesId = seriesIdBySlug.get(seriesSlug);
          if (!seriesId) {
            return null;
          }

          const next = { ...row, seriesId };
          delete (next as { seriesSlug?: string }).seriesSlug;
          return next;
        })
        .filter((item): item is Record<string, unknown> => Boolean(item));

      await createManyInChunks(observationRows, (chunk) =>
        tx.petroleumMarketObservation.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
    },
    {
      maxWait: 30_000,
      timeout: 600_000,
    },
  );
}

export async function listPetroleumMarketSeries(filters?: {
  category?: string;
  region?: string;
  product?: string;
}) {
  return prisma.petroleumMarketSeries.findMany({
    where: {
      category: filters?.category ?? undefined,
      region: filters?.region ?? undefined,
      product: filters?.product ?? undefined,
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

export async function listPetroleumMarketObservations(input?: {
  seriesId?: string;
  from?: Date;
  to?: Date;
}) {
  return prisma.petroleumMarketObservation.findMany({
    where: {
      seriesId: input?.seriesId ?? undefined,
      observationDate: input?.from || input?.to ? { gte: input?.from, lte: input?.to } : undefined,
    },
    orderBy: {
      observationDate: "asc",
    },
  });
}

export async function replacePetroleumFiscalSnapshots(input: {
  snapshots: Array<Record<string, unknown>>;
}) {
  await prisma.$transaction(
    async (tx) => {
      await tx.petroleumFiscalRegimeSnapshot.deleteMany();
      await createManyInChunks(input.snapshots, (chunk) =>
        tx.petroleumFiscalRegimeSnapshot.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
    },
    {
      maxWait: 30_000,
      timeout: 600_000,
    },
  );
}

export async function listPetroleumFiscalSnapshots(jurisdiction?: string) {
  return prisma.petroleumFiscalRegimeSnapshot.findMany({
    where: {
      jurisdiction: jurisdiction ?? undefined,
    },
    orderBy: {
      effectiveDate: "desc",
    },
  });
}

export async function replacePetroleumCompanyExposureSnapshots(input: {
  snapshots: Array<Record<string, unknown>>;
}) {
  await prisma.$transaction(
    async (tx) => {
      await tx.petroleumCompanyExposureSnapshot.deleteMany();
      await createManyInChunks(input.snapshots, (chunk) =>
        tx.petroleumCompanyExposureSnapshot.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
    },
    {
      maxWait: 30_000,
      timeout: 600_000,
    },
  );
}

export async function listPetroleumCompanyExposureSnapshots() {
  return prisma.petroleumCompanyExposureSnapshot.findMany({
    orderBy: {
      operatorFieldCount: "desc",
    },
  });
}

export async function findPetroleumEntityDetail(entityType: PetroleumEntityType, entityNpdId: number) {
  switch (entityType) {
    case "FIELD":
      return prisma.petroleumField.findUnique({ where: { npdId: entityNpdId } });
    case "DISCOVERY":
      return prisma.petroleumDiscovery.findUnique({ where: { npdId: entityNpdId } });
    case "LICENCE":
      return prisma.petroleumLicence.findUnique({ where: { npdId: entityNpdId } });
    case "FACILITY":
      return prisma.petroleumFacility.findUnique({ where: { npdId: entityNpdId } });
    case "TUF":
      return prisma.petroleumTuf.findUnique({ where: { npdId: entityNpdId } });
    case "SURVEY":
      return prisma.petroleumSurvey.findUnique({ where: { npdId: entityNpdId } });
    case "WELLBORE":
      return prisma.petroleumWellbore.findUnique({ where: { npdId: entityNpdId } });
    default:
      return null;
  }
}
