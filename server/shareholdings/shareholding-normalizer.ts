import crypto from "node:crypto";

import { ShareholderType } from "@/lib/types";
import {
  NormalizedShareholdingRow,
  ParsedShareholdingRow,
  ShareholdingImportValidationError,
  ShareholdingOwnershipAggregate,
} from "@/server/shareholdings/types";

function normalizeName(name: string) {
  return name
    .trim()
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferShareholderType(row: ParsedShareholdingRow): ShareholderType {
  if (row.shareholderIdentifier && /^\d{9}$/.test(row.shareholderIdentifier)) {
    return "COMPANY";
  }

  if (row.birthYear || (row.shareholderIdentifier && /^\d{6,11}$/.test(row.shareholderIdentifier))) {
    return "PERSON";
  }

  if (/\bAS|ASA|ANS|DA|NUF|SA|BA\b/i.test(row.shareholderName)) {
    return "COMPANY";
  }

  return "UNKNOWN";
}

function createFingerprint(row: {
  shareholderName: string;
  type: ShareholderType;
  shareholderIdentifier?: string | null;
  birthYear?: number | null;
  postalCode?: string | null;
  postalPlace?: string | null;
}) {
  const seed = [
    row.type,
    normalizeName(row.shareholderName),
    row.shareholderIdentifier ?? "",
    row.birthYear ?? "",
    row.postalCode ?? "",
    (row.postalPlace ?? "").toUpperCase(),
  ].join("|");

  return crypto.createHash("sha1").update(seed).digest("hex");
}

export function normalizeShareholdingRows(rows: ParsedShareholdingRow[]): {
  normalizedRows: NormalizedShareholdingRow[];
  ownerships: ShareholdingOwnershipAggregate[];
  totalShares: bigint | null;
  errors: ShareholdingImportValidationError[];
} {
  const errors: ShareholdingImportValidationError[] = [];
  const normalizedRows: NormalizedShareholdingRow[] = [];
  const totalShareCandidates = new Set<string>();

  for (const row of rows) {
    const shareholderType = inferShareholderType(row);
    const normalizedName = normalizeName(row.shareholderName);
    const fingerprint = createFingerprint({
      shareholderName: row.shareholderName,
      type: shareholderType,
      shareholderIdentifier: row.shareholderIdentifier,
      birthYear: row.birthYear,
      postalCode: row.postalCode,
      postalPlace: row.postalPlace,
    });
    const sourceRowKey = crypto
      .createHash("sha1")
      .update(
        [
          row.rowNumber,
          normalizedName,
          row.shareholderIdentifier ?? "",
          row.shareClass ?? "",
          row.numberOfShares?.toString() ?? "",
        ].join("|"),
      )
      .digest("hex");

    if ((row.numberOfShares ?? BigInt(0)) <= BigInt(0)) {
      errors.push({
        stage: "normalize",
        rowNumber: row.rowNumber,
        message: "Antall aksjer maa vaere stoerre enn null.",
        payload: row.raw,
      });
      continue;
    }

    if (row.totalShares) {
      totalShareCandidates.add(row.totalShares.toString());
    }

    normalizedRows.push({
      rowNumber: row.rowNumber,
      shareholderName: row.shareholderName.trim(),
      normalizedName,
      shareholderType,
      shareholderIdentifier: row.shareholderIdentifier,
      birthYear: row.birthYear,
      postalCode: row.postalCode,
      postalPlace: row.postalPlace,
      shareClass: row.shareClass,
      numberOfShares: row.numberOfShares!,
      totalShares: row.totalShares,
      fingerprint,
      sourceRowKey,
      raw: row.raw,
    });
  }

  let totalShares: bigint | null = null;
  if (totalShareCandidates.size === 1) {
    totalShares = BigInt(Array.from(totalShareCandidates)[0]);
  } else if (totalShareCandidates.size > 1) {
    errors.push({
      stage: "normalize",
      message: "Fant flere ulike verdier for totalt antall aksjer. Eierandel blir ikke beregnet automatisk.",
      payload: Array.from(totalShareCandidates),
    });
  }

  const ownershipMap = new Map<string, ShareholdingOwnershipAggregate>();
  for (const row of normalizedRows) {
    const ownershipKey = [row.fingerprint, row.shareClass ?? "ORDINARY"].join("|");
    const existing = ownershipMap.get(ownershipKey);
    if (existing) {
      existing.numberOfShares += row.numberOfShares;
      existing.sourceRowKeys.push(row.sourceRowKey);
      existing.rows.push(row);
      continue;
    }

    ownershipMap.set(ownershipKey, {
      fingerprint: row.fingerprint,
      shareholderName: row.shareholderName,
      normalizedName: row.normalizedName,
      shareholderType: row.shareholderType,
      shareholderIdentifier: row.shareholderIdentifier,
      birthYear: row.birthYear,
      postalCode: row.postalCode,
      postalPlace: row.postalPlace,
      shareClass: row.shareClass,
      numberOfShares: row.numberOfShares,
      totalShares: row.totalShares,
      sourceRowKeys: [row.sourceRowKey],
      rows: [row],
    });
  }

  return {
    normalizedRows,
    ownerships: Array.from(ownershipMap.values()),
    totalShares,
    errors,
  };
}
