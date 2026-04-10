import { prisma } from "@/lib/prisma";
import {
  CompanyPetroleumDiscoveryRow,
  CompanyPetroleumEventSummary,
  CompanyPetroleumFieldRow,
  CompanyPetroleumInfrastructureRow,
  CompanyPetroleumLicenceRow,
  CompanyPetroleumProfile,
  CompanyPetroleumSnapshot,
  CompanyPetroleumTabVisibility,
  CompanyPetroleumTopExposureRow,
  NormalizedCompany,
  PetroleumSourceStatus,
} from "@/lib/types";

function parseCompanyIdsFromInterests(value: unknown) {
  if (!Array.isArray(value)) return [] as number[];
  return value
    .map((item) =>
      item && typeof item === "object" && typeof (item as Record<string, unknown>).npdCompanyId === "number"
        ? ((item as Record<string, unknown>).npdCompanyId as number)
        : null,
    )
    .filter((item): item is number => item !== null);
}

function dedupeByEntityId<T extends { entityId: string }>(rows: T[]) {
  const map = new Map(rows.map((row) => [row.entityId, row]));
  return [...map.values()];
}

export async function getCompanyPetroleumTabVisibility(company: NormalizedCompany): Promise<CompanyPetroleumTabVisibility> {
  const [dbCompany, links] = await Promise.all([
    prisma.company.findUnique({ where: { orgNumber: company.orgNumber }, select: { id: true } }),
    prisma.petroleumCompanyLink.findMany({
      where: {
        OR: [{ linkedCompanyOrgNumber: company.orgNumber }, { orgNumber: company.orgNumber }],
      },
      select: { npdCompanyId: true },
    }),
  ]);

  if (!dbCompany || links.length === 0) {
    return {
      available: false,
      reason: "Ingen petroleum-link for selskapet.",
      matchedBy: [],
    };
  }

  const npdCompanyIds = links.map((link) => link.npdCompanyId);
  const matchedBy = new Set<string>(["petroleum_link"]);

  const [operatorAssetsCount, exposure, eventsCount, fields, licences] = await Promise.all([
    Promise.all([
      prisma.petroleumField.count({ where: { operatorNpdCompanyId: { in: npdCompanyIds } } }),
      prisma.petroleumDiscovery.count({ where: { operatorNpdCompanyId: { in: npdCompanyIds } } }),
      prisma.petroleumLicence.count({ where: { operatorNpdCompanyId: { in: npdCompanyIds } } }),
      prisma.petroleumFacility.count({ where: { currentOperatorNpdId: { in: npdCompanyIds } } }),
      prisma.petroleumTuf.count({ where: { operatorNpdCompanyId: { in: npdCompanyIds } } }),
    ]).then((counts) => counts.reduce((sum, count) => sum + count, 0)),
    prisma.petroleumCompanyExposureSnapshot.findUnique({ where: { companyId: dbCompany.id } }),
    prisma.petroleumEvent.count({
      where: {
        OR: [{ relatedCompanyOrgNumber: company.orgNumber }, { relatedCompanySlug: company.slug }],
      },
    }),
    prisma.petroleumField.findMany({ select: { licensees: true } }),
    prisma.petroleumLicence.findMany({ select: { licensees: true } }),
  ]);

  if (operatorAssetsCount > 0) matchedBy.add("operator");

  const hasLicensee = [...fields, ...licences].some((row) =>
    parseCompanyIdsFromInterests(row.licensees).some((id) => npdCompanyIds.includes(id)),
  );
  if (hasLicensee) matchedBy.add("licensee");

  if (
    exposure &&
    (exposure.operatorFieldCount > 0 ||
      exposure.licenceCount > 0 ||
      exposure.operatedProductionOe !== null ||
      exposure.remainingReservesOe !== null)
  ) {
    matchedBy.add("exposure_snapshot");
  }

  if (eventsCount > 0) matchedBy.add("events");

  const isAvailable = matchedBy.size > 1;
  return {
    available: isAvailable,
    reason: isAvailable ? null : "Mangler meningsfulle petroleum-signaler utover grunnlink.",
    matchedBy: [...matchedBy],
  };
}

function buildTopExposure(snapshot: CompanyPetroleumSnapshot): CompanyPetroleumTopExposureRow[] {
  return [
    { label: "Opererte felt", type: "field", valuePrimary: `${snapshot.operatorFieldCount}` },
    { label: "Lisenser", type: "field", valuePrimary: `${snapshot.licenceCount}` },
    { label: "Hovedområder", type: "area", valuePrimary: snapshot.mainAreas.slice(0, 3).join(", ") || "Ikke tilgjengelig" },
    {
      label: "Hydrokarboner",
      type: "hydrocarbon",
      valuePrimary: snapshot.mainHydrocarbonTypes.slice(0, 3).join(", ") || "Ikke tilgjengelig",
    },
  ];
}

function toSourceStatus(syncStates: Array<{ key: string; status: string | null; errorMessage: string | null; lastSuccessAt: Date | null }>): PetroleumSourceStatus[] {
  const byKey = new Map(syncStates.map((item) => [item.key, item]));
  return [
    { source: "SODIR", available: byKey.get("petroleum-core")?.status === "SUCCESS", message: byKey.get("petroleum-core")?.errorMessage ?? undefined, lastSuccessAt: byKey.get("petroleum-core")?.lastSuccessAt ?? null },
    { source: "HAVTIL", available: byKey.get("petroleum-events-havtil")?.status === "SUCCESS", message: byKey.get("petroleum-events-havtil")?.errorMessage ?? undefined, lastSuccessAt: byKey.get("petroleum-events-havtil")?.lastSuccessAt ?? null },
    { source: "GASSCO", available: byKey.get("petroleum-events-gassco")?.status === "SUCCESS", message: byKey.get("petroleum-events-gassco")?.errorMessage ?? undefined, lastSuccessAt: byKey.get("petroleum-events-gassco")?.lastSuccessAt ?? null },
    { source: "COMPANY_EXPOSURE", available: byKey.get("petroleum-company-exposure")?.status === "SUCCESS", message: byKey.get("petroleum-company-exposure")?.errorMessage ?? undefined, lastSuccessAt: byKey.get("petroleum-company-exposure")?.lastSuccessAt ?? null },
  ];
}

export async function getCompanyPetroleumProfile(company: NormalizedCompany): Promise<CompanyPetroleumProfile> {
  const visibility = await getCompanyPetroleumTabVisibility(company);
  if (!visibility.available) {
    return {
      visibility,
      snapshot: null,
      fields: [],
      licences: [],
      discoveries: [],
      infrastructure: [],
      topExposure: [],
      recentEvents: [],
      sourceStatus: [],
      marketModuleUrl: null,
    };
  }

  const [dbCompany, links] = await Promise.all([
    prisma.company.findUnique({ where: { orgNumber: company.orgNumber }, select: { id: true } }),
    prisma.petroleumCompanyLink.findMany({
      where: { OR: [{ linkedCompanyOrgNumber: company.orgNumber }, { orgNumber: company.orgNumber }] },
    }),
  ]);

  if (!dbCompany || links.length === 0) {
    return {
      visibility: { available: false, reason: "Manglende intern kobling", matchedBy: [] },
      snapshot: null,
      fields: [],
      licences: [],
      discoveries: [],
      infrastructure: [],
      topExposure: [],
      recentEvents: [],
      sourceStatus: [],
      marketModuleUrl: null,
    };
  }

  const npdCompanyIds = links.map((link) => link.npdCompanyId);

  const [exposure, fields, licences, discoveries, facilities, tufs, events, syncStates] = await Promise.all([
    prisma.petroleumCompanyExposureSnapshot.findUnique({ where: { companyId: dbCompany.id } }),
    prisma.petroleumField.findMany(),
    prisma.petroleumLicence.findMany(),
    prisma.petroleumDiscovery.findMany({ where: { operatorNpdCompanyId: { in: npdCompanyIds } } }),
    prisma.petroleumFacility.findMany({ where: { currentOperatorNpdId: { in: npdCompanyIds } } }),
    prisma.petroleumTuf.findMany({ where: { operatorNpdCompanyId: { in: npdCompanyIds } } }),
    prisma.petroleumEvent.findMany({
      where: { OR: [{ relatedCompanyOrgNumber: company.orgNumber }, { relatedCompanySlug: company.slug }] },
      orderBy: { publishedAt: "desc" },
      take: 10,
    }),
    prisma.petroleumSyncState.findMany({
      where: {
        key: {
          in: ["petroleum-core", "petroleum-events-havtil", "petroleum-events-gassco", "petroleum-company-exposure"],
        },
      },
      select: { key: true, status: true, errorMessage: true, lastSuccessAt: true },
    }),
  ]);

  const fieldRows: CompanyPetroleumFieldRow[] = dedupeByEntityId(
    fields
      .flatMap((field) => {
        const isOperator = npdCompanyIds.includes(field.operatorNpdCompanyId ?? -1);
        const isLicensee = parseCompanyIdsFromInterests(field.licensees).some((id) => npdCompanyIds.includes(id));
        if (!isOperator && !isLicensee) return [];

        return [{
          entityId: field.slug,
          npdId: field.npdId,
          name: field.name,
          status: field.activityStatus,
          area: field.mainArea,
          hcType: field.hydrocarbonType,
          role: isOperator ? "OPERATOR" : "LICENSEE",
          operatorName: field.operatorCompanyName,
          operatorSlug: field.operatorCompanySlug,
          latestProductionValue: null,
          latestProductionUnit: null,
          remainingOe: null,
          expectedFutureInvestmentNok: null,
          factPageUrl: field.factPageUrl,
          detailUrl: `/market/oil-gas?entity=FIELD:${field.slug}`,
        }];
      }),
  );

  const licenceRows: CompanyPetroleumLicenceRow[] = dedupeByEntityId(
    licences.flatMap((licence) => {
      const isOperator = npdCompanyIds.includes(licence.operatorNpdCompanyId ?? -1);
      const isLicensee = parseCompanyIdsFromInterests(licence.licensees).some((id) => npdCompanyIds.includes(id));
      if (!isOperator && !isLicensee) return [];

      return [{
        entityId: licence.slug,
        npdId: licence.npdId,
        name: licence.name,
        status: licence.status,
        currentPhase: licence.currentPhase,
        area: licence.mainArea,
        role: isOperator ? "OPERATOR" : "LICENSEE",
        operatorName: licence.operatorCompanyName,
        operatorSlug: licence.operatorCompanySlug,
        currentAreaSqKm: licence.currentAreaSqKm,
        transferCount: Array.isArray(licence.transfers) ? licence.transfers.length : 0,
        factPageUrl: licence.factPageUrl,
        detailUrl: `/market/oil-gas?entity=LICENCE:${licence.slug}`,
      }];
    }),
  );

  const discoveryRows: CompanyPetroleumDiscoveryRow[] = discoveries.map((item) => ({
    entityId: item.slug,
    npdId: item.npdId,
    name: item.name,
    status: item.activityStatus,
    area: item.areaName,
    hcType: item.hydrocarbonType,
    role: "OPERATOR",
    relatedFieldName: item.relatedFieldName,
    factPageUrl: item.factPageUrl,
    detailUrl: `/market/oil-gas?entity=DISCOVERY:${item.slug}`,
  }));

  const infraRows: CompanyPetroleumInfrastructureRow[] = [
    ...facilities.map((item) => ({
      entityId: item.slug,
      npdId: item.npdId,
      name: item.name,
      entityType: "FACILITY" as const,
      status: item.phase,
      area: item.belongsToName,
      kindOrMedium: item.kind,
      role: "OPERATOR" as const,
      factPageUrl: item.factPageUrl,
      detailUrl: `/market/oil-gas?entity=FACILITY:${item.slug}`,
    })),
    ...tufs.map((item) => ({
      entityId: item.slug,
      npdId: item.npdId,
      name: item.name,
      entityType: "TUF" as const,
      status: item.currentPhase,
      area: item.belongsToName,
      kindOrMedium: item.medium,
      role: "OPERATOR" as const,
      factPageUrl: item.factPageUrl,
      detailUrl: `/market/oil-gas?entity=TUF:${item.slug}`,
    })),
  ];

  const snapshot: CompanyPetroleumSnapshot = {
    operatorFieldCount: exposure?.operatorFieldCount ?? fieldRows.filter((row) => row.role === "OPERATOR").length,
    licenceCount: exposure?.licenceCount ?? licenceRows.length,
    discoveryCount: discoveryRows.length,
    facilityCount: facilities.length,
    tufCount: tufs.length,
    operatedProductionOe: exposure?.operatedProductionOe ?? null,
    attributableProductionOe: exposure?.attributableProductionOe ?? null,
    remainingReservesOe: exposure?.remainingReservesOe ?? null,
    expectedFutureInvestmentNok: exposure?.expectedFutureInvestmentNok ? Number(exposure.expectedFutureInvestmentNok) : null,
    mainAreas: Array.isArray(exposure?.mainAreas)
      ? (exposure?.mainAreas as string[])
      : [...new Set([...fieldRows.map((row) => row.area), ...licenceRows.map((row) => row.area)].filter(Boolean) as string[])],
    mainHydrocarbonTypes: [...new Set([...fieldRows.map((row) => row.hcType), ...discoveryRows.map((row) => row.hcType)].filter(Boolean) as string[])],
    npdCompanyId: links[0]?.npdCompanyId ?? null,
  };

  const recentEvents: CompanyPetroleumEventSummary[] = events.map((event) => ({
    id: event.externalId,
    source: event.source,
    eventType: event.eventType,
    title: event.title,
    summary: event.summary,
    publishedAt: event.publishedAt,
    detailUrl: event.detailUrl,
    entityType: event.entityType,
    entityName: event.entityName,
  }));

  return {
    visibility,
    snapshot,
    fields: fieldRows,
    licences: licenceRows,
    discoveries: discoveryRows,
    infrastructure: infraRows,
    topExposure: buildTopExposure(snapshot),
    recentEvents,
    sourceStatus: toSourceStatus(syncStates),
    marketModuleUrl: `/market/oil-gas?tab=companies&operatorIds=${npdCompanyIds.join(",")}`,
  };
}
