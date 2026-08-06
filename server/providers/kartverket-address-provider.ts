import type { Readable } from "node:stream";

import { XMLParser } from "fast-xml-parser";
import { parse } from "csv-parse";
import * as unzipper from "unzipper";

import { normalizeAddressName } from "@/server/company-map/address-resolution";

export const KARTVERKET_ADDRESS_ATOM_FEED =
  "https://nedlasting.geonorge.no/geonorge/ATOM-feeds/MatrikkelenAdresse_AtomFeedCSV.xml";

export type KartverketAddressDistribution = {
  sourceUrl: string;
  sourceUpdatedAt: Date;
  coordinateSystem: "EPSG:4258";
  datasetVersion: string;
};

export type OfficialAddressRecord = {
  officialAddressId: string;
  municipalityNumber: string;
  addressType: string;
  addressName: string;
  normalizedAddressName: string;
  houseNumber: number;
  houseLetter: string | null;
  unitNumber: string | null;
  postalCode: string | null;
  postalPlace: string | null;
  latitude: number;
  longitude: number;
  sourceUpdatedAt: Date | null;
  dataExtractedAt: Date;
};

type AtomLink = { href?: string };
type AtomEntry = {
  title?: string;
  updated?: string;
  link?: AtomLink | AtomLink[];
};
type AtomDocument = { feed?: { entry?: AtomEntry | AtomEntry[] } };
type KartverketCsvRecord = Record<string, string | undefined>;

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parseSourceDate(value: string | undefined): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const norwegianTimestamp = trimmed.match(
    /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/,
  );
  if (norwegianTimestamp) {
    const [, day, month, year, hour, minute, second, fraction = ""] = norwegianTimestamp;
    const milliseconds = Number(fraction.padEnd(3, "0").slice(0, 3));
    return new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
        milliseconds,
      ),
    );
  }

  const isoValue = /(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed) ? trimmed : `${trimmed}Z`;
  const date = new Date(isoValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function selectNationwideCsvDistribution(atomXml: string): KartverketAddressDistribution {
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    removeNSPrefix: true,
  }).parse(atomXml) as AtomDocument;
  const entries = asArray(parsed.feed?.entry);
  const selected = entries.find((entry) => {
    const links = asArray(entry.link);
    return (
      entry.title?.trim() === "CSV-format, Landsdekkende" &&
      links.some((link) => link.href?.includes("_4258_") || link.href?.includes("_4258_CSV"))
    );
  });
  const sourceUrl = asArray(selected?.link).find(
    (link) => link.href?.includes("_4258_") || link.href?.includes("_4258_CSV"),
  )?.href;
  const sourceUpdatedAt = parseSourceDate(selected?.updated);
  if (!sourceUrl || !sourceUpdatedAt) {
    throw new Error("Kartverket Atom feed has no nationwide EPSG:4258 CSV distribution.");
  }
  if (!sourceUrl.startsWith("https://nedlasting.geonorge.no/")) {
    throw new Error("Kartverket Atom feed returned an unexpected download host.");
  }

  return {
    sourceUrl,
    sourceUpdatedAt,
    coordinateSystem: "EPSG:4258",
    datasetVersion: `matrikkelen-address-${sourceUpdatedAt.toISOString()}-epsg4258`,
  };
}

export async function getLatestKartverketAddressDistribution(
  fetchImpl: typeof fetch = fetch,
): Promise<KartverketAddressDistribution> {
  const response = await fetchImpl(KARTVERKET_ADDRESS_ATOM_FEED, {
    headers: { Accept: "application/atom+xml, application/xml;q=0.9" },
  });
  if (!response.ok) {
    throw new Error(`Kartverket Atom feed failed with HTTP ${response.status}.`);
  }
  return selectNationwideCsvDistribution(await response.text());
}

export function parseOfficialAddressRecord(
  record: KartverketCsvRecord,
): OfficialAddressRecord | null {
  if (record.adressetype?.trim().toLocaleLowerCase("nb-NO") !== "vegadresse") return null;
  if (record["EPSG-kode"]?.trim() !== "4258") return null;

  const officialAddressId = record.uuidAdresse?.trim() || record.adresseId?.trim();
  const municipalityNumber = record.kommunenummer?.trim();
  const addressName = record.adressenavn?.normalize("NFKC").trim();
  const houseNumber = Number(record.nummer?.trim());
  const latitude = Number(record.Nord?.trim());
  const longitude = Number(record["Øst"]?.trim());
  const dataExtractedAt = parseSourceDate(record.datauttaksdato);
  if (
    !officialAddressId ||
    !municipalityNumber ||
    !/^\d{4}$/.test(municipalityNumber) ||
    !addressName ||
    !Number.isSafeInteger(houseNumber) ||
    houseNumber < 1 ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !dataExtractedAt
  ) {
    return null;
  }

  return {
    officialAddressId,
    municipalityNumber,
    addressType: "vegadresse",
    addressName,
    normalizedAddressName: normalizeAddressName(addressName),
    houseNumber,
    houseLetter: record.bokstav?.trim().toLocaleUpperCase("nb-NO") || null,
    unitNumber: null,
    postalCode: record.postnummer?.trim() || null,
    postalPlace: record.poststed?.normalize("NFKC").trim() || null,
    latitude,
    longitude,
    sourceUpdatedAt: parseSourceDate(record.oppdateringsdato),
    dataExtractedAt,
  };
}

export async function* streamOfficialAddressesFromZip(
  zipStream: Readable,
): AsyncGenerator<OfficialAddressRecord> {
  const archive = zipStream.pipe(unzipper.Parse({ forceStream: true }));
  let csvFound = false;

  for await (const entry of archive) {
    if (entry.type !== "File" || !entry.path.toLocaleLowerCase("nb-NO").endsWith(".csv")) {
      entry.autodrain();
      continue;
    }
    csvFound = true;
    const records = entry.pipe(
      parse({
        bom: true,
        columns: true,
        delimiter: ";",
        relax_column_count: true,
        skip_empty_lines: true,
      }),
    );
    for await (const record of records) {
      const address = parseOfficialAddressRecord(record as KartverketCsvRecord);
      if (address) yield address;
    }
  }

  if (!csvFound) throw new Error("Kartverket address ZIP did not contain a CSV file.");
}
