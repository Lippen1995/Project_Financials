import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import readline from "node:readline";

import env from "@/lib/env";
import { fetchJson } from "@/integrations/http";

type BrregUpdatesResponse = {
  _embedded?: {
    oppdaterteEnheter?: Array<{
      oppdateringsid: number;
      dato: string;
      organisasjonsnummer: string;
      endringstype?: string;
    }>;
  };
  _links?: {
    next?: {
      href: string;
    };
  };
};

type DistressInventoryMetadata = {
  etag: string | null;
  lastModified: string | null;
};

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      const nextChar = line[index + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function isTruthyCsvValue(value?: string | null) {
  if (!value) {
    return false;
  }

  return ["true", "ja", "1"].includes(value.trim().toLowerCase());
}

function hasDateLikeValue(value?: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}/.test(value.trim()));
}

function isDistressCsvRecord(record: Record<string, string>) {
  return (
    isTruthyCsvValue(record.konkurs) ||
    isTruthyCsvValue(record.underAvvikling) ||
    isTruthyCsvValue(record.underTvangsavviklingEllerTvangsopplosning) ||
    hasDateLikeValue(record.konkursdato) ||
    hasDateLikeValue(record.underAvviklingDato) ||
    hasDateLikeValue(record.tvangsavvikletPgaManglendeSlettingDato) ||
    hasDateLikeValue(record.tvangsopplostPgaManglendeDagligLederDato) ||
    hasDateLikeValue(record.tvangsopplostPgaManglendeRevisorDato) ||
    hasDateLikeValue(record.tvangsopplostPgaManglendeRegnskapDato) ||
    hasDateLikeValue(record.tvangsopplostPgaMangelfulltStyreDato) ||
    hasDateLikeValue(record.underUtenlandskInsolvensbehandlingDato) ||
    hasDateLikeValue(record.underRekonstruksjonsforhandlingDato)
  );
}

export class BrregDistressProvider {
  async getCompanyPayload(orgNumber: string) {
    return fetchJson<Record<string, unknown>>(`${env.brregBaseUrl}/enheter/${orgNumber}`);
  }

  async listEntityUpdates(fromUpdateId: number, size = 200) {
    const params = new URLSearchParams({
      oppdateringsid: String(Math.max(1, fromUpdateId)),
      size: String(size),
      includeChanges: "false",
    });

    const response = await fetchJson<BrregUpdatesResponse>(`${env.brregBaseUrl}/oppdateringer/enheter?${params.toString()}`);

    return response._embedded?.oppdaterteEnheter ?? [];
  }

  async getInventoryMetadata(): Promise<DistressInventoryMetadata> {
    const response = await fetch(`${env.brregBaseUrl}/enheter/lastned/csv`, {
      method: "HEAD",
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      throw new Error(`Kunne ikke hente metadata for distress-bootstrap (${response.status}).`);
    }

    return {
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
    };
  }

  async *streamBootstrapOrgNumbers(): AsyncGenerator<string> {
    const response = await fetch(`${env.brregBaseUrl}/enheter/lastned/csv`, {
      headers: {
        Accept: "application/vnd.brreg.enhetsregisteret.enhet.v2+gzip;charset=UTF-8",
      },
      next: { revalidate: 3600 },
    });

    if (!response.ok || !response.body) {
      throw new Error(`Kunne ikke hente totalbestand for distress-bootstrap (${response.status}).`);
    }

    const gunzip = createGunzip();
    const input = Readable.fromWeb(response.body as any);
    input.pipe(gunzip);

    const lines = readline.createInterface({
      input: gunzip,
      crlfDelay: Infinity,
    });

    let header: string[] | null = null;

    for await (const line of lines) {
      if (!header) {
        header = parseCsvLine(line).map((value) => value.trim());
        continue;
      }

      const values = parseCsvLine(line);
      if (values.length !== header.length) {
        continue;
      }

      const record = Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""]));
      if (isDistressCsvRecord(record) && record.organisasjonsnummer) {
        yield record.organisasjonsnummer;
      }
    }
  }
}
