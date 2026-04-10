import fs from "node:fs/promises";
import path from "node:path";

import env from "@/lib/env";
import { logRecoverableError } from "@/lib/recoverable-error";
import { IPRightSummary } from "@/lib/types";

type CachedIpPortfolio = {
  version: number;
  cachedAt: string;
  rights: IPRightSummary[];
};

const cacheDirectory = path.join(process.cwd(), ".projectx-cache", "ip-rights");
const cacheVersion = 1;

function getCachePath(orgNumber: string) {
  return path.join(cacheDirectory, `${orgNumber}.json`);
}

function reviveRight(
  right: Omit<IPRightSummary, "fetchedAt" | "normalizedAt"> & { fetchedAt: string; normalizedAt: string },
): IPRightSummary {
  return {
    ...right,
    fetchedAt: new Date(right.fetchedAt),
    normalizedAt: new Date(right.normalizedAt),
  };
}

export async function readIpPortfolioCache(orgNumber: string): Promise<CachedIpPortfolio | null> {
  try {
    const payload = await fs.readFile(getCachePath(orgNumber), "utf8");
    const parsed = JSON.parse(payload) as CachedIpPortfolio;
    if (parsed.version !== cacheVersion) {
      return null;
    }

    const ageMs = Date.now() - new Date(parsed.cachedAt).getTime();
    if (ageMs > env.cacheHours * 60 * 60 * 1000) {
      return null;
    }

    return {
      ...parsed,
      rights: parsed.rights.map((right) => reviveRight(right as never)),
    };
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      logRecoverableError("ip-cache.read", error, { orgNumber });
    }

    return null;
  }
}

export async function writeIpPortfolioCache(orgNumber: string, rights: IPRightSummary[]) {
  await fs.mkdir(cacheDirectory, { recursive: true });
  await fs.writeFile(
    getCachePath(orgNumber),
    JSON.stringify(
      {
        version: cacheVersion,
        cachedAt: new Date().toISOString(),
        rights,
      },
      null,
      2,
    ),
    "utf8",
  );
}
