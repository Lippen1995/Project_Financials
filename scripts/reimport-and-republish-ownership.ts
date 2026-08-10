import "./_load-env";

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { prisma } from "@/lib/prisma";

/**
 * Re-import the Skatteetaten shareholder register for a range of tax years and republish the
 * semantic group snapshot for each.
 *
 * Ordering matters and is the reason this exists as one command. A published group snapshot
 * pins its source import: `clearImportRowsForRetry` refuses to replace holdings while a
 * publication points at them. So each year runs as drop publication → re-import in place →
 * rebuild. Years are processed newest first, because the newest year is the one the product
 * reads by default and should be restored first.
 *
 * Re-importing reuses the existing import record rather than creating a second one for the
 * same year, so holdings are replaced instead of duplicated.
 *
 * Usage: npm run ownership:reimport -- --from=2015 --to=2025
 */

const DEFAULT_DIR = path.join(
  process.env.USERPROFILE ?? "",
  "OneDrive",
  "Skrivebord",
  "Aksjonærregister",
);

type YearPlan = {
  taxYear: number;
  importId: string;
  filePath: string;
};

function parseArgs() {
  let from: number | null = null;
  let to: number | null = null;
  let dir = process.env.AKSJONAERREGISTER_DIR || DEFAULT_DIR;

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--from=")) {
      from = Number.parseInt(arg.slice("--from=".length), 10);
      continue;
    }
    if (arg.startsWith("--to=")) {
      to = Number.parseInt(arg.slice("--to=".length), 10);
      continue;
    }
    if (arg.startsWith("--dir=")) {
      dir = path.resolve(arg.slice("--dir=".length));
      continue;
    }
  }

  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    throw new Error("Bruk: --from=<år> --to=<år>");
  }
  if ((from as number) > (to as number)) {
    throw new Error("--from kan ikke være større enn --to.");
  }
  return { from: from as number, to: to as number, dir };
}

/**
 * Resolve every year up front so a missing file or import record fails before any data is
 * touched, rather than halfway through a multi-hour run.
 */
async function buildPlan(from: number, to: number, dir: string): Promise<YearPlan[]> {
  const plan: YearPlan[] = [];
  const problems: string[] = [];

  for (let taxYear = to; taxYear >= from; taxYear -= 1) {
    const filePath = path.join(dir, `aksjeeiebok_${taxYear}.csv`);
    if (!fs.existsSync(filePath)) {
      problems.push(`${taxYear}: fant ikke ${filePath}`);
      continue;
    }
    const existing = await prisma.shareholderRegisterImport.findFirst({
      where: { taxYear },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    });
    if (!existing) {
      problems.push(`${taxYear}: ingen eksisterende importrad å gjenbruke`);
      continue;
    }
    plan.push({ taxYear, importId: existing.id, filePath });
  }

  if (problems.length > 0) {
    throw new Error(`Kan ikke starte:\n${problems.join("\n")}`);
  }
  return plan;
}

/**
 * `npx` resolves to a shell script, so the child has to go through a shell. Node warns about
 * combining `shell: true` with an argument array (DEP0190) because the arguments are
 * concatenated rather than escaped, but hand-quoting is the worse option here: backslash
 * escaping is a POSIX convention that cmd.exe does not honour, and applying it corrupts the
 * Windows paths this script passes. The arguments are all internally constructed — a year, a
 * uuid, and a register path with no spaces or shell metacharacters — so concatenation is safe,
 * and this form is the one proven across a full 2015–2025 run.
 */
function run(label: string, args: string[]) {
  console.log(`\n--- ${label} ---`);
  const result = spawnSync("npx", ["tsx", ...args], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`${label} feilet med exit-kode ${result.status}`);
  }
}

async function main() {
  const { from, to, dir } = parseArgs();
  const plan = await buildPlan(from, to, dir);

  console.log(
    `Re-importerer og republiserer ${plan.length} skatteår (nyeste først): ` +
      plan.map((entry) => entry.taxYear).join(", "),
  );

  const succeeded: number[] = [];
  const failed: Array<{ taxYear: number; message: string }> = [];

  for (const entry of plan) {
    const started = Date.now();
    try {
      // The publication pins the current holdings; it must go before they can be replaced.
      // Orphaned snapshot rows are swept by the next successful build.
      const removed = await prisma.groupRelationshipPublication.deleteMany({
        where: { taxYear: entry.taxYear },
      });
      if (removed.count > 0) {
        console.log(`\n${entry.taxYear}: fjernet publisert konsern-snapshot før re-import.`);
      }

      run(`${entry.taxYear}: importerer aksjonærregister`, [
        "scripts/import-shareholder-register-csvs.ts",
        `--year=${entry.taxYear}`,
        `--file=${entry.filePath}`,
        `--import-id=${entry.importId}`,
      ]);

      run(`${entry.taxYear}: bygger og publiserer konsernstruktur`, [
        "scripts/build-ownership-edges.ts",
        `--year=${entry.taxYear}`,
      ]);

      const minutes = ((Date.now() - started) / 60000).toFixed(1);
      console.log(`\n${entry.taxYear}: ferdig på ${minutes} min.`);
      succeeded.push(entry.taxYear);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\n${entry.taxYear}: FEILET — ${message}`);
      // Years are independent, so a failure must not cost the remaining ones.
      failed.push({ taxYear: entry.taxYear, message });
    }
  }

  console.log("\n=== Oppsummering ===");
  console.log(`Fullført: ${succeeded.length > 0 ? succeeded.join(", ") : "ingen"}`);
  if (failed.length > 0) {
    console.log(`Feilet: ${failed.map((entry) => entry.taxYear).join(", ")}`);
    for (const entry of failed) {
      console.log(`  ${entry.taxYear}: ${entry.message}`);
    }
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
