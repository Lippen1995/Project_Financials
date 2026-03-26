import { CompanyTable } from "@/components/company/company-table";
import { FilterPanel } from "@/components/search/filter-panel";
import { SearchForm } from "@/components/search/search-form";
import { NormalizedCompany } from "@/lib/types";
import { searchCompanies } from "@/server/services/company-service";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  let companies: NormalizedCompany[] = [];
  let searchError: string | null = null;

  try {
    companies = await searchCompanies({
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
            Søk i norske selskaper med samme disiplin som resten av analyseproduktet.
          </h1>
          <p className="mt-4 max-w-3xl text-[1.02rem] leading-8 text-slate-600">
            Søk på navn, organisasjonsnummer og kombiner med filter på næringskode, sted,
            organisasjonsform og status. Resultatene er laget for rask scanning, ikke katalogvisning.
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
            Bruk søkeresultatet til å orientere deg raskt, og gå videre til selskapsprofilen for
            regnskap, struktur, roller og dokumentasjon.
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
                {companies.length} selskaper funnet
              </h2>
            </div>
            <div className="text-sm text-slate-500">
              Søk:{" "}
              {typeof params.query === "string" && params.query
                ? params.query
                : "Ingen søketekst angitt"}
            </div>
          </div>

          {searchError ? (
            <div className="border border-red-200 bg-red-50 p-5 text-sm text-red-700">
              {searchError}
            </div>
          ) : null}

          <CompanyTable companies={companies} />
        </div>
      </section>
    </main>
  );
}
