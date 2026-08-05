/**
 * Bulk-ingest every Brønnøysund main entity (enhet) into the local RegistryEntity mirror
 * so company search hits our database instead of the live Brreg search API.
 *
 * Streams the daily full-register gzip download (~209 MB, ~1.1M entities) and tokenizes
 * the JSON array one object at a time — never holding the whole file in memory — then
 * batch-inserts after truncating the table (a re-runnable full-refresh snapshot).
 *
 * Usage:
 *   npm run brreg:ingest-entities                       # full register (from live API)
 *   npm run brreg:ingest-entities -- --file=enheter.json.gz   # from a downloaded file (robust)
 *   npm run brreg:ingest-entities -- --limit=5000        # stop after N inserts (smoke test)
 */
import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";

import { CompanyStatus, Prisma } from "@prisma/client";

import env from "@/lib/env";
import { prisma } from "@/lib/prisma";

const BULK_URL = `${env.brregBaseUrl}/enheter/lastned`;
const ACCEPT = "application/vnd.brreg.enhetsregisteret.enhet.v2+gzip";
// 25 bound values per row; 1250 * 25 = 31250 stays under PostgreSQL's 32767 parameter limit.
const BATCH_SIZE = 1250;
let cleanupStageTable: string | null = null;

function quotedStageTable(tableName: string): Prisma.Sql {
  if (!/^RegistryEntityStage_[a-f0-9]{32}$/.test(tableName)) {
    throw new Error("Invalid registry staging-table identifier.");
  }
  return Prisma.raw(`"${tableName}"`);
}

type BrregAddress = {
  adresse?: (string | null)[];
  postnummer?: string;
  poststed?: string;
  kommune?: string;
  kommunenummer?: string;
  landkode?: string;
};
type BrregEntity = {
  organisasjonsnummer?: string;
  navn?: string;
  organisasjonsform?: { kode?: string };
  institusjonellSektorkode?: { kode?: string; beskrivelse?: string };
  naeringskode1?: { kode?: string; beskrivelse?: string };
  antallAnsatte?: number;
  registreringsdatoEnhetsregisteret?: string;
  oppdateringsdato?: string;
  hjemmeside?: string;
  forretningsadresse?: BrregAddress;
  postadresse?: BrregAddress;
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

async function openGzipStream(filePath: string | null): Promise<NodeJS.ReadableStream> {
  if (filePath) {
    console.log(`Reading local file ${filePath}`);
    return createReadStream(filePath).pipe(createGunzip());
  }
  console.log(`Downloading ${BULK_URL}`);
  const response = await fetch(BULK_URL, { headers: { Accept: ACCEPT } });
  if (!response.ok || !response.body) throw new Error(`Bulk download failed: HTTP ${response.status}`);
  return Readable.fromWeb(response.body as never).pipe(createGunzip());
}

function deriveStatus(entity: BrregEntity): CompanyStatus {
  if (entity.konkurs) return CompanyStatus.BANKRUPT;
  if (entity.slettedato || entity.underAvvikling || entity.underTvangsavviklingEllerTvangsopplosning) {
    return CompanyStatus.DISSOLVED;
  }
  return CompanyStatus.ACTIVE;
}

function toDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapEntity(entity: BrregEntity) {
  // Prefer the business address (forretningsadresse); fall back to the postal address.
  const address = entity.forretningsadresse ?? entity.postadresse ?? {};
  const street = Array.isArray(address.adresse)
    ? address.adresse.filter(Boolean).join(", ") || null
    : null;
  return {
    orgNumber: entity.organisasjonsnummer!,
    name: entity.navn ?? "",
    organisationForm: entity.organisasjonsform?.kode ?? null,
    institutionalSectorCode: entity.institusjonellSektorkode?.kode ?? null,
    institutionalSectorDescription: entity.institusjonellSektorkode?.beskrivelse ?? null,
    naceCode: entity.naeringskode1?.kode ?? null,
    naceDescription: entity.naeringskode1?.beskrivelse ?? null,
    status: deriveStatus(entity),
    employeeCount: typeof entity.antallAnsatte === "number" ? entity.antallAnsatte : null,
    registeredAt: toDate(entity.registreringsdatoEnhetsregisteret),
    website: entity.hjemmeside ?? null,
    addressStreet: street,
    postalCode: address.postnummer ?? null,
    postalPlace: address.poststed ?? null,
    municipality: address.kommune ?? null,
    municipalityNumber: address.kommunenummer ?? null,
    countryCode: address.landkode ?? null,
    registerUpdatedAt: toDate(entity.oppdateringsdato),
  };
}

// Streaming tokenizer for a top-level JSON array of objects (see ingest-brreg-subunits.ts);
// persistent scanPos avoids re-scanning retained text across chunks.
type TokenizerState = {
  buf: string;
  scanPos: number;
  depth: number;
  inString: boolean;
  escaped: boolean;
  objectStart: number;
};

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
    if (char === '"') state.inString = true;
    else if (char === "{") {
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
  const tokenizer: TokenizerState = {
    buf: "",
    scanPos: 0,
    depth: 0,
    inString: false,
    escaped: false,
    objectStart: -1,
  };

  console.log("Streaming into an isolated RegistryEntity candidate snapshot…");
  const stageTable = `RegistryEntityStage_${randomUUID().replaceAll("-", "")}`;
  cleanupStageTable = stageTable;
  const stageIdentifier = quotedStageTable(stageTable);
  await prisma.$executeRaw(
    Prisma.sql`CREATE UNLOGGED TABLE ${stageIdentifier} (LIKE "RegistryEntity" INCLUDING DEFAULTS)`,
  );

  let batch: ReturnType<typeof mapEntity>[] = [];
  let inserted = 0;
  let scanned = 0;

  async function flush() {
    if (batch.length === 0) return;
    const now = new Date();
    const tuples = batch.map(
      (r) => Prisma.sql`(
        ${randomUUID()}, ${r.orgNumber}, ${r.name}, ${r.organisationForm},
        ${r.institutionalSectorCode}, ${r.institutionalSectorDescription}, ${r.naceCode},
        ${r.naceDescription}, ${r.status}::"CompanyStatus", ${r.employeeCount}, ${r.registeredAt},
        ${r.website}, ${r.addressStreet}, ${r.postalCode}, ${r.postalPlace}, ${r.municipality},
        ${r.municipalityNumber}, ${r.countryCode}, ${r.registerUpdatedAt},
        ${"BRREG"}, ${"enhet"}, ${r.orgNumber}, ${now}, ${now}, ${now}
      )`,
    );
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO ${stageIdentifier} (
        "id", "orgNumber", "name", "organisationForm", "institutionalSectorCode",
        "institutionalSectorDescription", "naceCode", "naceDescription", "status",
        "employeeCount", "registeredAt", "website", "addressStreet", "postalCode",
        "postalPlace", "municipality", "municipalityNumber", "countryCode", "registerUpdatedAt",
        "sourceSystem", "sourceEntityType", "sourceId", "fetchedAt", "normalizedAt", "updatedAt"
      ) VALUES ${Prisma.join(tuples)}
    `);
    inserted += batch.length;
    batch = [];
    process.stdout.write(`\r  scanned ${scanned} · inserted ${inserted}`);
  }

  for await (const chunk of gunzip) {
    for (const objectText of extractObjects(tokenizer, decoder.write(chunk as Buffer))) {
      scanned += 1;
      let entity: BrregEntity;
      try {
        entity = JSON.parse(objectText) as BrregEntity;
      } catch {
        continue;
      }
      if (!entity.organisasjonsnummer) continue;
      if (nacePrefix && !(entity.naeringskode1?.kode ?? "").startsWith(nacePrefix)) continue;
      batch.push(mapEntity(entity));
      if (batch.length >= BATCH_SIZE) await flush();
      if (inserted + batch.length >= limit) break;
    }
    if (inserted + batch.length >= limit) break;
  }

  const tail = decoder.end();
  if (tail) {
    for (const objectText of extractObjects(tokenizer, tail)) {
      try {
        const entity = JSON.parse(objectText) as BrregEntity;
        if (entity.organisasjonsnummer && (!nacePrefix || (entity.naeringskode1?.kode ?? "").startsWith(nacePrefix))) {
          batch.push(mapEntity(entity));
        }
      } catch {
        /* ignore trailing malformed */
      }
    }
  }
  await flush();

  const isCompleteSnapshot = !nacePrefix && limit === Infinity;
  if (isCompleteSnapshot) {
    const [{ count: currentCountRaw }] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count FROM "RegistryEntity"
    `;
    const currentCount = Number(currentCountRaw);
    if (inserted === 0 || (currentCount > 0 && inserted < currentCount * 0.9)) {
      throw new Error(
        `Refusing to publish suspicious RegistryEntity snapshot: ${inserted} rows versus ${currentCount} current rows.`,
      );
    }
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtext('fjord-insight-registry-entity-publication'), 0)
        `;
        await tx.$executeRaw`TRUNCATE TABLE "RegistryEntity"`;
        await tx.$executeRaw(
          Prisma.sql`INSERT INTO "RegistryEntity" SELECT * FROM ${stageIdentifier}`,
        );
      },
      { maxWait: 60_000, timeout: 900_000 },
    );
  } else {
    console.log("Filtered/limited run validated only; RegistryEntity publication was not replaced.");
  }

  await prisma.$executeRaw(Prisma.sql`DROP TABLE ${stageIdentifier}`);
  cleanupStageTable = null;

  // The published table keeps its indexes across the atomic truncate-and-replace operation.
  await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS registry_entity_name_trgm ON "RegistryEntity" USING gin ("name" gin_trgm_ops)',
  );

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  process.stdout.write("\n");
  console.log(`Done: scanned ${scanned} entities, inserted ${inserted} in ${seconds}s`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (cleanupStageTable) {
      await prisma.$executeRaw(
        Prisma.sql`DROP TABLE IF EXISTS ${quotedStageTable(cleanupStageTable)}`,
      );
    }
    await prisma.$disconnect();
  });
