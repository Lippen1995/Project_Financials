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
 *   npm run brreg:ingest-entities -- --file=enheter.json.gz   # validate a local artifact only
 *   npm run brreg:ingest-entities -- --limit=5000        # stop after N inserts (smoke test)
 */
import { createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createGunzip } from "node:zlib";
import { Readable, Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";

import { Prisma } from "@prisma/client";

import env from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  mapBrregRegistryEntity,
  type BrregRegistryEntity,
} from "@/server/providers/brreg-registry-entity-mapper";

const BULK_URL = `${env.brregBaseUrl}/enheter/lastned`;
const ACCEPT = "application/vnd.brreg.enhetsregisteret.enhet.v2+gzip";
// 36 bound values per row; 900 * 36 = 32400 stays under PostgreSQL's 32767 parameter limit.
const BATCH_SIZE = 900;
let cleanupStageTable: string | null = null;

function quotedStageTable(tableName: string): Prisma.Sql {
  if (!/^RegistryEntityStage_[a-f0-9]{32}$/.test(tableName)) {
    throw new Error("Invalid registry staging-table identifier.");
  }
  return Prisma.raw(`"${tableName}"`);
}

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

async function openGzipStream(filePath: string | null) {
  let compressed: NodeJS.ReadableStream;
  if (filePath) {
    console.log(`Reading local file ${filePath}`);
    compressed = createReadStream(filePath);
  } else {
    console.log(`Downloading ${BULK_URL}`);
    const response = await fetch(BULK_URL, { headers: { Accept: ACCEPT } });
    if (!response.ok || !response.body) {
      throw new Error(`Bulk download failed: HTTP ${response.status}`);
    }
    compressed = Readable.fromWeb(response.body as never);
  }

  const hash = createHash("sha256");
  let byteCount = 0n;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      byteCount += BigInt(chunk.length);
      callback(null, chunk);
    },
  });
  return {
    stream: compressed.pipe(meter).pipe(createGunzip()),
    sourceArtifact: filePath ? resolve(filePath) : null,
    finishEvidence: () => ({ checksumSha256: hash.digest("hex"), byteCount }),
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

function* extractObjects(
  state: TokenizerState,
  appended: string,
): Generator<string> {
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
  const snapshotAt = new Date();
  const importId = randomUUID();
  if (nacePrefix) console.log(`Filtering to NACE prefix ${nacePrefix}`);

  const source = await openGzipStream(filePath);
  const gunzip = source.stream;
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

  let batch: ReturnType<typeof mapBrregRegistryEntity>[] = [];
  let inserted = 0;
  let scanned = 0;
  let invalidObjects = 0;
  let firstNonWhitespaceCharacter = "";
  let lastNonWhitespaceCharacter = "";

  function observeDocumentBoundary(value: string) {
    if (!firstNonWhitespaceCharacter) {
      for (let index = 0; index < value.length; index += 1) {
        if (!/\s/.test(value[index])) {
          firstNonWhitespaceCharacter = value[index];
          break;
        }
      }
    }
    for (let index = value.length - 1; index >= 0; index -= 1) {
      if (!/\s/.test(value[index])) {
        lastNonWhitespaceCharacter = value[index];
        break;
      }
    }
  }

  async function flush() {
    if (batch.length === 0) return;
    const now = new Date();
    const tuples = batch.map(
      (r) => Prisma.sql`(
        ${randomUUID()}, ${r.orgNumber}, ${r.name}, ${r.organisationForm},
        ${r.institutionalSectorCode}, ${r.institutionalSectorDescription}, ${r.naceCode},
        ${r.naceDescription}, ${r.status}::"CompanyStatus", ${r.employeeCount}, ${r.registeredAt},
        ${r.website}, ${r.addressStreet}, ${r.postalCode}, ${r.postalPlace}, ${r.municipality},
        ${r.municipalityNumber}, ${r.countryCode}, ${r.businessAddressStreet},
        ${r.businessAddressPostalCode}, ${r.businessAddressPostalPlace},
        ${r.businessAddressMunicipality}, ${r.businessAddressMunicipalityNumber},
        ${r.businessAddressCountryCode}, ${r.businessAddressNormalizedName},
        ${r.businessAddressHouseNumber}, ${r.businessAddressHouseLetter},
        ${r.businessAddressUnitNumber}, ${r.registerUpdatedAt},
        ${snapshotAt}, ${"BRREG"}, ${"enhet"}, ${r.orgNumber}, ${now}, ${now}, ${now}
      )`,
    );
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO ${stageIdentifier} (
        "id", "orgNumber", "name", "organisationForm", "institutionalSectorCode",
        "institutionalSectorDescription", "naceCode", "naceDescription", "status",
        "employeeCount", "registeredAt", "website", "addressStreet", "postalCode",
        "postalPlace", "municipality", "municipalityNumber", "countryCode",
        "businessAddressStreet", "businessAddressPostalCode", "businessAddressPostalPlace",
        "businessAddressMunicipality", "businessAddressMunicipalityNumber",
        "businessAddressCountryCode",
        "businessAddressNormalizedName", "businessAddressHouseNumber",
        "businessAddressHouseLetter", "businessAddressUnitNumber", "registerUpdatedAt",
        "sourceSnapshotAt", "sourceSystem", "sourceEntityType", "sourceId", "fetchedAt",
        "normalizedAt", "updatedAt"
      ) VALUES ${Prisma.join(tuples)}
    `);
    inserted += batch.length;
    batch = [];
    process.stdout.write(`\r  scanned ${scanned} · inserted ${inserted}`);
  }

  for await (const chunk of gunzip) {
    const decodedChunk = decoder.write(chunk as Buffer);
    observeDocumentBoundary(decodedChunk);
    for (const objectText of extractObjects(tokenizer, decodedChunk)) {
      scanned += 1;
      let entity: BrregRegistryEntity;
      try {
        entity = JSON.parse(objectText) as BrregRegistryEntity;
      } catch {
        invalidObjects += 1;
        continue;
      }
      if (!entity.organisasjonsnummer) {
        invalidObjects += 1;
        continue;
      }
      if (
        nacePrefix &&
        !(entity.naeringskode1?.kode ?? "").startsWith(nacePrefix)
      )
        continue;
      batch.push(mapBrregRegistryEntity(entity));
      if (batch.length >= BATCH_SIZE) await flush();
      if (inserted + batch.length >= limit) break;
    }
    if (inserted + batch.length >= limit) break;
  }

  const tail = decoder.end();
  if (tail) {
    observeDocumentBoundary(tail);
    for (const objectText of extractObjects(tokenizer, tail)) {
      try {
        const entity = JSON.parse(objectText) as BrregRegistryEntity;
        if (!entity.organisasjonsnummer) {
          invalidObjects += 1;
        } else if (
          !nacePrefix ||
          (entity.naeringskode1?.kode ?? "").startsWith(nacePrefix)
        ) {
          batch.push(mapBrregRegistryEntity(entity));
        }
      } catch {
        invalidObjects += 1;
      }
    }
  }
  await flush();

  const isFullArtifact = !nacePrefix && limit === Infinity;
  if (isFullArtifact) {
    if (
      firstNonWhitespaceCharacter !== "[" ||
      lastNonWhitespaceCharacter !== "]" ||
      tokenizer.depth !== 0 ||
      tokenizer.inString ||
      tokenizer.objectStart !== -1 ||
      invalidObjects > 0
    ) {
      throw new Error(
        "Brreg full-register artifact was incomplete or contained invalid entity objects.",
      );
    }
  }
  const evidence = isFullArtifact ? source.finishEvidence() : null;

  // Only a stream fetched directly from the configured official Brreg endpoint can replace the
  // published mirror. A local file has no authenticated chain to that source, even if valid.
  const canPublishSnapshot = isFullArtifact && !filePath;
  if (canPublishSnapshot) {
    if (!evidence) throw new Error("Full Brreg artifact evidence was not recorded.");
    const [{ count: currentCountRaw }] = await prisma.$queryRaw<
      Array<{ count: bigint }>
    >`
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
        const completedAt = new Date();
        await tx.registryEntityImport.create({
          data: {
            id: importId,
            snapshotAt,
            status: "COMPLETED",
            sourceUrl: BULK_URL,
            sourceMediaType: ACCEPT,
            sourceArtifact: source.sourceArtifact,
            checksumSha256: evidence.checksumSha256,
            byteCount: evidence.byteCount,
            rowCount: inserted,
            isUnfiltered: true,
            reachedEof: true,
            startedAt: new Date(startedAt),
            completedAt,
            sourceSystem: "BRREG",
            sourceEntityType: "EnhetsregisteretFullDownload",
            sourceId: importId,
            fetchedAt: snapshotAt,
            normalizedAt: completedAt,
          },
        });
      },
      { maxWait: 60_000, timeout: 900_000 },
    );
  } else {
    console.log(
      isFullArtifact
        ? `Local full artifact validated (${evidence?.checksumSha256}); RegistryEntity publication was not replaced.`
        : "Filtered/limited run inspected only; RegistryEntity publication was not replaced.",
    );
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
  console.log(
    `Done: scanned ${scanned} entities, inserted ${inserted} in ${seconds}s`,
  );
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
