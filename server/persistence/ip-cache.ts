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
const elCertificateCacheDirectory = path.join(process.cwd(), ".projectx-cache", "nve-elcert");
// Bump when the mapped IPRightSummary shape changes so stale portfolios refetch:
//   2 — added `expiryDate`
//   3 — populated `registrationOrGrantDate` for active rights
const cacheVersion = 3;
const elCertificateCacheVersion = 1;

function getCachePath(orgNumber: string, directory = cacheDirectory) {
  return path.join(directory, `${orgNumber}.json`);
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
  return readPortfolioCache(orgNumber, cacheVersion, cacheDirectory);
}

export async function readElCertificatePortfolioCache(orgNumber: string): Promise<CachedIpPortfolio | null> {
  return readPortfolioCache(orgNumber, elCertificateCacheVersion, elCertificateCacheDirectory);
}

async function readPortfolioCache(
  orgNumber: string,
  expectedVersion: number,
  directory: string,
): Promise<CachedIpPortfolio | null> {
  try {
    const payload = await fs.readFile(getCachePath(orgNumber, directory), "utf8");
    const parsed = JSON.parse(payload) as CachedIpPortfolio;
    if (parsed.version !== expectedVersion) {
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
      logRecoverableError("ip-cache.read", error, { orgNumber, directory });
    }

    return null;
  }
}

export async function writeIpPortfolioCache(orgNumber: string, rights: IPRightSummary[]) {
  await writePortfolioCache(orgNumber, rights, cacheVersion, cacheDirectory);
}

export async function writeElCertificatePortfolioCache(orgNumber: string, rights: IPRightSummary[]) {
  await writePortfolioCache(orgNumber, rights, elCertificateCacheVersion, elCertificateCacheDirectory);
}

async function writePortfolioCache(
  orgNumber: string,
  rights: IPRightSummary[],
  version: number,
  directory: string,
) {
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    getCachePath(orgNumber, directory),
    JSON.stringify(
      {
        version,
        cachedAt: new Date().toISOString(),
        rights,
      },
      null,
      2,
    ),
    "utf8",
  );
}
