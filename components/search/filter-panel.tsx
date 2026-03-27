export function FilterPanel({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  return (
    <form className="grid gap-3 border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.88)] p-5 md:grid-cols-2 xl:grid-cols-1">
      <input type="hidden" name="query" value={String(searchParams.query ?? "")} />
      <input
        name="industryCode"
        defaultValue={String(searchParams.industryCode ?? "")}
        placeholder="Næringskode, f.eks. 62.010"
        className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm"
      />
      <input
        name="city"
        defaultValue={String(searchParams.city ?? "")}
        placeholder="Poststed"
        className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm"
      />
      <input
        name="legalForm"
        defaultValue={String(searchParams.legalForm ?? "")}
        placeholder="Organisasjonsform, f.eks. AS"
        className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm"
      />
      <select
        name="status"
        defaultValue={String(searchParams.status ?? "")}
        className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm"
      >
        <option value="">Alle statuser</option>
        <option value="ACTIVE">Aktiv</option>
        <option value="DISSOLVED">Avviklet/slettet</option>
        <option value="BANKRUPT">Konkurs</option>
      </select>
      <div className="flex items-center">
        <button type="submit" className="rounded-full bg-[#182535] px-5 py-3 text-sm font-semibold text-white">
          Oppdater filtre
        </button>
      </div>
      <p className="text-sm leading-6 text-slate-600">
        Kombiner gjerne filtre med navn eller organisasjonsnummer for å få skarpere treff.
      </p>
    </form>
  );
}
