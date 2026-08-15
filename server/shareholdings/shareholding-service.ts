import crypto from "node:crypto";

import { ShareholdingGraphSnapshot, ShareholderType } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import {
  getShareholdingAvailableYears,
  getShareholdingSnapshot,
} from "@/server/shareholdings/shareholding-repository";
import { getRegisteredOwnersForCompany } from "@/server/shareholdings/shareholder-register-repository";
import { resolveUltimateOwners, type UltimateOwner } from "@/server/ownership/ultimate-owner-service";

// The shareholders tab only ever shows the largest holders; a widely-held company can have
// hundreds of thousands of register rows that add no value and make the page slow. Cap the
// list to the top holders (by ownership share).
const TOP_SHAREHOLDERS_CAP = 100;

function getLatestExpectedYear(currentDate = new Date()) {
  const year = currentDate.getUTCFullYear();
  const expectedRelease = new Date(Date.UTC(year, 4, 15));
  return currentDate < expectedRelease ? year - 2 : year - 1;
}

function normalizeName(name: string) {
  return name
    .trim()
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stableId(seed: string) {
  return crypto.createHash("sha1").update(seed).digest("hex");
}

async function getRegisterAvailableYearsForCompany(orgNumber: string) {
  // Prisma `distinct` here materializes every register row for the company (millions for a
  // widely-held issuer — ~18s for Equinor). Instead probe each imported register year for
  // existence via the (taxYear, issuerOrgNumber) index — ~20 index lookups, ~20ms.
  const rows = await prisma.$queryRaw<Array<{ taxYear: number }>>`
    SELECT y."taxYear"
    FROM (
      SELECT DISTINCT "taxYear" FROM "ShareholderRegisterImport"
      WHERE status::text IN ('COMPLETED', 'PARTIAL')
    ) y
    WHERE EXISTS (
      SELECT 1 FROM "ShareholderRegisterHolding" h
      WHERE h."taxYear" = y."taxYear" AND h."issuerOrgNumber" = ${orgNumber}
    )
    ORDER BY y."taxYear" DESC
  `;

  return rows.map((row) => row.taxYear);
}

async function getRegisterImportedAt(taxYear: number) {
  const row = await prisma.shareholderRegisterImport.findFirst({
    where: { taxYear, status: { in: ["COMPLETED", "PARTIAL"] } },
    orderBy: [{ completedAt: "desc" }, { fetchedAt: "desc" }],
    select: { completedAt: true, fetchedAt: true },
  });

  return row?.completedAt ?? row?.fetchedAt ?? new Date();
}

type OwnerAggregate = {
  key: string;
  type: ShareholderType;
  name: string;
  normalizedName: string;
  orgNumber: string | null;
  birthYear: number | null;
  postalCode: string | null;
  postalPlace: string | null;
  shares: bigint;
  totalShares: bigint | null;
};

function ownerPercent(owner: OwnerAggregate) {
  if (!owner.totalShares || owner.totalShares <= BigInt(0)) return null;
  const percent = (Number(owner.shares) * 100) / Number(owner.totalShares);
  return percent <= 150 ? Number(Math.min(percent, 100).toFixed(8)) : null;
}

async function buildRegisterBackedSnapshot(params: {
  orgNumber: string;
  companyName: string;
  taxYear: number;
  latestExpectedYear: number;
}): Promise<ShareholdingGraphSnapshot | null> {
  const rows = await getRegisteredOwnersForCompany(
    params.orgNumber,
    params.taxYear,
    TOP_SHAREHOLDERS_CAP,
  );
  if (rows.length === 0) return null;

  // Fall back to the register's issuer name when the company is not in the local Company
  // table (so the name is not just the org number).
  const companyName =
    params.companyName && params.companyName !== params.orgNumber
      ? params.companyName
      : rows[0]?.issuerName ?? params.orgNumber;

  const aggregates = new Map<string, OwnerAggregate>();
  for (const row of rows) {
    const normalizedName = normalizeName(row.shareholderName);
    const key = row.shareholderOrgNumber
      ? `company:${row.shareholderOrgNumber}`
      : [
          row.shareholderType,
          normalizedName,
          row.shareholderBirthYear ?? "",
          row.postalCode ?? "",
          row.postalPlace ?? "",
        ].join("|");
    const shares = BigInt(row.numberOfShares);
    const totalShares = row.totalCompanyShares ? BigInt(row.totalCompanyShares) : null;
    const existing = aggregates.get(key);

    if (existing) {
      existing.shares += shares;
      if (existing.totalShares !== null && totalShares !== null && existing.totalShares !== totalShares) {
        existing.totalShares = null;
      }
      continue;
    }

    aggregates.set(key, {
      key,
      type: row.shareholderType,
      name: row.shareholderName,
      normalizedName,
      orgNumber: row.shareholderOrgNumber,
      birthYear: row.shareholderBirthYear,
      postalCode: row.postalCode,
      postalPlace: row.postalPlace,
      shares,
      totalShares,
    });
  }

  const owners = Array.from(aggregates.values()).sort((left, right) => {
    const leftPercent = ownerPercent(left) ?? -1;
    const rightPercent = ownerPercent(right) ?? -1;
    if (rightPercent !== leftPercent) return rightPercent - leftPercent;
    if (right.shares > left.shares) return 1;
    if (right.shares < left.shares) return -1;
    return left.name.localeCompare(right.name, "nb");
  });

  const snapshotId = `register:${params.orgNumber}:${params.taxYear}`;
  const companyNodeId = `company:${params.orgNumber}`;
  const sourceImportedAt = await getRegisterImportedAt(params.taxYear);

  const shareholders = owners.map((owner) => {
    const id = `shareholder:${stableId(`${params.taxYear}:${owner.key}`)}`;
    return {
      id,
      type: owner.type,
      name: owner.name,
      normalizedName: owner.normalizedName,
      birthYear: owner.birthYear,
      postalCode: owner.postalCode,
      postalPlace: owner.postalPlace,
      externalIdentifier: owner.orgNumber,
      linkedCompanyId: null,
      linkedCompanyOrgNumber: owner.orgNumber,
      linkedCompanyName: owner.orgNumber ? owner.name : null,
      matchConfidence: owner.orgNumber ? 1 : null,
    };
  });

  const ownerships = owners.map((owner, index) => {
    const percent = ownerPercent(owner);
    return {
      id: `ownership:${stableId(`${snapshotId}:${owner.key}`)}`,
      snapshotId,
      companyId: params.orgNumber,
      shareholderId: shareholders[index].id,
      shareClass: null,
      numberOfShares: owner.shares.toString(),
      ownershipPercent: percent,
      ownershipPercentRaw: percent !== null ? percent.toFixed(8) : null,
      ownershipBasis: "SUMMED_SHARE_CLASSES",
      dataQualityNote: null,
      isDirect: true,
    };
  });

  return {
    snapshotId,
    companyId: params.orgNumber,
    companyOrgNumber: params.orgNumber,
    companyName,
    taxYear: params.taxYear,
    totalShares: owners.find((owner) => owner.totalShares !== null)?.totalShares?.toString() ?? null,
    shareholderCount: owners.length,
    source: "SKATTEETATEN_CSV",
    sourceImportedAt,
    latestAvailableYear: params.latestExpectedYear,
    dataQualityNote: "Bygget direkte fra importert aksjonærregister fordi materialisert snapshot mangler.",
    availabilityMessage: null,
    nodes: [
      {
        id: companyNodeId,
        type: "COMPANY",
        label: companyName,
        metadata: { orgNumber: params.orgNumber, typeLabel: "Selskap" },
      },
      ...owners.map((owner) => ({
        id: owner.orgNumber ? `company:${owner.orgNumber}` : `shareholder:${stableId(owner.key)}`,
        type:
          owner.type === "COMPANY"
            ? ("COMPANY_SHAREHOLDER" as const)
            : owner.type === "PERSON"
              ? ("PERSON" as const)
              : ("UNKNOWN_SHAREHOLDER" as const),
        label: owner.name,
        metadata: {
          orgNumber: owner.orgNumber,
          shareholderId: `shareholder:${stableId(`${params.taxYear}:${owner.key}`)}`,
          typeLabel: owner.type === "COMPANY" ? "Selskap" : owner.type === "PERSON" ? "Person" : "Uavklart",
          confidence: owner.orgNumber ? 1 : null,
        },
      })),
    ],
    edges: owners.map((owner, index) => ({
      id: `edge:${stableId(`${snapshotId}:${owner.key}`)}`,
      sourceNodeId: owner.orgNumber ? `company:${owner.orgNumber}` : `shareholder:${stableId(owner.key)}`,
      targetNodeId: companyNodeId,
      relationshipType: "OWNS",
      percent: ownerships[index].ownershipPercent,
      percentRaw: ownerships[index].ownershipPercentRaw,
      shares: owner.shares.toString(),
      shareClass: null,
    })),
    ownerships,
    shareholders,
  };
}

/**
 * Resolve the ultimate owner behind each corporate shareholder in a snapshot,
 * keyed by shareholder org number. Best-effort: any failure (or a year without a
 * materialised ownership graph) yields an empty map rather than breaking the tab.
 */
async function buildUltimateOwners(
  snapshot: ShareholdingGraphSnapshot,
): Promise<Record<string, UltimateOwner>> {
  try {
    const orgNumbers = snapshot.shareholders
      .filter((shareholder) => shareholder.type === "COMPANY" && shareholder.linkedCompanyOrgNumber)
      .map((shareholder) => shareholder.linkedCompanyOrgNumber as string);
    if (orgNumbers.length === 0) return {};
    const resolved = await resolveUltimateOwners(orgNumbers, snapshot.taxYear);
    return Object.fromEntries(resolved);
  } catch {
    return {};
  }
}

export async function getCompanyShareholdingOverview(orgNumber: string, requestedYear?: number) {
  // The company name is the only thing needed here, so read it from the local Company table
  // (a fast indexed lookup, run in parallel) instead of a synchronous Brreg API call on
  // every shareholders page load.
  const [companyRow, snapshotYears, registerYears] = await Promise.all([
    prisma.company.findUnique({ where: { orgNumber }, select: { name: true } }),
    getShareholdingAvailableYears(orgNumber),
    getRegisterAvailableYearsForCompany(orgNumber),
  ]);
  const availableYears = Array.from(new Set([...snapshotYears, ...registerYears])).sort((a, b) => b - a);
  const latestExpectedYear = getLatestExpectedYear();
  const selectedYear = requestedYear ?? availableYears[0] ?? latestExpectedYear;
  const companyName = companyRow?.name ?? orgNumber;

  const persistedSnapshot = await getShareholdingSnapshot(
    orgNumber,
    selectedYear,
    TOP_SHAREHOLDERS_CAP,
  );
  const registerSnapshot = persistedSnapshot
    ? null
    : await buildRegisterBackedSnapshot({
        orgNumber,
        companyName,
        taxYear: selectedYear,
        latestExpectedYear,
      });
  const snapshot = persistedSnapshot ?? registerSnapshot;

  if (!snapshot) {
    const unavailable: ShareholdingGraphSnapshot = {
      snapshotId: `unavailable:${orgNumber}:${selectedYear}`,
      companyId: "",
      companyOrgNumber: orgNumber,
      companyName,
      taxYear: selectedYear,
      totalShares: null,
      shareholderCount: 0,
      source: "SKATTEETATEN_CSV",
      sourceImportedAt: new Date(),
      latestAvailableYear: latestExpectedYear,
      dataQualityNote: null,
      availabilityMessage: selectedYear > latestExpectedYear
        ? `Aksjonærdata for ${selectedYear} er normalt ikke tilgjengelig ennå. Siste forventede tilgjengelige år er ${latestExpectedYear}.`
        : "Aksjonærdata er ikke lastet inn i det lokale registeret for valgt år.",
      nodes: [],
      edges: [],
      ownerships: [],
      shareholders: [],
    };

    return {
      snapshot: unavailable,
      availableYears,
      latestExpectedYear,
      ultimateOwners: {} as Record<string, UltimateOwner>,
    };
  }

  snapshot.latestAvailableYear = latestExpectedYear;
  if (!snapshot.availabilityMessage && selectedYear > latestExpectedYear) {
    snapshot.availabilityMessage = `Aksjonærdata for ${selectedYear} er normalt ikke tilgjengelig ennå.`;
  }

  return {
    snapshot,
    availableYears,
    latestExpectedYear,
    ultimateOwners: await buildUltimateOwners(snapshot),
  };
}
