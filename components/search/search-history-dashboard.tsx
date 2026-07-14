import Link from "next/link";
import type { Route } from "next";
import { randomUUID } from "node:crypto";
import { BarChart3, CalendarDays, Search, Sparkles, Target } from "lucide-react";

import {
  buildSearchHistoryHref,
  getRevenueClassLabel,
  type SearchHistoryFrequency,
} from "@/lib/search-history";
import { getAiSearchResetPresentation } from "@/lib/ai-search-usage";
import type { SearchHistoryDashboard as SearchHistoryDashboardData } from "@/server/services/search-history-service";

const dateFormatter = new Intl.DateTimeFormat("nb-NO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Oslo",
});

const shortDateFormatter = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Oslo",
});

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="data-label text-[10px] font-semibold uppercase text-[var(--px-muted)]">
            {label}
          </div>
          <div className="mt-3 text-3xl font-semibold tabular-nums text-[var(--px-text)]">
            {value}
          </div>
        </div>
        <span className="rounded-xl bg-[var(--px-accent-soft)] p-3 text-[var(--px-accent)]">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--px-muted)]">{detail}</p>
    </article>
  );
}

function FrequencyList({
  items,
  emptyLabel,
}: {
  items: SearchHistoryFrequency[];
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm leading-6 text-[var(--px-muted)]">{emptyLabel}</p>;
  }

  const maximum = Math.max(...items.map((item) => item.count), 1);
  return (
    <ol className="space-y-4">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-start justify-between gap-4 text-sm">
            <span className="min-w-0 break-words font-medium text-[var(--px-text)]">
              {item.label}
            </span>
            <span className="data-label shrink-0 text-[10px] text-[var(--px-muted)]">
              {item.count} søk · {item.share}%
            </span>
          </div>
          <div className="mt-2 h-1.5 bg-[var(--px-subtle)]" aria-hidden="true">
            <div
              className="h-full bg-[var(--px-accent)]"
              style={{ width: `${Math.max(4, (item.count / maximum) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

function InsightCard({
  title,
  description,
  items,
  emptyLabel,
}: {
  title: string;
  description: string;
  items: SearchHistoryFrequency[];
  emptyLabel: string;
}) {
  return (
    <article className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
      <h3 className="text-base font-semibold text-[var(--px-text)]">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-[var(--px-muted)]">{description}</p>
      <div className="mt-6">
        <FrequencyList items={items} emptyLabel={emptyLabel} />
      </div>
    </article>
  );
}

function SearchActivity({ data }: { data: SearchHistoryDashboardData["summary"]["dailyActivity"] }) {
  const maximum = Math.max(...data.map((item) => item.count), 1);

  return (
    <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--px-text)]">Søkeaktivitet</h2>
          <p className="mt-1 text-sm text-[var(--px-muted)]">Antall lagrede søk per dag de siste 14 dagene.</p>
        </div>
        <span className="data-label text-[10px] uppercase text-[var(--px-muted)]">14 dager</span>
      </div>
      <div
        className="mt-8 grid h-48 items-end gap-4 border-b border-[var(--px-border)] px-1"
        style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}
      >
        {data.map((item) => (
          <div key={item.date} className="flex h-full min-w-0 flex-col justify-end">
            <div
              title={`${item.count} søk ${shortDateFormatter.format(new Date(`${item.date}T12:00:00Z`))}`}
              aria-label={`${item.count} søk ${shortDateFormatter.format(new Date(`${item.date}T12:00:00Z`))}`}
              className="min-h-1 w-full bg-[var(--px-accent)]"
              style={{ height: `${item.count === 0 ? 2 : Math.max(8, (item.count / maximum) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="data-label mt-3 flex justify-between text-[10px] text-[var(--px-muted)]">
        <span>{shortDateFormatter.format(new Date(`${data[0]?.date}T12:00:00Z`))}</span>
        <span>{shortDateFormatter.format(new Date(`${data.at(-1)?.date}T12:00:00Z`))}</span>
      </div>
    </section>
  );
}

const tokenFormatter = new Intl.NumberFormat("nb-NO");
const resetDateFormatter = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Oslo",
});

function getResetLabel(data: SearchHistoryDashboardData["aiUsage"]) {
  if (!data.billingPeriod) return "Reset-dato er ikke tilgjengelig";
  const presentation = getAiSearchResetPresentation(data.billingPeriod);
  if (presentation.kind === "days") {
    return presentation.days === 1
      ? "Tilbakestilles om 1 dag"
      : `Tilbakestilles om ${presentation.days} dager`;
  }
  return `Tilbakestilles ${resetDateFormatter.format(presentation.resetAt)}`;
}

function AiUsage({ data }: { data: SearchHistoryDashboardData["aiUsage"] }) {
  return (
    <section
      className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6"
      aria-labelledby="ai-usage-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="data-label text-[10px] font-semibold uppercase text-[var(--px-muted)]">
            AI-søk · {data.enabled ? "Premium" : "Ikke aktivert"}
          </div>
          <h2 id="ai-usage-heading" className="mt-2 text-lg font-semibold text-[var(--px-text)]">
            Tokenforbruk
          </h2>
          <p className="mt-1 text-sm text-[var(--px-muted)]">
            {data.enabled
              ? "Kvoten følger abonnementsperioden og tilbakestilles månedlig."
              : "AI-søk og tokenkvote er tilgjengelig med Premium."}
          </p>
          {data.enabled ? (
            <p className="data-label mt-3 text-[10px] uppercase text-[var(--px-muted)]">
              {getResetLabel(data)}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <div className="data-label text-2xl font-semibold tabular-nums text-[var(--px-text)]">
            {tokenFormatter.format(data.usedTokens)}
          </div>
          <div className="data-label mt-1 text-[10px] uppercase text-[var(--px-muted)]">
            av {tokenFormatter.format(data.tokenLimit)} tokens
          </div>
        </div>
      </div>

      <div
        className="mt-6 h-3 overflow-hidden rounded-full bg-[var(--px-subtle)]"
        role="progressbar"
        aria-label="Brukt AI-søkkvote"
        aria-valuemin={0}
        aria-valuemax={Math.max(1, data.tokenLimit)}
        aria-valuenow={data.usedTokens}
      >
        <div
          className="h-full rounded-full bg-[var(--px-accent)]"
          style={{ width: `${data.usagePercent}%` }}
        />
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Gjenstår", `${tokenFormatter.format(data.remainingTokens)} tokens`],
          ["AI-søk", tokenFormatter.format(data.aiSearches)],
          ["Input", tokenFormatter.format(data.inputTokens + data.cachedInputTokens)],
          ["Output", tokenFormatter.format(data.outputTokens)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-[var(--px-subtle)] p-4">
            <dt className="data-label text-[10px] uppercase text-[var(--px-muted)]">{label}</dt>
            <dd className="data-label mt-2 text-sm font-semibold tabular-nums text-[var(--px-text)]">{value}</dd>
          </div>
        ))}
      </dl>
      {data.enabled ? (
        <p className="mt-4 text-xs leading-5 text-[var(--px-muted)]">
          Forbrukstokens vektes etter modellens input-, cache- og outputbruk.
        </p>
      ) : null}
    </section>
  );
}

function getStatusLabel(status: string | null) {
  if (status === "ACTIVE") return "Aktiv";
  if (status === "DISSOLVED") return "Avviklet";
  if (status === "BANKRUPT") return "Konkurs";
  return status;
}

function getFilterLabels(item: SearchHistoryDashboardData["items"][number]) {
  return [
    item.industryCode ? `Næring ${item.industryCode}` : null,
    item.city ? `Sted ${item.city}` : null,
    item.legalForm ? `Form ${item.legalForm}` : null,
    item.status ? `Status ${getStatusLabel(item.status)}` : null,
    item.revenueClass ? `Omsetning ${getRevenueClassLabel(item.revenueClass)}` : null,
    item.aiAssisted ? "AI-søk" : null,
  ].filter((value): value is string => Boolean(value));
}

function Pagination({ data }: { data: SearchHistoryDashboardData }) {
  if (data.pageCount <= 1) return null;

  return (
    <nav className="flex items-center justify-between gap-4 border-t border-[var(--px-border)] pt-4" aria-label="Historikksider">
      {data.page > 1 ? (
        <Link
          href={`/search-history?page=${data.page - 1}` as Route}
          className="rounded-full border border-[var(--px-border)] px-4 py-2 text-sm font-medium text-[var(--px-text)] hover:bg-[var(--px-subtle)]"
        >
          Forrige
        </Link>
      ) : <span />}
      <span className="data-label text-[10px] uppercase text-[var(--px-muted)]">
        Side {data.page} av {data.pageCount}
      </span>
      {data.page < data.pageCount ? (
        <Link
          href={`/search-history?page=${data.page + 1}` as Route}
          className="rounded-full border border-[var(--px-border)] px-4 py-2 text-sm font-medium text-[var(--px-text)] hover:bg-[var(--px-subtle)]"
        >
          Neste
        </Link>
      ) : <span />}
    </nav>
  );
}

export function SearchHistoryDashboard({ data }: { data: SearchHistoryDashboardData }) {
  const { summary } = data;

  return (
    <main className="space-y-8 pb-12">
      <header className="border-t-2 border-[var(--px-text)] pt-6">
        <div className="data-label text-[11px] font-semibold uppercase text-[var(--px-muted)]">
          Personlig arbeidsflate
        </div>
        <div className="mt-4 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <h1 className="editorial-display text-4xl font-semibold text-[var(--px-text)] sm:text-5xl">
              Søk og analysehistorikk
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--px-muted)]">
              Se virksomhetssøk fra de siste 30 dagene og forstå hvilke temaer, sektorer og filtre du bruker mest.
            </p>
          </div>
          <Link
            href="/search"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--px-action)] px-5 text-sm font-semibold text-[var(--px-bg)] hover:bg-[var(--px-action-hover)]"
          >
            Nytt søk
          </Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Nøkkeltall for søkehistorikk">
        <MetricCard label="Siste 30 dager" value={String(summary.searchesLast30Days)} detail="Nylig søkeaktivitet" icon={<CalendarDays className="h-5 w-5" />} />
        <MetricCard label="Unike søkeord" value={String(summary.uniqueQueries)} detail="Normalisert for store og små bokstaver" icon={<Target className="h-5 w-5" />} />
        <MetricCard label="Snitt treff" value={String(summary.averageResultCount)} detail="Gjennomsnitt per lagret søk" icon={<BarChart3 className="h-5 w-5" />} />
        <MetricCard label="Andel AI-søk" value={`${summary.aiSearchShare}%`} detail="Av alle lagrede søk" icon={<Sparkles className="h-5 w-5" />} />
      </section>

      <AiUsage data={data.aiUsage} />

      <SearchActivity data={summary.dailyActivity} />

      <section aria-labelledby="search-patterns-heading">
        <div className="mb-6">
          <div className="data-label text-[10px] font-semibold uppercase text-[var(--px-muted)]">Mønstre</div>
          <h2 id="search-patterns-heading" className="mt-2 text-xl font-semibold text-[var(--px-text)]">Hva du søker mest på</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <InsightCard title="Søkeord" description="De mest gjentatte fritekstsøkene." items={summary.topQueries} emptyLabel="Ingen fritekstsøk er lagret ennå." />
          <InsightCard title="Sektorer" description="Basert på valgte og fortolkede næringskoder." items={summary.topSectors} emptyLabel="Ingen sektorer kan utledes fra historikken ennå." />
          <InsightCard title="Omsetningsklasser" description="Klassene som er valgt i avansert søk." items={summary.topRevenueClasses} emptyLabel="Ingen søk med omsetningsklasse er lagret ennå." />
          <InsightCard title="Geografi" description="Poststeder brukt som søkefilter." items={summary.topLocations} emptyLabel="Ingen geografiske filtre er lagret ennå." />
          <InsightCard title="Organisasjonsformer" description="Foretrukne selskapsformer i filtrerte søk." items={summary.topLegalForms} emptyLabel="Ingen organisasjonsformer er lagret ennå." />
          <InsightCard title="Virksomhetsstatus" description="Statusfiltre brukt i søkene." items={summary.topStatuses} emptyLabel="Ingen statusfiltre er lagret ennå." />
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6" aria-labelledby="complete-history-heading">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--px-border)] pb-4">
          <div>
            <h2 id="complete-history-heading" className="text-lg font-semibold text-[var(--px-text)]">Komplett historikk</h2>
            <p className="mt-1 text-sm text-[var(--px-muted)]">{data.totalCount} lagrede søk fra de siste 30 dagene, nyeste først.</p>
          </div>
        </div>

        {data.items.length === 0 ? (
          <div className="py-12 text-center">
            <Search className="mx-auto h-6 w-6 text-[var(--px-muted)]" />
            <h3 className="mt-4 text-base font-semibold text-[var(--px-text)]">Ingen søk lagret ennå</h3>
            <p className="mt-2 text-sm text-[var(--px-muted)]">Virksomhetssøk du utfører mens du er innlogget vil vises her.</p>
          </div>
        ) : (
          <ol>
            {data.items.map((item) => {
              const filters = getFilterLabels(item);
              return (
                <li key={item.id} className="border-b border-[var(--px-border)] py-5 last:border-b-0">
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-4">
                        <h3 className="text-base font-semibold text-[var(--px-text)]">{item.query || "Filtrert virksomhetssøk"}</h3>
                        <span className={`data-label rounded-full px-2 py-1 text-[9px] font-semibold uppercase ${item.succeeded ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                          {item.succeeded ? `${item.resultCount} treff` : "Kunne ikke fullføres"}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-4">
                        {filters.map((filter) => (
                          <span key={filter} className="data-label rounded-full border border-[var(--px-border)] px-3 py-1 text-[10px] text-[var(--px-muted)]">{filter}</span>
                        ))}
                        {item.sectors.slice(0, 3).map((sector) => (
                          <span key={sector.code} className="data-label text-[10px] text-[var(--px-muted)]">{sector.code} {sector.title}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <time className="data-label text-[10px] text-[var(--px-muted)]" dateTime={item.searchedAt.toISOString()}>{dateFormatter.format(item.searchedAt)}</time>
                      <Link href={buildSearchHistoryHref({ ...item, searchEventId: randomUUID() }) as Route} className="rounded-full border border-[var(--px-border)] px-4 py-2 text-sm font-medium text-[var(--px-text)] hover:bg-[var(--px-subtle)]">Kjør igjen</Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <Pagination data={data} />
      </section>
    </main>
  );
}
