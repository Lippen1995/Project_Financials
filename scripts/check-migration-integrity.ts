/**
 * Guards the migration history against the two failure modes that have already
 * bitten this repo.
 *
 * 1. Checksum drift. Prisma hashes each migration.sql and compares it to
 *    _prisma_migrations. Any byte difference — including a line ending — makes
 *    Prisma treat the history as drifted, and `prisma migrate dev` then offers
 *    to reset the database. On a developer machine holding real ingested data
 *    that is a destructive trap, so drift must be caught early and repaired
 *    deliberately rather than discovered at the reset prompt.
 *
 * 2. Missing raw-SQL indexes. Some indexes cannot be expressed in
 *    schema.prisma — a GIN index on an Unsupported("tsvector") column, and a
 *    trigram index needing gin_trgm_ops. They live in migrations only, so
 *    `prisma migrate diff` does not know about them and will happily propose
 *    dropping them. Applying such a diff would silently degrade company-name
 *    fuzzy search and knowledge full-text search with no error anywhere.
 *
 *   npm run db:check-migrations            # verify, exit 1 on problems
 *   npm run db:check-migrations -- --repair  # re-record checksums from files
 *
 * Repair only rewrites the stored checksum. It never runs DDL, so it is safe
 * only when the database genuinely reflects the migration files — which is the
 * case for line-ending drift and for edits that merely make an already-applied
 * migration replay-safe.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import "@/lib/env";
import { prisma } from "@/lib/prisma";

/**
 * Indexes created by raw SQL in migrations that schema.prisma cannot express.
 * `prisma migrate diff` proposes dropping these; they must never disappear.
 */
const CRITICAL_RAW_SQL_INDEXES = [
  {
    name: "registry_entity_name_trgm",
    purpose: "trigram fuzzy matching on company names in search",
  },
  {
    name: "KnowledgeChunk_searchVector_idx",
    purpose: "full-text search over the knowledge corpus",
  },
] as const;

type MigrationRow = {
  id: string;
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

function fileChecksum(migrationName: string): string | null {
  try {
    const raw = readFileSync(join("prisma/migrations", migrationName, "migration.sql"));
    return createHash("sha256").update(raw).digest("hex");
  } catch {
    return null;
  }
}

async function main() {
  const repair = process.argv.includes("--repair");

  const rows = await prisma.$queryRawUnsafe<MigrationRow[]>(
    `SELECT id, migration_name, checksum, finished_at, rolled_back_at
     FROM _prisma_migrations ORDER BY started_at ASC`,
  );

  const drifted: MigrationRow[] = [];
  const missingFiles: string[] = [];
  const unfinished: string[] = [];

  for (const row of rows) {
    if (row.finished_at === null && row.rolled_back_at === null) {
      unfinished.push(row.migration_name);
    }
    const actual = fileChecksum(row.migration_name);
    if (actual === null) {
      missingFiles.push(row.migration_name);
      continue;
    }
    if (actual !== row.checksum) drifted.push(row);
  }

  console.log(`Migrasjoner registrert i databasen: ${rows.length}`);

  if (missingFiles.length > 0) {
    console.log(
      `\nMangler migrasjonsfil (${missingFiles.length}) — databasen kjenner en migrasjon som ikke finnes i repoet:`,
    );
    for (const name of missingFiles) console.log(`  ${name}`);
  }

  if (unfinished.length > 0) {
    console.log(`\nUfullførte migrasjonsrader (${unfinished.length}):`);
    for (const name of unfinished) console.log(`  ${name}`);
  }

  if (drifted.length === 0) {
    console.log("Sjekksummer: alle stemmer.");
  } else if (!repair) {
    console.log(
      `\nSjekksumavvik (${drifted.length}). Prisma vil se historikken som endret og kan tilby å nullstille databasen.`,
    );
    for (const row of drifted) console.log(`  ${row.migration_name}`);
    console.log(
      "\nVanligste årsak er linjeskift. Kontroller at .gitattributes tvinger LF for prisma/migrations/**/*.sql,",
    );
    console.log(
      "normaliser filene, og kjør deretter: npm run db:check-migrations -- --repair",
    );
  } else {
    console.log(`\nReparerer ${drifted.length} sjekksummer fra filene på disk:`);
    for (const row of drifted) {
      const actual = fileChecksum(row.migration_name);
      if (!actual) continue;
      await prisma.$executeRawUnsafe(
        `UPDATE _prisma_migrations SET checksum = $1 WHERE id = $2`,
        actual,
        row.id,
      );
      console.log(`  ${row.migration_name}`);
    }
  }

  const indexRows = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
  );
  const present = new Set(indexRows.map((row) => row.indexname));
  const missingIndexes = CRITICAL_RAW_SQL_INDEXES.filter((idx) => !present.has(idx.name));

  console.log(
    `\nKritiske rå-SQL-indekser: ${CRITICAL_RAW_SQL_INDEXES.length - missingIndexes.length}/${CRITICAL_RAW_SQL_INDEXES.length} til stede.`,
  );
  for (const idx of missingIndexes) {
    console.log(`  MANGLER ${idx.name} — ${idx.purpose}`);
  }

  const failed =
    missingIndexes.length > 0 ||
    missingFiles.length > 0 ||
    unfinished.length > 0 ||
    (!repair && drifted.length > 0);

  if (failed) {
    process.exitCode = 1;
    console.log("\nKontrollen feilet.");
  } else {
    console.log("\nKontrollen er OK.");
  }
}

main()
  .catch((error) => {
    console.error("Kontrollen kunne ikke kjøres:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
