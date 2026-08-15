import type {
  CompanyGridConnectionOverview,
  CompanyGridConnectionProfile,
  GridConnectionRecord,
} from "@/lib/types";

const LEGAL_FORM_TOKENS = new Set(["as", "asa", "ans", "ba", "da", "sa", "nuf", "kf", "iks", "sf", "fkf"]);
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
  void input;
  return {
    records: [],
    overview: buildCompanyGridConnectionOverview([]),
    availability: {
      available: false,
      reliable: false,
      sourceSystem: "STATNETT",
      sourceUrl: null,
      message: "Statnett-data er ikke lastet inn i det lokale datasettet ennå.",
    },
  };
}
