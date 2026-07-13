import { CompanySearchWorkspace } from "@/components/search/company-search-workspace";
import type { CompanySearchRow } from "@/lib/company-search-sort";
import type { CompanySearchResponse } from "@/lib/types";
import { searchCompanies } from "@/server/services/company-service";

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

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  const params = {
    query: readParam(rawParams.query).trim(),
    industryCode: readParam(rawParams.industryCode).trim(),
    city: readParam(rawParams.city).trim(),
    legalForm: readParam(rawParams.legalForm).trim(),
    status: readParam(rawParams.status).trim(),
    aiEnabled: rawParams.ai === "1",
  };

  let searchResult = emptySearchResult;
  let searchError: string | null = null;

  try {
    searchResult = await searchCompanies({
      query: params.query || undefined,
      aiAssisted: false,
      industryCode: params.industryCode || undefined,
      city: params.city || undefined,
      legalForm: params.legalForm || undefined,
      status:
        params.status === "ACTIVE" ||
        params.status === "DISSOLVED" ||
        params.status === "BANKRUPT"
          ? params.status
          : undefined,
    });
  } catch {
    searchError =
      "Søket mot virksomhetsregisteret kunne ikke fullføres akkurat nå. Prøv igjen med selskapsnavn eller organisasjonsnummer.";
  }

  const rows: CompanySearchRow[] = searchResult.results.map((result) => ({
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

  return (
    <CompanySearchWorkspace
      rows={rows}
      params={params}
      searchError={searchError}
    />
  );
}
