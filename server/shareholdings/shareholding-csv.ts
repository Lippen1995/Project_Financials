import crypto from "node:crypto";

import {
  ParsedShareholdingRow,
  ShareholdingColumnMapping,
  ShareholdingImportValidationError,
} from "@/server/shareholdings/types";

const DEFAULT_ALIASES: Record<keyof ShareholdingColumnMapping, string[]> = {
  issuerOrgNumber: ["selskap_orgnr", "issuer_org_number", "organisasjonsnummer", "orgnr", "selskaporgnr"],
  issuerName: ["selskap_navn", "issuer_name", "selskapsnavn", "company_name"],
  shareholderName: ["aksjonaer_navn", "shareholder_name", "aksjonaernavn", "navn"],
  shareholderIdentifier: ["aksjonaer_identifikator", "shareholder_identifier", "identifikator", "id", "orgnr_eller_fnr"],
  birthYear: ["foedselsaar", "fodselsaar", "birth_year"],
  postalCode: ["postnummer", "postal_code"],
  postalPlace: ["poststed", "postal_place"],
  shareClass: ["aksjeklasse", "share_class", "klasse"],
  numberOfShares: ["antall_aksjer", "number_of_shares", "aksjer", "antall"],
  totalShares: ["totalt_antall_aksjer", "total_shares", "totaltaksjer", "sum_aksjer"],
};

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function splitCsvLine(line: string, delimiter: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === delimiter && !quoted) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function detectDelimiter(firstLine: string) {
  const candidates = [";", ",", "\t"];
  const counts = candidates.map((candidate) => ({
    delimiter: candidate,
    count: splitCsvLine(firstLine, candidate).length,
  }));

  return counts.sort((left, right) => right.count - left.count)[0]?.delimiter ?? ";";
}

function resolveHeaderIndex(
  headers: string[],
  key: keyof ShareholdingColumnMapping,
  explicit?: string,
) {
  if (explicit) {
    const normalizedExplicit = normalizeHeader(explicit);
    const index = headers.findIndex((header) => normalizeHeader(header) === normalizedExplicit);
    if (index >= 0) {
      return index;
    }
  }

  return headers.findIndex((header) => DEFAULT_ALIASES[key].includes(normalizeHeader(header)));
}

function parseBigIntSafe(value?: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (!normalized) {
    return null;
  }

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return BigInt(Math.trunc(numeric));
}

export function checksumRawText(rawText: string) {
  return crypto.createHash("sha256").update(rawText).digest("hex");
}

export function parseShareholdingCsv(
  rawText: string,
  columnMapping?: ShareholdingColumnMapping,
): { rows: ParsedShareholdingRow[]; errors: ShareholdingImportValidationError[] } {
  const errors: ShareholdingImportValidationError[] = [];
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      rows: [],
      errors: [{ stage: "parse", message: "Kilden inneholder ingen rader." }],
    };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter);
  const headerIndexes = {
    issuerOrgNumber: resolveHeaderIndex(headers, "issuerOrgNumber", columnMapping?.issuerOrgNumber),
    issuerName: resolveHeaderIndex(headers, "issuerName", columnMapping?.issuerName),
    shareholderName: resolveHeaderIndex(headers, "shareholderName", columnMapping?.shareholderName),
    shareholderIdentifier: resolveHeaderIndex(headers, "shareholderIdentifier", columnMapping?.shareholderIdentifier),
    birthYear: resolveHeaderIndex(headers, "birthYear", columnMapping?.birthYear),
    postalCode: resolveHeaderIndex(headers, "postalCode", columnMapping?.postalCode),
    postalPlace: resolveHeaderIndex(headers, "postalPlace", columnMapping?.postalPlace),
    shareClass: resolveHeaderIndex(headers, "shareClass", columnMapping?.shareClass),
    numberOfShares: resolveHeaderIndex(headers, "numberOfShares", columnMapping?.numberOfShares),
    totalShares: resolveHeaderIndex(headers, "totalShares", columnMapping?.totalShares),
  };

  if (headerIndexes.shareholderName < 0 || headerIndexes.numberOfShares < 0) {
    return {
      rows: [],
      errors: [
        {
          stage: "parse",
          message:
            "Fant ikke paakrevde kolonner for aksjonaernavn og antall aksjer. Oppgi column mapping eller bruk en fil med header.",
          payload: { headers },
        },
      ],
    };
  }

  const rows: ParsedShareholdingRow[] = [];
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const values = splitCsvLine(lines[lineIndex], delimiter);
    const raw = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const shareholderName = values[headerIndexes.shareholderName]?.trim();

    if (!shareholderName) {
      errors.push({
        stage: "parse",
        rowNumber: lineIndex + 1,
        message: "Mangler aksjonaernavn.",
        payload: raw,
      });
      continue;
    }

    const numberOfShares = parseBigIntSafe(values[headerIndexes.numberOfShares]);
    if (numberOfShares === null) {
      errors.push({
        stage: "parse",
        rowNumber: lineIndex + 1,
        message: "Mangler eller ugyldig antall aksjer.",
        payload: raw,
      });
      continue;
    }

    rows.push({
      rowNumber: lineIndex + 1,
      issuerOrgNumber:
        headerIndexes.issuerOrgNumber >= 0 ? values[headerIndexes.issuerOrgNumber]?.trim() || null : null,
      issuerName:
        headerIndexes.issuerName >= 0 ? values[headerIndexes.issuerName]?.trim() || null : null,
      shareholderName,
      shareholderIdentifier:
        headerIndexes.shareholderIdentifier >= 0
          ? values[headerIndexes.shareholderIdentifier]?.trim() || null
          : null,
      birthYear:
        headerIndexes.birthYear >= 0 && values[headerIndexes.birthYear]
          ? Number.parseInt(values[headerIndexes.birthYear], 10) || null
          : null,
      postalCode: headerIndexes.postalCode >= 0 ? values[headerIndexes.postalCode]?.trim() || null : null,
      postalPlace:
        headerIndexes.postalPlace >= 0 ? values[headerIndexes.postalPlace]?.trim() || null : null,
      shareClass: headerIndexes.shareClass >= 0 ? values[headerIndexes.shareClass]?.trim() || null : null,
      numberOfShares,
      totalShares:
        headerIndexes.totalShares >= 0 ? parseBigIntSafe(values[headerIndexes.totalShares]) : null,
      raw,
    });
  }

  return { rows, errors };
}
