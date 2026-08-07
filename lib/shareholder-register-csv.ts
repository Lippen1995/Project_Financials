export type ShareholderRegisterCsvIndexes = {
  issuerOrgNumber: number;
  issuerName: number;
  shareClass: number;
  shareholderName: number;
  shareholderIdentifier: number;
  postal: number;
  countryCode: number;
  numberOfShares: number;
  totalCompanyShares: number;
};

export const SHAREHOLDER_REGISTER_CSV_FIELD_COUNT = 9;

export function hasExpectedShareholderRegisterCsvFieldCount(values: readonly string[]) {
  return values.length === SHAREHOLDER_REGISTER_CSV_FIELD_COUNT;
}

export function splitShareholderRegisterCsvLine(line: string) {
  // Skatteetaten's shareholder-register export is a fixed semicolon-delimited format,
  // not an RFC 4180 CSV file. Quote characters occur literally in a few names and must
  // not change where a field ends.
  return line.split(";").map((value) => value.trim());
}

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\u00e6/g, "ae")
    .replace(/\u00f8/g, "o")
    .replace(/\u00e5/g, "a")
    .normalize("NFKD")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseShareholderRegisterCsvHeader(line: string) {
  const headers = splitShareholderRegisterCsvLine(line);
  const normalized = headers.map(normalizeHeader);
  const indexes: ShareholderRegisterCsvIndexes = {
    issuerOrgNumber: normalized.indexOf("orgnr"),
    issuerName: normalized.indexOf("selskap"),
    shareClass: normalized.indexOf("aksjeklasse"),
    shareholderName: normalized.indexOf("navn_aksjonaer"),
    shareholderIdentifier: normalized.indexOf("fodselsar_orgnr"),
    postal: normalized.indexOf("postnr_sted"),
    countryCode: normalized.indexOf("landkode"),
    numberOfShares: normalized.indexOf("antall_aksjer"),
    totalCompanyShares: normalized.indexOf("antall_aksjer_selskap"),
  };
  const missing = Object.entries(indexes)
    .filter(([, index]) => index < 0)
    .map(([key]) => key);

  return {
    headers,
    indexes,
    missing,
    normalized,
    hasExpectedFieldCount: hasExpectedShareholderRegisterCsvFieldCount(headers),
  };
}
