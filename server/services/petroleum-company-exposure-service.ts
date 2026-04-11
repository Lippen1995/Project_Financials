import { prisma } from "@/lib/prisma";
import {
  listPetroleumCompanyLinks,
  listPetroleumFieldSnapshots,
  listPetroleumFields,
  listPetroleumLicenceSnapshots,
  listPetroleumCompanyExposureSnapshots,
  replacePetroleumCompanyExposureSnapshots,
  upsertPetroleumSyncState,
} from "@/server/persistence/petroleum-market-repository";
import { PetroleumCompanyExposureSnapshotView } from "@/lib/types";

const COMPANY_EXPOSURE_SYNC_KEY = "petroleum-company-exposure";

function parseLicenseeShares(value: unknown) {
  if (!Array.isArray(value)) return [] as Array<{ npdCompanyId: number; share?: number }>;
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const npdCompanyId = typeof row.npdCompanyId === "number" ? row.npdCompanyId : null;
    if (!npdCompanyId) return [];
    const share = typeof row.share === "number" ? row.share : undefined;
    return [{ npdCompanyId, share }];
  });
}

export async function syncPetroleumCompanyExposureSnapshots() {
  await upsertPetroleumSyncState({ key: COMPANY_EXPOSURE_SYNC_KEY, status: "RUNNING" });

  try {
    const [companyLinks, fieldSnapshots, licenceSnapshots, rawFields, companies] = await Promise.all([
      listPetroleumCompanyLinks(),
      listPetroleumFieldSnapshots(),
      listPetroleumLicenceSnapshots(),
      listPetroleumFields(),
      prisma.company.findMany({ select: { id: true, orgNumber: true } }),
    ]);

    const companyByOrg = new Map(companies.map((company) => [company.orgNumber, company]));
    const linkByNpd = new Map(companyLinks.map((link) => [link.npdCompanyId, link]));
    const rawFieldByNpd = new Map(rawFields.map((field) => [field.npdId, field]));
    const latestAnnualByField = new Map(fieldSnapshots.map((field) => [field.fieldNpdId, field.latestAnnualOe ?? 0]));
    const reserveByField = new Map(fieldSnapshots.map((field) => [field.fieldNpdId, field.remainingOe ?? 0]));
    const investmentsByField = new Map(
      fieldSnapshots.map((field) => [field.fieldNpdId, field.expectedFutureInvestmentNok ?? 0n]),
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

    for (const field of fieldSnapshots) {
      if (!field.operatorNpdCompanyId) continue;
      const exposure = ensureExposure(field.operatorNpdCompanyId);
      if (!exposure) continue;

      exposure.operatorFieldIds.add(field.fieldNpdId);
      exposure.operatedProductionOe += latestAnnualByField.get(field.fieldNpdId) ?? 0;
      exposure.remainingReservesOe += reserveByField.get(field.fieldNpdId) ?? 0;
      exposure.expectedFutureInvestmentNok += investmentsByField.get(field.fieldNpdId) ?? 0n;
      if (field.area) exposure.mainAreas.add(field.area);

      const rawField = rawFieldByNpd.get(field.fieldNpdId);
      const licensees = parseLicenseeShares(rawField?.licensees);
      const licensee = licensees.find((item) => item.npdCompanyId === field.operatorNpdCompanyId);
      if (licensee?.share !== undefined) {
        exposure.attributableProductionOe =
          (exposure.attributableProductionOe ?? 0) +
          (latestAnnualByField.get(field.fieldNpdId) ?? 0) * (licensee.share / 100);
      } else {
        exposure.attributableProductionOe = null;
      }
    }

    for (const licence of licenceSnapshots) {
      if (!licence.operatorNpdCompanyId) continue;
      const exposure = ensureExposure(licence.operatorNpdCompanyId);
      if (!exposure) continue;
      exposure.licenceIds.add(licence.licenceNpdId);
      if (licence.area) exposure.mainAreas.add(licence.area);
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
    await upsertPetroleumSyncState({
      key: COMPANY_EXPOSURE_SYNC_KEY,
      status: "SUCCESS",
      markSuccess: true,
      metadata: {
        snapshotCount: snapshots.length,
      },
    });
  } catch (error) {
    await upsertPetroleumSyncState({
      key: COMPANY_EXPOSURE_SYNC_KEY,
      status: "ERROR",
      errorMessage:
        error instanceof Error ? error.message : "Unknown company exposure refresh error",
    });
    throw error;
  }
}

export async function refreshPetroleumCompanyExposureNow() {
  await syncPetroleumCompanyExposureSnapshots();
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
