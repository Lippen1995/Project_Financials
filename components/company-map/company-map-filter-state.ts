import {
  COMPANY_MAP_RANGE_KEYS,
  type CompanyMapRangeKey,
} from "@/lib/company-map";

export type CompanyMapStatus = "ACTIVE" | "DISSOLVED" | "BANKRUPT";
export type CompanyMapOrganisationForms = "AS,ASA" | "ALL";
export type CompanyMapRangeInput = { min: string; max: string };

export type CompanyMapFilterState = {
  search: string;
  county: string;
  organisationForms: CompanyMapOrganisationForms;
  companyStatuses: CompanyMapStatus[];
  onlyGroupMembers: boolean;
  requirePublishedFinancials: boolean;
  ranges: Record<CompanyMapRangeKey, CompanyMapRangeInput>;
};

/**
 * The panel's numeric filters, in the order the design lists them. Money is entered in thousands
 * because that is how Norwegian accounts are read; the scale is applied once, on the way out.
 */
export const COMPANY_MAP_RANGE_FIELDS: Array<{
  key: CompanyMapRangeKey;
  label: string;
  unit: string;
  scale: number;
}> = [
  { key: "revenue", label: "Omsetning", unit: "1 000 kr", scale: 1_000 },
  { key: "ebit", label: "EBIT", unit: "1 000 kr", scale: 1_000 },
  { key: "equity", label: "Egenkapital", unit: "1 000 kr", scale: 1_000 },
  { key: "totalAssets", label: "Sum eiendeler", unit: "1 000 kr", scale: 1_000 },
  { key: "ebitMargin", label: "EBIT-margin", unit: "%", scale: 1 },
  {
    key: "returnOnEquity",
    label: "Egenkapitalavkastning",
    unit: "%",
    scale: 1,
  },
  { key: "equityRatio", label: "Egenkapitalandel", unit: "%", scale: 1 },
  { key: "employees", label: "Ansatte", unit: "", scale: 1 },
];

export const COMPANY_MAP_STATUS_LABELS: Record<CompanyMapStatus, string> = {
  ACTIVE: "Aktiv",
  DISSOLVED: "Avviklet",
  BANKRUPT: "Konkurs",
};

export const COMPANY_MAP_METRIC_OPTIONS = [
  ["revenue", "Omsetning"],
  ["ebit", "EBIT"],
  ["preTaxProfit", "Resultat før skatt"],
  ["netIncome", "Årsresultat"],
  ["equity", "Egenkapital"],
  ["totalAssets", "Sum eiendeler"],
  ["employees", "Ansatte"],
] as const;

export type CompanyMapMetric = (typeof COMPANY_MAP_METRIC_OPTIONS)[number][0];

const EMPTY_RANGE: CompanyMapRangeInput = { min: "", max: "" };

export function createDefaultCompanyMapFilters(): CompanyMapFilterState {
  return {
    search: "",
    county: "",
    organisationForms: "AS,ASA",
    companyStatuses: ["ACTIVE"],
    onlyGroupMembers: false,
    requirePublishedFinancials: false,
    ranges: Object.fromEntries(
      COMPANY_MAP_RANGE_KEYS.map((key) => [key, { ...EMPTY_RANGE }]),
    ) as Record<CompanyMapRangeKey, CompanyMapRangeInput>,
  };
}

function rangeScale(key: CompanyMapRangeKey) {
  return COMPANY_MAP_RANGE_FIELDS.find((field) => field.key === key)?.scale ?? 1;
}

function scaledBound(value: string, key: CompanyMapRangeKey) {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  const scale = rangeScale(key);
  return scale === 1 ? parsed : Math.round(parsed * scale);
}

function activeRangeKeys(filters: CompanyMapFilterState) {
  return COMPANY_MAP_RANGE_KEYS.filter((key) => {
    const range = filters.ranges[key];
    return scaledBound(range.min, key) !== null || scaledBound(range.max, key) !== null;
  });
}

/**
 * One place decides which filters reach the server, so the map, the counters and the ranked list
 * are always looking at the same universe.
 */
export function buildCompanyMapFilterParams(filters: CompanyMapFilterState) {
  const params = new URLSearchParams({
    organisationForms: filters.organisationForms,
    companyStatuses: [...filters.companyStatuses].sort().join(","),
  });
  const search = filters.search.trim();
  if (search) params.set("search", search);
  if (filters.county) params.set("counties", filters.county);
  if (filters.onlyGroupMembers) params.set("onlyGroupMembers", "true");
  if (filters.requirePublishedFinancials) {
    params.set("requirePublishedFinancials", "true");
  }
  for (const key of COMPANY_MAP_RANGE_KEYS) {
    const range = filters.ranges[key];
    const min = scaledBound(range.min, key);
    const max = scaledBound(range.max, key);
    if (min !== null) params.set(`${key}Min`, String(min));
    if (max !== null) params.set(`${key}Max`, String(max));
  }
  return params;
}

/** What the "Flere filtre" badge counts: filter groups moved away from their default. */
export function countActiveCompanyMapFilters(filters: CompanyMapFilterState) {
  const defaults = createDefaultCompanyMapFilters();
  let count = activeRangeKeys(filters).length;
  if (filters.organisationForms !== defaults.organisationForms) count += 1;
  if (
    [...filters.companyStatuses].sort().join(",") !==
    [...defaults.companyStatuses].sort().join(",")
  ) {
    count += 1;
  }
  if (filters.onlyGroupMembers) count += 1;
  if (filters.requirePublishedFinancials) count += 1;
  return count;
}
