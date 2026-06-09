import { prisma } from "@/lib/prisma";

export type ShareholderRegisterYearSummary = {
  taxYear: number;
  status: string;
  importedRowCount: number;
  skippedRowCount: number;
  processedBytes: string;
  totalBytes: string | null;
  sourceFileName: string;
  failureMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
};

export type ShareholderRegisterHoldingRecord = {
  taxYear: number;
  issuerOrgNumber: string;
  issuerName: string;
  shareClass: string | null;
  shareholderName: string;
  shareholderOrgNumber: string | null;
  shareholderBirthYear: number | null;
  shareholderType: "PERSON" | "COMPANY" | "UNKNOWN";
  postalCode: string | null;
  postalPlace: string | null;
  countryCode: string | null;
  numberOfShares: string;
  totalCompanyShares: string | null;
  ownershipPercent: string | null;
};

export async function getShareholderRegisterImportSummaries(): Promise<ShareholderRegisterYearSummary[]> {
  const imports = await prisma.shareholderRegisterImport.findMany({
    orderBy: { taxYear: "desc" },
    select: {
      taxYear: true,
      status: true,
      importedRowCount: true,
      skippedRowCount: true,
      processedBytes: true,
      totalBytes: true,
      sourceFileName: true,
      failureMessage: true,
      startedAt: true,
      completedAt: true,
    },
  });

  return imports.map((item) => ({
    taxYear: item.taxYear,
    status: item.status,
    importedRowCount: item.importedRowCount,
    skippedRowCount: item.skippedRowCount,
    processedBytes: item.processedBytes.toString(),
    totalBytes: item.totalBytes?.toString() ?? null,
    sourceFileName: item.sourceFileName,
    failureMessage: item.failureMessage,
    startedAt: item.startedAt,
    completedAt: item.completedAt,
  }));
}

export async function getShareholderRegisterAvailableYears() {
  const imports = await prisma.shareholderRegisterImport.findMany({
    where: { status: { in: ["COMPLETED", "PARTIAL"] } },
    orderBy: { taxYear: "desc" },
    select: { taxYear: true },
  });

  return imports.map((item) => item.taxYear);
}

export async function getRegisteredOwnersForCompany(
  orgNumber: string,
  taxYear: number,
  limit = 250,
): Promise<ShareholderRegisterHoldingRecord[]> {
  const rows = await prisma.shareholderRegisterHolding.findMany({
    where: {
      taxYear,
      issuerOrgNumber: orgNumber,
    },
    orderBy: [{ ownershipPercent: "desc" }, { numberOfShares: "desc" }],
    take: limit,
  });

  return rows.map(mapHolding);
}

export async function getRegisteredCompanyHoldings(
  shareholderOrgNumber: string,
  taxYear: number,
  limit = 250,
): Promise<ShareholderRegisterHoldingRecord[]> {
  const rows = await prisma.shareholderRegisterHolding.findMany({
    where: {
      taxYear,
      shareholderOrgNumber,
    },
    orderBy: [{ ownershipPercent: "desc" }, { numberOfShares: "desc" }],
    take: limit,
  });

  return rows.map(mapHolding);
}

function mapHolding(row: {
  taxYear: number;
  issuerOrgNumber: string;
  issuerName: string;
  shareClass: string | null;
  shareholderName: string;
  shareholderOrgNumber: string | null;
  shareholderBirthYear: number | null;
  shareholderType: "PERSON" | "COMPANY" | "UNKNOWN";
  postalCode: string | null;
  postalPlace: string | null;
  countryCode: string | null;
  numberOfShares: bigint;
  totalCompanyShares: bigint | null;
  ownershipPercent: { toString(): string } | null;
}): ShareholderRegisterHoldingRecord {
  return {
    taxYear: row.taxYear,
    issuerOrgNumber: row.issuerOrgNumber,
    issuerName: row.issuerName,
    shareClass: row.shareClass,
    shareholderName: row.shareholderName,
    shareholderOrgNumber: row.shareholderOrgNumber,
    shareholderBirthYear: row.shareholderBirthYear,
    shareholderType: row.shareholderType,
    postalCode: row.postalCode,
    postalPlace: row.postalPlace,
    countryCode: row.countryCode,
    numberOfShares: row.numberOfShares.toString(),
    totalCompanyShares: row.totalCompanyShares?.toString() ?? null,
    ownershipPercent: row.ownershipPercent?.toString() ?? null,
  };
}
