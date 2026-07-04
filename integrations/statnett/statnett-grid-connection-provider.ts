import * as XLSX from "xlsx";

import env from "@/lib/env";
import { GridConnectionRecord, GridConnectionStatus } from "@/lib/types";

const SOURCE_SYSTEM = "STATNETT";
const SOURCE_ENTITY_TYPE = "GRID_CONNECTION_CASE";

type RawRecord = Record<string, unknown>;

const statusLabels: Record<GridConnectionStatus, string[]> = {
  QUEUE: ["ko", "kø", "kapasitetsko", "kapasitetskø", "queue"],
  RESERVED: ["reservert", "reservasjon", "reserved"],
  CONNECTED: ["tilknyttet", "tilkoblet", "connected"],
};

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[æ]/g, "ae")
    .replace(/[ø]/g, "o")
    .replace(/[å]/g, "a")
    .replace(/[^a-z0-9]+/g, "");
}

function firstString(record: RawRecord, keys: string[]) {
  const wanted = keys.map(normalizeKey);
  for (const [key, value] of Object.entries(record)) {
    if (!wanted.includes(normalizeKey(key))) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return null;
}

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const normalized = value.replace(/\s/g, "").replace(/,/g, ".").replace(/[^\d.-]/g, "");
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstNumber(record: RawRecord, keys: string[]) {
  const wanted = keys.map(normalizeKey);
  for (const [key, value] of Object.entries(record)) {
    if (!wanted.includes(normalizeKey(key))) continue;

    const parsed = parseNumber(value);
    if (parsed !== null) return { value: parsed, header: key };
  }

  return null;
}

function asIsoDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeOrgNumber(value: string | null) {
  const normalized = value?.replace(/\D/g, "") ?? "";
  return normalized.length === 9 ? normalized : null;
}

function inferStatus(record: RawRecord, sheetName?: string): GridConnectionStatus | null {
  const raw = [firstString(record, ["status", "sakstatus", "kategori", "type"]), sheetName ?? null]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const [status, labels] of Object.entries(statusLabels) as Array<[GridConnectionStatus, string[]]>) {
    if (labels.some((label) => raw.includes(label))) return status;
  }

  return null;
}

function capacityToMw(value: number, header: string) {
  const normalizedHeader = normalizeKey(header);
  if (normalizedHeader.includes("kw") && !normalizedHeader.includes("mw")) return value / 1000;
  if (normalizedHeader.includes("gw")) return value * 1000;
  return value;
}

function sourceIdFor(record: RawRecord, fallbackParts: Array<string | number | null>) {
  return (
    firstString(record, ["id", "saksid", "saksnummer", "caseId", "caseNumber"]) ??
    fallbackParts.filter((part) => part !== null && part !== "").join(":")
  );
}

function inferSpecialTerms(record: RawRecord) {
  const value = firstString(record, ["sarligeVilkar", "saerligeVilkar", "særligeVilkår", "vilkar", "vilkår"]);
  if (!value) return null;

  const normalized = value.toLowerCase();
  if (["ja", "true", "yes"].includes(normalized)) return true;
  if (["nei", "false", "no"].includes(normalized)) return false;
  return normalized.includes("sær") || normalized.includes("saer");
}

function mapRecord(record: RawRecord, sourceUrl: string, sheetName?: string, rowIndex = 0): GridConnectionRecord | null {
  const status = inferStatus(record, sheetName);
  const capacity = firstNumber(record, [
    "kapasitet",
    "kapasitetMw",
    "reservertKapasitet",
    "reservertKapasitetMw",
    "tilknyttetKapasitet",
    "koKapasitet",
    "køKapasitet",
    "effekt",
    "effektMw",
    "effektKw",
    "effektGw",
    "kapasitetKw",
    "kapasitetGw",
    "mw",
    "omsoktEffekt",
    "omsøktEffekt",
  ]);

  if (!status || !capacity || capacity.value <= 0) return null;

  const companyName = firstString(record, ["organisasjon", "selskap", "kunde", "kundenavn", "aktor", "aktør"]);
  const projectName = firstString(record, ["prosjekt", "prosjektnavn", "tiltak", "sak", "navn"]);
  const companyOrgNumber = normalizeOrgNumber(
    firstString(record, ["orgnr", "orgnummer", "organisasjonsnummer", "organisationNumber", "organizationNumber"]),
  );
  const normalizedAt = new Date();
  const sourceId = sourceIdFor(record, [status, companyOrgNumber, companyName, projectName, rowIndex]);

  return {
    id: `${SOURCE_SYSTEM}:${sourceId}`,
    companyOrgNumber,
    companyName,
    projectName,
    status,
    capacityMw: capacityToMw(capacity.value, capacity.header),
    area: firstString(record, ["omrade", "område", "prisomrade", "prisområde", "region"]),
    municipality: firstString(record, ["kommune"]),
    county: firstString(record, ["fylke"]),
    networkLevel: firstString(record, ["nettniva", "nettnivå", "spenningsniva", "spenningsnivå"]),
    connectionPoint: firstString(record, ["tilknytningspunkt", "stasjon", "punkt"]),
    queuePosition: firstNumber(record, ["koplass", "køplass", "queuePosition", "plass"])?.value ?? null,
    expectedConnectionDate: asIsoDate(firstString(record, ["forventetTilknytning", "planlagtTilknytning", "dato"])),
    reservedAt: asIsoDate(firstString(record, ["reservertDato", "reservasjonsdato"])),
    connectedAt: asIsoDate(firstString(record, ["tilknyttetDato", "tilkobletDato"])),
    specialTerms: inferSpecialTerms(record),
    detailUrl: firstString(record, ["url", "lenke", "detailUrl"]),
    sourceUrl,
    sourceSystem: SOURCE_SYSTEM,
    sourceEntityType: SOURCE_ENTITY_TYPE,
    sourceId,
    fetchedAt: normalizedAt,
    normalizedAt,
    rawPayload: record,
  };
}

function asRecord(value: unknown): RawRecord {
  return value && typeof value === "object" ? (value as RawRecord) : {};
}

function parseJson(payload: unknown): Array<{ record: RawRecord; sheetName?: string; rowIndex: number }> {
  const root = asRecord(payload);
  const records = Array.isArray(payload)
    ? payload
    : Array.isArray(root.items)
      ? root.items
      : Array.isArray(root.records)
        ? root.records
        : Array.isArray(root.data)
          ? root.data
          : [];

  return records.map((record, rowIndex) => ({ record: asRecord(record), rowIndex }));
}

function parseWorkbook(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const rows: Array<{ record: RawRecord; sheetName?: string; rowIndex: number }> = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const records = XLSX.utils.sheet_to_json<RawRecord>(sheet, { defval: null });
    records.forEach((record, rowIndex) => rows.push({ record, sheetName, rowIndex }));
  }

  return rows;
}

export class StatnettGridConnectionProvider {
  constructor(private readonly sourceUrl = env.statnettGridConnectionsDataUrl) {}

  async listGridConnections(): Promise<GridConnectionRecord[]> {
    if (!this.sourceUrl) return [];

    const response = await fetch(this.sourceUrl, {
      headers: {
        Accept: "application/json, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*",
      },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      throw new Error(`Statnett grid connection request failed with status ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const rows =
      contentType.includes("json") || this.sourceUrl.endsWith(".json")
        ? parseJson(await response.json())
        : parseWorkbook(await response.arrayBuffer());

    return rows
      .map((row) => mapRecord(row.record, this.sourceUrl, row.sheetName, row.rowIndex))
      .filter((record): record is GridConnectionRecord => Boolean(record));
  }
}

export const __testables = {
  mapRecord,
  normalizeKey,
};
