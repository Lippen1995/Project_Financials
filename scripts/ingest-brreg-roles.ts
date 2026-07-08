/**
 * Bulk-ingest the Enhetsregister roller dataset into the local role mirror
 * (RegistryPerson + RegistryRoleAssignment) so "which companies does this person hold
 * roles in" and "who runs this company" are answered from our database.
 *
 * Streams the full roller gzip (~131 MB) and tokenizes the JSON array one entity at a
 * time, flattening rollegrupper → roller into assignments. People are deduplicated across
 * companies by a natural identity key (normalized name + birth date — Brreg exposes no
 * national ID publicly). Company role-holders (auditors, accountant firms, corporate board
 * members) are recorded by org number instead of a person.
 *
 * Usage:
 *   npm run brreg:ingest-roles -- --file=roller.json.gz   # local file (robust)
 *   npm run brreg:ingest-roles -- --limit=50000            # stop after N assignments
 */
import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";

import { Prisma } from "@prisma/client";

import env from "@/lib/env";
import { prisma } from "@/lib/prisma";

const BULK_URL = `${env.brregBaseUrl}/roller/totalbestand`;
const PERSON_BATCH = 3000; // 8 cols -> 24000 params < 32767
const ASSIGNMENT_BATCH = 2000; // 15 cols -> 30000 params < 32767

type BrregName = { fornavn?: string; mellomnavn?: string; etternavn?: string };
type BrregRole = {
  type?: { kode?: string; beskrivelse?: string };
  person?: { fodselsdato?: string; navn?: BrregName; erDoed?: boolean };
  enhet?: { organisasjonsnummer?: string; navn?: string | string[]; erSlettet?: boolean };
  avregistrert?: boolean;
  rekkefolge?: number;
};
type BrregRoleGroup = { type?: { kode?: string }; sistEndret?: string; roller?: BrregRole[] };
type BrregRoleEntity = { organisasjonsnummer?: string; rollegrupper?: BrregRoleGroup[] };

function parseArgs() {
  let filePath: string | null = null;
  let limit = Infinity;
  for (const arg of process.argv.slice(2)) {
    const file = arg.match(/^--file=(.+)$/);
    if (file) filePath = file[1];
    const lim = arg.match(/^--limit=(\d+)$/);
    if (lim) limit = Number(lim[1]);
  }
  return { filePath, limit };
}

function personFullName(navn?: BrregName): string {
  return [navn?.fornavn, navn?.mellomnavn, navn?.etternavn].filter(Boolean).join(" ").trim();
}

function normalizeName(name: string): string {
  return name.toUpperCase().replace(/\s+/g, " ").trim();
}

function identityKeyFor(fullName: string, birthDate: string | null): string {
  return `${normalizeName(fullName)}|${birthDate ?? ""}`;
}

async function openGzipStream(filePath: string | null): Promise<NodeJS.ReadableStream> {
  if (filePath) {
    console.log(`Reading local file ${filePath}`);
    return createReadStream(filePath).pipe(createGunzip());
  }
  console.log(`Downloading ${BULK_URL}`);
  const response = await fetch(BULK_URL);
  if (!response.ok || !response.body) throw new Error(`Bulk download failed: HTTP ${response.status}`);
  return Readable.fromWeb(response.body as never).pipe(createGunzip());
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

type PersonRow = {
  identityKey: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  isDeceased: boolean;
};
type AssignmentRow = {
  companyOrgNumber: string;
  holderType: "PERSON" | "COMPANY";
  personIdentityKey: string | null;
  personName: string | null;
  personBirthDate: string | null;
  holderOrgNumber: string | null;
  holderName: string | null;
  roleGroup: string | null;
  roleType: string;
  roleTypeLabel: string | null;
  isBoardRole: boolean;
  deregistered: boolean;
  orderIndex: number | null;
  groupLastChanged: string | null;
};

async function main() {
  const { filePath, limit } = parseArgs();
  const startedAt = Date.now();

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

  console.log("Truncating role mirror and streaming inserts…");
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "RegistryRoleAssignment"');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "RegistryPerson"');

  const seenPersons = new Set<string>();
  let personBatch: PersonRow[] = [];
  let assignmentBatch: AssignmentRow[] = [];
  let entities = 0;
  let personsInserted = 0;
  let assignmentsInserted = 0;

  async function flushPersons() {
    if (personBatch.length === 0) return;
    const rows = personBatch;
    personBatch = [];
    const tuples = rows.map(
      (r) => Prisma.sql`(
        ${randomUUID()}, ${r.identityKey}, ${r.fullName}, ${r.firstName}, ${r.lastName},
        ${r.birthDate}::date, ${r.isDeceased}, ${new Date()}
      )`,
    );
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "RegistryPerson" (
        "id", "identityKey", "fullName", "firstName", "lastName", "birthDate", "isDeceased", "updatedAt"
      ) VALUES ${Prisma.join(tuples)}
      ON CONFLICT ("identityKey") DO NOTHING
    `);
    personsInserted += rows.length;
  }

  async function flushAssignments() {
    if (assignmentBatch.length === 0) return;
    const rows = assignmentBatch;
    assignmentBatch = [];
    const tuples = rows.map(
      (r) => Prisma.sql`(
        ${randomUUID()}, ${r.companyOrgNumber}, ${r.holderType}::"RoleHolderType",
        ${r.personIdentityKey}, ${r.personName}, ${r.personBirthDate}::date,
        ${r.holderOrgNumber}, ${r.holderName}, ${r.roleGroup}, ${r.roleType}, ${r.roleTypeLabel},
        ${r.isBoardRole}, ${r.deregistered}, ${r.orderIndex}, ${r.groupLastChanged}::date
      )`,
    );
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "RegistryRoleAssignment" (
        "id", "companyOrgNumber", "holderType", "personIdentityKey", "personName",
        "personBirthDate", "holderOrgNumber", "holderName", "roleGroup", "roleType",
        "roleTypeLabel", "isBoardRole", "deregistered", "orderIndex", "groupLastChanged"
      ) VALUES ${Prisma.join(tuples)}
    `);
    assignmentsInserted += rows.length;
    process.stdout.write(
      `\r  entities ${entities} · persons ${personsInserted} · roles ${assignmentsInserted}`,
    );
  }

  function handleEntity(entity: BrregRoleEntity) {
    const orgNumber = entity.organisasjonsnummer;
    if (!orgNumber) return;
    for (const group of entity.rollegrupper ?? []) {
      const groupKode = group.type?.kode ?? null;
      const groupLastChanged = group.sistEndret ?? null;
      for (const role of group.roller ?? []) {
        const roleType = role.type?.kode;
        if (!roleType) continue;
        const isBoardRole = groupKode === "STYR";
        const base = {
          companyOrgNumber: orgNumber,
          roleGroup: groupKode,
          roleType,
          roleTypeLabel: role.type?.beskrivelse ?? null,
          isBoardRole,
          deregistered: role.avregistrert === true,
          orderIndex: typeof role.rekkefolge === "number" ? role.rekkefolge : null,
          groupLastChanged,
        };

        if (role.person) {
          const fullName = personFullName(role.person.navn);
          if (!fullName) continue;
          const birthDate = role.person.fodselsdato ?? null;
          const identityKey = identityKeyFor(fullName, birthDate);
          if (!seenPersons.has(identityKey)) {
            seenPersons.add(identityKey);
            personBatch.push({
              identityKey,
              fullName,
              firstName: role.person.navn?.fornavn ?? null,
              lastName: role.person.navn?.etternavn ?? null,
              birthDate,
              isDeceased: role.person.erDoed === true,
            });
          }
          assignmentBatch.push({
            ...base,
            holderType: "PERSON",
            personIdentityKey: identityKey,
            personName: fullName,
            personBirthDate: birthDate,
            holderOrgNumber: null,
            holderName: null,
          });
        } else if (role.enhet) {
          const holderName = Array.isArray(role.enhet.navn)
            ? role.enhet.navn.join(" ")
            : role.enhet.navn ?? null;
          assignmentBatch.push({
            ...base,
            holderType: "COMPANY",
            personIdentityKey: null,
            personName: null,
            personBirthDate: null,
            holderOrgNumber: role.enhet.organisasjonsnummer ?? null,
            holderName,
          });
        }
      }
    }
  }

  async function drainBatches(force: boolean) {
    if (force || personBatch.length >= PERSON_BATCH) await flushPersons();
    if (force || assignmentBatch.length >= ASSIGNMENT_BATCH) await flushAssignments();
  }

  for await (const chunk of gunzip) {
    for (const objectText of extractObjects(tokenizer, decoder.write(chunk as Buffer))) {
      let entity: BrregRoleEntity;
      try {
        entity = JSON.parse(objectText) as BrregRoleEntity;
      } catch {
        continue;
      }
      entities += 1;
      handleEntity(entity);
      await drainBatches(false);
      if (assignmentsInserted + assignmentBatch.length >= limit) break;
    }
    if (assignmentsInserted + assignmentBatch.length >= limit) break;
  }

  const tail = decoder.end();
  if (tail) {
    for (const objectText of extractObjects(tokenizer, tail)) {
      try {
        entities += 1;
        handleEntity(JSON.parse(objectText) as BrregRoleEntity);
      } catch {
        /* ignore trailing malformed */
      }
    }
  }
  await drainBatches(true);

  // Build the name-search index after the load (creating it up front would slow every
  // insert). IF NOT EXISTS so re-runs are a no-op; TRUNCATE above preserves it.
  await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS registry_person_name_trgm ON "RegistryPerson" USING gin ("fullName" gin_trgm_ops)',
  );

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  process.stdout.write("\n");
  console.log(
    `Done: ${entities} entities, ${personsInserted} persons, ${assignmentsInserted} role assignments in ${seconds}s`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
