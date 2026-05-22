export function FilterPanel({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  return (
    <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
      <input type="hidden" name="query" value={String(searchParams.query ?? "")} />

      <label className="grid gap-2">
        <span className="data-label text-[11px] font-semibold uppercase text-[var(--px-muted)]">
          {"N\u00e6ringskode"}
        </span>
        <input
          name="industryCode"
          defaultValue={String(searchParams.industryCode ?? "")}
          placeholder={"F.eks. 62.010"}
          className="border border-[var(--px-border)] bg-[rgba(255,255,255,0.9)] px-3 py-3 text-sm text-[var(--px-text)] outline-none transition-colors placeholder:text-[var(--px-muted)] focus:border-[var(--px-accent)]"
        />
      </label>

      <label className="grid gap-2">
        <span className="data-label text-[11px] font-semibold uppercase text-[var(--px-muted)]">
          Poststed
        </span>
        <input
          name="city"
          defaultValue={String(searchParams.city ?? "")}
          placeholder="Oslo"
          className="border border-[var(--px-border)] bg-[rgba(255,255,255,0.9)] px-3 py-3 text-sm text-[var(--px-text)] outline-none transition-colors placeholder:text-[var(--px-muted)] focus:border-[var(--px-accent)]"
        />
      </label>

      <label className="grid gap-2">
        <span className="data-label text-[11px] font-semibold uppercase text-[var(--px-muted)]">
          {"Organisasjonsform"}
        </span>
        <input
          name="legalForm"
          defaultValue={String(searchParams.legalForm ?? "")}
          placeholder="AS"
          className="border border-[var(--px-border)] bg-[rgba(255,255,255,0.9)] px-3 py-3 text-sm text-[var(--px-text)] outline-none transition-colors placeholder:text-[var(--px-muted)] focus:border-[var(--px-accent)]"
        />
      </label>

      <label className="grid gap-2">
        <span className="data-label text-[11px] font-semibold uppercase text-[var(--px-muted)]">
          Status
        </span>
        <select
          name="status"
          defaultValue={String(searchParams.status ?? "")}
          className="border border-[var(--px-border)] bg-[rgba(255,255,255,0.9)] px-3 py-3 text-sm text-[var(--px-text)] outline-none transition-colors focus:border-[var(--px-accent)]"
        >
          <option value="">Alle statuser</option>
          <option value="ACTIVE">Aktiv</option>
          <option value="DISSOLVED">Avviklet/slettet</option>
          <option value="BANKRUPT">Konkurs</option>
        </select>
      </label>

      <div className="flex items-center pt-2">
        <button
          type="submit"
          className="min-h-12 border border-[var(--px-panel)] bg-transparent px-5 text-sm font-semibold text-[var(--px-panel)] transition-colors hover:bg-[rgba(15,23,42,0.06)]"
        >
          Oppdater filtre
        </button>
      </div>

      <p className="pt-1 text-sm leading-7 text-[var(--px-muted)] xl:text-[0.96rem]">
        {"Kombiner gjerne filtre med navn eller organisasjonsnummer for \u00e5 f\u00e5 skarpere treff."}
      </p>
    </form>
  );
}
