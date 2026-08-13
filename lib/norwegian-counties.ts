/**
 * Fylke codes as they stand after the 2024 county split. The published company-map snapshot only
 * carries Brønnøysundregistrene's municipality number, and its first two digits are the county
 * number, so county filtering is a prefix match rather than a separate registry lookup.
 */
export const NORWEGIAN_COUNTIES = [
  { code: "03", name: "Oslo" },
  { code: "11", name: "Rogaland" },
  { code: "15", name: "Møre og Romsdal" },
  { code: "18", name: "Nordland" },
  { code: "21", name: "Svalbard" },
  { code: "31", name: "Østfold" },
  { code: "32", name: "Akershus" },
  { code: "33", name: "Buskerud" },
  { code: "34", name: "Innlandet" },
  { code: "39", name: "Vestfold" },
  { code: "40", name: "Telemark" },
  { code: "42", name: "Agder" },
  { code: "46", name: "Vestland" },
  { code: "50", name: "Trøndelag" },
  { code: "55", name: "Troms" },
  { code: "56", name: "Finnmark" },
] as const;

export type NorwegianCountyCode = (typeof NORWEGIAN_COUNTIES)[number]["code"];

const countyNameByCode = new Map<string, string>(
  NORWEGIAN_COUNTIES.map((county) => [county.code, county.name]),
);

export function isNorwegianCountyCode(
  value: string,
): value is NorwegianCountyCode {
  return countyNameByCode.has(value);
}

export function countyCodeForMunicipalityNumber(
  municipalityNumber: string | null | undefined,
): NorwegianCountyCode | null {
  if (!municipalityNumber) return null;
  const code = municipalityNumber.padStart(4, "0").slice(0, 2);
  return isNorwegianCountyCode(code) ? code : null;
}

export function countyNameForMunicipalityNumber(
  municipalityNumber: string | null | undefined,
): string | null {
  const code = countyCodeForMunicipalityNumber(municipalityNumber);
  return code ? (countyNameByCode.get(code) ?? null) : null;
}
