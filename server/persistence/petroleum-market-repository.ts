import { prisma } from "@/lib/prisma";
import { PetroleumEntityType } from "@/lib/types";
import {
  PetroleumCoreSyncPayload,
  PetroleumEventsSyncPayload,
  PetroleumMetricsSyncPayload,
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
    default:
      return null;
  }
}
