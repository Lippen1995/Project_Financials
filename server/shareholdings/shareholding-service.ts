import crypto from "node:crypto";

import { ShareholdingGraphSnapshot, ShareholderType } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { SkatteetatenShareholdingProvider } from "@/integrations/skatteetaten/aksjonaer-i-virksomhet-provider";
import { BrregCompanyProvider } from "@/integrations/brreg/brreg-company-provider";
import {
  getShareholdingAvailableYears,
  getShareholdingSnapshot,
} from "@/server/shareholdings/shareholding-repository";
import { getRegisteredOwnersForCompany } from "@/server/shareholdings/shareholder-register-repository";

const skatteetatenProvider = new SkatteetatenShareholdingProvider();
const brregCompanyProvider = new BrregCompanyProvider();

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
  const rows = await prisma.shareholderRegisterHolding.findMany({
    where: { issuerOrgNumber: orgNumber },
    distinct: ["taxYear"],
    orderBy: { taxYear: "desc" },
    select: { taxYear: true },
  });

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
  const rows = await getRegisteredOwnersForCompany(params.orgNumber, params.taxYear, 1000);
  if (rows.length === 0) return null;

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
    companyName: params.companyName,
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
        label: params.companyName,
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

export async function getCompanyShareholdingOverview(orgNumber: string, requestedYear?: number) {
  const company = await brregCompanyProvider.getCompany(orgNumber);
  const [snapshotYears, registerYears] = await Promise.all([
    getShareholdingAvailableYears(orgNumber),
    getRegisterAvailableYearsForCompany(orgNumber),
  ]);
  const availableYears = Array.from(new Set([...snapshotYears, ...registerYears])).sort((a, b) => b - a);
  const latestExpectedYear = getLatestExpectedYear();
  const selectedYear = requestedYear ?? availableYears[0] ?? latestExpectedYear;
  const companyName = company?.name ?? orgNumber;

  if (skatteetatenProvider.canFetch()) {
    try {
      const liveSnapshot = await skatteetatenProvider.getShareholdingSnapshot(orgNumber, requestedYear);
      if (liveSnapshot) {
        liveSnapshot.companyName = company?.name ?? liveSnapshot.companyName;
        return {
          snapshot: liveSnapshot,
          availableYears: Array.from(new Set([liveSnapshot.taxYear, ...availableYears])).sort((a, b) => b - a),
          latestExpectedYear,
        };
      }
    } catch {
      // Fall back to persisted or imported shareholder-register data if the live API is unavailable.
    }
  }

  const persistedSnapshot = await getShareholdingSnapshot(orgNumber, selectedYear);
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
      availabilityMessage: !skatteetatenProvider.canFetch()
        ? "Aksjonærdata er ikke tilgjengelig fordi Skatteetatens API ikke er konfigurert, og det finnes heller ikke importerte registerrader for valgt år."
        : selectedYear > latestExpectedYear
          ? `Aksjonærdata for ${selectedYear} er normalt ikke tilgjengelig ennå. Siste forventede tilgjengelige år er ${latestExpectedYear}.`
          : "Aksjonærdata ikke tilgjengelig for valgt år.",
      nodes: [],
      edges: [],
      ownerships: [],
      shareholders: [],
    };

    return {
      snapshot: unavailable,
      availableYears,
      latestExpectedYear,
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
  };
}
