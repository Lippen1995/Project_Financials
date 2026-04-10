"use client";

import { ArrowUpRight, ChevronDown, LoaderCircle, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { IPRightDetail, IPRightSummary, IPRightType } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

type SortKey = "latest-activity" | "latest-application" | "oldest-application" | "name";

type Props = {
  companySlug: string;
  initialRights: IPRightSummary[];
  initialOverview: {
    total: number;
    patents: number;
    trademarks: number;
    designs: number;
    active: number;
    latestActivityDate: string | null;
  };
};

function rightTypeLabel(type: IPRightType) {
  if (type === "patent") return "Patent";
  if (type === "trademark") return "Varemerke";
  return "Design";
}

function toTime(value: string | null) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function buildIndications(overview: Props["initialOverview"]) {
  const notes: string[] = [];
  if (overview.trademarks >= 3) notes.push("Mange aktive varemerker kan indikere bred merkevarebeskyttelse.");
  if (overview.patents > 0) notes.push("Patenter kan indikere teknologisk differensiering.");
  if (overview.designs > 0) notes.push("Designregistreringer kan indikere produkt- og kommersialiseringsfokus.");
  if (overview.latestActivityDate) notes.push("Nylig aktivitet kan indikere pågående IP-arbeid.");
  return notes.slice(0, 3);
}

export function CompanyIpTab({ companySlug, initialRights, initialOverview }: Props) {
  const [filter, setFilter] = useState<"all" | IPRightType>("all");
  const [sort, setSort] = useState<SortKey>("latest-activity");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialRights[0]?.id ?? null);
  const [details, setDetails] = useState<Record<string, IPRightDetail>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialRights
      .filter((item) => (filter === "all" ? true : item.type === filter))
      .filter((item) => {
        if (!q) return true;
        return [item.title, item.applicationNumber, item.status, ...item.owners.map((owner) => owner.name)]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(q));
      })
      .sort((left, right) => {
        if (sort === "latest-activity") {
          return toTime(right.lastEventDate) - toTime(left.lastEventDate);
        }

        if (sort === "latest-application") {
          return toTime(right.applicationDate) - toTime(left.applicationDate);
        }

        if (sort === "oldest-application") {
          return toTime(left.applicationDate) - toTime(right.applicationDate);
        }

        return (left.title ?? "").localeCompare(right.title ?? "", "nb-NO");
      });
  }, [filter, initialRights, query, sort]);

  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;

  useEffect(() => {
    if (!selected || details[selected.id]) {
      return;
    }

    const appNo = selected.applicationNumber ?? selected.id;
    if (!appNo) {
      return;
    }

    setLoadingId(selected.id);
    setDetailError(null);
    fetch(`/api/companies/${companySlug}/ip/${selected.type}/${encodeURIComponent(appNo)}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Kunne ikke laste detaljene.");
        }

        const payload = (await response.json()) as { data: IPRightDetail };
        setDetails((current) => ({ ...current, [selected.id]: payload.data }));
      })
      .catch((error) => setDetailError(error instanceof Error ? error.message : "Kunne ikke laste detaljene."))
      .finally(() => setLoadingId((current) => (current === selected.id ? null : current)));
  }, [companySlug, details, selected]);

  const selectedDetail = selected ? details[selected.id] : null;
  const indications = buildIndications(initialOverview);

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["Totalt", `${initialOverview.total}`],
          ["Patenter", `${initialOverview.patents}`],
          ["Varemerker", `${initialOverview.trademarks}`],
          ["Design", `${initialOverview.designs}`],
          ["Aktive", `${initialOverview.active}`],
          ["Siste aktivitet", initialOverview.latestActivityDate ? formatDate(initialOverview.latestActivityDate) : "Ukjent"],
        ].map(([label, value]) => (
          <Card key={label} className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)] p-4">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">{label}</div>
            <div className="mt-1.5 text-lg font-semibold text-slate-950">{value}</div>
          </Card>
        ))}
      </section>

      <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
        <div className="grid gap-3 lg:grid-cols-[auto,auto,1fr] lg:items-center">
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "Alle"],
              ["patent", "Patenter"],
              ["trademark", "Varemerker"],
              ["design", "Design"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id as "all" | IPRightType)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-semibold",
                  filter === id
                    ? "border-[#162233] bg-[#162233] text-white"
                    : "border-[rgba(15,23,42,0.12)] bg-white text-slate-700",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="inline-flex items-center gap-2 rounded-[0.7rem] border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700">
            <ChevronDown className="h-4 w-4" />
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="bg-transparent outline-none">
              <option value="latest-activity">Nyeste aktivitet</option>
              <option value="latest-application">Nyeste søknad</option>
              <option value="oldest-application">Eldste søknad</option>
              <option value="name">A–Å</option>
            </select>
          </label>

          <label className="inline-flex items-center gap-2 rounded-[0.7rem] border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-600">
            <Search className="h-4 w-4" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Søk i porteføljen"
              className="w-full bg-transparent outline-none"
            />
          </label>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(15,23,42,0.08)] text-left text-slate-500">
                <th className="px-3 py-2 font-semibold">Type</th>
                <th className="px-3 py-2 font-semibold">Tittel / navn</th>
                <th className="px-3 py-2 font-semibold">Søknadsnummer</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Søknadsdato</th>
                <th className="px-3 py-2 font-semibold">Registrerings-/meddelelsesdato</th>
                <th className="px-3 py-2 font-semibold">Eier / søker</th>
                <th className="px-3 py-2 font-semibold">Kilde</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className={cn(
                    "cursor-pointer border-b border-[rgba(15,23,42,0.06)] hover:bg-[rgba(248,249,250,0.55)]",
                    selected?.id === item.id ? "bg-[rgba(248,249,250,0.75)]" : "",
                  )}
                  onClick={() => setSelectedId(item.id)}
                >
                  <td className="px-3 py-3">{rightTypeLabel(item.type)}</td>
                  <td className="px-3 py-3 font-medium text-slate-900">{item.title ?? "Uten tittel"}</td>
                  <td className="px-3 py-3">{item.applicationNumber ?? "Ukjent"}</td>
                  <td className="px-3 py-3">{item.status ?? "Ukjent"}</td>
                  <td className="px-3 py-3">{item.applicationDate ? formatDate(item.applicationDate) : "Ukjent"}</td>
                  <td className="px-3 py-3">{item.registrationOrGrantDate ? formatDate(item.registrationOrGrantDate) : "Ukjent"}</td>
                  <td className="px-3 py-3">{item.owners[0]?.name ?? "Ukjent"}</td>
                  <td className="px-3 py-3">
                    {item.caseUrl ? (
                      <a href={item.caseUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-slate-700 underline">
                        Åpne <ArrowUpRight className="h-4 w-4" />
                      </a>
                    ) : (
                      <span className="text-slate-500">Ingen lenke</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
        <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Detaljvisning</div>
        {!selected ? <p className="mt-3 text-sm text-slate-600">Ingen saker matcher valgt filter.</p> : null}
        {loadingId === selected?.id ? (
          <div className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" /> Laster detaljer…</div>
        ) : null}
        {detailError ? <p className="mt-3 text-sm text-rose-700">{detailError}</p> : null}
        {selectedDetail ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-sm font-semibold text-slate-900">{selectedDetail.title ?? "Uten tittel"}</div>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                <li>Status: {selectedDetail.status ?? "Ukjent"}</li>
                <li>Søknadsnummer: {selectedDetail.applicationNumber ?? "Ukjent"}</li>
                <li>Datoer: {selectedDetail.applicationDate ? formatDate(selectedDetail.applicationDate) : "Ukjent"}</li>
              </ul>
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Hendelser</div>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {selectedDetail.events.slice(0, 6).map((event, index) => (
                  <li key={`${event.label}-${index}`}>{event.date ? formatDate(event.date) : "Ukjent dato"}: {event.label}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </Card>

      {indications.length > 0 ? (
        <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.72)]">
          <h3 className="text-base font-semibold text-slate-900">Hva dette kan indikere</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {indications.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)] text-sm text-slate-600">
        <p>Kilde: Patentstyret. Dataene er basert på offentlig tilgjengelige registreringer og søknader i Norge.</p>
        <p className="mt-1">Patentsøknader kan være skjult i opptil 18 måneder. Designsøknader kan være skjult i opptil 6 måneder.</p>
        <p className="mt-1">Hvis en sak mangler direkte lenke, kan du bruke Patentstyrets søketjeneste for videre oppslag.</p>
      </Card>
    </div>
  );
}
