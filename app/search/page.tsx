import { CompanyTable } from "@/components/company/company-table";
import { FilterPanel } from "@/components/search/filter-panel";
import { SearchForm } from "@/components/search/search-form";
import { CompanySearchResponse } from "@/lib/types";
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

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  let searchResult: CompanySearchResponse = emptySearchResult;
  let searchError: string | null = null;

  try {
    searchResult = await searchCompanies({
      query: typeof params.query === "string" ? params.query : undefined,
      industryCode: typeof params.industryCode === "string" ? params.industryCode : undefined,
      city: typeof params.city === "string" ? params.city : undefined,
      legalForm: typeof params.legalForm === "string" ? params.legalForm : undefined,
      status:
        typeof params.status === "string"
          ? (params.status as "ACTIVE" | "DISSOLVED" | "BANKRUPT")
          : undefined,
    });
  } catch {
    searchError =
      "Søket mot virksomhetsregisteret feilet akkurat nå. Prøv igjen med selskapsnavn eller organisasjonsnummer.";
  }

  return (
    <main className="space-y-8 pb-10">
      <section className="grid gap-0 border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.78)] xl:grid-cols-[minmax(0,1.45fr),340px]">
        <div className="p-8">
          <div className="data-label inline-flex rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-3 py-1 text-[11px] font-semibold uppercase text-slate-600">
            Søkeflate
          </div>
          <h1 className="editorial-display mt-5 max-w-4xl text-[3rem] leading-[0.98] text-slate-950 sm:text-[4rem]">
            Finn selskaper med skarpere treff.
          </h1>
          <p className="mt-4 max-w-3xl text-[1.02rem] leading-8 text-slate-600">
            Skriv vanlige søk, navn eller organisasjonsnummer. Resultatene tolkes for bedre treff,
            men bygger fortsatt på reelle data fra Brreg, SSB og lagret regnskap.
          </p>
          <div className="mt-6">
            <SearchForm compact />
          </div>
        </div>

        <aside className="border-t border-[rgba(15,23,42,0.08)] bg-[#192536] p-8 text-white xl:border-l xl:border-t-0">
          <div className="data-label text-[11px] font-semibold uppercase text-white/60">Arbeidsflyt</div>
          <div className="mt-4 text-[1.45rem] font-semibold leading-tight">
            Trefflisten er bygget for vurdering
          </div>
          <p className="mt-4 text-sm leading-7 text-white/76">
            AI brukes bare til å tolke søketeksten. Selve kandidatene og sorteringen bygger fortsatt
            på reelle data fra Brreg, SSB og lagret regnskap.
          </p>
        </aside>
      </section>

      <section className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="border-t border-[rgba(15,23,42,0.12)] pt-4">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
              Filtrering
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Innsnevr resultatene med feltene som er mest relevante for vurdering.
            </p>
          </div>
          <FilterPanel searchParams={params} />
        </div>

        <div className="space-y-4">
          <div className="flex items-end justify-between gap-4 border-b border-[rgba(15,23,42,0.08)] pb-4">
            <div>
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Treff</div>
              <h2 className="mt-2 text-[1.8rem] font-semibold text-slate-950">
                {searchResult.results.length} selskaper funnet
              </h2>
            </div>
            <div className="text-sm text-slate-500">
              Søk: {typeof params.query === "string" && params.query ? params.query : "Ingen søketekst angitt"}
            </div>
          </div>

          {searchError ? (
            <div className="border border-red-200 bg-red-50 p-5 text-sm text-red-700">
              {searchError}
            </div>
          ) : null}

          {!searchError && typeof params.query === "string" && params.query ? (
            <div className="border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.72)] p-5 text-sm text-slate-600">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">
                  {searchResult.interpretation.aiAssisted ? "AI-tolket søk" : "Fallback-søk"}
                </span>
                {searchResult.interpretation.intentSummary ? (
                  <span>{searchResult.interpretation.intentSummary}</span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                {searchResult.interpretation.matchedIndustryCodes.map((item) => (
                  <span
                    key={item.code}
                    className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-3 py-1"
                  >
                    Næringskode {item.code}
                    {item.title ? ` ${item.title}` : ""}
                  </span>
                ))}
                {searchResult.interpretation.geographicTerm ? (
                  <span className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-3 py-1">
                    Geografi {searchResult.interpretation.geographicTerm}
                  </span>
                ) : null}
                {searchResult.interpretation.fallbackReason ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
                    {searchResult.interpretation.fallbackReason}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          <CompanyTable companies={searchResult.results} />
        </div>
      </section>
    </main>
  );
}
