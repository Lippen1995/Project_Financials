import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { PetroleumEntityType } from "@/lib/types";
import {
  PetroleumCoreSyncPayload,
  PetroleumEventsSyncPayload,
  PetroleumMetricsSyncPayload,
  PetroleumPublicationsSyncPayload,
} from "@/server/services/petroleum-market-types";

const CHUNK_SIZE = 500;

export type PetroleumFieldSnapshotListInput = {
  areas?: string[];
  statuses?: string[];
  hcTypes?: string[];
  operatorNpdCompanyIds?: number[];
  operatorOrgNumbers?: string[];
  licenseeCompanyIds?: number[];
  fieldNpdIds?: number[];
  fieldSlugs?: string[];
  query?: string;
  take?: number;
  skip?: number;
  orderBy?:
    | Prisma.PetroleumFieldSnapshotOrderByWithRelationInput
    | Prisma.PetroleumFieldSnapshotOrderByWithRelationInput[];
};

export type PetroleumLicenceSnapshotListInput = {
  areas?: string[];
  statuses?: string[];
  currentPhases?: string[];
  operatorNpdCompanyIds?: number[];
  operatorOrgNumbers?: string[];
  licenseeCompanyIds?: number[];
  licenceNpdIds?: number[];
  query?: string;
  take?: number;
  skip?: number;
  orderBy?:
    | Prisma.PetroleumLicenceSnapshotOrderByWithRelationInput
    | Prisma.PetroleumLicenceSnapshotOrderByWithRelationInput[];
};

export type PetroleumOperatorSnapshotListInput = {
  npdCompanyIds?: number[];
  orgNumbers?: string[];
  areas?: string[];
  hcTypes?: string[];
  query?: string;
  take?: number;
  skip?: number;
  orderBy?:
    | Prisma.PetroleumOperatorSnapshotOrderByWithRelationInput
    | Prisma.PetroleumOperatorSnapshotOrderByWithRelationInput[];
};

export type PetroleumAreaSnapshotListInput = {
  areas?: string[];
  query?: string;
  take?: number;
  skip?: number;
  orderBy?:
    | Prisma.PetroleumAreaSnapshotOrderByWithRelationInput
    | Prisma.PetroleumAreaSnapshotOrderByWithRelationInput[];
};

export type PetroleumMapFeatureSnapshotListInput = {
  layerIds?: string[];
  statuses?: string[];
  areas?: string[];
  hcTypes?: string[];
  operatorNpdCompanyIds?: number[];
  logicalFacilityLayer?: "facilities" | "subsea" | "terminals";
  query?: string;
  surveyCategories?: string[];
  surveyYearFrom?: number;
  surveyYearTo?: number;
  take?: number;
  skip?: number;
  orderBy?:
    | Prisma.PetroleumMapFeatureSnapshotOrderByWithRelationInput
    | Prisma.PetroleumMapFeatureSnapshotOrderByWithRelationInput[];
};

export type PetroleumEventListInput = {
  sources?: string[];
  entityRefs?: Array<{ entityType: PetroleumEntityType; entityNpdIds: number[] }>;
  relatedCompanyOrgNumber?: string;
  relatedCompanySlug?: string;
  take?: number;
  skip?: number;
};

export type PetroleumDiscoveryListInput = {
  areas?: string[];
  statuses?: string[];
  hcTypes?: string[];
  operatorNpdCompanyIds?: number[];
  query?: string;
  take?: number;
  skip?: number;
  orderBy?:
    | Prisma.PetroleumDiscoveryOrderByWithRelationInput
    | Prisma.PetroleumDiscoveryOrderByWithRelationInput[];
};

export type PetroleumFacilityListInput = {
  areas?: string[];
  statuses?: string[];
  operatorNpdCompanyIds?: number[];
  query?: string;
  take?: number;
  skip?: number;
  orderBy?:
    | Prisma.PetroleumFacilityOrderByWithRelationInput
    | Prisma.PetroleumFacilityOrderByWithRelationInput[];
};

export type PetroleumTufListInput = {
  areas?: string[];
  statuses?: string[];
  hcTypes?: string[];
  operatorNpdCompanyIds?: number[];
  query?: string;
  take?: number;
  skip?: number;
  orderBy?:
    | Prisma.PetroleumTufOrderByWithRelationInput
    | Prisma.PetroleumTufOrderByWithRelationInput[];
};

export type PetroleumSurveyListInput = {
  areas?: string[];
  statuses?: string[];
  categories?: string[];
  companyNpdIds?: number[];
  query?: string;
  take?: number;
  skip?: number;
  orderBy?:
    | Prisma.PetroleumSurveyOrderByWithRelationInput
    | Prisma.PetroleumSurveyOrderByWithRelationInput[];
};

export type PetroleumWellboreListInput = {
  areas?: string[];
  statuses?: string[];
  hcTypes?: string[];
  operatorNpdCompanyIds?: number[];
  query?: string;
  take?: number;
  skip?: number;
  orderBy?:
    | Prisma.PetroleumWellboreOrderByWithRelationInput
    | Prisma.PetroleumWellboreOrderByWithRelationInput[];
};

type PetroleumCompanyExposureSnapshotRow = {
  id: string;
  companyId: string;
  npdCompanyId: number;
  operatorFieldCount: number;
  licenceCount: number;
  operatedProductionOe: number | null;
  attributableProductionOe: number | null;
  remainingReservesOe: number | null;
  expectedFutureInvestmentNok: bigint | null;
  mainAreas: unknown;
  metadata: unknown;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
};

type ExposureSnapshotDelegate = {
  deleteMany: (args?: unknown) => Promise<unknown>;
  createMany: (args: { data: never[]; skipDuplicates?: boolean }) => Promise<unknown>;
  findMany: (args?: unknown) => Promise<PetroleumCompanyExposureSnapshotRow[]>;
  findUnique: (args: { where: { companyId: string } }) => Promise<PetroleumCompanyExposureSnapshotRow | null>;
};

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

function getExposureSnapshotDelegate(client: unknown): ExposureSnapshotDelegate | null {
  if (!client || typeof client !== "object") {
    return null;
  }

  const candidate = (client as Record<string, unknown>).petroleumCompanyExposureSnapshot;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const delegate = candidate as Record<string, unknown>;
  if (
    typeof delegate.findUnique !== "function" ||
    typeof delegate.findMany !== "function" ||
    typeof delegate.deleteMany !== "function" ||
    typeof delegate.createMany !== "function"
  ) {
    return null;
  }

  return candidate as ExposureSnapshotDelegate;
}

function buildFieldSnapshotWhere(input?: PetroleumFieldSnapshotListInput): Prisma.PetroleumFieldSnapshotWhereInput {
  const query = input?.query?.trim();

  return {
    area: input?.areas?.length ? { in: input.areas } : undefined,
    status: input?.statuses?.length ? { in: input.statuses } : undefined,
    hcType: input?.hcTypes?.length ? { in: input.hcTypes } : undefined,
    operatorNpdCompanyId: input?.operatorNpdCompanyIds?.length
      ? { in: input.operatorNpdCompanyIds }
      : undefined,
    operatorOrgNumber: input?.operatorOrgNumbers?.length ? { in: input.operatorOrgNumbers } : undefined,
    fieldNpdId: input?.fieldNpdIds?.length ? { in: input.fieldNpdIds } : undefined,
    fieldSlug: input?.fieldSlugs?.length ? { in: input.fieldSlugs } : undefined,
    licenseeCompanyIds: input?.licenseeCompanyIds?.length ? { hasSome: input.licenseeCompanyIds } : undefined,
    OR: query
      ? [
          { name: { contains: query, mode: "insensitive" } },
          { fieldSlug: { contains: query, mode: "insensitive" } },
          { operatorName: { contains: query, mode: "insensitive" } },
        ]
      : undefined,
  };
}

function buildLicenceSnapshotWhere(
  input?: PetroleumLicenceSnapshotListInput,
): Prisma.PetroleumLicenceSnapshotWhereInput {
  const query = input?.query?.trim();

  return {
    area: input?.areas?.length ? { in: input.areas } : undefined,
    status: input?.statuses?.length ? { in: input.statuses } : undefined,
    currentPhase: input?.currentPhases?.length ? { in: input.currentPhases } : undefined,
    operatorNpdCompanyId: input?.operatorNpdCompanyIds?.length
      ? { in: input.operatorNpdCompanyIds }
      : undefined,
    operatorOrgNumber: input?.operatorOrgNumbers?.length ? { in: input.operatorOrgNumbers } : undefined,
    licenceNpdId: input?.licenceNpdIds?.length ? { in: input.licenceNpdIds } : undefined,
    licenseeCompanyIds: input?.licenseeCompanyIds?.length ? { hasSome: input.licenseeCompanyIds } : undefined,
    OR: query
      ? [
          { name: { contains: query, mode: "insensitive" } },
          { licenceSlug: { contains: query, mode: "insensitive" } },
          { operatorName: { contains: query, mode: "insensitive" } },
        ]
      : undefined,
  };
}

function buildOperatorSnapshotWhere(
  input?: PetroleumOperatorSnapshotListInput,
): Prisma.PetroleumOperatorSnapshotWhereInput {
  const query = input?.query?.trim();

  return {
    npdCompanyId: input?.npdCompanyIds?.length ? { in: input.npdCompanyIds } : undefined,
    orgNumber: input?.orgNumbers?.length ? { in: input.orgNumbers } : undefined,
    mainAreas: input?.areas?.length ? { hasSome: input.areas } : undefined,
    mainHydrocarbonTypes: input?.hcTypes?.length ? { hasSome: input.hcTypes } : undefined,
    OR: query
      ? [
          { operatorName: { contains: query, mode: "insensitive" } },
          { slug: { contains: query, mode: "insensitive" } },
          { orgNumber: { contains: query, mode: "insensitive" } },
        ]
      : undefined,
  };
}

function buildAreaSnapshotWhere(input?: PetroleumAreaSnapshotListInput): Prisma.PetroleumAreaSnapshotWhereInput {
  const query = input?.query?.trim();

  return {
    area: input?.areas?.length ? { in: input.areas } : query ? { contains: query, mode: "insensitive" } : undefined,
  };
}

function buildMapFeatureSnapshotWhere(
  input?: PetroleumMapFeatureSnapshotListInput,
): Prisma.PetroleumMapFeatureSnapshotWhereInput {
  const query = input?.query?.trim();
  const and: Prisma.PetroleumMapFeatureSnapshotWhereInput[] = [];
  const facilityLogicalWhere =
    input?.logicalFacilityLayer === "subsea"
      ? {
          OR: [
            { facilityKind: { equals: "SUBSEA STRUCTURE", mode: "insensitive" } },
            { facilityKind: { equals: "MULTI WELL TEMPLATE", mode: "insensitive" } },
            { facilityKind: { equals: "SINGLE WELL TEMPLATE", mode: "insensitive" } },
          ],
        }
      : input?.logicalFacilityLayer === "terminals"
        ? {
            OR: [
              { facilityKind: { equals: "ONSHORE FACILITY", mode: "insensitive" } },
              { facilityKind: { equals: "LANDFALL", mode: "insensitive" } },
              { name: { contains: "terminal", mode: "insensitive" } },
              { area: { contains: "terminal", mode: "insensitive" } },
              { name: { contains: "landanlegg", mode: "insensitive" } },
            ],
          }
        : input?.logicalFacilityLayer === "facilities"
          ? {
              NOT: {
                OR: [
                  { facilityKind: { equals: "SUBSEA STRUCTURE", mode: "insensitive" } },
                  { facilityKind: { equals: "MULTI WELL TEMPLATE", mode: "insensitive" } },
                  { facilityKind: { equals: "SINGLE WELL TEMPLATE", mode: "insensitive" } },
                  { facilityKind: { equals: "ONSHORE FACILITY", mode: "insensitive" } },
                  { facilityKind: { equals: "LANDFALL", mode: "insensitive" } },
                  { facilityKind: { contains: "vessel", mode: "insensitive" } },
                  { facilityKind: { contains: "offshore wind", mode: "insensitive" } },
                ],
              },
            }
          : null;

  if (facilityLogicalWhere) {
    and.push(facilityLogicalWhere);
  }

  if (input?.surveyCategories?.length) {
    and.push({
      OR: [
        { category: { in: input.surveyCategories } },
        { subType: { in: input.surveyCategories } },
        { hcType: { in: input.surveyCategories } },
      ],
    });
  }

  if (input?.surveyYearFrom !== undefined || input?.surveyYearTo !== undefined) {
    and.push({
      surveyYear: {
        gte: input?.surveyYearFrom,
        lte: input?.surveyYearTo,
      },
    });
  }

  return {
    layerId: input?.layerIds?.length ? { in: input.layerIds } : undefined,
    status: input?.statuses?.length ? { in: input.statuses } : undefined,
    area: input?.areas?.length ? { in: input.areas } : undefined,
    hcType: input?.hcTypes?.length ? { in: input.hcTypes } : undefined,
    operatorNpdCompanyId: input?.operatorNpdCompanyIds?.length ? { in: input.operatorNpdCompanyIds } : undefined,
    OR: query
      ? [
          { name: { contains: query, mode: "insensitive" } },
          { entitySlug: { contains: query, mode: "insensitive" } },
          { operatorName: { contains: query, mode: "insensitive" } },
          { relatedFieldName: { contains: query, mode: "insensitive" } },
          { companyName: { contains: query, mode: "insensitive" } },
        ]
      : undefined,
    AND: and.length ? and : undefined,
  };
}

function buildPetroleumEventWhere(input?: PetroleumEventListInput): Prisma.PetroleumEventWhereInput | undefined {
  if (!input) {
    return undefined;
  }

  const entityRefs = (input.entityRefs ?? []).filter((item) => item.entityNpdIds.length > 0);
  const or: Prisma.PetroleumEventWhereInput[] = [
    ...entityRefs.map((item) => ({
      entityType: item.entityType,
      entityNpdId: { in: item.entityNpdIds },
    })),
    ...(input.relatedCompanyOrgNumber ? [{ relatedCompanyOrgNumber: input.relatedCompanyOrgNumber }] : []),
    ...(input.relatedCompanySlug ? [{ relatedCompanySlug: input.relatedCompanySlug }] : []),
  ];

  return {
    source: input.sources?.length ? { in: input.sources } : undefined,
    OR: or.length ? or : undefined,
  };
}

function buildDiscoveryWhere(input?: PetroleumDiscoveryListInput): Prisma.PetroleumDiscoveryWhereInput {
  const query = input?.query?.trim();

  return {
    areaName: input?.areas?.length ? { in: input.areas } : undefined,
    activityStatus: input?.statuses?.length ? { in: input.statuses } : undefined,
    hydrocarbonType: input?.hcTypes?.length ? { in: input.hcTypes } : undefined,
    operatorNpdCompanyId: input?.operatorNpdCompanyIds?.length ? { in: input.operatorNpdCompanyIds } : undefined,
    OR: query
      ? [
          { name: { contains: query, mode: "insensitive" } },
          { slug: { contains: query, mode: "insensitive" } },
          { relatedFieldName: { contains: query, mode: "insensitive" } },
          { operatorCompanyName: { contains: query, mode: "insensitive" } },
        ]
      : undefined,
  };
}

function buildFacilityWhere(input?: PetroleumFacilityListInput): Prisma.PetroleumFacilityWhereInput {
  const query = input?.query?.trim();

  return {
    belongsToName: input?.areas?.length ? { in: input.areas } : undefined,
    phase: input?.statuses?.length ? { in: input.statuses } : undefined,
    currentOperatorNpdId: input?.operatorNpdCompanyIds?.length ? { in: input.operatorNpdCompanyIds } : undefined,
    OR: query
      ? [
          { name: { contains: query, mode: "insensitive" } },
          { slug: { contains: query, mode: "insensitive" } },
          { kind: { contains: query, mode: "insensitive" } },
          { currentOperatorName: { contains: query, mode: "insensitive" } },
        ]
      : undefined,
  };
}

function buildTufWhere(input?: PetroleumTufListInput): Prisma.PetroleumTufWhereInput {
  const query = input?.query?.trim();

  return {
    belongsToName: input?.areas?.length ? { in: input.areas } : undefined,
    currentPhase: input?.statuses?.length ? { in: input.statuses } : undefined,
    medium: input?.hcTypes?.length ? { in: input.hcTypes } : undefined,
    operatorNpdCompanyId: input?.operatorNpdCompanyIds?.length ? { in: input.operatorNpdCompanyIds } : undefined,
    OR: query
      ? [
          { name: { contains: query, mode: "insensitive" } },
          { slug: { contains: query, mode: "insensitive" } },
          { medium: { contains: query, mode: "insensitive" } },
          { operatorCompanyName: { contains: query, mode: "insensitive" } },
        ]
      : undefined,
  };
}

function buildSurveyWhere(input?: PetroleumSurveyListInput): Prisma.PetroleumSurveyWhereInput {
  const query = input?.query?.trim();

  return {
    geographicalArea: input?.areas?.length ? { in: input.areas } : undefined,
    status: input?.statuses?.length ? { in: input.statuses } : undefined,
    companyNpdId: input?.companyNpdIds?.length ? { in: input.companyNpdIds } : undefined,
    OR: query
      ? [
          { name: { contains: query, mode: "insensitive" } },
          { slug: { contains: query, mode: "insensitive" } },
          { category: { contains: query, mode: "insensitive" } },
          { mainType: { contains: query, mode: "insensitive" } },
          { subType: { contains: query, mode: "insensitive" } },
          { companyName: { contains: query, mode: "insensitive" } },
        ]
      : undefined,
    ...(input?.categories?.length
      ? {
          AND: [
            {
              OR: [
                { category: { in: input.categories } },
                { mainType: { in: input.categories } },
                { subType: { in: input.categories } },
              ],
            },
          ],
        }
      : {}),
  };
}

function buildWellboreWhere(input?: PetroleumWellboreListInput): Prisma.PetroleumWellboreWhereInput {
  const query = input?.query?.trim();

  return {
    mainArea: input?.areas?.length ? { in: input.areas } : undefined,
    drillingOperatorNpdCompanyId: input?.operatorNpdCompanyIds?.length
      ? { in: input.operatorNpdCompanyIds }
      : undefined,
    content: input?.hcTypes?.length ? { in: input.hcTypes } : undefined,
    OR: query
      ? [
          { name: { contains: query, mode: "insensitive" } },
          { slug: { contains: query, mode: "insensitive" } },
          { fieldName: { contains: query, mode: "insensitive" } },
          { drillingOperatorName: { contains: query, mode: "insensitive" } },
        ]
      : undefined,
    ...(input?.statuses?.length
      ? {
          AND: [
            {
              OR: [
                { status: { in: input.statuses } },
                { purpose: { in: input.statuses } },
              ],
            },
          ],
        }
      : {}),
  };
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

export async function listPetroleumCompanyLinksForOrgNumber(orgNumber: string) {
  return prisma.petroleumCompanyLink.findMany({
    where: {
      OR: [{ linkedCompanyOrgNumber: orgNumber }, { orgNumber }],
    },
  });
}

export async function listPetroleumFields() {
  return prisma.petroleumField.findMany();
}

export async function listPetroleumFieldsByNpdIds(npdIds: number[]) {
  if (npdIds.length === 0) {
    return [] as Awaited<ReturnType<typeof listPetroleumFields>>;
  }

  return prisma.petroleumField.findMany({
    where: {
      npdId: { in: npdIds },
    },
  });
}

export async function listPetroleumDiscoveries() {
  return prisma.petroleumDiscovery.findMany();
}

export async function listPetroleumDiscoveriesFiltered(input?: PetroleumDiscoveryListInput) {
  return prisma.petroleumDiscovery.findMany({
    where: buildDiscoveryWhere(input),
    orderBy: input?.orderBy ?? [{ discoveryYear: "desc" }, { name: "asc" }],
    take: input?.take,
    skip: input?.skip,
  });
}

export async function listPetroleumDiscoveriesByOperatorCompanyIds(npdCompanyIds: number[]) {
  if (npdCompanyIds.length === 0) {
    return [] as Awaited<ReturnType<typeof listPetroleumDiscoveries>>;
  }

  return prisma.petroleumDiscovery.findMany({
    where: {
      operatorNpdCompanyId: { in: npdCompanyIds },
    },
  });
}

export async function countPetroleumDiscoveriesByOperatorCompanyIds(npdCompanyIds: number[]) {
  if (npdCompanyIds.length === 0) {
    return 0;
  }

  return prisma.petroleumDiscovery.count({
    where: {
      operatorNpdCompanyId: { in: npdCompanyIds },
    },
  });
}

export async function listPetroleumLicences() {
  return prisma.petroleumLicence.findMany();
}

export async function listPetroleumLicencesByNpdIds(npdIds: number[]) {
  if (npdIds.length === 0) {
    return [] as Awaited<ReturnType<typeof listPetroleumLicences>>;
  }

  return prisma.petroleumLicence.findMany({
    where: {
      npdId: { in: npdIds },
    },
  });
}

export async function listPetroleumFacilities() {
  return prisma.petroleumFacility.findMany();
}

export async function listPetroleumFacilitiesFiltered(input?: PetroleumFacilityListInput) {
  return prisma.petroleumFacility.findMany({
    where: buildFacilityWhere(input),
    orderBy: input?.orderBy ?? [{ startupDate: "desc" }, { name: "asc" }],
    take: input?.take,
    skip: input?.skip,
  });
}

export async function listPetroleumFacilitiesByOperatorCompanyIds(npdCompanyIds: number[]) {
  if (npdCompanyIds.length === 0) {
    return [] as Awaited<ReturnType<typeof listPetroleumFacilities>>;
  }

  return prisma.petroleumFacility.findMany({
    where: {
      currentOperatorNpdId: { in: npdCompanyIds },
    },
  });
}

export async function countPetroleumFacilitiesByOperatorCompanyIds(npdCompanyIds: number[]) {
  if (npdCompanyIds.length === 0) {
    return 0;
  }

  return prisma.petroleumFacility.count({
    where: {
      currentOperatorNpdId: { in: npdCompanyIds },
    },
  });
}

export async function listPetroleumTufs() {
  return prisma.petroleumTuf.findMany();
}

export async function listPetroleumTufsFiltered(input?: PetroleumTufListInput) {
  return prisma.petroleumTuf.findMany({
    where: buildTufWhere(input),
    orderBy: input?.orderBy ?? [{ name: "asc" }],
    take: input?.take,
    skip: input?.skip,
  });
}

export async function listPetroleumTufsByOperatorCompanyIds(npdCompanyIds: number[]) {
  if (npdCompanyIds.length === 0) {
    return [] as Awaited<ReturnType<typeof listPetroleumTufs>>;
  }

  return prisma.petroleumTuf.findMany({
    where: {
      operatorNpdCompanyId: { in: npdCompanyIds },
    },
  });
}

export async function countPetroleumTufsByOperatorCompanyIds(npdCompanyIds: number[]) {
  if (npdCompanyIds.length === 0) {
    return 0;
  }

  return prisma.petroleumTuf.count({
    where: {
      operatorNpdCompanyId: { in: npdCompanyIds },
    },
  });
}

export async function listPetroleumSurveys() {
  return prisma.petroleumSurvey.findMany();
}

export async function listPetroleumSurveysFiltered(input?: PetroleumSurveyListInput) {
  return prisma.petroleumSurvey.findMany({
    where: buildSurveyWhere(input),
    orderBy: input?.orderBy ?? [{ finalizedAt: "desc" }, { startedAt: "desc" }, { name: "asc" }],
    take: input?.take,
    skip: input?.skip,
  });
}

export async function listPetroleumWellbores() {
  return prisma.petroleumWellbore.findMany();
}

export async function listPetroleumWellboresFiltered(input?: PetroleumWellboreListInput) {
  return prisma.petroleumWellbore.findMany({
    where: buildWellboreWhere(input),
    orderBy: input?.orderBy ?? [{ completionDate: "desc" }, { entryDate: "desc" }, { name: "asc" }],
    take: input?.take,
    skip: input?.skip,
  });
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

export async function replacePetroleumFieldSnapshots(input: {
  snapshots: Array<Record<string, unknown>>;
}) {
  await prisma.$transaction(
    async (tx) => {
      await tx.petroleumFieldSnapshot.deleteMany();
      await createManyInChunks(input.snapshots, (chunk) =>
        tx.petroleumFieldSnapshot.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
    },
    {
      maxWait: 30_000,
      timeout: 600_000,
    },
  );
}

export async function replacePetroleumLicenceSnapshots(input: {
  snapshots: Array<Record<string, unknown>>;
}) {
  await prisma.$transaction(
    async (tx) => {
      await tx.petroleumLicenceSnapshot.deleteMany();
      await createManyInChunks(input.snapshots, (chunk) =>
        tx.petroleumLicenceSnapshot.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
    },
    {
      maxWait: 30_000,
      timeout: 600_000,
    },
  );
}

export async function replacePetroleumOperatorSnapshots(input: {
  snapshots: Array<Record<string, unknown>>;
}) {
  await prisma.$transaction(
    async (tx) => {
      await tx.petroleumOperatorSnapshot.deleteMany();
      await createManyInChunks(input.snapshots, (chunk) =>
        tx.petroleumOperatorSnapshot.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
    },
    {
      maxWait: 30_000,
      timeout: 600_000,
    },
  );
}

export async function replacePetroleumAreaSnapshots(input: {
  snapshots: Array<Record<string, unknown>>;
}) {
  await prisma.$transaction(
    async (tx) => {
      await tx.petroleumAreaSnapshot.deleteMany();
      await createManyInChunks(input.snapshots, (chunk) =>
        tx.petroleumAreaSnapshot.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
    },
    {
      maxWait: 30_000,
      timeout: 600_000,
    },
  );
}

export async function replacePetroleumMapFeatureSnapshots(input: {
  snapshots: Array<Record<string, unknown>>;
}) {
  await prisma.$transaction(
    async (tx) => {
      await tx.petroleumMapFeatureSnapshot.deleteMany();
      await createManyInChunks(input.snapshots, (chunk) =>
        tx.petroleumMapFeatureSnapshot.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
    },
    {
      maxWait: 30_000,
      timeout: 600_000,
    },
  );
}

export async function listPetroleumFieldSnapshots(input?: PetroleumFieldSnapshotListInput) {
  return prisma.petroleumFieldSnapshot.findMany({
    where: buildFieldSnapshotWhere(input),
    orderBy: input?.orderBy ?? [{ latestAnnualOe: "desc" }, { name: "asc" }],
    take: input?.take,
    skip: input?.skip,
  });
}

export async function countPetroleumFieldSnapshots(input?: PetroleumFieldSnapshotListInput) {
  return prisma.petroleumFieldSnapshot.count({
    where: buildFieldSnapshotWhere(input),
  });
}

export async function listPetroleumLicenceSnapshots(input?: PetroleumLicenceSnapshotListInput) {
  return prisma.petroleumLicenceSnapshot.findMany({
    where: buildLicenceSnapshotWhere(input),
    orderBy: input?.orderBy ?? [{ name: "asc" }],
    take: input?.take,
    skip: input?.skip,
  });
}

export async function countPetroleumLicenceSnapshots(input?: PetroleumLicenceSnapshotListInput) {
  return prisma.petroleumLicenceSnapshot.count({
    where: buildLicenceSnapshotWhere(input),
  });
}

export async function listPetroleumOperatorSnapshots(input?: PetroleumOperatorSnapshotListInput) {
  return prisma.petroleumOperatorSnapshot.findMany({
    where: buildOperatorSnapshotWhere(input),
    orderBy: input?.orderBy ?? [{ latestProductionOe: "desc" }, { operatorName: "asc" }],
    take: input?.take,
    skip: input?.skip,
  });
}

export async function countPetroleumOperatorSnapshots(input?: PetroleumOperatorSnapshotListInput) {
  return prisma.petroleumOperatorSnapshot.count({
    where: buildOperatorSnapshotWhere(input),
  });
}

export async function listPetroleumAreaSnapshots(input?: PetroleumAreaSnapshotListInput) {
  return prisma.petroleumAreaSnapshot.findMany({
    where: buildAreaSnapshotWhere(input),
    orderBy: input?.orderBy ?? [{ latestProductionOe: "desc" }, { area: "asc" }],
    take: input?.take,
    skip: input?.skip,
  });
}

export async function countPetroleumAreaSnapshots(input?: PetroleumAreaSnapshotListInput) {
  return prisma.petroleumAreaSnapshot.count({
    where: buildAreaSnapshotWhere(input),
  });
}

export async function listPetroleumMapFeatureSnapshots(input?: PetroleumMapFeatureSnapshotListInput) {
  return prisma.petroleumMapFeatureSnapshot.findMany({
    where: buildMapFeatureSnapshotWhere(input),
    orderBy: input?.orderBy ?? [{ layerId: "asc" }, { name: "asc" }],
    take: input?.take,
    skip: input?.skip,
  });
}

export async function listPetroleumProductionPointsForEntities(input: {
  entityType?: PetroleumEntityType;
  entityNpdIds?: number[];
  yearFrom?: number;
  yearTo?: number;
  period?: string;
}) {
  if (input.entityNpdIds && input.entityNpdIds.length === 0) {
    return [] as Awaited<ReturnType<typeof prisma.petroleumProductionPoint.findMany>>;
  }

  return prisma.petroleumProductionPoint.findMany({
    where: {
      entityType: input.entityType ?? undefined,
      entityNpdId: input.entityNpdIds?.length ? { in: input.entityNpdIds } : undefined,
      year:
        input.yearFrom !== undefined || input.yearTo !== undefined
          ? { gte: input.yearFrom, lte: input.yearTo }
          : undefined,
      period: input.period ?? undefined,
    },
    orderBy: [{ entityNpdId: "asc" }, { year: "asc" }, { month: "asc" }],
  });
}

export async function listPetroleumProductionPointsForEntity(input: {
  entityType: PetroleumEntityType;
  entityNpdId: number;
  yearFrom?: number;
  yearTo?: number;
  period?: string;
}) {
  return prisma.petroleumProductionPoint.findMany({
    where: {
      entityType: input.entityType,
      entityNpdId: input.entityNpdId,
      year:
        input.yearFrom !== undefined || input.yearTo !== undefined
          ? { gte: input.yearFrom, lte: input.yearTo }
          : undefined,
      period: input.period ?? undefined,
    },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });
}

export async function listPetroleumEvents() {
  return prisma.petroleumEvent.findMany({
    orderBy: {
      publishedAt: "desc",
    },
  });
}

export async function listPetroleumEventsFiltered(input?: PetroleumEventListInput) {
  return prisma.petroleumEvent.findMany({
    where: buildPetroleumEventWhere(input),
    orderBy: {
      publishedAt: "desc",
    },
    take: input?.take,
    skip: input?.skip,
  });
}

export async function countPetroleumEventsByCompanyReference(input: {
  relatedCompanyOrgNumber?: string;
  relatedCompanySlug?: string;
}) {
  const where = buildPetroleumEventWhere({
    relatedCompanyOrgNumber: input.relatedCompanyOrgNumber,
    relatedCompanySlug: input.relatedCompanySlug,
  });

  return prisma.petroleumEvent.count({ where });
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
      const observationRows = input.observations.reduce<Record<string, unknown>[]>((acc, item) => {
        const row = item as Record<string, unknown> & { seriesSlug?: string };
        const seriesSlug = row.seriesSlug;
        if (!seriesSlug) {
          return acc;
        }

        const seriesId = seriesIdBySlug.get(seriesSlug);
        if (!seriesId) {
          return acc;
        }

        const next = { ...row, seriesId };
        delete (next as { seriesSlug?: string }).seriesSlug;
        acc.push(next);
        return acc;
      }, []);

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
  const delegate = getExposureSnapshotDelegate(prisma);
  if (!delegate) {
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      const txDelegate = getExposureSnapshotDelegate(tx);
      if (!txDelegate) {
        return;
      }

      await txDelegate.deleteMany();
      await createManyInChunks(input.snapshots, (chunk) =>
        txDelegate.createMany({ data: chunk as never[], skipDuplicates: true }),
      );
    },
    {
      maxWait: 30_000,
      timeout: 600_000,
    },
  );
}

export async function listPetroleumCompanyExposureSnapshots() {
  const delegate = getExposureSnapshotDelegate(prisma);
  if (!delegate) {
    return [] as PetroleumCompanyExposureSnapshotRow[];
  }

  return delegate.findMany({
    orderBy: {
      operatorFieldCount: "desc",
    },
  });
}

export async function findPetroleumCompanyExposureSnapshotByCompanyId(companyId: string) {
  const delegate = getExposureSnapshotDelegate(prisma);
  if (!delegate) {
    return null;
  }

  return delegate.findUnique({
    where: { companyId },
  });
}

export async function listPetroleumSyncStates(keys: string[]) {
  return prisma.petroleumSyncState.findMany({
    where: {
      key: {
        in: keys,
      },
    },
    select: { key: true, status: true, errorMessage: true, lastSuccessAt: true },
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

export async function findPetroleumEntityDetailBySlugOrNpdId(entityType: PetroleumEntityType, id: string) {
  const numericId = Number(id);

  switch (entityType) {
    case "FIELD":
      return prisma.petroleumField.findFirst({
        where: Number.isFinite(numericId) ? { OR: [{ slug: id }, { npdId: numericId }] } : { slug: id },
      });
    case "DISCOVERY":
      return prisma.petroleumDiscovery.findFirst({
        where: Number.isFinite(numericId) ? { OR: [{ slug: id }, { npdId: numericId }] } : { slug: id },
      });
    case "LICENCE":
      return prisma.petroleumLicence.findFirst({
        where: Number.isFinite(numericId) ? { OR: [{ slug: id }, { npdId: numericId }] } : { slug: id },
      });
    case "FACILITY":
      return prisma.petroleumFacility.findFirst({
        where: Number.isFinite(numericId) ? { OR: [{ slug: id }, { npdId: numericId }] } : { slug: id },
      });
    case "TUF":
      return prisma.petroleumTuf.findFirst({
        where: Number.isFinite(numericId) ? { OR: [{ slug: id }, { npdId: numericId }] } : { slug: id },
      });
    case "SURVEY":
      return prisma.petroleumSurvey.findFirst({
        where: Number.isFinite(numericId) ? { OR: [{ slug: id }, { npdId: numericId }] } : { slug: id },
      });
    case "WELLBORE":
      return prisma.petroleumWellbore.findFirst({
        where: Number.isFinite(numericId) ? { OR: [{ slug: id }, { npdId: numericId }] } : { slug: id },
      });
    default:
      return null;
  }
}

export async function findPetroleumReserveSnapshotForEntity(
  entityType: PetroleumEntityType,
  entityNpdId: number,
) {
  return prisma.petroleumReserveSnapshot.findUnique({
    where: {
      entityType_entityNpdId: {
        entityType,
        entityNpdId,
      },
    },
  });
}

export async function findPetroleumInvestmentSnapshotForEntity(
  entityType: PetroleumEntityType,
  entityNpdId: number,
) {
  return prisma.petroleumInvestmentSnapshot.findUnique({
    where: {
      entityType_entityNpdId: {
        entityType,
        entityNpdId,
      },
    },
  });
}
