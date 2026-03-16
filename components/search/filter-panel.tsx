export function FilterPanel({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  return (
    <form className="grid gap-3 rounded-[1.75rem] border border-white/70 bg-white/80 p-5 shadow-panel md:grid-cols-2 xl:grid-cols-5">
      <input type="hidden" name="query" value={String(searchParams.query ?? "")} />
      <input
        name="industryCode"
        defaultValue={String(searchParams.industryCode ?? "")}
        placeholder="Næringskode, f.eks. 62.010"
        className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
      />
      <input
        name="city"
        defaultValue={String(searchParams.city ?? "")}
        placeholder="Poststed"
        className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
      />
      <input
        name="legalForm"
        defaultValue={String(searchParams.legalForm ?? "")}
        placeholder="Organisasjonsform, f.eks. AS"
        className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
      />
      <select
        name="status"
        defaultValue={String(searchParams.status ?? "")}
        className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
      >
        <option value="">Alle statuser</option>
        <option value="ACTIVE">Aktiv</option>
        <option value="DISSOLVED">Avviklet/slettet</option>
        <option value="BANKRUPT">Konkurs</option>
      </select>
      <div className="flex items-center">
        <button type="submit" className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white">
          Oppdater filtre
        </button>
      </div>
      <p className="text-sm text-ink/60 md:col-span-2 xl:col-span-5">
        Filtreringen i MVP-et bruker åpne Brreg-oppslag og etterbehandling i ProjectX. Kombiner gjerne filtre med navn eller organisasjonsnummer for mest presise treff.
      </p>
    </form>
  );
}
