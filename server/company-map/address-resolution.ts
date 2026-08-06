export const COMPANY_MAP_ADDRESS_RESOLUTION_STATUSES = [
  "MATCHED",
  "NO_BUSINESS_ADDRESS",
  "INCOMPLETE_OR_INVALID",
  "NON_GEOGRAPHIC_ADDRESS",
  "NO_EXACT_MATCH",
  "AMBIGUOUS_EXACT_MATCH",
  "OUTSIDE_NORWAY",
  "PRIVACY_WITHHELD",
  "PENDING",
  "PROVIDER_FAILURE",
] as const;

export const COMPANY_MAP_ADDRESS_MATCHER_VERSION = "exact-business-address-v3";

export type CompanyMapAddressResolutionStatus =
  (typeof COMPANY_MAP_ADDRESS_RESOLUTION_STATUSES)[number];

export type ExactAddressKey = {
  municipalityNumber: string;
  normalizedAddressName: string;
  houseNumber: number;
  houseLetter: string | null;
  unitNumber: string | null;
};

export type BusinessAddressInput = {
  addressStreet: string | null;
  municipalityNumber: string | null;
  countryCode: string | null;
  organisationForm: string | null;
};

export type OfficialAddressCandidate = {
  officialAddressId: string;
  municipalityNumber: string;
  addressName: string;
  houseNumber: number;
  houseLetter: string | null;
  unitNumber: string | null;
  latitude: number;
  longitude: number;
};

export type BusinessAddressResolution =
  | { status: Exclude<CompanyMapAddressResolutionStatus, "MATCHED"> }
  | {
      status: "MATCHED";
      officialAddressId: string;
      latitude: number;
      longitude: number;
      key: ExactAddressKey;
    };

// Exact coordinates for sole proprietorships stay withheld until the DPIA has
// approved a broader, explicit organisation-form policy.
const PRIVACY_WITHHELD_ORGANISATION_FORMS = new Set(["ENK"]);
const NORWAY_COUNTRY_CODES = new Set(["NO", "NOR", "NORGE"]);
const NON_GEOGRAPHIC_ADDRESS_PATTERN = /^(?:POSTBOKS|POSTB\.?|PB\.?)\b/i;
const UNIT_PATTERN = /(?:^|[\s,])(H\d{4})(?:$|[\s,])/i;

export function normalizeAddressName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleUpperCase("nb-NO");
}

export function buildExactAddressKey(input: {
  municipalityNumber: string | null;
  addressStreet: string | null;
}): ExactAddressKey | null {
  const municipalityNumber = input.municipalityNumber?.trim();
  const addressStreet = input.addressStreet?.normalize("NFKC").trim();
  if (!municipalityNumber || !/^\d{4}$/.test(municipalityNumber) || !addressStreet) {
    return null;
  }

  const unitNumber = addressStreet.match(UNIT_PATTERN)?.[1]?.toLocaleUpperCase("nb-NO") ?? null;
  const match = addressStreet
    .split(",")
    .map((segment) => segment.trim())
    .reverse()
    .map((segment) => segment.match(/^(.+?)\s+(\d{1,5})(?:\s*([a-zæøå]))?$/i))
    .find((candidate) => candidate !== null);
  if (!match) return null;

  const houseNumber = Number(match[2]);
  if (!Number.isSafeInteger(houseNumber) || houseNumber < 1) return null;

  return {
    municipalityNumber,
    normalizedAddressName: normalizeAddressName(match[1]),
    houseNumber,
    houseLetter: match[3]?.toLocaleUpperCase("nb-NO") ?? null,
    unitNumber,
  };
}

function candidateMatchesKey(candidate: OfficialAddressCandidate, key: ExactAddressKey): boolean {
  return (
    candidate.municipalityNumber === key.municipalityNumber &&
    normalizeAddressName(candidate.addressName) === key.normalizedAddressName &&
    candidate.houseNumber === key.houseNumber &&
    (candidate.houseLetter?.toLocaleUpperCase("nb-NO") ?? null) === key.houseLetter &&
    (candidate.unitNumber?.toLocaleUpperCase("nb-NO") ?? null) === key.unitNumber &&
    Number.isFinite(candidate.latitude) &&
    Number.isFinite(candidate.longitude)
  );
}

export function resolveBusinessAddress(
  input: BusinessAddressInput,
  candidates: readonly OfficialAddressCandidate[],
): BusinessAddressResolution {
  const organisationForm = input.organisationForm?.trim().toLocaleUpperCase("nb-NO") ?? null;
  const countryCode = input.countryCode?.trim().toLocaleUpperCase("nb-NO") ?? null;
  if (countryCode && !NORWAY_COUNTRY_CODES.has(countryCode)) {
    return { status: "OUTSIDE_NORWAY" };
  }

  const addressStreet = input.addressStreet?.trim() ?? "";
  if (!addressStreet) return { status: "NO_BUSINESS_ADDRESS" };
  if (NON_GEOGRAPHIC_ADDRESS_PATTERN.test(addressStreet)) {
    return { status: "NON_GEOGRAPHIC_ADDRESS" };
  }

  const key = buildExactAddressKey(input);
  if (!key) return { status: "INCOMPLETE_OR_INVALID" };

  const exactMatches = candidates.filter((candidate) => candidateMatchesKey(candidate, key));
  if (exactMatches.length === 0) return { status: "NO_EXACT_MATCH" };
  if (exactMatches.length > 1) return { status: "AMBIGUOUS_EXACT_MATCH" };
  if (organisationForm && PRIVACY_WITHHELD_ORGANISATION_FORMS.has(organisationForm)) {
    return { status: "PRIVACY_WITHHELD" };
  }

  const match = exactMatches[0];
  return {
    status: "MATCHED",
    officialAddressId: match.officialAddressId,
    latitude: match.latitude,
    longitude: match.longitude,
    key,
  };
}
