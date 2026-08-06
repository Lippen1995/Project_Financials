import { prisma } from "@/lib/prisma";
import { getGroupStructure } from "@/server/ownership/group-structure-service";
import { classifyRelationship, type OwnershipRelationship } from "@/server/ownership/ownership-thresholds";
import type { GroupStructure } from "@/server/ownership/types";
import type { CompanyProfile, DataAvailability, NormalizedCompany } from "@/lib/types";

async function getRegisterHoldingAvailableYears(): Promise<number[]> {
  const rows = await prisma.$queryRaw<Array<{ taxYear: number }>>`
    SELECT DISTINCT import."taxYear"
    FROM "ShareholderRegisterImport" import
    WHERE import."status" IN ('COMPLETED', 'PARTIAL')
      AND EXISTS (
        SELECT 1 FROM "ShareholderRegisterHolding" holding
        WHERE holding."importId" = import."id"
      )
    ORDER BY import."taxYear" DESC
  `;
  return rows.map((row) => row.taxYear);
}

async function getOwnershipSourceForYear(
  taxYear: number,
): Promise<{
  importId: string;
  status: "COMPLETED" | "PARTIAL";
  hasGroupPublication: boolean;
} | null> {
  const publication = await prisma.groupRelationshipPublication.findFirst({
    where: { taxYear, sourceImportStatus: "COMPLETED" },
    select: { sourceImportId: true },
  });
  if (publication) {
    const publishedImport = await prisma.shareholderRegisterImport.findFirst({
      where: {
        id: publication.sourceImportId,
        status: "COMPLETED",
        holdings: { some: {} },
      },
      select: { id: true },
    });
    if (publishedImport) {
      return {
        importId: publishedImport.id,
        status: "COMPLETED",
        hasGroupPublication: true,
      };
    }
  }
  const sourceImport = await prisma.shareholderRegisterImport.findFirst({
    where: {
      taxYear,
      status: { in: ["COMPLETED", "PARTIAL"] },
      holdings: { some: {} },
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, status: true },
  });
  if (!sourceImport || (sourceImport.status !== "COMPLETED" && sourceImport.status !== "PARTIAL")) {
    return null;
  }
  return {
    importId: sourceImport.id,
    status: sourceImport.status,
    hasGroupPublication: false,
  };
}

/** A company profile shaped like getCompanyProfile's result, for the company page. */
export type RegisterBackedProfile = CompanyProfile & { companyDbId: string | null };

export type DirectShareholder = {
  type: "PERSON" | "COMPANY" | "UNKNOWN";
  orgNumber: string | null;
  name: string;
  birthYear: number | null;
  postalPlace: string | null;
  countryCode: string | null;
  shares: string;
  ownershipPercent: number | null;
};

export type CompanyHolding = {
  orgNumber: string;
  name: string;
  shares: string;
  ownershipPercent: number | null;
  relationship: OwnershipRelationship | "FINANCIAL_POSITION";
};

export type OwnershipOverview = {
  orgNumber: string;
  companyName: string;
  year: number | null;
  availableYears: number[];
  sourceImportStatus: "COMPLETED" | "PARTIAL" | null;
  group: GroupStructure | null;
  directShareholders: DirectShareholder[];
  holdings: CompanyHolding[];
  availabilityMessage: string | null;
};

const LIST_LIMIT = 200;

/**
 * Resolve a company's display name from the register when it is not in the local
 * Company table. The register names every issuer and corporate owner, so ownership
 * works for any registered company — not only the ones already fetched from BRREG.
 */
export async function resolveCompanyNameFromRegister(orgNumber: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT "issuerName" AS name
    FROM "ShareholderRegisterHolding"
    WHERE "issuerOrgNumber" = ${orgNumber}
    ORDER BY "taxYear" DESC
    LIMIT 1
  `;
  if (rows[0]?.name) {
    return rows[0].name;
  }
  const asOwner = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT "shareholderName" AS name
    FROM "ShareholderRegisterHolding"
    WHERE "shareholderOrgNumber" = ${orgNumber}
    ORDER BY "taxYear" DESC
    LIMIT 1
  `;
  return asOwner[0]?.name ?? null;
}

/**
 * Build a minimal company profile from the local shareholder register for companies that
 * are not (yet) in the Company table. Lets the ownership drill-through resolve any company
 * straight from the local database — no on-demand BRREG call. Other tabs (regnskap, roller)
 * report "ikke tilgjengelig" until the Company database is populated for this org.
 *
 * Returns null if the org number is unknown to the register too.
 */
export async function getRegisterBackedCompanyProfile(
  orgNumber: string,
): Promise<RegisterBackedProfile | null> {
  const name = await resolveCompanyNameFromRegister(orgNumber);
  if (!name) {
    return null;
  }

  const now = new Date();
  const company: NormalizedCompany = {
    orgNumber,
    name,
    slug: orgNumber,
    legalForm: null,
    status: "ACTIVE",
    addresses: [],
    sourceSystem: "SKATTEETATEN_CSV",
    sourceEntityType: "shareholder_register_row",
    sourceId: orgNumber,
    fetchedAt: now,
    normalizedAt: now,
  };

  const notLoaded = (message: string): DataAvailability => ({
    available: false,
    sourceSystem: "DATABASE",
    message,
  });

  return {
    company,
    companyDbId: null,
    roles: [],
    rolesAvailability: notLoaded(
      "Roller er ikke lastet inn i databasen for dette selskapet ennå.",
    ),
    financialStatements: [],
    financialStatementsAllScopes: [],
    financialLineItems: [],
    financialDocuments: [],
    financialsAvailability: notLoaded(
      "Regnskap er ikke lastet inn i databasen for dette selskapet ennå. Eierskapsdata er tilgjengelig fra aksjonærregisteret.",
    ),
    regulatoryAvailability: notLoaded("Ikke tilgjengelig."),
  };
}

/**
 * Direct shareholders of a company, aggregated across share classes so each
 * person/company appears once with a correct total ownership percentage.
 */
async function getDirectShareholders(
  orgNumber: string,
  year: number,
  importId: string,
): Promise<DirectShareholder[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      type: string;
      orgNumber: string | null;
      name: string;
      birthYear: number | null;
      postalPlace: string | null;
      countryCode: string | null;
      shares: bigint;
      ownershipPercent: number | null;
    }>
  >`
    SELECT
      "shareholderType"::text AS "type",
      "shareholderOrgNumber" AS "orgNumber",
      max("shareholderName") AS "name",
      "shareholderBirthYear" AS "birthYear",
      max("postalPlace") AS "postalPlace",
      max("countryCode") AS "countryCode",
      sum("numberOfShares")::bigint AS "shares",
      CASE
        WHEN max("totalCompanyShares") IS NULL OR max("totalCompanyShares") = 0 THEN NULL
        WHEN sum("numberOfShares")::numeric * 100 / max("totalCompanyShares")::numeric > 150 THEN NULL
        ELSE round(least(sum("numberOfShares")::numeric * 100 / max("totalCompanyShares")::numeric, 100), 4)::float8
      END AS "ownershipPercent"
    FROM "ShareholderRegisterHolding"
    WHERE "taxYear" = ${year}
      AND "importId" = ${importId}
      AND "issuerOrgNumber" = ${orgNumber}
    GROUP BY
      "shareholderType",
      "shareholderOrgNumber",
      "shareholderBirthYear",
      (CASE WHEN "shareholderOrgNumber" IS NULL THEN "shareholderName" ELSE NULL END)
    ORDER BY "shares" DESC
    LIMIT ${LIST_LIMIT}
  `;

  return rows.map((row) => ({
    type: (row.type as DirectShareholder["type"]) ?? "UNKNOWN",
    orgNumber: row.orgNumber,
    name: row.name,
    birthYear: row.birthYear,
    postalPlace: row.postalPlace,
    countryCode: row.countryCode,
    shares: row.shares.toString(),
    ownershipPercent: row.ownershipPercent,
  }));
}

/** Companies this company holds shares in, aggregated across share classes. */
async function getDirectHoldings(
  orgNumber: string,
  year: number,
  importId: string,
): Promise<CompanyHolding[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      orgNumber: string;
      name: string;
      shares: bigint;
      ownershipPercent: number | null;
      semanticRelationship: string | null;
    }>
  >`
    SELECT
      holding."issuerOrgNumber" AS "orgNumber",
      max(holding."issuerName") AS "name",
      sum(holding."numberOfShares")::bigint AS "shares",
      CASE
        WHEN max(holding."totalCompanyShares") IS NULL OR max(holding."totalCompanyShares") = 0 THEN NULL
        WHEN sum(holding."numberOfShares")::numeric * 100 / max(holding."totalCompanyShares")::numeric > 150 THEN NULL
        ELSE round(least(sum(holding."numberOfShares")::numeric * 100 / max(holding."totalCompanyShares")::numeric, 100), 4)::float8
      END AS "ownershipPercent",
      max(semantic."relationship"::text) AS "semanticRelationship"
    FROM "ShareholderRegisterHolding" holding
    LEFT JOIN "GroupRelationshipPublication" publication
      ON publication."taxYear" = holding."taxYear"
     AND publication."sourceImportStatus" = 'COMPLETED'
     AND publication."sourceImportId" = holding."importId"
    LEFT JOIN "GroupRelationshipSnapshot" semantic
      ON semantic."buildId" = publication."buildId"
     AND semantic."taxYear" = holding."taxYear"
     AND semantic."issuerOrgNumber" = holding."issuerOrgNumber"
     AND semantic."ownerOrgNumber" = holding."shareholderOrgNumber"
    WHERE holding."taxYear" = ${year}
      AND holding."importId" = ${importId}
      AND holding."shareholderOrgNumber" = ${orgNumber}
    GROUP BY holding."issuerOrgNumber"
    ORDER BY "ownershipPercent" DESC NULLS LAST, "shares" DESC
    LIMIT ${LIST_LIMIT}
  `;

  return rows.map((row) => ({
    orgNumber: row.orgNumber,
    name: row.name,
    shares: row.shares.toString(),
    ownershipPercent: row.ownershipPercent,
    relationship:
      row.semanticRelationship === "FINANCIAL_POSITION"
        ? "FINANCIAL_POSITION"
        : classifyRelationship(row.ownershipPercent),
  }));
}

/**
 * Assemble everything the Eierskap tab needs: the group (konsern) tree, the direct
 * shareholder list, and the company's own holdings — for a single tax year.
 */
export async function getCompanyOwnershipOverview(params: {
  orgNumber: string;
  companyName?: string | null;
  requestedYear?: number;
}): Promise<OwnershipOverview> {
  const { orgNumber } = params;
  // Raw holdings remain useful evidence even when no complete semantic group publication exists.
  const availableYears = await getRegisterHoldingAvailableYears();
  const year =
    params.requestedYear !== undefined && availableYears.includes(params.requestedYear)
      ? params.requestedYear
      : availableYears[0] ?? null;
  const companyName =
    params.companyName ?? (await resolveCompanyNameFromRegister(orgNumber)) ?? orgNumber;

  if (year === null) {
    return {
      orgNumber,
      companyName,
      year: null,
      availableYears,
      sourceImportStatus: null,
      group: null,
      directShareholders: [],
      holdings: [],
      availabilityMessage:
        "Eierskapsdata er ikke tilgjengelig ennå. Aksjonærregisteret må importeres og eierskapskanter bygges.",
    };
  }

  const source = await getOwnershipSourceForYear(year);
  if (!source) {
    return {
      orgNumber,
      companyName,
      year: null,
      availableYears,
      sourceImportStatus: null,
      group: null,
      directShareholders: [],
      holdings: [],
      availabilityMessage: "Ingen sporbar aksjonærregisterimport er tilgjengelig for valgt år.",
    };
  }

  const [group, directShareholders, holdings] = await Promise.all([
    source.hasGroupPublication
      ? getGroupStructure({ orgNumber, year, currentName: companyName })
      : Promise.resolve(null),
    getDirectShareholders(orgNumber, year, source.importId),
    getDirectHoldings(orgNumber, year, source.importId),
  ]);

  const hasAnyData =
    (group?.nodes.length ?? 0) > 1 || directShareholders.length > 0 || holdings.length > 0;

  return {
    orgNumber,
    companyName,
    year,
    availableYears,
    sourceImportStatus: source.status,
    group,
    directShareholders,
    holdings,
    availabilityMessage: hasAnyData
      ? null
      : `Ingen registrerte eierskapsrelasjoner for ${companyName} i skatteåret ${year}.`,
  };
}
