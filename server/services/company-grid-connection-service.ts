import { StatnettGridConnectionProvider } from "@/integrations/statnett/statnett-grid-connection-provider";
import { logRecoverableError } from "@/lib/recoverable-error";
import {
  CompanyGridConnectionOverview,
  CompanyGridConnectionProfile,
  GridConnectionRecord,
} from "@/lib/types";

const provider = new StatnettGridConnectionProvider();

// The public Statnett feed carries no organisation number, so a case can only be tied to a
// company by name. Legal forms are ignored and the distinctive tokens are compared as a set, so
// "Nord Kraft AS" matches "Nord Kraft AS" but NOT the separate entity "Nord Kraft Holding AS".
const LEGAL_FORM_TOKENS = new Set(["as", "asa", "ans", "ba", "da", "sa", "nuf", "kf", "iks", "sf", "fkf"]);

// Curated equivalences for companies whose register name and Statnett name differ by a corporate
// prefix/suffix (e.g. register "Nscale" appears as "Aker Nscale AS"). Each group lists distinctive
// tokens that denote the same entity; a company and a case match when both carry a token from the
// same group. Kept deliberately narrow to avoid false attributions.
const ALIAS_GROUPS: string[][] = [["nscale"]];

function normalizeCompanyName(value: string | null | undefined) {
  return value?.toLowerCase().replace(/\s+/g, " ").replace(/[.,]/g, "").trim() ?? "";
}

function coreTokens(value: string | null | undefined) {
  return new Set(
    normalizeCompanyName(value)
      .split(" ")
      .filter((token) => token && !LEGAL_FORM_TOKENS.has(token)),
  );
}

function sameTokenSet(a: Set<string>, b: Set<string>) {
  return a.size > 0 && a.size === b.size && [...a].every((token) => b.has(token));
}

function shareAliasGroup(a: Set<string>, b: Set<string>) {
  return ALIAS_GROUPS.some((group) => group.some((token) => a.has(token)) && group.some((token) => b.has(token)));
}

function namesMatch(companyName: string, candidate: string | null) {
  if (!candidate) return false;

  const company = normalizeCompanyName(companyName);
  const other = normalizeCompanyName(candidate);
  if (company && company === other) return true;

  const companyTokens = coreTokens(companyName);
  const candidateTokens = coreTokens(candidate);
  return sameTokenSet(companyTokens, candidateTokens) || shareAliasGroup(companyTokens, candidateTokens);
}

export function buildCompanyGridConnectionOverview(records: GridConnectionRecord[]): CompanyGridConnectionOverview {
  return records.reduce(
    (overview, record) => {
      overview.totalCapacityMw += record.capacityMw;

      if (record.status === "QUEUE") {
        overview.queueCapacityMw += record.capacityMw;
        overview.queueCount += 1;
      }

      if (record.status === "RESERVED") {
        overview.reservedCapacityMw += record.capacityMw;
        overview.reservedCount += 1;
      }

      if (record.status === "CONNECTED") {
        overview.connectedCapacityMw += record.capacityMw;
        overview.connectedCount += 1;
      }

      return overview;
    },
    {
      totalCapacityMw: 0,
      queueCapacityMw: 0,
      reservedCapacityMw: 0,
      connectedCapacityMw: 0,
      queueCount: 0,
      reservedCount: 0,
      connectedCount: 0,
    },
  );
}

export function filterGridConnectionsForCompany(input: {
  records: GridConnectionRecord[];
  orgNumber: string;
  companyName: string;
}) {
  return input.records.filter((record) => {
    if (record.companyOrgNumber && record.companyOrgNumber === input.orgNumber) return true;
    const candidateNames = record.matchNames?.length ? record.matchNames : [record.companyName];
    return candidateNames.some((name) => namesMatch(input.companyName, name));
  });
}

export async function getCompanyGridConnectionProfile(input: {
  orgNumber: string;
  companyName: string;
}): Promise<CompanyGridConnectionProfile> {
  try {
    const allRecords = await provider.listGridConnections();
    const records = filterGridConnectionsForCompany({
      records: allRecords,
      orgNumber: input.orgNumber,
      companyName: input.companyName,
    });

    return {
      records,
      overview: buildCompanyGridConnectionOverview(records),
      availability: {
        available: records.length > 0,
        reliable: true,
        sourceSystem: "STATNETT",
        sourceUrl: records[0]?.sourceUrl ?? null,
        message:
          records.length > 0
            ? "Offentlige Statnett-saker er matchet mot selskapet på navn (kilden oppgir ikke organisasjonsnummer)."
            : allRecords.length > 0
              ? "Ingen offentlige Statnett-saker kunne matches mot selskapet."
              : "Fant ingen offentlige Statnett-saker for nettkø eller reservasjon akkurat nå.",
      },
    };
  } catch (error) {
    logRecoverableError("company-grid-connection-service.getCompanyGridConnectionProfile", error, input);
    return {
      records: [],
      overview: buildCompanyGridConnectionOverview([]),
      availability: {
        available: false,
        reliable: false,
        sourceSystem: "STATNETT",
        sourceUrl: null,
        message: "Statnett-data for nettilknytning kunne ikke hentes akkurat nå.",
      },
    };
  }
}
