import { Prisma } from "@prisma/client";

import { BrregCompanyProvider } from "@/integrations/brreg/brreg-company-provider";
import {
  fetchNewswebIssuers,
  type NewswebIssuer,
} from "@/integrations/news/newsweb-provider";
import { prisma } from "@/lib/prisma";
import type { NormalizedCompany } from "@/lib/types";
import { normalizeCompanyName } from "@/server/news/company-alias-service";
import { upsertCompanySnapshot } from "@/server/persistence/company-repository";

const SOURCE_SYSTEM = "NEWSWEB";
const NORWEGIAN_LEGAL_NAME_PATTERN = /\b(?:AS|ASA|SPAREBANK|SPAREBANKEN)\.?$/i;

type RegistryCompany = {
  id: string;
  name: string;
  orgNumber: string;
};

export type NewswebIssuerRegistrySyncResult = {
  issuersFetched: number;
  invalidIssuersSkipped: number;
  activeIssuers: number;
  matchedExisting: number;
  matchedFromBrreg: number;
  unmatched: number;
  ambiguous: number;
  brregLookups: number;
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function normalizedFullName(value: string) {
  return normalizeCompanyName(value).replace(/\s+/g, " ").trim();
}

function uniqueCompanyByFullName(companies: RegistryCompany[]) {
  const byName = new Map<string, RegistryCompany[]>();
  for (const company of companies) {
    const key = normalizedFullName(company.name);
    const values = byName.get(key) ?? [];
    values.push(company);
    byName.set(key, values);
  }
  return byName;
}

export function matchNewswebIssuerToCompanies(
  issuer: NewswebIssuer,
  companies: RegistryCompany[],
) {
  const candidates = uniqueCompanyByFullName(companies).get(normalizedFullName(issuer.name)) ?? [];
  return {
    company: candidates.length === 1 ? candidates[0] : null,
    ambiguous: candidates.length > 1,
  };
}

function shouldResolveThroughBrreg(issuer: NewswebIssuer) {
  return (issuer.isActive ?? 0) > 0 && NORWEGIAN_LEGAL_NAME_PATTERN.test(issuer.name.trim());
}

async function exactBrregCompany(
  issuer: NewswebIssuer,
  provider: BrregCompanyProvider,
): Promise<NormalizedCompany | null> {
  const matches = await provider.searchCompanies({
    query: issuer.name,
    size: 10,
  });
  const exact = matches.filter(
    (company) => normalizedFullName(company.name) === normalizedFullName(issuer.name),
  );
  return exact.length === 1 ? exact[0] : null;
}

export async function syncNewswebIssuerRegistry(options: {
  brregLookupLimit?: number;
  issuerLimit?: number;
  fetchIssuers?: () => Promise<NewswebIssuer[]>;
  brregProvider?: BrregCompanyProvider;
} = {}): Promise<NewswebIssuerRegistrySyncResult> {
  const fetchedAt = new Date();
  const fetchedIssuers = await (options.fetchIssuers ?? fetchNewswebIssuers)();
  const issuers = fetchedIssuers
    .filter(
      (issuer) =>
        Number.isFinite(issuer?.issuerId) &&
        typeof issuer?.name === "string" &&
        issuer.name.trim().length > 0,
    )
    .slice(0, options.issuerLimit ?? Number.POSITIVE_INFINITY);
  let companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      orgNumber: true,
    },
  });
  let companiesByFullName = uniqueCompanyByFullName(companies);
  const brregProvider = options.brregProvider ?? new BrregCompanyProvider();
  const brregLookupLimit = Math.max(0, options.brregLookupLimit ?? 100);

  let matchedExisting = 0;
  let matchedFromBrreg = 0;
  let unmatched = 0;
  let ambiguous = 0;
  let brregLookups = 0;

  for (const issuer of issuers) {
    const sourceIssuerId = String(issuer.issuerId);
    const normalizedIssuerName = normalizedFullName(issuer.name);
    let candidates = companiesByFullName.get(normalizedIssuerName) ?? [];
    let company = candidates.length === 1 ? candidates[0] : null;
    let matchMethod: string | null = company ? "exact_legal_name" : null;
    let matchConfidence = company ? 1 : 0;

    if (!company && candidates.length === 0 && brregLookups < brregLookupLimit && shouldResolveThroughBrreg(issuer)) {
      brregLookups += 1;
      try {
        const brregCompany = await exactBrregCompany(issuer, brregProvider);
        if (brregCompany) {
          await upsertCompanySnapshot(brregCompany);
          company = await prisma.company.findUnique({
            where: { orgNumber: brregCompany.orgNumber },
            select: { id: true, name: true, orgNumber: true },
          });
          if (company) {
            companies = [...companies.filter((item) => item.id !== company!.id), company];
            companiesByFullName = uniqueCompanyByFullName(companies);
            matchMethod = "brreg_exact_legal_name";
            matchConfidence = 1;
            matchedFromBrreg += 1;
          }
        }
      } catch {
        // A failed lookup must not prevent the remaining official issuer list from being persisted.
      }
    }

    candidates = companiesByFullName.get(normalizedIssuerName) ?? [];
    if (!company && candidates.length > 1) {
      ambiguous += 1;
      matchMethod = "ambiguous_legal_name";
    } else if (company && matchMethod === "exact_legal_name") {
      matchedExisting += 1;
    } else if (!company) {
      unmatched += 1;
    }

    await prisma.newsIssuerIdentity.upsert({
      where: {
        sourceSystem_sourceIssuerId: {
          sourceSystem: SOURCE_SYSTEM,
          sourceIssuerId,
        },
      },
      update: {
        issuerSign: issuer.issuerSign || null,
        symbol: issuer.symbol || null,
        issuerName: issuer.name,
        isActive: (issuer.isActive ?? 0) > 0,
        companyId: company?.id ?? null,
        matchMethod,
        matchConfidence,
        fetchedAt,
        normalizedAt: new Date(),
        rawPayload: json(issuer),
      },
      create: {
        sourceSystem: SOURCE_SYSTEM,
        sourceIssuerId,
        issuerSign: issuer.issuerSign || null,
        symbol: issuer.symbol || null,
        issuerName: issuer.name,
        isActive: (issuer.isActive ?? 0) > 0,
        companyId: company?.id ?? null,
        matchMethod,
        matchConfidence,
        fetchedAt,
        normalizedAt: new Date(),
        rawPayload: json(issuer),
      },
    });
  }

  return {
    issuersFetched: issuers.length,
    invalidIssuersSkipped: fetchedIssuers.length - issuers.length,
    activeIssuers: issuers.filter((issuer) => (issuer.isActive ?? 0) > 0).length,
    matchedExisting,
    matchedFromBrreg,
    unmatched,
    ambiguous,
    brregLookups,
  };
}
