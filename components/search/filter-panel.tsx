import { getSearchFacets } from "@/server/services/company-service";

export async function FilterPanel({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const facets = await getSearchFacets();

  return (
    <form className="grid gap-3 rounded-[1.75rem] border border-white/70 bg-white/80 p-5 shadow-panel md:grid-cols-2 xl:grid-cols-5">
      <input type="hidden" name="query" value={String(searchParams.query ?? "")} />
      <select name="industryCode" defaultValue={String(searchParams.industryCode ?? "")} className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm">
        <option value="">Alle bransjer</option>
        {facets.industries.map((industry) => (
          <option key={industry.code} value={industry.code}>{industry.code} {industry.title}</option>
        ))}
      </select>
      <select name="city" defaultValue={String(searchParams.city ?? "")} className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm">
        <option value="">Alle steder</option>
        {facets.cities.map((city) => (
          <option key={city} value={city}>{city}</option>
        ))}
      </select>
      <select name="status" defaultValue={String(searchParams.status ?? "")} className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm">
        <option value="">Alle statuser</option>
        {facets.statuses.map((status) => (
          <option key={status} value={status}>{status}</option>
        ))}
      </select>
      <input name="minRevenue" type="number" defaultValue={String(searchParams.minRevenue ?? "")} placeholder="Min. omsetning" className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm" />
      <input name="minEmployees" type="number" defaultValue={String(searchParams.minEmployees ?? "")} placeholder="Min. ansatte" className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm" />
      <div className="md:col-span-2 xl:col-span-5">
        <button type="submit" className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white">Oppdater filtre</button>
      </div>
    </form>
  );
}