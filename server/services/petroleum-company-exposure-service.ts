import {
  listPetroleumCompanyLinks,
  listPetroleumFields,
  listPetroleumInvestmentSnapshots,
  listPetroleumLicences,
  listPetroleumProductionPoints,
  listPetroleumReserveSnapshots,
  listPetroleumCompanyExposureSnapshots,
  replacePetroleumCompanyExposureSnapshots,
} from "@/server/persistence/petroleum-market-repository";
import { PetroleumCompanyExposureSnapshotView } from "@/lib/types";

function parseLicenseeShares(value: unknown) {
  if (!Array.isArray(value)) return [] as Array<{ npdCompanyId?: number; share?: number }>;
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const npdCompanyId = typeof row.npdCompanyId === "number" ? row.npdCompanyId : undefined;
      const share = typeof row.share === "number" ? row.share : undefined;
      return npdCompanyId ? { npdCompanyId, share } : null;
    })
    .filter((item): item is { npdCompanyId?: number; share?: number } => Boolean(item));
}

export async function syncPetroleumCompanyExposureSnapshots() {
  const [companyLinks, fields, licences, productionPoints, reserveSnapshots, investmentSnapshots, companies] =
    await Promise.all([
      listPetroleumCompanyLinks(),
      listPetroleumFields(),
      listPetroleumLicences(),
      listPetroleumProductionPoints(),
      listPetroleumReserveSnapshots(),
      listPetroleumInvestmentSnapshots(),
      prisma.company.findMany({ select: { id: true, orgNumber: true } }),
    ]);

  const companyByOrg = new Map(companies.map((company) => [company.orgNumber, company]));
  const linkByNpd = new Map(companyLinks.map((link) => [link.npdCompanyId, link]));

  const latestAnnualByField = new Map<number, number>();
  for (const point of productionPoints) {
    if (point.entityType !== "FIELD" || point.period !== "year") continue;
    const current = latestAnnualByField.get(point.entityNpdId) ?? 0;
    latestAnnualByField.set(point.entityNpdId, Math.max(current, point.oeNetMillSm3 ?? 0));
  }

  const reserveByField = new Map(
    reserveSnapshots
      .filter((snapshot) => snapshot.entityType === "FIELD")
      .map((snapshot) => [snapshot.entityNpdId, snapshot.remainingOe ?? 0]),
  );
  const investmentsByField = new Map(
    investmentSnapshots
      .filter((snapshot) => snapshot.entityType === "FIELD")
      .map((snapshot) => [snapshot.entityNpdId, BigInt(snapshot.expectedFutureInvestmentMillNok ?? 0) * 1_000_000n]),
  );

  const exposureByCompany = new Map<
    string,
    {
      companyId: string;
      npdCompanyId: number;
      operatorFieldIds: Set<number>;
      licenceIds: Set<number>;
      operatedProductionOe: number;
      attributableProductionOe: number | null;
      remainingReservesOe: number;
      expectedFutureInvestmentNok: bigint;
      mainAreas: Set<string>;
    }
  >();

  const ensureExposure = (npdCompanyId: number) => {
    const link = linkByNpd.get(npdCompanyId);
    if (!link?.linkedCompanyOrgNumber) return null;
    const company = companyByOrg.get(link.linkedCompanyOrgNumber);
    if (!company) return null;

    const existing = exposureByCompany.get(company.id);
    if (existing) return existing;

    const next = {
      companyId: company.id,
      npdCompanyId,
      operatorFieldIds: new Set<number>(),
      licenceIds: new Set<number>(),
      operatedProductionOe: 0,
      attributableProductionOe: 0,
      remainingReservesOe: 0,
      expectedFutureInvestmentNok: 0n,
      mainAreas: new Set<string>(),
    };
    exposureByCompany.set(company.id, next);
    return next;
  };

  for (const field of fields) {
    if (!field.operatorNpdCompanyId) continue;
    const exposure = ensureExposure(field.operatorNpdCompanyId);
    if (!exposure) continue;

    exposure.operatorFieldIds.add(field.npdId);
    exposure.operatedProductionOe += latestAnnualByField.get(field.npdId) ?? 0;
    exposure.remainingReservesOe += reserveByField.get(field.npdId) ?? 0;
    exposure.expectedFutureInvestmentNok += investmentsByField.get(field.npdId) ?? 0n;
    if (field.mainArea) exposure.mainAreas.add(field.mainArea);

    const licensees = parseLicenseeShares(field.licensees);
    const licensee = licensees.find((item) => item.npdCompanyId === field.operatorNpdCompanyId);
    if (licensee?.share !== undefined) {
      exposure.attributableProductionOe =
        (exposure.attributableProductionOe ?? 0) + (latestAnnualByField.get(field.npdId) ?? 0) * (licensee.share / 100);
    } else {
      exposure.attributableProductionOe = null;
    }
  }

  for (const licence of licences) {
    if (!licence.operatorNpdCompanyId) continue;
    const exposure = ensureExposure(licence.operatorNpdCompanyId);
    if (!exposure) continue;
    exposure.licenceIds.add(licence.npdId);
    if (licence.mainArea) exposure.mainAreas.add(licence.mainArea);
  }

  const now = new Date();
  const snapshots = [...exposureByCompany.values()].map((entry) => ({
    companyId: entry.companyId,
    npdCompanyId: entry.npdCompanyId,
    operatorFieldCount: entry.operatorFieldIds.size,
    licenceCount: entry.licenceIds.size,
    operatedProductionOe: entry.operatedProductionOe,
    attributableProductionOe: entry.attributableProductionOe,
    remainingReservesOe: entry.remainingReservesOe,
    expectedFutureInvestmentNok: entry.expectedFutureInvestmentNok,
    mainAreas: [...entry.mainAreas],
    metadata: {
      attributableMethod:
        entry.attributableProductionOe === null
          ? "NULL_IF_LICENCE_SHARES_UNAVAILABLE"
          : "FIELD_LICENSEE_SHARE_WHEN_AVAILABLE",
    },
    sourceSystem: "PROJECTX",
    sourceEntityType: "PETROLEUM_COMPANY_EXPOSURE",
    sourceId: `company:${entry.companyId}`,
    fetchedAt: now,
    normalizedAt: now,
  }));

  await replacePetroleumCompanyExposureSnapshots({ snapshots });
}

export async function getPetroleumCompanyExposureSnapshots(): Promise<PetroleumCompanyExposureSnapshotView[]> {
  const rows = await listPetroleumCompanyExposureSnapshots();

  return rows.map((row) => ({
    id: row.id,
    companyId: row.companyId,
    npdCompanyId: row.npdCompanyId,
    operatorFieldCount: row.operatorFieldCount,
    licenceCount: row.licenceCount,
    operatedProductionOe: row.operatedProductionOe,
    attributableProductionOe: row.attributableProductionOe,
    remainingReservesOe: row.remainingReservesOe,
    expectedFutureInvestmentNok: row.expectedFutureInvestmentNok ? Number(row.expectedFutureInvestmentNok) : null,
    mainAreas: Array.isArray(row.mainAreas) ? (row.mainAreas as string[]) : [],
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    sourceSystem: row.sourceSystem,
    sourceEntityType: row.sourceEntityType,
    sourceId: row.sourceId,
    fetchedAt: row.fetchedAt,
    normalizedAt: row.normalizedAt,
  }));
}
