import { prisma } from "@/lib/prisma";
import {
  CompanyPetroleumBreakdownRow,
  CompanyPetroleumDiscoveryRow,
  CompanyPetroleumEventSummary,
  CompanyPetroleumFieldRow,
  CompanyPetroleumInfrastructureRow,
  CompanyPetroleumLicenceRow,
  CompanyPetroleumPipeline,
  CompanyPetroleumPipelineAsset,
  CompanyPetroleumProfile,
  CompanyPetroleumSnapshot,
  CompanyPetroleumTabVisibility,
  CompanyPetroleumTopAssetBreakdown,
  CompanyPetroleumTopExposureRow,
  NormalizedCompany,
  PetroleumRateUnit,
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

function normalizeStatus(value?: string | null) {
  return value?.toLowerCase().trim() ?? "";
}

function hasDevelopmentSignal(status?: string | null) {
  const s = normalizeStatus(status);
  return ["plan", "under utbygging", "development", "planning", "bygging", "godkjent"].some((keyword) =>
    s.includes(keyword),
  );
}

function sumNumber(values: Array<number | null | undefined>) {
  return values.reduce((sum, value) => sum + (value ?? 0), 0);
}

function mapCountBreakdown(values: string[]): CompanyPetroleumBreakdownRow[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return [...counts.entries()]
    .map(([label, value]) => ({
      label,
      value,
      sharePercent: total > 0 ? (value / total) * 100 : null,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "nb-NO"));
}

export function buildTopAssetExposureBreakdown(fields: CompanyPetroleumFieldRow[]): CompanyPetroleumTopAssetBreakdown {
  const byProduction = [...fields]
    .filter((field) => typeof field.latestProductionValue === "number")
    .sort((a, b) => (b.latestProductionValue ?? 0) - (a.latestProductionValue ?? 0))
    .slice(0, 5);
  const byReserves = [...fields]
    .filter((field) => typeof field.remainingOe === "number")
    .sort((a, b) => (b.remainingOe ?? 0) - (a.remainingOe ?? 0))
    .slice(0, 5);
  const byInvestment = [...fields]
    .filter((field) => typeof field.expectedFutureInvestmentNok === "number")
    .sort((a, b) => (b.expectedFutureInvestmentNok ?? 0) - (a.expectedFutureInvestmentNok ?? 0))
    .slice(0, 5);

  return { byProduction, byReserves, byInvestment };
}

export function buildExecutiveSummary(snapshot: CompanyPetroleumSnapshot, pipeline: CompanyPetroleumPipeline | null): string[] {
  const points: string[] = [];
  const roleSummary =
    snapshot.operatorFieldCount > 0
      ? "Selskapet fremstår primært som operatør i porteføljen."
      : "Selskapet fremstår primært som licensee i porteføljen.";
  points.push(roleSummary);

  if (snapshot.mainAreas.length === 1) {
    points.push(`Eksponeringen er konsentrert i ${snapshot.mainAreas[0]}.`);
  } else if (snapshot.mainAreas.length > 1) {
    points.push(`Eksponeringen er fordelt på flere områder, med tyngde i ${snapshot.mainAreas[0]}.`);
  }

  if (snapshot.mainHydrocarbonTypes.length > 0) {
    points.push(`Hydrokarbonprofil: ${snapshot.mainHydrocarbonTypes.slice(0, 3).join(", ")}.`);
  }

  if ((snapshot.expectedFutureInvestmentNok ?? 0) > 0) {
    points.push("Porteføljen har registrerte fremtidige investeringsforpliktelser.");
  }

  if (pipeline?.insights.length) {
    points.push(...pipeline.insights.slice(0, 2));
  }

  return points.slice(0, 5);
}

export function evaluatePetroleumVisibilityFromSignals(input: {
  hasLink: boolean;
  hasOperatorRole: boolean;
  hasLicenseeRole: boolean;
  hasMeaningfulSnapshot: boolean;
  hasRelevantEvents: boolean;
}): CompanyPetroleumTabVisibility {
  if (!input.hasLink) {
    return {
      available: false,
      reason: "Ingen petroleum-link for selskapet.",
      matchedBy: [],
      strength: "NONE",
      hasOperatorRole: false,
      hasLicenseeRole: false,
      hasAssets: false,
      hasMeaningfulSnapshot: false,
      hasRelevantEvents: false,
    };
  }

  const matchedBy: string[] = ["petroleum_link"];
  if (input.hasOperatorRole) matchedBy.push("operator");
  if (input.hasLicenseeRole) matchedBy.push("licensee");
  if (input.hasMeaningfulSnapshot) matchedBy.push("exposure_snapshot");
  if (input.hasRelevantEvents) matchedBy.push("events");

  const hasAssets = input.hasOperatorRole || input.hasLicenseeRole;
  const strength: CompanyPetroleumTabVisibility["strength"] =
    hasAssets || input.hasMeaningfulSnapshot ? "CORE" : input.hasRelevantEvents ? "WEAK" : "WEAK";

  return {
    available: strength === "CORE",
    reason: strength === "CORE" ? null : "Petroleumkoblingen er foreløpig for svak til å vise fanen.",
    matchedBy,
    strength,
    hasOperatorRole: input.hasOperatorRole,
    hasLicenseeRole: input.hasLicenseeRole,
    hasAssets,
    hasMeaningfulSnapshot: input.hasMeaningfulSnapshot,
    hasRelevantEvents: input.hasRelevantEvents,
  };
}

function buildMarketModuleUrl(npdCompanyIds: number[]) {
  return `/market/oil-gas?tab=companies&operatorIds=${npdCompanyIds.join(",")}`;
}

function buildEntityUrl(entityType: "FIELD" | "LICENCE" | "DISCOVERY" | "FACILITY" | "TUF", slug: string) {
  return `/market/oil-gas?entity=${entityType}:${slug}`;
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
    return evaluatePetroleumVisibilityFromSignals({
      hasLink: false,
      hasOperatorRole: false,
      hasLicenseeRole: false,
      hasMeaningfulSnapshot: false,
      hasRelevantEvents: false,
    });
  }

  const npdCompanyIds = links.map((link) => link.npdCompanyId);

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

  const hasLicenseeRole = [...fields, ...licences].some((row) =>
    parseCompanyIdsFromInterests(row.licensees).some((id) => npdCompanyIds.includes(id)),
  );
  const hasMeaningfulSnapshot = Boolean(
    exposure &&
      (exposure.operatorFieldCount > 0 ||
        exposure.licenceCount > 0 ||
        exposure.operatedProductionOe !== null ||
        exposure.remainingReservesOe !== null),
  );

  return evaluatePetroleumVisibilityFromSignals({
    hasLink: true,
    hasOperatorRole: operatorAssetsCount > 0,
    hasLicenseeRole,
    hasMeaningfulSnapshot,
    hasRelevantEvents: eventsCount > 0,
  });
}

export function buildPipeline(input: {
  fields: CompanyPetroleumFieldRow[];
  licences: CompanyPetroleumLicenceRow[];
  discoveries: CompanyPetroleumDiscoveryRow[];
  infrastructure: CompanyPetroleumInfrastructureRow[];
}): CompanyPetroleumPipeline | null {
  const developmentAssets: CompanyPetroleumPipelineAsset[] = [
    ...input.fields
      .filter((row) => hasDevelopmentSignal(row.status))
      .map((row) => ({ entityType: "FIELD" as const, entityId: row.entityId, name: row.name, status: row.status, area: row.area, investmentNok: row.expectedFutureInvestmentNok })),
    ...input.licences
      .filter((row) => hasDevelopmentSignal(row.currentPhase) || hasDevelopmentSignal(row.status))
      .map((row) => ({ entityType: "LICENCE" as const, entityId: row.entityId, name: row.name, status: row.currentPhase ?? row.status, area: row.area })),
    ...input.infrastructure
      .filter((row) => hasDevelopmentSignal(row.status))
      .map((row) => ({ entityType: row.entityType, entityId: row.entityId, name: row.name, status: row.status, area: row.area })),
  ];

  const futureInvestmentSignals = [...input.fields]
    .filter((row) => (row.expectedFutureInvestmentNok ?? 0) > 0)
    .sort((a, b) => (b.expectedFutureInvestmentNok ?? 0) - (a.expectedFutureInvestmentNok ?? 0))
    .slice(0, 5)
    .map((row) => ({
      entityType: "FIELD" as const,
      entityId: row.entityId,
      name: row.name,
      status: row.status,
      area: row.area,
      investmentNok: row.expectedFutureInvestmentNok,
    }));

  const insights: string[] = [];
  if (input.discoveries.length >= 3) insights.push("Selskapet har flere funn i pipeline med potensial for videre modning.");
  if (futureInvestmentSignals.length > 0) insights.push("Fremtidige investeringer indikerer aktiv utviklingspipeline.");
  if (developmentAssets.length === 0 && input.discoveries.length === 0) insights.push("Eksponeringen ser i hovedsak moden ut uten tydelige utviklingssignaler.");

  if (developmentAssets.length === 0 && futureInvestmentSignals.length === 0 && input.discoveries.length === 0) {
    return null;
  }

  return {
    developmentAssets,
    discoveryPipeline: input.discoveries,
    futureInvestmentSignals,
    insights,
  };
}

function classifyEventGroup(event: CompanyPetroleumEventSummary) {
  if (event.source === "HAVTIL") return "Regulatorisk";
  if (event.eventType.toLowerCase().includes("licence") || event.source === "PETREG") return "Lisensrelatert";
  return "Operasjonelt";
}

function rankEvents(events: CompanyPetroleumEventSummary[], operatorEntityNames: Set<string>) {
  return [...events]
    .map((event) => {
      const operatorHit = event.entityName ? operatorEntityNames.has(event.entityName) : false;
      return {
        event,
        score: (operatorHit ? 100 : 0) + (event.source === "HAVTIL" ? 20 : 0) + (event.source === "PETREG" ? 15 : 0),
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((item) => item.event);
}

export async function getCompanyPetroleumProfile(company: NormalizedCompany): Promise<CompanyPetroleumProfile> {
  const visibility = await getCompanyPetroleumTabVisibility(company);
  if (!visibility.available) {
    return {
      visibility,
      snapshot: null,
      executiveSummary: [],
      fields: [],
      licences: [],
      discoveries: [],
      infrastructure: [],
      areaBreakdown: [],
      hydrocarbonBreakdown: [],
      roleBreakdown: [],
      topAssetBreakdown: { byProduction: [], byReserves: [], byInvestment: [] },
      topExposure: [],
      pipeline: null,
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
      visibility: evaluatePetroleumVisibilityFromSignals({
        hasLink: false,
        hasOperatorRole: false,
        hasLicenseeRole: false,
        hasMeaningfulSnapshot: false,
        hasRelevantEvents: false,
      }),
      snapshot: null,
      executiveSummary: [],
      fields: [],
      licences: [],
      discoveries: [],
      infrastructure: [],
      areaBreakdown: [],
      hydrocarbonBreakdown: [],
      roleBreakdown: [],
      topAssetBreakdown: { byProduction: [], byReserves: [], byInvestment: [] },
      topExposure: [],
      pipeline: null,
      recentEvents: [],
      sourceStatus: [],
      marketModuleUrl: null,
    };
  }

  const npdCompanyIds = links.map((link) => link.npdCompanyId);

  const [exposure, fields, licences, discoveries, facilities, tufs, events, syncStates, productionPoints, reserves, investments] = await Promise.all([
    prisma.petroleumCompanyExposureSnapshot.findUnique({ where: { companyId: dbCompany.id } }),
    prisma.petroleumField.findMany(),
    prisma.petroleumLicence.findMany(),
    prisma.petroleumDiscovery.findMany({ where: { operatorNpdCompanyId: { in: npdCompanyIds } } }),
    prisma.petroleumFacility.findMany({ where: { currentOperatorNpdId: { in: npdCompanyIds } } }),
    prisma.petroleumTuf.findMany({ where: { operatorNpdCompanyId: { in: npdCompanyIds } } }),
    prisma.petroleumEvent.findMany({
      where: { OR: [{ relatedCompanyOrgNumber: company.orgNumber }, { relatedCompanySlug: company.slug }] },
      orderBy: { publishedAt: "desc" },
      take: 30,
    }),
    prisma.petroleumSyncState.findMany({
      where: {
        key: {
          in: ["petroleum-core", "petroleum-events-havtil", "petroleum-events-gassco", "petroleum-company-exposure"],
        },
      },
      select: { key: true, status: true, errorMessage: true, lastSuccessAt: true },
    }),
    prisma.petroleumProductionPoint.findMany({ where: { entityType: "FIELD", period: "year" } }),
    prisma.petroleumReserveSnapshot.findMany({ where: { entityType: "FIELD" } }),
    prisma.petroleumInvestmentSnapshot.findMany({ where: { entityType: "FIELD" } }),
  ]);

  const productionByField = new Map<number, { value: number; unit: PetroleumRateUnit }>();
  for (const point of productionPoints) {
    const current = productionByField.get(point.entityNpdId);
    if (!current || (point.oeNetMillSm3 ?? 0) > current.value) {
      productionByField.set(point.entityNpdId, { value: point.oeNetMillSm3 ?? 0, unit: "msm3" });
    }
  }
  const reserveByField = new Map(reserves.map((row) => [row.entityNpdId, row.remainingOe]));
  const investmentByField = new Map(investments.map((row) => [row.entityNpdId, (row.expectedFutureInvestmentMillNok ?? 0) * 1_000_000]));

  const fieldRows: CompanyPetroleumFieldRow[] = dedupeByEntityId(
    fields.flatMap((field) => {
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
        latestProductionValue: productionByField.get(field.npdId)?.value ?? null,
        latestProductionUnit: productionByField.get(field.npdId)?.unit ?? null,
        remainingOe: reserveByField.get(field.npdId) ?? null,
        expectedFutureInvestmentNok: investmentByField.get(field.npdId) ?? null,
        factPageUrl: field.factPageUrl,
        detailUrl: buildEntityUrl("FIELD", field.slug),
      }];
    }),
  ).sort((a, b) =>
    (b.latestProductionValue ?? 0) - (a.latestProductionValue ?? 0) ||
    (b.remainingOe ?? 0) - (a.remainingOe ?? 0) ||
    (b.expectedFutureInvestmentNok ?? 0) - (a.expectedFutureInvestmentNok ?? 0),
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
        detailUrl: buildEntityUrl("LICENCE", licence.slug),
      }];
    }),
  ).sort((a, b) =>
    (a.role === "OPERATOR" ? -1 : 1) - (b.role === "OPERATOR" ? -1 : 1) ||
    (b.currentAreaSqKm ?? 0) - (a.currentAreaSqKm ?? 0),
  );

  const discoveryRows: CompanyPetroleumDiscoveryRow[] = discoveries
    .map((item) => ({
      entityId: item.slug,
      npdId: item.npdId,
      name: item.name,
      status: item.activityStatus,
      area: item.areaName,
      hcType: item.hydrocarbonType,
      role: "OPERATOR" as const,
      relatedFieldName: item.relatedFieldName,
      factPageUrl: item.factPageUrl,
      detailUrl: buildEntityUrl("DISCOVERY", item.slug),
    }))
    .sort((a, b) => normalizeStatus(a.status).localeCompare(normalizeStatus(b.status), "nb-NO"));

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
      detailUrl: buildEntityUrl("FACILITY", item.slug),
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
      detailUrl: buildEntityUrl("TUF", item.slug),
    })),
  ].sort((a, b) => a.entityType.localeCompare(b.entityType) || normalizeStatus(a.status).localeCompare(normalizeStatus(b.status), "nb-NO"));

  const snapshot: CompanyPetroleumSnapshot = {
    operatorFieldCount: exposure?.operatorFieldCount ?? fieldRows.filter((row) => row.role === "OPERATOR").length,
    licenceCount: exposure?.licenceCount ?? licenceRows.length,
    discoveryCount: discoveryRows.length,
    facilityCount: facilities.length,
    tufCount: tufs.length,
    operatedProductionOe: exposure?.operatedProductionOe ?? sumNumber(fieldRows.map((row) => row.latestProductionValue)),
    attributableProductionOe: exposure?.attributableProductionOe ?? null,
    remainingReservesOe: exposure?.remainingReservesOe ?? sumNumber(fieldRows.map((row) => row.remainingOe)),
    expectedFutureInvestmentNok:
      exposure?.expectedFutureInvestmentNok !== null && exposure?.expectedFutureInvestmentNok !== undefined
        ? Number(exposure.expectedFutureInvestmentNok)
        : sumNumber(fieldRows.map((row) => row.expectedFutureInvestmentNok)),
    mainAreas: Array.isArray(exposure?.mainAreas)
      ? (exposure?.mainAreas as string[])
      : [...new Set([...fieldRows.map((row) => row.area), ...licenceRows.map((row) => row.area)].filter(Boolean) as string[])],
    mainHydrocarbonTypes: [...new Set([...fieldRows.map((row) => row.hcType), ...discoveryRows.map((row) => row.hcType)].filter(Boolean) as string[])],
    npdCompanyId: links[0]?.npdCompanyId ?? null,
  };

  const areaBreakdown = mapCountBreakdown(
    [...fieldRows.map((row) => row.area), ...licenceRows.map((row) => row.area)].filter(Boolean) as string[],
  );
  const hydrocarbonBreakdown = mapCountBreakdown(
    [...fieldRows.map((row) => row.hcType), ...discoveryRows.map((row) => row.hcType)].filter(Boolean) as string[],
  );
  const roleBreakdown = mapCountBreakdown([...fieldRows.map((row) => row.role), ...licenceRows.map((row) => row.role)]);
  const topAssetBreakdown = buildTopAssetExposureBreakdown(fieldRows);

  const topExposure: CompanyPetroleumTopExposureRow[] = [
    { label: "Opererte felt", type: "field", valuePrimary: `${snapshot.operatorFieldCount}` },
    { label: "Lisenser", type: "field", valuePrimary: `${snapshot.licenceCount}` },
    { label: "Hovedområder", type: "area", valuePrimary: areaBreakdown.slice(0, 3).map((row) => row.label).join(", ") || "Ikke tilgjengelig" },
    { label: "Hydrokarboner", type: "hydrocarbon", valuePrimary: hydrocarbonBreakdown.slice(0, 3).map((row) => row.label).join(", ") || "Ikke tilgjengelig" },
  ];

  const operatorFieldNames = new Set(fieldRows.filter((row) => row.role === "OPERATOR").map((row) => row.name));
  const rankedEvents = rankEvents(
    events.map((event) => ({
      id: event.externalId,
      source: event.source,
      eventType: classifyEventGroup({
        id: event.externalId,
        source: event.source,
        eventType: event.eventType,
        title: event.title,
      } as CompanyPetroleumEventSummary),
      title: event.title,
      summary: event.summary,
      publishedAt: event.publishedAt,
      detailUrl: event.detailUrl,
      entityType: event.entityType,
      entityName: event.entityName,
    })),
    operatorFieldNames,
  ).slice(0, 10);

  const pipeline = buildPipeline({
    fields: fieldRows,
    licences: licenceRows,
    discoveries: discoveryRows,
    infrastructure: infraRows,
  });

  return {
    visibility,
    snapshot,
    executiveSummary: buildExecutiveSummary(snapshot, pipeline),
    fields,
    licences: licenceRows,
    discoveries: discoveryRows,
    infrastructure: infraRows,
    areaBreakdown,
    hydrocarbonBreakdown,
    roleBreakdown,
    topAssetBreakdown,
    topExposure,
    pipeline,
    recentEvents: rankedEvents,
    sourceStatus: toSourceStatus(syncStates),
    marketModuleUrl: buildMarketModuleUrl(npdCompanyIds),
  };
}
