"use client";

import { useMemo, useState } from "react";

type WatchlistEvent = {
  id: string;
  eventId: string;
  title: string;
  summary?: string | null;
  eventType: string;
  lastSeen: string;
  investorValueScore: number;
  confidenceScore: number;
  exposureType: string;
  exposureScore: number;
  company: {
    name: string;
    slug: string;
    orgNumber: string;
  };
  contexts: string[];
  watchTypes: Array<"company" | "group" | "industry">;
  href?: string | null;
};

type FilterValue = "all" | "company" | "group" | "industry" | "macro" | "regulatory";

const FILTERS: Array<{ value: FilterValue; label: string }> = [
  { value: "all", label: "Alle" },
  { value: "company", label: "Direkte" },
  { value: "group", label: "Bolk" },
  { value: "industry", label: "Bransje" },
  { value: "macro", label: "Makro" },
  { value: "regulatory", label: "Regulatorisk" },
];

const EVENT_TYPE_LABELS: Record<string, string> = {
  financial_result: "Resultat",
  annual_report: "Årsrapport",
  financial_statement: "Regnskap",
  contract_award: "Kontrakt",
  contract_loss: "Kontrakttap",
  regulatory_change: "Regulering",
  regulatory_approval: "Godkjenning",
  ownership_change: "Eierendring",
  ceo_change: "Lederskifte",
  cfo_change: "Finansdirektør",
  board_change: "Styre",
  sector_news: "Sektor",
  macro_news: "Makro",
  commodity_price_exposure: "Råvare",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isMacro(event: WatchlistEvent) {
  return ["macro_news", "interest_rate", "commodity_price_exposure"].includes(event.eventType);
}

function isRegulatory(event: WatchlistEvent) {
  return event.exposureType === "regulatory" || event.eventType.startsWith("regulatory");
}

function matchesFilter(event: WatchlistEvent, filter: FilterValue) {
  if (filter === "all") return true;
  if (filter === "macro") return isMacro(event);
  if (filter === "regulatory") return isRegulatory(event);
  return event.watchTypes.includes(filter);
}

function eventHref(event: WatchlistEvent) {
  return event.href || `/companies/${event.company.slug}`;
}

export function WatchlistEventFeed({ events }: { events: WatchlistEvent[] }) {
  const [filter, setFilter] = useState<FilterValue>("all");
  const filteredEvents = useMemo(
    () => events.filter((event) => matchesFilter(event, filter)),
    [events, filter],
  );

  return (
    <section className="rounded-2xl border border-[var(--px-border)] bg-white">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[rgba(15,23,42,0.06)] p-5">
        <div>
          <h2 className="data-label text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            Relevante nyheter og hendelser
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Deduplisert på tvers av selskaper, bolker og bransjer.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Filtrer watchlist-hendelser">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
              className={
                filter === item.value
                  ? "rounded-full bg-[var(--px-action)] px-3 py-1.5 text-xs font-semibold text-white"
                  : "rounded-full border border-[var(--px-border)] px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {filteredEvents.length === 0 ? (
        <div className="px-5 py-10 text-sm text-slate-500">
          Ingen relevante hendelser for dette filteret ennå.
        </div>
      ) : (
        <div className="divide-y divide-[rgba(15,23,42,0.06)]">
          {filteredEvents.map((event) => (
            <article key={event.id} className="grid gap-3 px-5 py-4 hover:bg-[rgba(248,249,250,0.8)] md:grid-cols-[8rem_minmax(0,1fr)_auto]">
              <div>
                <p className="data-label text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                  {EVENT_TYPE_LABELS[event.eventType] ?? event.eventType.replaceAll("_", " ")}
                </p>
                <p className="mt-1 text-xs text-slate-400">{formatDate(event.lastSeen)}</p>
              </div>
              <div className="min-w-0">
                <a
                  href={eventHref(event)}
                  target={event.href ? "_blank" : undefined}
                  rel={event.href ? "noopener noreferrer" : undefined}
                  className="line-clamp-1 text-sm font-semibold text-slate-900 hover:text-[var(--px-accent)]"
                >
                  {event.title}
                </a>
                <p className="mt-1 text-xs text-slate-500">
                  {event.company.name} · score {Math.round(event.investorValueScore)}
                </p>
                {event.summary ? (
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">{event.summary}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {event.contexts.map((context) => (
                    <span
                      key={context}
                      className="rounded-full border border-[var(--px-border)] px-2 py-0.5 text-[11px] font-semibold text-slate-500"
                    >
                      {context}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-start justify-end">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  {Math.round(event.exposureScore * 100)}%
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
