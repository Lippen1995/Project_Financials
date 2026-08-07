import "./_load-env";

import crypto from "node:crypto";
import fs from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";

import { prisma } from "@/lib/prisma";
import {
  parseShareholderRegisterCsvHeader,
  splitShareholderRegisterCsvLine,
} from "@/lib/shareholder-register-csv";
import { rebuildRoleChangeAttributions } from "@/server/insider-transactions/role-change-attribution-service";

const DEFAULT_DIR = path.join(
  process.env.USERPROFILE ?? "",
  "OneDrive",
  "Skrivebord",
  "Aksjonærregister",
);

type ImportCounters = {
  processedBytes: bigint;
  parsedRows: number;
  importedRows: number;
  skippedRows: number;
  errorRows: number;
};

type ParsedArgs = {
  dir: string;
  filePath: string | null;
  importId: string | null;
  singleYear: number | null;
  years: Set<number> | null;
  truncateYear: boolean;
};

type NormalizedHolding = {
  sourceRowNumber: number;
  taxYear: number;
  issuerOrgNumber: string;
  issuerName: string;
  shareClass: string | null;
  shareholderName: string;
  shareholderIdentifierRaw: string | null;
  shareholderOrgNumber: string | null;
  shareholderBirthYear: number | null;
  shareholderType: "PERSON" | "COMPANY" | "UNKNOWN";
  postalCode: string | null;
  postalPlace: string | null;
  countryCode: string | null;
  numberOfShares: bigint;
  totalCompanyShares: bigint | null;
  ownershipPercent: string | null;
  sourceId: string;
};

async function rebuildCurrentInsiderAttributions(taxYear: number) {
  const companies = await prisma.company.findMany({
    where: {
      insiderTransactions: {
        some: { status: "ACTIVE", instrumentType: "SHARE" },
      },
    },
    select: { id: true, orgNumber: true },
  });

  for (const company of companies) {
    const latestSnapshot = await prisma.shareholderRegisterHolding.aggregate({
      where: { issuerOrgNumber: company.orgNumber },
      _max: { taxYear: true },
    });
    if (latestSnapshot._max.taxYear !== taxYear) continue;
    await rebuildRoleChangeAttributions({
      companyId: company.id,
      orgNumber: company.orgNumber,
      snapshotTaxYear: taxYear,
    });
  }
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let dir = process.env.AKSJONAERREGISTER_DIR || DEFAULT_DIR;
  let filePath: string | null = null;
  let importId: string | null = null;
  let singleYear: number | null = null;
  let years: Set<number> | null = null;
  let truncateYear = true;

  for (const arg of args) {
    if (arg.startsWith("--dir=")) {
      dir = path.resolve(arg.slice("--dir=".length));
      continue;
    }
    if (arg.startsWith("--file=")) {
      filePath = path.resolve(arg.slice("--file=".length));
      continue;
    }
    if (arg.startsWith("--import-id=")) {
      importId = arg.slice("--import-id=".length);
      continue;
    }
    if (arg.startsWith("--year=")) {
      singleYear = Number.parseInt(arg.slice("--year=".length), 10);
      continue;
    }
    if (arg.startsWith("--years=")) {
      years = new Set(
        arg
          .slice("--years=".length)
          .split(",")
          .map((year) => Number.parseInt(year.trim(), 10))
          .filter(Number.isInteger),
      );
      continue;
    }
    if (arg === "--no-truncate-year") {
      truncateYear = false;
      continue;
    }
  }

  if (filePath && !Number.isInteger(singleYear)) {
    throw new Error("--file krever --year=<aar>.");
  }

  return { dir, filePath, importId, singleYear, years, truncateYear };
}

function sqlLiteral(value: string | number | bigint | null | undefined) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function runPsql(sql: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      "docker",
      ["exec", "-i", "projectx-db", "psql", "-U", "postgres", "-d", "projectx", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || stdout || `psql exited with code ${code}`));
      }
    });
  });
}

async function createImportRecord(input: {
  id: string;
  taxYear: number;
  filePath: string;
  fileSizeBytes: bigint;
}) {
  const now = new Date().toISOString();
  await runPsql(`
    INSERT INTO "ShareholderRegisterImport" (
      "id", "taxYear", "sourceFileName", "sourcePath", "fileSizeBytes", "totalBytes",
      "status", "fetchedAt", "startedAt", "createdAt", "updatedAt"
    )
    VALUES (
      ${sqlLiteral(input.id)}, ${input.taxYear}, ${sqlLiteral(path.basename(input.filePath))},
      ${sqlLiteral(input.filePath)}, ${input.fileSizeBytes}, ${input.fileSizeBytes},
      'VALIDATING', ${sqlLiteral(now)}, ${sqlLiteral(now)}, ${sqlLiteral(now)}, ${sqlLiteral(now)}
    );
  `);
}

async function updateImportRecord(
  importId: string,
  status: "VALIDATING" | "IMPORTING" | "COMPLETED" | "PARTIAL" | "FAILED",
  counters: Partial<ImportCounters>,
  extra?: { checksum?: string; failureMessage?: string; completed?: boolean },
) {
  const sets = [
    `"status" = ${sqlLiteral(status)}`,
    `"updatedAt" = ${sqlLiteral(new Date().toISOString())}`,
  ];

  if (counters.processedBytes !== undefined) {
    sets.push(`"processedBytes" = ${counters.processedBytes}`);
  }
  if (counters.parsedRows !== undefined) {
    sets.push(`"parsedRowCount" = ${counters.parsedRows}`);
  }
  if (counters.importedRows !== undefined) {
    sets.push(`"importedRowCount" = ${counters.importedRows}`);
  }
  if (counters.skippedRows !== undefined) {
    sets.push(`"skippedRowCount" = ${counters.skippedRows}`);
  }
  if (counters.errorRows !== undefined) {
    sets.push(`"errorRowCount" = ${counters.errorRows}`);
  }
  if (extra?.checksum) {
    sets.push(`"sourceChecksum" = ${sqlLiteral(extra.checksum)}`);
  }
  if (extra?.failureMessage) {
    sets.push(`"failureMessage" = ${sqlLiteral(extra.failureMessage.slice(0, 2000))}`);
  }
  if (extra?.completed) {
    sets.push(`"completedAt" = ${sqlLiteral(new Date().toISOString())}`);
  }

  await runPsql(`UPDATE "ShareholderRegisterImport" SET ${sets.join(", ")} WHERE "id" = ${sqlLiteral(importId)};`);
}

async function clearImportRowsForRetry(importId: string) {
  await runPsql(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM "GroupRelationshipPublication"
        WHERE "sourceImportId" = ${sqlLiteral(importId)}
      ) THEN
        RAISE EXCEPTION 'Cannot replace shareholder import % while it backs a published group snapshot', ${sqlLiteral(importId)};
      END IF;
      DELETE FROM "ShareholderRegisterHolding" WHERE "importId" = ${sqlLiteral(importId)};
    END $$;
  `);
}

function parseBigIntSafe(value: string | undefined) {
  const normalized = (value ?? "").replace(/\s/g, "").replace(",", ".");
  if (!normalized) {
    return null;
  }
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return BigInt(Math.trunc(numeric));
}

function computeOwnershipPercent(numberOfShares: bigint, totalShares: bigint | null) {
  if (!totalShares || totalShares <= 0n) {
    return null;
  }
  const scale = 10n ** 8n;
  const scaled = (numberOfShares * 100n * scale + totalShares / 2n) / totalShares;
  const intPart = scaled / scale;
  const fractional = (scaled % scale).toString().padStart(8, "0");
  return `${intPart}.${fractional}`;
}

function parsePostal(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return { postalCode: null, postalPlace: null };
  }
  const match = trimmed.match(/^(\d{4})\s*(.*)$/);
  if (!match) {
    return { postalCode: null, postalPlace: trimmed };
  }
  return {
    postalCode: match[1],
    postalPlace: match[2]?.trim() || null,
  };
}

function normalizeIdentifier(value: string | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) {
    return {
      shareholderIdentifierRaw: null,
      shareholderOrgNumber: null,
      shareholderBirthYear: null,
      shareholderType: "UNKNOWN" as const,
    };
  }

  const digits = raw.replace(/\D/g, "");
  if (/^\d{9}$/.test(digits)) {
    return {
      shareholderIdentifierRaw: raw,
      shareholderOrgNumber: digits,
      shareholderBirthYear: null,
      shareholderType: "COMPANY" as const,
    };
  }

  if (/^\d{4}$/.test(digits)) {
    return {
      shareholderIdentifierRaw: raw,
      shareholderOrgNumber: null,
      shareholderBirthYear: Number.parseInt(digits, 10),
      shareholderType: "PERSON" as const,
    };
  }

  return {
    shareholderIdentifierRaw: raw,
    shareholderOrgNumber: null,
    shareholderBirthYear: null,
    shareholderType: "UNKNOWN" as const,
  };
}

function normalizeHolding(
  taxYear: number,
  sourceRowNumber: number,
  headers: string[],
  values: string[],
  indexes: Record<string, number>,
): NormalizedHolding | null {
  const issuerOrgNumber = (values[indexes.issuerOrgNumber] ?? "").replace(/\D/g, "");
  const issuerName = (values[indexes.issuerName] ?? "").trim();
  const shareholderName = (values[indexes.shareholderName] ?? "").trim();
  const numberOfShares = parseBigIntSafe(values[indexes.numberOfShares]);
  const totalCompanyShares = parseBigIntSafe(values[indexes.totalCompanyShares]);

  if (!/^\d{9}$/.test(issuerOrgNumber) || !issuerName || !numberOfShares || numberOfShares <= 0n) {
    return null;
  }

  const identifier = normalizeIdentifier(values[indexes.shareholderIdentifier]);
  const postal = parsePostal(values[indexes.postal]);
  const shareClass = (values[indexes.shareClass] ?? "").trim() || null;
  const countryCode = (values[indexes.countryCode] ?? "").trim() || null;

  return {
    sourceRowNumber,
    taxYear,
    issuerOrgNumber,
    issuerName,
    shareClass,
    shareholderName,
    shareholderIdentifierRaw: identifier.shareholderIdentifierRaw,
    shareholderOrgNumber: identifier.shareholderOrgNumber,
    shareholderBirthYear: identifier.shareholderBirthYear,
    shareholderType: identifier.shareholderType,
    postalCode: postal.postalCode,
    postalPlace: postal.postalPlace,
    countryCode,
    numberOfShares,
    totalCompanyShares,
    ownershipPercent: computeOwnershipPercent(numberOfShares, totalCompanyShares),
    sourceId: `${taxYear}:${sourceRowNumber}`,
  };
}

function copyText(value: string | number | bigint | null) {
  if (value === null) {
    return "\\N";
  }
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function toCopyLine(importId: string, holding: NormalizedHolding, now: string) {
  return [
    importId,
    holding.sourceRowNumber,
    holding.taxYear,
    holding.issuerOrgNumber,
    holding.issuerName,
    holding.shareClass,
    holding.shareholderName,
    holding.shareholderIdentifierRaw,
    holding.shareholderOrgNumber,
    holding.shareholderBirthYear,
    holding.shareholderType,
    holding.postalCode,
    holding.postalPlace,
    holding.countryCode,
    holding.numberOfShares,
    holding.totalCompanyShares,
    holding.ownershipPercent,
    "SKATTEETATEN_CSV",
    "shareholder_register_row",
    holding.sourceId,
    now,
    now,
  ]
    .map(copyText)
    .join("\t");
}

function startCopyProcess() {
  const columns = [
    "importId",
    "sourceRowNumber",
    "taxYear",
    "issuerOrgNumber",
    "issuerName",
    "shareClass",
    "shareholderName",
    "shareholderIdentifierRaw",
    "shareholderOrgNumber",
    "shareholderBirthYear",
    "shareholderType",
    "postalCode",
    "postalPlace",
    "countryCode",
    "numberOfShares",
    "totalCompanyShares",
    "ownershipPercent",
    "sourceSystem",
    "sourceEntityType",
    "sourceId",
    "fetchedAt",
    "normalizedAt",
  ]
    .map((column) => `"${column}"`)
    .join(", ");

  const sql = `COPY "ShareholderRegisterHolding" (${columns}) FROM STDIN WITH (FORMAT text, DELIMITER E'\\t', NULL '\\N')`;
  return spawn(
    "docker",
    ["exec", "-i", "projectx-db", "psql", "-U", "postgres", "-d", "projectx", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
}

function waitForCopy(child: ReturnType<typeof startCopyProcess>) {
  return new Promise<void>((resolve, reject) => {
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `COPY exited with code ${code}`));
      }
    });
  });
}

function extractYear(fileName: string) {
  const match = fileName.match(/(?:^|_)(20\d{2}|19\d{2})(?:\.|_|$)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

async function findCsvFiles(dir: string, years: Set<number> | null) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
    .map((entry) => {
      const taxYear = extractYear(entry.name);
      return taxYear ? { taxYear, filePath: path.join(dir, entry.name) } : null;
    })
    .filter((entry): entry is { taxYear: number; filePath: string } => Boolean(entry))
    .filter((entry) => !years || years.has(entry.taxYear))
    .sort((left, right) => left.taxYear - right.taxYear);

  if (files.length === 0) {
    throw new Error(`Fant ingen CSV-filer i ${dir}.`);
  }

  return files;
}

async function importCsv(input: {
  taxYear: number;
  filePath: string;
  truncateYear: boolean;
  importId?: string | null;
}) {
  const fileStat = await stat(input.filePath);
  const importId = input.importId ?? crypto.randomUUID();
  const counters: ImportCounters = {
    processedBytes: 0n,
    parsedRows: 0,
    importedRows: 0,
    skippedRows: 0,
    errorRows: 0,
  };

  if (input.truncateYear && input.importId) {
    await clearImportRowsForRetry(input.importId);
  }
  if (!input.importId) {
    await createImportRecord({
      id: importId,
      taxYear: input.taxYear,
      filePath: input.filePath,
      fileSizeBytes: BigInt(fileStat.size),
    });
  }

  const hash = crypto.createHash("sha256");
  const copy = startCopyProcess();
  const copyDone = waitForCopy(copy);
  const now = new Date().toISOString();
  let headers: string[] | null = null;
  let indexes: Record<string, number> | null = null;
  let sourceRowNumber = 0;
  let lastProgressAt = Date.now();

  try {
    await updateImportRecord(importId, "IMPORTING", counters);
    const stream = fs.createReadStream(input.filePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      counters.processedBytes += BigInt(Buffer.byteLength(line, "utf8") + 1);
      hash.update(line);
      hash.update("\n");
      sourceRowNumber += 1;
      if (!headers) {
        const parsedHeader = parseShareholderRegisterCsvHeader(line);
        headers = parsedHeader.headers;
        indexes = parsedHeader.indexes;
        if (parsedHeader.missing.length > 0) {
          throw new Error(
            `CSV mangler påkrevde kolonner: ${parsedHeader.missing.join(", ")}. Headers: ${JSON.stringify(headers)}. Normalized: ${JSON.stringify(parsedHeader.normalized)}`,
          );
        }
        continue;
      }

      counters.parsedRows += 1;
      const values = splitShareholderRegisterCsvLine(line);
      const holding = normalizeHolding(input.taxYear, sourceRowNumber, headers, values, indexes!);
      if (!holding) {
        counters.skippedRows += 1;
      } else {
        const canContinue = copy.stdin.write(`${toCopyLine(importId, holding, now)}\n`);
        counters.importedRows += 1;
        if (!canContinue) {
          await new Promise<void>((resolve) => copy.stdin.once("drain", resolve));
        }
      }

      if (Date.now() - lastProgressAt > 5000) {
        await updateImportRecord(importId, "IMPORTING", counters);
        const percent = fileStat.size > 0 ? (Number(counters.processedBytes) / fileStat.size) * 100 : 0;
        console.log(
          `${input.taxYear}: ${percent.toFixed(1)}% (${counters.importedRows.toLocaleString("nb-NO")} rader importert)`,
        );
        lastProgressAt = Date.now();
      }
    }

    copy.stdin.end();
    await copyDone;

    const checksum = hash.digest("hex");
    const status = counters.skippedRows > 0 || counters.errorRows > 0 ? "PARTIAL" : "COMPLETED";
    await updateImportRecord(importId, status, counters, { checksum, completed: true });
    console.log(
      `${input.taxYear}: ferdig, ${counters.importedRows.toLocaleString("nb-NO")} rader importert, ${counters.skippedRows.toLocaleString("nb-NO")} hoppet over.`,
    );
  } catch (error) {
    copy.stdin.destroy();
    await updateImportRecord(importId, "FAILED", counters, {
      failureMessage: error instanceof Error ? error.message : String(error),
      completed: true,
    });
    throw error;
  }

  await rebuildCurrentInsiderAttributions(input.taxYear);
}

async function main() {
  const args = parseArgs();
  if (args.filePath && args.singleYear) {
    console.log(`Importerer ${args.singleYear}: ${args.filePath}`);
    await importCsv({
      taxYear: args.singleYear,
      filePath: args.filePath,
      truncateYear: args.truncateYear,
      importId: args.importId,
    });
    return;
  }

  const files = await findCsvFiles(args.dir, args.years);

  console.log(`Importerer ${files.length} CSV-fil(er) fra ${args.dir}`);
  for (const file of files) {
    console.log(`Starter ${file.taxYear}: ${file.filePath}`);
    await importCsv({
      taxYear: file.taxYear,
      filePath: file.filePath,
      truncateYear: args.truncateYear,
    });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
