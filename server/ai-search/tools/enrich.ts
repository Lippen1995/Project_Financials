import { prisma } from "@/lib/prisma";
import { getPublishedAnnualReportFinancials } from "@/server/services/annual-report-financials-service";
import { getCompanyOwnershipOverview } from "@/server/ownership/ownership-overview-service";
import type { NormalizedFinancialStatement } from "@/lib/types";
import type {
  CompanyEventSummary,
  DistressSummary,
  FeasibilitySummary,
  FinancialSnapshot,
  OwnershipSummary,
  QualitativeSummary,
} from "./types";

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

type OwnershipOverview = Awaited<ReturnType<typeof getCompanyOwnershipOverview>>;

/** Fetch the ownership overview once — both the acquirability summary and feasibility derive from it. */
async function fetchOwnershipOverview(
  orgNumber: string,
  companyName: string,
): Promise<OwnershipOverview | null> {
  try {
    const overview = await getCompanyOwnershipOverview({ orgNumber, companyName });
    return overview.year === null ? null : overview;
  } catch {
    return null;
  }
}

/** Collapse the full ownership overview into the acquirability signals the agent ranks on. */
function toOwnershipSummary(
  overview: OwnershipOverview | null,
  orgNumber: string,
): OwnershipSummary | null {
  if (!overview) return null;
  {
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
  }
}

/** Defence / dual-use vocabulary. Matched against the NACE line and the business description. */
const SECURITY_SENSITIVE_TERMS =
  /(våpen|ammunisjon|militær|forsvar|defence|defense|weapon|ammunition|missil|naval|krigsmateriell)/i;

/**
 * Grounded inputs for the feasibility judgement. This does NOT decide whether a deal is allowed —
 * it surfaces the facts that decide it: is the sector security-critical (would ownership change be
 * screened under sikkerhetsloven), and who owns the company today, from which countries. Clearance
 * status is unavailable in our data and is always reported as unknown.
 */
function buildFeasibility(params: {
  overview: OwnershipOverview | null;
  naceCode: string | null;
  naceDescription: string | null;
  legalForm: string | null;
  businessSummary: string | null;
}): FeasibilitySummary {
  const naceLine = [params.naceCode, params.naceDescription].filter(Boolean).join(" ").trim();

  let securitySensitiveSector = false;
  let sectorBasis: string | null = null;
  if (params.naceDescription && SECURITY_SENSITIVE_TERMS.test(params.naceDescription)) {
    securitySensitiveSector = true;
    sectorBasis = `NACE: ${naceLine}`;
  } else if (params.businessSummary && SECURITY_SENSITIVE_TERMS.test(params.businessSummary)) {
    securitySensitiveSector = true;
    sectorBasis = "Business description indicates defence / dual-use activity";
  }

  // Aggregate registered direct ownership by holder country. Holders with an unknown country are
  // left out of the foreign total rather than silently counted as Norwegian.
  const byCountry = new Map<string, number>();
  let knownPercent = 0;
  let foreignPercent = 0;
  for (const holder of params.overview?.directShareholders ?? []) {
    const country = holder.countryCode?.trim().toUpperCase();
    const pct = holder.ownershipPercent ?? 0;
    if (!country) continue;
    byCountry.set(country, (byCountry.get(country) ?? 0) + pct);
    knownPercent += pct;
    if (country !== "NO") foreignPercent += pct;
  }

  const ownerCountries = [...byCountry.entries()]
    .map(([countryCode, ownershipPercent]) => ({
      countryCode,
      ownershipPercent: Math.round(ownershipPercent * 100) / 100,
    }))
    .sort((a, b) => b.ownershipPercent - a.ownershipPercent);

  return {
    securitySensitiveSector,
    sectorBasis,
    foreignOwnershipPercent:
      knownPercent > 0 ? Math.round(foreignPercent * 100) / 100 : null,
    ownerCountries,
    isListedAsa: (params.legalForm ?? "").toUpperCase() === "ASA",
    clearanceStatus: null,
  };
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

/** Highest-value events only — enough to reason on, cheap in replayed tool-result tokens. */
const EVENT_LIMIT = 5;

/**
 * Risk + availability signals: distress state and material events (deals, contracts, restructuring).
 * Both hang off the enriched `Company` table, so a company that exists only in the registry mirror
 * has NO signals tracked — we return `tracked: false` so the agent reports "unknown", not "none".
 */
async function getSignals(orgNumber: string): Promise<{
  distress: DistressSummary | null;
  events: CompanyEventSummary[];
  tracked: boolean;
}> {
  const company = await prisma.company
    .findFirst({ where: { orgNumber }, select: { id: true } })
    .catch(() => null);
  if (!company) {
    return { distress: null, events: [], tracked: false };
  }

  const [distress, events] = await Promise.all([
    prisma.companyDistressProfile
      .findUnique({
        where: { companyId: company.id },
        select: {
          distressStatus: true,
          statusStartedAt: true,
          daysInStatus: true,
          bankruptcyDate: true,
          lastAnnouncementTitle: true,
        },
      })
      .catch(() => null),
    prisma.companyEvent
      .findMany({
        where: { companyId: company.id, status: "ACTIVE" },
        orderBy: [{ investorValueScore: "desc" }, { lastSeen: "desc" }],
        take: EVENT_LIMIT,
        select: {
          eventType: true,
          title: true,
          summary: true,
          eventDate: true,
          investorValueScore: true,
        },
      })
      .catch(() => []),
  ]);

  return {
    tracked: true,
    distress: distress
      ? {
          status: distress.distressStatus,
          statusStartedAt: distress.statusStartedAt?.toISOString() ?? null,
          daysInStatus: distress.daysInStatus ?? null,
          bankruptcyDate: distress.bankruptcyDate?.toISOString() ?? null,
          lastAnnouncementTitle: distress.lastAnnouncementTitle ?? null,
        }
      : null,
    events: events.map((e) => ({
      eventType: e.eventType,
      title: e.title,
      summary: e.summary ?? null,
      eventDate: e.eventDate?.toISOString() ?? null,
      investorValueScore: e.investorValueScore,
    })),
  };
}

export type ProfileEnrichment = {
  financials: FinancialSnapshot[];
  ownership: OwnershipSummary | null;
  qualitative: QualitativeSummary;
  distress: DistressSummary | null;
  events: CompanyEventSummary[];
  signalsTracked: boolean;
  feasibility: FeasibilitySummary;
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
  naceCode: string | null;
  naceDescription: string | null;
  legalForm: string | null;
}): Promise<ProfileEnrichment> {
  const [financials, overview, qualitative, signals, registry] = await Promise.all([
    getFinancialSeries(params.orgNumber),
    fetchOwnershipOverview(params.orgNumber, params.companyName),
    getQualitativeSummary(params.orgNumber, params.description, params.website),
    getSignals(params.orgNumber),
    // The search mirror's NormalizedCompany does not carry the NACE description, so read it from the
    // registry directly — without it the security-sector check could only ever fire off the corpus,
    // and would silently miss every company we have not scraped a business description for.
    prisma.registryEntity
      .findUnique({
        where: { orgNumber: params.orgNumber },
        select: { naceCode: true, naceDescription: true },
      })
      .catch(() => null),
  ]);

  return {
    financials,
    ownership: toOwnershipSummary(overview, params.orgNumber),
    qualitative,
    distress: signals.distress,
    events: signals.events,
    signalsTracked: signals.tracked,
    feasibility: buildFeasibility({
      overview,
      naceCode: registry?.naceCode ?? params.naceCode,
      naceDescription: registry?.naceDescription ?? params.naceDescription,
      legalForm: params.legalForm,
      businessSummary: qualitative.businessSummary,
    }),
  };
}
