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

/**
 * Split one Skatteetaten aksjeeiebok row.
 *
 * The format is semicolon-delimited with no quoting mechanism: a double quote is an ordinary
 * character inside Baltic company names (`UAB "ERA CAPITAL"`, `SIA "MB CAPITAL"`). Verified
 * against aksjeeiebok_2025.csv, where all 3 089 374 lines split into exactly nine fields on ";".
 *
 * Treating `"` as a quote delimiter was therefore pure loss: balanced names silently lost their
 * quotes, and a name with an odd number of quotes swallowed the following ";", collapsing the
 * row into too few fields so it was discarded as malformed.
 */
export function splitShareholderRegisterCsvLine(line: string) {
  return line.split(";").map((value) => value.trim());
}

/**
 * Fold surplus fields back into the address column.
 *
 * The register is unescaped, so a handful of foreign addresses contain the delimiter itself
 * (`S-51, Tranemo; Sverige`) and split into more fields than the header declares. The row is
 * still unambiguous: the address is the only free-text column, every column before it and
 * after it is fixed, so the leading fields anchor from the left and the trailing fields from
 * the right and the surplus in between can only belong to the address.
 *
 * Rows with the declared field count pass through untouched. Rejoining loses the whitespace
 * that followed the embedded delimiter, which affects the address string only. If the anchor
 * were ever wrong the share count would not parse and the row is rejected as before, so this
 * recovers rows without widening what counts as valid.
 */
export function reconcileSurplusCsvFields(
  values: string[],
  columnCount: number,
  addressIndex: number,
) {
  const trailingCount = columnCount - addressIndex - 1;
  if (values.length <= columnCount || addressIndex < 0 || trailingCount < 0) {
    return values;
  }

  return [
    ...values.slice(0, addressIndex),
    values.slice(addressIndex, values.length - trailingCount).join(";"),
    ...values.slice(values.length - trailingCount),
  ];
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
    .filter(([key, index]) => key !== "shareClass" && index < 0)
    .map(([key]) => key);

  return { headers, indexes, missing, normalized };
}
