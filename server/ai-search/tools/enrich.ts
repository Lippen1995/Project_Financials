import { prisma } from "@/lib/prisma";
import { getPublishedAnnualReportFinancials } from "@/server/services/annual-report-financials-service";
import { getCompanyOwnershipOverview } from "@/server/ownership/ownership-overview-service";
import type { NormalizedFinancialStatement } from "@/lib/types";
import type { FinancialSnapshot, OwnershipSummary, QualitativeSummary } from "./types";

/** How many years of accounts the deep profile carries — enough to read a trend, cheap on tokens. */
const PROFILE_FINANCIAL_YEARS = 3;

/** Board-report excerpt length. The full text can be pages; a lead excerpt is enough to reason on. */
const BUSINESS_SUMMARY_MAX_CHARS = 1200;

function toSnapshot(s: NormalizedFinancialStatement): FinancialSnapshot {
  return {
    fiscalYear: s.fiscalYear,
    currency: s.currency,
    revenue: s.revenue ?? null,
    operatingProfit: s.operatingProfit ?? null,
    netIncome: s.netIncome ?? null,
    equity: s.equity ?? null,
    assets: s.assets ?? null,
  };
}

function bigIntToNumber(value: bigint | null): number | null {
  return value == null ? null : Number(value);
}

/**
 * Latest published headline accounts for many companies in ONE query — for ranked shortlists
 * (find_comparables) where a per-company call would be an N+1. Only companies present in our
 * Company table with at least one company-scope statement appear in the result; callers must
 * treat a missing orgNumber as "no data", not zero.
 */
export async function getLatestFinancialsByOrgNumbers(
  orgNumbers: string[],
): Promise<Map<string, FinancialSnapshot>> {
  const result = new Map<string, FinancialSnapshot>();
  if (orgNumbers.length === 0) {
    return result;
  }

  const companies = await prisma.company.findMany({
    where: { orgNumber: { in: orgNumbers } },
    select: {
      orgNumber: true,
      financialStatements: {
        where: { statementScope: "COMPANY" },
        orderBy: { fiscalYear: "desc" },
        take: 1,
        select: {
          fiscalYear: true,
          currency: true,
          revenue: true,
          operatingProfit: true,
          netIncome: true,
          equity: true,
          assets: true,
        },
      },
    },
  });

  for (const company of companies) {
    const latest = company.financialStatements[0];
    if (!latest) continue;
    result.set(company.orgNumber, {
      fiscalYear: latest.fiscalYear,
      currency: latest.currency,
      revenue: bigIntToNumber(latest.revenue),
      operatingProfit: bigIntToNumber(latest.operatingProfit),
      netIncome: bigIntToNumber(latest.netIncome),
      equity: bigIntToNumber(latest.equity),
      assets: bigIntToNumber(latest.assets),
    });
  }

  return result;
}

/** Multi-year company-scope accounts, most-recent-first, capped for the deep profile. */
async function getFinancialSeries(orgNumber: string): Promise<FinancialSnapshot[]> {
  try {
    const { statements } = await getPublishedAnnualReportFinancials(orgNumber);
    return statements
      .filter((s) => (s.statementScope ?? "COMPANY") === "COMPANY")
      .sort((a, b) => b.fiscalYear - a.fiscalYear)
      .slice(0, PROFILE_FINANCIAL_YEARS)
      .map(toSnapshot);
  } catch {
    // Financials are best-effort enrichment; never fail the whole profile on their account.
    return [];
  }
}

/** Collapse the full ownership overview into the acquirability signals the agent ranks on. */
async function getOwnershipSummary(
  orgNumber: string,
  companyName: string,
): Promise<OwnershipSummary | null> {
  try {
    const overview = await getCompanyOwnershipOverview({ orgNumber, companyName });
    if (overview.year === null) {
      return null;
    }

    const controlling = overview.directShareholders.reduce<
      OwnershipSummary["controllingOwner"]
    >((best, sh) => {
      const pct = sh.ownershipPercent ?? 0;
      if (best === null || pct > (best.ownershipPercent ?? 0)) {
        return {
          name: sh.name,
          orgNumber: sh.orgNumber,
          type: sh.type,
          ownershipPercent: sh.ownershipPercent,
        };
      }
      return best;
    }, null);

    const group = overview.group;
    const subsidiaryCount = group
      ? group.nodes.filter((n) => n.parentOrgNumber === orgNumber).length
      : 0;

    return {
      year: overview.year,
      controllingOwner: controlling,
      ownerCount: overview.directShareholders.length,
      partOfGroup: group?.ultimateParent != null,
      ultimateParentName: group?.ultimateParent?.name ?? null,
      subsidiaryCount,
    };
  } catch {
    return null;
  }
}

/**
 * The "what they do" layer. Prefers the offline-built CompanyWebProfile (website scrape reasoned
 * into prose about products + value-chain position) — the richest qualitative source — and falls
 * back to the latest board-report excerpt when no web profile exists. Read via raw SQL because the
 * Prisma client is not regenerated while the dev server holds the query-engine DLL.
 */
async function getQualitativeSummary(
  orgNumber: string,
  description: string | null,
  website: string | null,
): Promise<QualitativeSummary> {
  const webRows = await prisma.$queryRaw<Array<{ businessSummary: string | null; sourceUrl: string | null }>>`
    SELECT "businessSummary", "sourceUrl" FROM "CompanyWebProfile" WHERE "orgNumber" = ${orgNumber} LIMIT 1
  `.catch(() => [] as Array<{ businessSummary: string | null; sourceUrl: string | null }>);
  const web = webRows[0];

  if (web?.businessSummary) {
    return {
      description: description ?? null,
      website: website ?? web.sourceUrl ?? null,
      businessSummary: web.businessSummary,
      businessSummarySource: "website",
      sourceUrl: web.sourceUrl ?? null,
      businessSummaryYear: null,
    };
  }

  const narrative = await prisma.annualReportNarrative
    .findFirst({
      where: {
        company: { orgNumber },
        sectionKind: "BOARD_REPORT",
        statementScope: "COMPANY",
      },
      orderBy: { fiscalYear: "desc" },
      select: { fullText: true, textPreview: true, fiscalYear: true },
    })
    .catch(() => null);

  const raw = narrative?.fullText ?? narrative?.textPreview ?? null;
  const businessSummary = raw
    ? raw.length > BUSINESS_SUMMARY_MAX_CHARS
      ? `${raw.slice(0, BUSINESS_SUMMARY_MAX_CHARS).trimEnd()}…`
      : raw
    : null;

  return {
    description: description ?? null,
    website: website ?? null,
    businessSummary,
    businessSummarySource: businessSummary ? "board-report" : null,
    sourceUrl: null,
    businessSummaryYear: businessSummary ? (narrative?.fiscalYear ?? null) : null,
  };
}

export type ProfileEnrichment = {
  financials: FinancialSnapshot[];
  ownership: OwnershipSummary | null;
  qualitative: QualitativeSummary;
};

/**
 * Gather the deep enrichment for one company: multi-year financials, an ownership/acquirability
 * summary, and a qualitative (board-report) description. Runs the three reads concurrently; each
 * degrades to empty/null on its own rather than failing the profile.
 */
export async function buildProfileEnrichment(params: {
  orgNumber: string;
  companyName: string;
  description: string | null;
  website: string | null;
}): Promise<ProfileEnrichment> {
  const [financials, ownership, qualitative] = await Promise.all([
    getFinancialSeries(params.orgNumber),
    getOwnershipSummary(params.orgNumber, params.companyName),
    getQualitativeSummary(params.orgNumber, params.description, params.website),
  ]);

  return { financials, ownership, qualitative };
}
