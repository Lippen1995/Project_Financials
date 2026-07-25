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

export function splitShareholderRegisterCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"') {
      if (quoted && nextCharacter === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === ";" && !quoted) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);
  return values.map((value) => value.trim());
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
