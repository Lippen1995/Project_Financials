import {
  listPetroleumCompanyLinks,
  listPetroleumDiscoveries,
  listPetroleumFacilities,
  listPetroleumFields,
  listPetroleumInvestmentSnapshots,
  listPetroleumLicences,
  listPetroleumProductionPoints,
  listPetroleumReserveSnapshots,
  replacePetroleumAreaSnapshots,
  replacePetroleumFieldSnapshots,
  replacePetroleumLicenceSnapshots,
  replacePetroleumOperatorSnapshots,
  upsertPetroleumSyncState,
} from "@/server/persistence/petroleum-market-repository";

type CompanyLinkRow = Awaited<ReturnType<typeof listPetroleumCompanyLinks>>[number];
type FieldRow = Awaited<ReturnType<typeof listPetroleumFields>>[number];
type DiscoveryRow = Awaited<ReturnType<typeof listPetroleumDiscoveries>>[number];
type LicenceRow = Awaited<ReturnType<typeof listPetroleumLicences>>[number];
type FacilityRow = Awaited<ReturnType<typeof listPetroleumFacilities>>[number];
type ProductionPointRow = Awaited<ReturnType<typeof listPetroleumProductionPoints>>[number];
type ReserveSnapshotRow = Awaited<ReturnType<typeof listPetroleumReserveSnapshots>>[number];
type InvestmentSnapshotRow = Awaited<ReturnType<typeof listPetroleumInvestmentSnapshots>>[number];

type SnapshotSourceDataset = {
  companyLinks: CompanyLinkRow[];
  fields: FieldRow[];
  discoveries: DiscoveryRow[];
  licences: LicenceRow[];
  facilities: FacilityRow[];
  productionPoints: ProductionPointRow[];
  reserveSnapshots: ReserveSnapshotRow[];
  investmentSnapshots: InvestmentSnapshotRow[];
};

const SNAPSHOT_SYNC_KEY = "petroleum-snapshots";

function parseCompanyIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as number[];
  }

  return value
    .map((item) =>
      item && typeof item === "object" && typeof (item as Record<string, unknown>).npdCompanyId === "number"
        ? ((item as Record<string, unknown>).npdCompanyId as number)
        : null,
    )
    .filter((item): item is number => item !== null);
}

function countJsonItems(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getDaysInPeriod(year: number, month?: number | null) {
  return month ? getDaysInMonth(year, month) : 365;
}

function toLiquidsVolume(point: ProductionPointRow) {
  return (point.oilNetMillSm3 ?? 0) + (point.nglNetMillSm3 ?? 0) + (point.condensateNetMillSm3 ?? 0);
}

function getLatestAnnualPoint(points: ProductionPointRow[]) {
  return [...points]
    .filter((point) => point.period === "year")
    .sort((left, right) => right.year - left.year)
    .at(0);
}

function getLatestMonthlyPoint(points: ProductionPointRow[]) {
  return [...points]
    .filter((point) => point.period === "month" && point.month)
    .sort((left, right) =>
      left.year === right.year ? (right.month ?? 0) - (left.month ?? 0) : right.year - left.year,
    )
    .at(0);
}

function getYearToDateDeltas(points: ProductionPointRow[]) {
  const monthlyPoints = [...points]
    .filter((point) => point.period === "month" && point.month)
    .sort((left, right) =>
      left.year === right.year ? (left.month ?? 0) - (right.month ?? 0) : left.year - right.year,
    );

  const latestPoint = monthlyPoints.at(-1);
  if (!latestPoint?.month) {
    return {
      yoyYtdDeltaPercent: null,
      currentMonthDeltaPercent: null,
    };
  }

  const currentYearPoints = monthlyPoints.filter(
    (point) => point.year === latestPoint.year && (point.month ?? 0) <= latestPoint.month!,
  );
  const previousYearPoints = monthlyPoints.filter(
    (point) => point.year === latestPoint.year - 1 && (point.month ?? 0) <= latestPoint.month!,
  );
  const currentYtd = currentYearPoints.reduce((sum, point) => sum + (point.oeNetMillSm3 ?? 0), 0);
  const previousYtd = previousYearPoints.reduce((sum, point) => sum + (point.oeNetMillSm3 ?? 0), 0);
  const previousSameMonth = monthlyPoints.find(
    (point) => point.year === latestPoint.year - 1 && point.month === latestPoint.month,
  );

  return {
    yoyYtdDeltaPercent: previousYtd > 0 ? (currentYtd - previousYtd) / previousYtd : null,
    currentMonthDeltaPercent:
      (previousSameMonth?.oeNetMillSm3 ?? 0) > 0
        ? ((latestPoint.oeNetMillSm3 ?? 0) - (previousSameMonth?.oeNetMillSm3 ?? 0)) /
          (previousSameMonth?.oeNetMillSm3 ?? 0)
        : null,
  };
}

function toInvestmentBigInt(snapshot?: InvestmentSnapshotRow | null) {
  if (!snapshot?.expectedFutureInvestmentMillNok || snapshot.expectedFutureInvestmentMillNok <= 0) {
    return null;
  }

  return BigInt(snapshot.expectedFutureInvestmentMillNok) * 1_000_000n;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function loadProductionLookup(rows: ProductionPointRow[]) {
  const lookup = new Map<number, ProductionPointRow[]>();

  for (const row of rows) {
    if (row.entityType !== "FIELD") {
      continue;
    }

    const existing = lookup.get(row.entityNpdId) ?? [];
    existing.push(row);
    lookup.set(row.entityNpdId, existing);
  }

  return lookup;
}

function loadReserveLookup(rows: ReserveSnapshotRow[]) {
  return new Map(
    rows
      .filter((row) => row.entityType === "FIELD")
      .map((row) => [row.entityNpdId, row] as const),
  );
}

function loadInvestmentLookup(rows: InvestmentSnapshotRow[]) {
  return new Map(
    rows
      .filter((row) => row.entityType === "FIELD")
      .map((row) => [row.entityNpdId, row] as const),
  );
}

function loadCompanyLinkLookup(rows: CompanyLinkRow[]) {
  return new Map(rows.map((row) => [row.npdCompanyId, row] as const));
}

export function buildPetroleumFieldSnapshotRows(input: SnapshotSourceDataset, computedAt = new Date()) {
  const productionLookup = loadProductionLookup(input.productionPoints);
  const reserveLookup = loadReserveLookup(input.reserveSnapshots);
  const investmentLookup = loadInvestmentLookup(input.investmentSnapshots);

  return input.fields.map((field) => {
    const points = productionLookup.get(field.npdId) ?? [];
    const latestAnnual = getLatestAnnualPoint(points);
    const latestMonthly = getLatestMonthlyPoint(points);
    const reserve = reserveLookup.get(field.npdId);
    const investment = investmentLookup.get(field.npdId);
    const deltas = getYearToDateDeltas(points);

    return {
      fieldNpdId: field.npdId,
      fieldSlug: field.slug,
      name: field.name,
      area: field.mainArea,
      status: field.activityStatus,
      hcType: field.hydrocarbonType,
      operatorNpdCompanyId: field.operatorNpdCompanyId,
      operatorName: field.operatorCompanyName,
      operatorOrgNumber: field.operatorOrgNumber,
      operatorSlug: field.operatorCompanySlug,
      licenseeCompanyIds: parseCompanyIds(field.licensees),
      latestAnnualOe: latestAnnual?.oeNetMillSm3 ?? null,
      latestMonthlyOe: latestMonthly?.oeNetMillSm3 ?? null,
      latestSelectedProductionOil: latestAnnual?.oilNetMillSm3 ?? null,
      latestSelectedProductionGas: latestAnnual?.gasNetBillSm3 ?? null,
      latestSelectedProductionLiquids: latestAnnual ? toLiquidsVolume(latestAnnual) : null,
      latestSelectedProductionOe: latestAnnual?.oeNetMillSm3 ?? null,
      remainingOe: reserve?.remainingOe ?? null,
      recoverableOe: reserve?.recoverableOe ?? null,
      expectedFutureInvestmentNok: toInvestmentBigInt(investment),
      yoyYtdDeltaPercent: deltas.yoyYtdDeltaPercent,
      currentMonthDeltaPercent: deltas.currentMonthDeltaPercent,
      sourceSystem: "PROJECTX",
      sourceEntityType: "PETROLEUM_FIELD_SNAPSHOT",
      sourceId: `field:${field.npdId}`,
      computedAt,
    };
  });
}

export function buildPetroleumLicenceSnapshotRows(input: SnapshotSourceDataset, computedAt = new Date()) {
  return input.licences.map((licence) => {
    const licenseeCompanyIds = parseCompanyIds(licence.licensees);

    return {
      licenceNpdId: licence.npdId,
      licenceSlug: licence.slug,
      name: licence.name,
      area: licence.mainArea,
      status: licence.status,
      active: licence.active ?? null,
      currentPhase: licence.currentPhase,
      operatorNpdCompanyId: licence.operatorNpdCompanyId,
      operatorName: licence.operatorCompanyName,
      operatorOrgNumber: licence.operatorOrgNumber,
      operatorSlug: licence.operatorCompanySlug,
      licenseeCompanyIds,
      currentAreaSqKm: licence.currentAreaSqKm ?? null,
      originalAreaSqKm: licence.originalAreaSqKm ?? null,
      transferCount: countJsonItems(licence.transfers),
      licenseeCount: licenseeCompanyIds.length,
      sourceSystem: "PROJECTX",
      sourceEntityType: "PETROLEUM_LICENCE_SNAPSHOT",
      sourceId: `licence:${licence.npdId}`,
      computedAt,
    };
  });
}

export function buildPetroleumOperatorSnapshotRows(input: SnapshotSourceDataset, computedAt = new Date()) {
  const fieldSnapshots = buildPetroleumFieldSnapshotRows(input, computedAt);
  const licenceSnapshots = buildPetroleumLicenceSnapshotRows(input, computedAt);
  const companyLinks = loadCompanyLinkLookup(input.companyLinks);
  const references = new Map<
    number,
    {
      name: string;
      orgNumber?: string | null;
      slug?: string | null;
    }
  >();

  for (const row of fieldSnapshots) {
    if (!row.operatorNpdCompanyId) continue;
    references.set(row.operatorNpdCompanyId, {
      name: row.operatorName ?? `Operator ${row.operatorNpdCompanyId}`,
      orgNumber: row.operatorOrgNumber,
      slug: row.operatorSlug,
    });
  }

  for (const row of licenceSnapshots) {
    if (!row.operatorNpdCompanyId || references.has(row.operatorNpdCompanyId)) continue;
    references.set(row.operatorNpdCompanyId, {
      name: row.operatorName ?? `Operator ${row.operatorNpdCompanyId}`,
      orgNumber: row.operatorOrgNumber,
      slug: row.operatorSlug,
    });
  }

  for (const row of input.discoveries) {
    if (!row.operatorNpdCompanyId || references.has(row.operatorNpdCompanyId)) continue;
    references.set(row.operatorNpdCompanyId, {
      name: row.operatorCompanyName ?? `Operator ${row.operatorNpdCompanyId}`,
      orgNumber: row.operatorOrgNumber,
      slug: row.operatorCompanySlug,
    });
  }

  for (const row of input.facilities) {
    if (!row.currentOperatorNpdId || references.has(row.currentOperatorNpdId)) continue;
    references.set(row.currentOperatorNpdId, {
      name: row.currentOperatorName ?? `Operator ${row.currentOperatorNpdId}`,
      orgNumber: row.currentOperatorOrgNumber,
      slug: row.currentOperatorSlug,
    });
  }

  return [...references.entries()].map(([npdCompanyId, reference]) => {
    const link = companyLinks.get(npdCompanyId);
    const operatorFields = fieldSnapshots.filter((row) => row.operatorNpdCompanyId === npdCompanyId);
    const operatorLicences = licenceSnapshots.filter((row) => row.operatorNpdCompanyId === npdCompanyId);
    const discoveryCount = input.discoveries.filter((row) => row.operatorNpdCompanyId === npdCompanyId).length;
    const facilityCount = input.facilities.filter((row) => row.currentOperatorNpdId === npdCompanyId).length;

    return {
      npdCompanyId,
      operatorName: link?.companyName ?? reference.name,
      orgNumber: link?.linkedCompanyOrgNumber ?? link?.orgNumber ?? reference.orgNumber ?? null,
      slug: link?.linkedCompanySlug ?? reference.slug ?? null,
      fieldCount: operatorFields.length,
      licenceCount: operatorLicences.length,
      discoveryCount,
      facilityCount,
      latestProductionOe: operatorFields.reduce((sum, row) => sum + (row.latestAnnualOe ?? 0), 0),
      remainingOe: operatorFields.reduce((sum, row) => sum + (row.remainingOe ?? 0), 0),
      expectedFutureInvestmentNok: operatorFields.reduce<bigint | null>((sum, row) => {
        const next = row.expectedFutureInvestmentNok ?? 0n;
        return (sum ?? 0n) + next;
      }, 0n),
      mainAreas: uniqueStrings([...operatorFields.map((row) => row.area), ...operatorLicences.map((row) => row.area)]),
      mainHydrocarbonTypes: uniqueStrings(operatorFields.map((row) => row.hcType)),
      sourceSystem: "PROJECTX",
      sourceEntityType: "PETROLEUM_OPERATOR_SNAPSHOT",
      sourceId: `operator:${npdCompanyId}`,
      computedAt,
    };
  });
}

export function buildPetroleumAreaSnapshotRows(input: SnapshotSourceDataset, computedAt = new Date()) {
  const fieldSnapshots = buildPetroleumFieldSnapshotRows(input, computedAt);
  const licenceSnapshots = buildPetroleumLicenceSnapshotRows(input, computedAt);
  const areas = uniqueStrings([
    ...fieldSnapshots.map((row) => row.area),
    ...licenceSnapshots.map((row) => row.area),
  ]);

  return areas.map((area) => {
    const fields = fieldSnapshots.filter((row) => row.area === area);
    const licences = licenceSnapshots.filter((row) => row.area === area);
    const operatorIds = new Set([
      ...fields.map((row) => row.operatorNpdCompanyId).filter((value): value is number => typeof value === "number"),
      ...licences
        .map((row) => row.operatorNpdCompanyId)
        .filter((value): value is number => typeof value === "number"),
    ]);

    return {
      area,
      fieldCount: fields.length,
      licenceCount: licences.length,
      operatorCount: operatorIds.size,
      latestProductionOe: fields.reduce((sum, row) => sum + (row.latestAnnualOe ?? 0), 0),
      remainingOe: fields.reduce((sum, row) => sum + (row.remainingOe ?? 0), 0),
      expectedFutureInvestmentNok: fields.reduce<bigint | null>((sum, row) => {
        const next = row.expectedFutureInvestmentNok ?? 0n;
        return (sum ?? 0n) + next;
      }, 0n),
      sourceSystem: "PROJECTX",
      sourceEntityType: "PETROLEUM_AREA_SNAPSHOT",
      sourceId: `area:${area}`,
      computedAt,
    };
  });
}

async function loadSnapshotSourceDataset(): Promise<SnapshotSourceDataset> {
  const [companyLinks, fields, discoveries, licences, facilities, productionPoints, reserveSnapshots, investmentSnapshots] =
    await Promise.all([
      listPetroleumCompanyLinks(),
      listPetroleumFields(),
      listPetroleumDiscoveries(),
      listPetroleumLicences(),
      listPetroleumFacilities(),
      listPetroleumProductionPoints(),
      listPetroleumReserveSnapshots(),
      listPetroleumInvestmentSnapshots(),
    ]);

  return {
    companyLinks,
    fields,
    discoveries,
    licences,
    facilities,
    productionPoints,
    reserveSnapshots,
    investmentSnapshots,
  };
}

export async function refreshPetroleumFieldSnapshots() {
  const computedAt = new Date();
  const dataset = await loadSnapshotSourceDataset();
  const snapshots = buildPetroleumFieldSnapshotRows(dataset, computedAt);
  await replacePetroleumFieldSnapshots({ snapshots });
  return { count: snapshots.length, computedAt };
}

export async function refreshPetroleumLicenceSnapshots() {
  const computedAt = new Date();
  const dataset = await loadSnapshotSourceDataset();
  const snapshots = buildPetroleumLicenceSnapshotRows(dataset, computedAt);
  await replacePetroleumLicenceSnapshots({ snapshots });
  return { count: snapshots.length, computedAt };
}

export async function refreshPetroleumOperatorSnapshots() {
  const computedAt = new Date();
  const dataset = await loadSnapshotSourceDataset();
  const snapshots = buildPetroleumOperatorSnapshotRows(dataset, computedAt);
  await replacePetroleumOperatorSnapshots({ snapshots });
  return { count: snapshots.length, computedAt };
}

export async function refreshPetroleumAreaSnapshots() {
  const computedAt = new Date();
  const dataset = await loadSnapshotSourceDataset();
  const snapshots = buildPetroleumAreaSnapshotRows(dataset, computedAt);
  await replacePetroleumAreaSnapshots({ snapshots });
  return { count: snapshots.length, computedAt };
}

export async function refreshPetroleumSnapshotsNow() {
  await upsertPetroleumSyncState({ key: SNAPSHOT_SYNC_KEY, status: "RUNNING" });

  try {
    const computedAt = new Date();
    const dataset = await loadSnapshotSourceDataset();
    const fieldSnapshots = buildPetroleumFieldSnapshotRows(dataset, computedAt);
    const licenceSnapshots = buildPetroleumLicenceSnapshotRows(dataset, computedAt);
    const operatorSnapshots = buildPetroleumOperatorSnapshotRows(dataset, computedAt);
    const areaSnapshots = buildPetroleumAreaSnapshotRows(dataset, computedAt);

    await Promise.all([
      replacePetroleumFieldSnapshots({ snapshots: fieldSnapshots }),
      replacePetroleumLicenceSnapshots({ snapshots: licenceSnapshots }),
      replacePetroleumOperatorSnapshots({ snapshots: operatorSnapshots }),
      replacePetroleumAreaSnapshots({ snapshots: areaSnapshots }),
    ]);

    await upsertPetroleumSyncState({
      key: SNAPSHOT_SYNC_KEY,
      status: "SUCCESS",
      markSuccess: true,
      metadata: {
        fieldSnapshots: fieldSnapshots.length,
        licenceSnapshots: licenceSnapshots.length,
        operatorSnapshots: operatorSnapshots.length,
        areaSnapshots: areaSnapshots.length,
      },
    });

    return {
      computedAt,
      fieldSnapshots: fieldSnapshots.length,
      licenceSnapshots: licenceSnapshots.length,
      operatorSnapshots: operatorSnapshots.length,
      areaSnapshots: areaSnapshots.length,
    };
  } catch (error) {
    await upsertPetroleumSyncState({
      key: SNAPSHOT_SYNC_KEY,
      status: "ERROR",
      errorMessage: error instanceof Error ? error.message : "Unknown snapshot refresh error",
    });
    throw error;
  }
}
