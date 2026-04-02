import { DistressFilterOptions } from "@/lib/types";

function toArray(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function getSummaryLabel(selected: string[], fallback: string, singular: string, plural: string) {
  if (selected.length === 0) {
    return fallback;
  }

  return selected.length === 1 ? `1 ${singular} valgt` : `${selected.length} ${plural} valgt`;
}

function MultiSelectDropdown({
  name,
  summary,
  options,
  selectedValues,
}: {
  name: string;
  summary: string;
  options: DistressFilterOptions["statuses"] | DistressFilterOptions["industryCodes"] | DistressFilterOptions["sectors"];
  selectedValues: string[];
}) {
  return (
    <details className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm text-slate-700">
        <span>{summary}</span>
      </summary>
      <div className="max-h-72 space-y-2 overflow-y-auto border-t border-[rgba(15,23,42,0.08)] px-4 py-3">
        {options.length > 0 ? (
          options.map((option) => (
            <label key={option.value} className="flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                name={name}
                value={option.value}
                defaultChecked={selectedValues.includes(option.value)}
                className="mt-0.5 h-4 w-4 rounded border-[rgba(15,23,42,0.18)]"
              />
              <span className="leading-6">
                {option.label}
                <span className="ml-2 text-xs text-slate-500">({option.count})</span>
              </span>
            </label>
          ))
        ) : (
          <p className="text-sm text-slate-500">Ingen valg tilgjengelig ennå.</p>
        )}
      </div>
    </details>
  );
}

export function DistressFilterPanel({
  searchParams,
  filterOptions,
}: {
  searchParams: Record<string, string | string[] | undefined>;
  filterOptions: DistressFilterOptions;
}) {
  const selectedStatuses = toArray(searchParams.status);
  const selectedSectorCodes = toArray(searchParams.sectorCode);
  const sortValue = typeof searchParams.sort === "string" && searchParams.sort.trim() ? searchParams.sort : "";
  const viewValue = typeof searchParams.view === "string" && searchParams.view.trim() ? searchParams.view : "BEST_FIT";

  return (
    <form className="grid gap-3 border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.88)] p-5 md:grid-cols-2 xl:grid-cols-1">
      <input type="hidden" name="page" value="0" />
      {sortValue ? <input type="hidden" name="sort" value={sortValue} /> : null}
      <input type="hidden" name="view" value={viewValue} />

      <MultiSelectDropdown
        name="status"
        summary={getSummaryLabel(selectedStatuses, "Alle distress-statuser", "status", "statuser")}
        options={filterOptions.statuses}
        selectedValues={selectedStatuses}
      />

      <MultiSelectDropdown
        name="sectorCode"
        summary={getSummaryLabel(selectedSectorCodes, "Alle sektorer", "sektor", "sektorer")}
        options={filterOptions.sectors}
        selectedValues={selectedSectorCodes}
      />

      <input
        name="industryCodePrefix"
        defaultValue={String(searchParams.industryCodePrefix ?? "")}
        placeholder="Næringskode, f.eks. 43"
        className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm"
      />
      <input
        name="minDaysInStatus"
        type="number"
        min="0"
        defaultValue={String(searchParams.minDaysInStatus ?? "")}
        placeholder="Min dager i status"
        className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm"
      />
      <input
        name="maxDaysInStatus"
        type="number"
        min="0"
        defaultValue={String(searchParams.maxDaysInStatus ?? "")}
        placeholder="Maks dager i status"
        className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm"
      />
      <input
        name="lastReportedYearFrom"
        type="number"
        defaultValue={String(searchParams.lastReportedYearFrom ?? "")}
        placeholder="Fra regnskapsår"
        className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm"
      />
      <input
        name="lastReportedYearTo"
        type="number"
        defaultValue={String(searchParams.lastReportedYearTo ?? "")}
        placeholder="Til regnskapsår"
        className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm"
      />

      <div className="rounded-[0.85rem] border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.72)] px-4 py-3 text-sm text-slate-500">
        Sorter ved å trykke på kolonneoverskriftene. Første trykk sorterer, neste snur retningen, tredje går tilbake til standardrekkefølge.
      </div>
      <div className="rounded-[0.85rem] border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.72)] px-4 py-3 text-sm text-slate-500">
        Distress score-filter kommer senere. Feltet holdes deaktivert til modellen er reell.
      </div>
      <div className="flex items-center">
        <button type="submit" className="rounded-full bg-[#182535] px-5 py-3 text-sm font-semibold text-white">
          Oppdater filtre
        </button>
      </div>
      <p className="text-sm leading-6 text-slate-600">
        Filtrene virker bare på verifiserte distress-profiler og tilgjengelige regnskapssnapshots.
      </p>
    </form>
  );
}
