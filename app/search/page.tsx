import { CompanyTable } from "@/components/company/company-table";
import { FilterPanel } from "@/components/search/filter-panel";
import { SearchForm } from "@/components/search/search-form";
import { searchCompanies } from "@/server/services/company-service";

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const companies = await searchCompanies({
    query: typeof params.query === "string" ? params.query : undefined,
    industryCode: typeof params.industryCode === "string" ? params.industryCode : undefined,
    city: typeof params.city === "string" ? params.city : undefined,
    status: typeof params.status === "string" ? (params.status as "ACTIVE" | "DISSOLVED" | "BANKRUPT") : undefined,
    minRevenue: typeof params.minRevenue === "string" ? Number(params.minRevenue) : undefined,
    minEmployees: typeof params.minEmployees === "string" ? Number(params.minEmployees) : undefined,
  });

  return (
    <main className="space-y-6">
      <section className="rounded-[1.75rem] border border-white/70 bg-white/80 p-6 shadow-panel">
        <h1 className="text-3xl font-semibold tracking-tight">Selskapssok</h1>
        <p className="mt-2 text-sm text-ink/65">Sok pa navn eller organisasjonsnummer, og filtrer pa bransje, geografi og storrelse.</p>
        <div className="mt-5"><SearchForm compact /></div>
      </section>
      <FilterPanel searchParams={params} />
      <CompanyTable companies={companies} />
    </main>
  );
}