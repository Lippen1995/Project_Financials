import type { Route } from "next";
import Link from "next/link";

import { AiSearchPanel } from "@/components/search/ai-search-panel";
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

const pageSize = 15;

function readPage(value: string | string[] | undefined) {
  if (typeof value !== "string") {
    return 1;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function buildQueryString(
  current: Record<string, string | string[] | undefined>,
  next: Record<string, string | number | undefined>,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(current)) {
    if (typeof value === "string" && value) {
      params.set(key, value);
    }
  }

  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || value === "") {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }
  }

  const queryString = params.toString();
  return (queryString ? `/search?${queryString}` : "/search") as Route;
}

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
      "S\u00f8ket mot virksomhetsregisteret kunne ikke fullf\u00f8res akkurat n\u00e5. Pr\u00f8v igjen med selskapsnavn eller organisasjonsnummer.";
  }

  const query =
    typeof params.query === "string" && params.query.trim().length > 0 ? params.query.trim() : null;
  const aiEnabled = params.ai === "1";
  const isFullTableView = params.view === "table";
  const totalResults = searchResult.results.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const currentPage = Math.min(readPage(params.page), totalPages);
  const pageOffset = (currentPage - 1) * pageSize;
  const visibleResults = isFullTableView
    ? searchResult.results.slice(pageOffset, pageOffset + pageSize)
    : searchResult.results.slice(0, pageSize);
  const showingStart = totalResults === 0 ? 0 : pageOffset + 1;
  const showingEnd = totalResults === 0 ? 0 : pageOffset + visibleResults.length;
  const previewEnd = Math.min(pageSize, totalResults);
  const showPagination = isFullTableView && totalPages > 1;
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);

  return (
    <main className={`space-y-10 pb-12${aiEnabled ? " sm:pr-[400px]" : ""}`}>
      <section className="border-b border-[var(--px-border-subtle)] bg-[rgba(255,255,255,0.72)]">
        <div className="grid lg:grid-cols-[minmax(0,1.32fr),360px]">
          <div className="border-b border-[var(--px-border-subtle)] px-6 py-8 sm:px-8 sm:py-10 lg:border-b-0 lg:border-r lg:px-10 lg:py-12">
            <div className="data-label text-[11px] font-semibold uppercase text-[var(--px-muted)]">
              {"S\u00f8keverkt\u00f8y"}
            </div>
            <h1 className="editorial-display mt-4 max-w-3xl text-[2.65rem] leading-[0.98] text-[var(--px-text)] sm:text-[3.5rem]">
              {"Finn norske selskaper med mer presise treff."}
            </h1>
            <p className="mt-5 max-w-2xl text-[0.98rem] leading-8 text-[var(--px-muted)]">
              {
                "V\u00e5r database kombinerer offentlige registre med AI-drevet analyse for \u00e5 gi deg dypere innsikt i b\u00e5de noterte og unoterte foretak."
              }
            </p>
            <div className="mt-8 max-w-3xl">
              <SearchForm compact />
            </div>
          </div>

          <aside className="bg-[var(--px-panel)] px-6 py-8 text-white sm:px-8 sm:py-10 lg:px-10 lg:py-12">
            <div className="data-label text-[11px] font-semibold uppercase text-white/60">
              Arbeidsflate
            </div>
            <h2 className="mt-5 text-[1.9rem] font-semibold leading-tight text-white">
              {"Vurdering, ikke bare oppslag."}
            </h2>
            <p className="mt-5 max-w-[18rem] text-sm leading-7 text-white/80">
              {
                "Resultatene presenteres med fokus p\u00e5 finansielle kontakt- og operative signaler. Bruk tabellen under for \u00e5 sammenligne n\u00f8kkeltall og vurdere risiko direkte i oversikten."
              }
            </p>
          </aside>
        </div>
      </section>

      <section className="grid gap-8 xl:grid-cols-[240px,minmax(0,1fr)]">
        <aside className="space-y-5 xl:pt-1">
          <div className="space-y-3 border-t border-[rgba(15,23,42,0.12)] pt-4">
            <div className="data-label text-[11px] font-semibold uppercase text-[var(--px-muted)]">
              Filtrering
            </div>
          </div>
          <FilterPanel searchParams={params} />
        </aside>

        <div className="space-y-6">
          <div className="flex flex-col gap-4 border-b border-[var(--px-border-subtle)] pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-[2rem] font-semibold text-[var(--px-text)]">
                {totalResults} selskaper funnet
              </h2>
              <p className="mt-1 text-sm text-[var(--px-muted)]">
                {searchResult.interpretation.intentSummary
                  ? searchResult.interpretation.intentSummary
                  : "Registrerte virksomheter fra offentlige kilder."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--px-muted)]">
              {query ? (
                <span className="border border-[var(--px-border)] bg-[rgba(255,255,255,0.9)] px-3 py-1">
                  {"S\u00f8k "} {query}
                </span>
              ) : null}
              {typeof params.legalForm === "string" && params.legalForm ? (
                <span className="border border-[var(--px-border)] bg-[rgba(255,255,255,0.9)] px-3 py-1">
                  {"Form "} {params.legalForm}
                </span>
              ) : null}
              {typeof params.status === "string" && params.status ? (
                <span className="border border-[var(--px-border)] bg-[rgba(255,255,255,0.9)] px-3 py-1">
                  {"Status "} {params.status}
                </span>
              ) : null}
            </div>
          </div>

          {searchError ? (
            <div className="border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
              {searchError}
            </div>
          ) : null}

          {!searchError && query ? (
            <div className="flex flex-col gap-4 border-b border-[var(--px-border-subtle)] pb-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <span className="text-sm font-semibold text-[var(--px-text)]">
                  {searchResult.interpretation.aiAssisted ? "Tolket s\u00f8k" : "Direkte s\u00f8k"}
                </span>
                <span className="text-sm text-[var(--px-muted)]">
                  {searchResult.interpretation.intentSummary
                    ? searchResult.interpretation.intentSummary
                    : "Trefflisten er strukturert ut fra registrerte virksomhetsdata."}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--px-muted)]">
                {searchResult.interpretation.matchedIndustryCodes.map((item) => (
                  <span
                    key={item.code}
                    className="border border-[var(--px-border)] bg-[rgba(255,255,255,0.9)] px-3 py-1"
                  >
                    {"N\u00e6ringskode "} {item.code}
                    {item.title ? ` ${item.title}` : ""}
                  </span>
                ))}

                {searchResult.interpretation.geographicTerm ? (
                  <span className="border border-[var(--px-border)] bg-[rgba(255,255,255,0.9)] px-3 py-1">
                    {"Geografi "} {searchResult.interpretation.geographicTerm}
                  </span>
                ) : null}

                {searchResult.interpretation.fallbackReason ? (
                  <span className="border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
                    {searchResult.interpretation.fallbackReason}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="space-y-4">
            <div className="pt-1 text-sm text-[var(--px-muted)]">
              {isFullTableView
                ? `Viser ${showingStart}-${showingEnd} av ${totalResults} selskaper i tabellen.`
                : `Viser de ${previewEnd} \u00f8verste treffene. \u00c5pne tabellvisning for hele listen.`}
            </div>

            {showPagination || totalResults > pageSize ? (
              <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--px-muted)]">
                {showPagination ? (
                  <>
                    {currentPage > 1 ? (
                      <Link
                        href={buildQueryString(params, { view: "table", page: currentPage - 1 })}
                        className="border border-[var(--px-border)] px-3 py-1 font-medium text-[var(--px-text)] transition-colors hover:bg-[rgba(15,23,42,0.06)]"
                      >
                        Forrige 15
                      </Link>
                    ) : (
                      <span className="border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.62)] px-3 py-1 text-[rgba(15,23,42,0.35)]">
                        Forrige 15
                      </span>
                    )}

                    {pageNumbers.map((pageNumber) =>
                      pageNumber === currentPage ? (
                        <span
                          key={pageNumber}
                          className="border border-[var(--px-panel)] bg-[var(--px-panel)] px-3 py-1 font-semibold text-white"
                        >
                          {pageNumber}
                        </span>
                      ) : (
                        <Link
                          key={pageNumber}
                          href={buildQueryString(params, { view: "table", page: pageNumber })}
                          className="border border-[var(--px-border)] px-3 py-1 font-medium text-[var(--px-text)] transition-colors hover:bg-[rgba(15,23,42,0.06)]"
                        >
                          {pageNumber}
                        </Link>
                      ),
                    )}

                    {currentPage < totalPages ? (
                      <Link
                        href={buildQueryString(params, { view: "table", page: currentPage + 1 })}
                        className="border border-[var(--px-border)] px-3 py-1 font-medium text-[var(--px-text)] transition-colors hover:bg-[rgba(15,23,42,0.06)]"
                      >
                        Neste 15
                      </Link>
                    ) : (
                      <span className="border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.62)] px-3 py-1 text-[rgba(15,23,42,0.35)]">
                        Neste 15
                      </span>
                    )}
                  </>
                ) : null}

              </div>
            ) : null}

            <CompanyTable companies={visibleResults} />
          </div>
        </div>
      </section>

      {aiEnabled ? <AiSearchPanel query={query} /> : null}
    </main>
  );
}
