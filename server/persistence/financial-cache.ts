import fs from "node:fs/promises";
import path from "node:path";

import env from "@/lib/env";
import {
  DataAvailability,
  NormalizedFinancialDocument,
  NormalizedFinancialStatement,
} from "@/lib/types";

type CachedFinancials = {
  version: number;
  cachedAt: string;
  statements: NormalizedFinancialStatement[];
  documents: NormalizedFinancialDocument[];
  availability: DataAvailability;
};

const cacheDirectory = path.join(process.cwd(), ".projectx-cache", "financials");
const cacheVersion = 6;

function getCachePath(orgNumber: string) {
  return path.join(cacheDirectory, `${orgNumber}.json`);
}

function reviveStatement(statement: Omit<NormalizedFinancialStatement, "fetchedAt" | "normalizedAt"> & {
  fetchedAt: string;
  normalizedAt: string;
}): NormalizedFinancialStatement {
  return {
    ...statement,
    fetchedAt: new Date(statement.fetchedAt),
    normalizedAt: new Date(statement.normalizedAt),
  };
}

function reviveDocument(document: Omit<NormalizedFinancialDocument, "fetchedAt" | "normalizedAt"> & {
  fetchedAt: string;
  normalizedAt: string;
}): NormalizedFinancialDocument {
  return {
    ...document,
    fetchedAt: new Date(document.fetchedAt),
    normalizedAt: new Date(document.normalizedAt),
  };
}

export async function readFinancialCache(orgNumber: string): Promise<CachedFinancials | null> {
  try {
    const payload = await fs.readFile(getCachePath(orgNumber), "utf8");
    const parsed = JSON.parse(payload) as CachedFinancials;
    if (parsed.version !== cacheVersion) {
      return null;
    }
    const cacheAgeMs = Date.now() - new Date(parsed.cachedAt).getTime();

    if (cacheAgeMs > env.cacheHours * 60 * 60 * 1000) {
      return null;
    }

    return {
      version: parsed.version,
      cachedAt: parsed.cachedAt,
      availability: parsed.availability,
      statements: parsed.statements.map((statement) => reviveStatement(statement as never)),
      documents: parsed.documents.map((document) => reviveDocument(document as never)),
    };
  } catch {
    return null;
  }
}

export async function writeFinancialCache(
  orgNumber: string,
  financials: Omit<CachedFinancials, "cachedAt" | "version">,
) {
  await fs.mkdir(cacheDirectory, { recursive: true });
  await fs.writeFile(
    getCachePath(orgNumber),
    JSON.stringify(
      {
        version: cacheVersion,
        cachedAt: new Date().toISOString(),
        ...financials,
      },
      null,
      2,
    ),
    "utf8",
  );
}
