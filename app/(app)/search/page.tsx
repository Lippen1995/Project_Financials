import { CompanySearchWorkspace } from "@/components/search/company-search-workspace";
import type { CompanySearchRow } from "@/lib/company-search-sort";
import { safeAuth } from "@/lib/auth";
import {
  filterRowsByRevenueClass,
  isRevenueClass,
  type RevenueClass,
} from "@/lib/search-history";
import { logRecoverableError } from "@/lib/recoverable-error";
import type { CompanySearchResponse } from "@/lib/types";
import { canStartAiSearch } from "@/lib/ai-search-usage";
import { getAiSearchSubscriptionContext } from "@/server/billing/subscription";
import { searchCompanies } from "@/server/services/company-service";
import {
  getAiSearchUsageStatus,
  finalizeAiSearchUsage,
  recordCompanySearch,
  releaseAiSearchUsage,
  reserveAiSearchUsage,
} from "@/server/services/search-history-service";

const emptySearchResult: CompanySearchResponse = {
  results: [],
  interpretation: {
    originalQuery: "",
    rewrittenQuery: "",
    aiAssisted: false,
    fallbackReason: null,
    companyTerms: [],
    industryTerms: [],
    geographicTerm: null,
    geographicType: null,
    intentSummary: null,
    matchedIndustryCodes: [],
  },
};

function readParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function readSearchEventId(value: string | string[] | undefined) {
  const candidate = readParam(value).trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null;
}

function readCompanySearchScope(
  value: string | string[] | undefined,
): "companies" | "industries" | "bankruptcies" {
  return value === "industries" || value === "bankruptcies" ? value : "companies";
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  const session = await safeAuth();
  let subscriptionContext = { premium: false, billingPeriod: null } as Awaited<
    ReturnType<typeof getAiSearchSubscriptionContext>
  >;
  let aiUsageStatus = null;
  let aiReservationId: string | null = null;
  let quotaLookupFailed = false;
  if (session?.user?.id) {
    try {
      subscriptionContext = await getAiSearchSubscriptionContext(session.user.id);
      aiUsageStatus = await getAiSearchUsageStatus(
        session.user.id,
        subscriptionContext.premium,
        subscriptionContext.billingPeriod,
      );
      if (
        rawParams.ai === "1" &&
        subscriptionContext.premium &&
        subscriptionContext.billingPeriod
      ) {
        aiReservationId = await reserveAiSearchUsage(
          session.user.id,
          subscriptionContext.billingPeriod,
        );
      }
    } catch (error) {
      quotaLookupFailed = true;
      logRecoverableError("search-page.getAiSearchUsageStatus", error, {
        userId: session.user.id,
      });
    }
  }
  const aiRequested = rawParams.ai === "1";
  const aiAvailable = aiRequested
    ? Boolean(aiReservationId)
    : Boolean(aiUsageStatus && canStartAiSearch(aiUsageStatus));
  const revenueClass: RevenueClass | "" = isRevenueClass(rawParams.revenueClass)
    ? rawParams.revenueClass
    : "";
  const params = {
    query: readParam(rawParams.query ?? rawParams.q).trim(),
    industryCode: readParam(rawParams.industryCode).trim(),
    city: readParam(rawParams.city).trim(),
    legalForm: readParam(rawParams.legalForm).trim(),
    status: readParam(rawParams.status).trim(),
    revenueClass,
    aiEnabled: aiRequested && aiAvailable,
    scope: readCompanySearchScope(rawParams.scope),
    searchEventId: readSearchEventId(rawParams.searchEventId),
  };

  let searchResult = emptySearchResult;
  let searchError: string | null = null;
  const aiAccessMessage = aiRequested && !aiAvailable
    ? quotaLookupFailed
      ? "Tokenstatus er midlertidig utilgjengelig. AI-søk er deaktivert til statusen kan bekreftes."
      : subscriptionContext.premium
      ? subscriptionContext.billingPeriod
        ? "AI-søk er midlertidig deaktivert fordi tokenkvoten for denne abonnementsperioden er brukt opp."
        : "AI-søk er midlertidig deaktivert fordi abonnementsperioden ikke er tilgjengelig."
      : "AI-søk krever Premium-abonnement. Søket ble kjørt uten AI."
    : null;
  let aiUsageFinalized = false;

  try {
    searchResult = await searchCompanies(
      {
        query: params.query || undefined,
        aiAssisted: params.aiEnabled,
        industryCode: params.industryCode || undefined,
        city: params.city || undefined,
        legalForm: params.legalForm || undefined,
        status:
          params.status === "ACTIVE" ||
          params.status === "DISSOLVED" ||
          params.status === "BANKRUPT"
            ? params.status
            : undefined,
      },
      {
        onAiUsage: async (usage) => {
          if (session?.user?.id && aiReservationId) {
            await finalizeAiSearchUsage(session.user.id, aiReservationId, usage);
            aiUsageFinalized = true;
          }
        },
      },
    );
  } catch {
    searchError =
      "Søket mot virksomhetsregisteret kunne ikke fullføres akkurat nå. Prøv igjen med selskapsnavn eller organisasjonsnummer.";
  } finally {
    if (session?.user?.id && aiReservationId && !aiUsageFinalized) {
      try {
        await releaseAiSearchUsage(session.user.id, aiReservationId);
      } catch (error) {
        logRecoverableError("search-page.releaseAiSearchUsage", error, {
          userId: session.user.id,
          reservationId: aiReservationId,
        });
      }
    }
  }

  const matchedIndustryCodes = searchResult.interpretation.matchedIndustryCodes.map(
    (industry) => industry.code,
  );
  const scopedResults =
    params.scope === "industries"
      ? searchResult.results.filter((result) =>
          matchedIndustryCodes.some((code) => result.company.industryCode?.code.startsWith(code)),
        )
      : searchResult.results;

  const revenueFilteredResults = filterRowsByRevenueClass(scopedResults, params.revenueClass);

  const rows: CompanySearchRow[] = revenueFilteredResults.map((result) => ({
    orgNumber: result.company.orgNumber,
    name: result.company.name,
    status: result.company.status,
    industry: result.company.industryCode
      ? [result.company.industryCode.code, result.company.industryCode.title]
          .filter(Boolean)
          .join(" ")
      : null,
    city: result.company.addresses[0]?.city ?? null,
    revenue: result.revenue ?? null,
    revenueFiscalYear: result.revenueFiscalYear ?? null,
    operatingProfit: result.operatingProfit ?? null,
    netIncome: result.netIncome ?? null,
    employeeCount: result.company.employeeCount ?? null,
  }));

  const hasSearchCriteria = Boolean(
    params.query ||
      params.industryCode ||
      params.city ||
      params.legalForm ||
      params.status ||
      params.revenueClass,
  );

  if (
    hasSearchCriteria &&
    (params.searchEventId || searchResult.interpretation.aiUsage?.usageTokens)
  ) {
    if (session?.user?.id) {
      try {
        await recordCompanySearch({
          userId: session.user.id,
          eventKey: params.searchEventId,
          query: params.query,
          scope: params.scope,
          industryCode: params.industryCode,
          city: params.city,
          legalForm: params.legalForm,
          status: params.status,
          revenueClass: params.revenueClass,
          aiAssisted: params.aiEnabled,
          resultCount: rows.length,
          succeeded: !searchError,
          sectors: searchResult.interpretation.matchedIndustryCodes.map((sector) => ({
            code: sector.code,
            title:
              sector.title ??
              searchResult.results.find((result) =>
                result.company.industryCode?.code === sector.code,
              )?.company.industryCode?.title ??
              null,
          })),
        });
      } catch (error) {
        logRecoverableError("search-page.recordCompanySearch", error, {
          userId: session.user.id,
        });
      }
    }
  }

  return (
    <CompanySearchWorkspace
      rows={rows}
      params={params}
      searchError={searchError}
      aiAvailable={aiAvailable}
      aiAccessMessage={aiAccessMessage}
    />
  );
}
