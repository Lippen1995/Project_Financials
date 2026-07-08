/**
 * Bulk-ingest every Brønnøysund underenhet into the local RegistrySubunit mirror so
 * store/outlet searches hit our database instead of the live Brreg API.
 *
 * Streams the daily full-register gzip download (~87 MB, ~830k units) and tokenizes the
 * JSON array one object at a time — never holding the whole file in memory — then
 * batch-inserts after truncating the table (a re-runnable full-refresh snapshot).
 *
 * Usage:
 *   npm run brreg:ingest-subunits              # full register
 *   npm run brreg:ingest-subunits -- --nace=47.11   # only NACE 47.11* (grocery outlets)
 *   npm run brreg:ingest-subunits -- --limit=5000    # stop after N inserts (smoke test)
 */
import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";

import { CompanyStatus, Prisma } from "@prisma/client";

import env from "@/lib/env";
import { prisma } from "@/lib/prisma";

const BULK_URL = `${env.brregBaseUrl}/underenheter/lastned`;
const ACCEPT = "application/vnd.brreg.enhetsregisteret.underenhet.v2+gzip";
// 18 columns per row; 1500 * 18 = 27000 stays under PostgreSQL's 32767 bind-parameter
// (Int16) limit per prepared statement.
const BATCH_SIZE = 1500;

type BrregSubunit = {
  organisasjonsnummer?: string;
  navn?: string;
  overordnetEnhet?: string;
  organisasjonsform?: { kode?: string };
  naeringskode1?: { kode?: string; beskrivelse?: string };
  antallAnsatte?: number;
  registreringsdatoEnhetsregisteret?: string;
  oppdateringsdato?: string;
  beliggenhetsadresse?: {
    adresse?: (string | null)[];
    postnummer?: string;
    poststed?: string;
    kommune?: string;
    kommunenummer?: string;
    landkode?: string;
  };
  konkurs?: boolean;
  underAvvikling?: boolean;
  underTvangsavviklingEllerTvangsopplosning?: boolean;
  slettedato?: string;
};

function parseArgs() {
  let nacePrefix: string | null = null;
  let limit = Infinity;
  let filePath: string | null = null;
  for (const arg of process.argv.slice(2)) {
    const nace = arg.match(/^--nace=(.+)$/);
    if (nace) nacePrefix = nace[1];
    const lim = arg.match(/^--limit=(\d+)$/);
    if (lim) limit = Number(lim[1]);
    const file = arg.match(/^--file=(.+)$/);
    if (file) filePath = file[1];
  }
  return { nacePrefix, limit, filePath };
}

/**
 * Source the gzip stream from a local file (--file) or the live Brreg bulk endpoint.
 * The local-file path is more robust for the ~87 MB transfer: a plain streaming fetch
 * can drop the socket mid-download, so downloading with a retrying client (curl) first
 * and pointing --file at the result is the reliable option.
 */
async function openGzipStream(filePath: string | null): Promise<NodeJS.ReadableStream> {
  if (filePath) {
    console.log(`Reading local file ${filePath}`);
    return createReadStream(filePath).pipe(createGunzip());
  }
  console.log(`Downloading ${BULK_URL}`);
  const response = await fetch(BULK_URL, { headers: { Accept: ACCEPT } });
  if (!response.ok || !response.body) {
    throw new Error(`Bulk download failed: HTTP ${response.status}`);
  }
  return Readable.fromWeb(response.body as never).pipe(createGunzip());
}

function deriveStatus(unit: BrregSubunit): CompanyStatus {
  if (unit.konkurs) return CompanyStatus.BANKRUPT;
  if (unit.slettedato || unit.underAvvikling || unit.underTvangsavviklingEllerTvangsopplosning) {
    return CompanyStatus.DISSOLVED;
  }
  return CompanyStatus.ACTIVE;
}

function toDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapSubunit(unit: BrregSubunit) {
  const address = unit.beliggenhetsadresse ?? {};
  const street = Array.isArray(address.adresse)
    ? address.adresse.filter(Boolean).join(", ") || null
    : null;
  return {
    orgNumber: unit.organisasjonsnummer!,
    name: unit.navn ?? "",
    parentOrgNumber: unit.overordnetEnhet ?? null,
    organisationForm: unit.organisasjonsform?.kode ?? null,
    naceCode: unit.naeringskode1?.kode ?? null,
    naceDescription: unit.naeringskode1?.beskrivelse ?? null,
    status: deriveStatus(unit),
    employeeCount: typeof unit.antallAnsatte === "number" ? unit.antallAnsatte : null,
    registeredAt: toDate(unit.registreringsdatoEnhetsregisteret),
    addressStreet: street,
    postalCode: address.postnummer ?? null,
    postalPlace: address.poststed ?? null,
    municipality: address.kommune ?? null,
    municipalityNumber: address.kommunenummer ?? null,
    countryCode: address.landkode ?? null,
    registerUpdatedAt: toDate(unit.oppdateringsdato),
  };
}

/**
 * Streaming tokenizer for a top-level JSON array of objects. Fed decompressed text in
 * arbitrary chunks, it yields each complete top-level object's source text, keeping at
 * most one partial object buffered. Tracks string/escape state so braces inside strings
 * never affect depth.
 */
type TokenizerState = {
  buf: string;
  /** Index in `buf` of the next unscanned char — persists across chunks so retained
   *  text is never re-scanned (avoids O(n²) growth and double-counted braces). */
  scanPos: number;
  depth: number;
  inString: boolean;
  escaped: boolean;
  objectStart: number;
};

function createTokenizer(): TokenizerState {
  return { buf: "", scanPos: 0, depth: 0, inString: false, escaped: false, objectStart: -1 };
}

function* extractObjects(state: TokenizerState, appended: string): Generator<string> {
  state.buf += appended;
  for (let i = state.scanPos; i < state.buf.length; i += 1) {
    const char = state.buf[i];
    if (state.inString) {
      if (state.escaped) state.escaped = false;
      else if (char === "\\") state.escaped = true;
      else if (char === '"') state.inString = false;
      continue;
    }
    if (char === '"') {
      state.inString = true;
    } else if (char === "{") {
      if (state.depth === 0) state.objectStart = i;
      state.depth += 1;
    } else if (char === "}") {
      state.depth -= 1;
      if (state.depth === 0 && state.objectStart >= 0) {
        yield state.buf.slice(state.objectStart, i + 1);
        state.objectStart = -1;
      }
    }
  }
  // Everything in buf is now scanned. Compact so buf never grows past one object:
  // between objects drop it all; mid-object keep from its start, preserving the
  // running string/depth state so the next chunk continues seamlessly.
  if (state.depth === 0) {
    state.buf = "";
    state.scanPos = 0;
    state.objectStart = -1;
  } else {
    state.buf = state.buf.slice(state.objectStart);
    state.scanPos = state.buf.length;
    state.objectStart = 0;
  }
}

async function main() {
  const { nacePrefix, limit, filePath } = parseArgs();
  const startedAt = Date.now();
  if (nacePrefix) console.log(`Filtering to NACE prefix ${nacePrefix}`);

  const gunzip = await openGzipStream(filePath);
  const decoder = new StringDecoder("utf8");
  const tokenizer = createTokenizer();

  console.log("Truncating RegistrySubunit and streaming inserts…");
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "RegistrySubunit"');

  let batch: ReturnType<typeof mapSubunit>[] = [];
  let inserted = 0;
  let scanned = 0;

  async function flush() {
    if (batch.length === 0) return;
    // Raw parameterized insert (rather than prisma.registrySubunit.createMany) so the
    // ingester does not depend on regenerating the Prisma client — on Windows the running
    // dev server locks the query-engine DLL and blocks `prisma generate`. id and updatedAt
    // are supplied here because their Prisma defaults are client-side, not DB-side.
    const now = new Date();
    const tuples = batch.map(
      (r) => Prisma.sql`(
        ${randomUUID()}, ${r.orgNumber}, ${r.name}, ${r.parentOrgNumber}, ${r.organisationForm},
        ${r.naceCode}, ${r.naceDescription}, ${r.status}::"CompanyStatus", ${r.employeeCount},
        ${r.registeredAt}, ${r.addressStreet}, ${r.postalCode}, ${r.postalPlace}, ${r.municipality},
        ${r.municipalityNumber}, ${r.countryCode}, ${r.registerUpdatedAt}, ${now}
      )`,
    );
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "RegistrySubunit" (
        "id", "orgNumber", "name", "parentOrgNumber", "organisationForm", "naceCode",
        "naceDescription", "status", "employeeCount", "registeredAt", "addressStreet",
        "postalCode", "postalPlace", "municipality", "municipalityNumber", "countryCode",
        "registerUpdatedAt", "updatedAt"
      ) VALUES ${Prisma.join(tuples)}
      ON CONFLICT ("orgNumber") DO NOTHING
    `);
    inserted += batch.length;
    batch = [];
    process.stdout.write(`\r  scanned ${scanned} · inserted ${inserted}`);
  }

  for await (const chunk of gunzip) {
    for (const objectText of extractObjects(tokenizer, decoder.write(chunk as Buffer))) {
      scanned += 1;
      let unit: BrregSubunit;
      try {
        unit = JSON.parse(objectText) as BrregSubunit;
      } catch {
        continue; // skip a malformed record rather than abort the whole run
      }
      if (!unit.organisasjonsnummer) continue;
      if (nacePrefix && !(unit.naeringskode1?.kode ?? "").startsWith(nacePrefix)) continue;
      batch.push(mapSubunit(unit));
      if (batch.length >= BATCH_SIZE) await flush();
      if (inserted + batch.length >= limit) break;
    }
    if (inserted + batch.length >= limit) break;
  }

  const tail = decoder.end();
  if (tail) {
    for (const objectText of extractObjects(tokenizer, tail)) {
      try {
        const unit = JSON.parse(objectText) as BrregSubunit;
        if (unit.organisasjonsnummer && (!nacePrefix || (unit.naeringskode1?.kode ?? "").startsWith(nacePrefix))) {
          batch.push(mapSubunit(unit));
        }
      } catch {
        /* ignore trailing malformed */
      }
    }
  }
  await flush();

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  process.stdout.write("\n");
  console.log(`Done: scanned ${scanned} units, inserted ${inserted} in ${seconds}s`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
