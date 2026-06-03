"use client";

import React from "react";

type RelevanceInfo = {
  totalScore: number;
  candidateScore?: number;
  confidence: number;
  primaryType: "direct" | "group" | "peer" | "industry" | "macro" | "ip";
  type?: "direct" | "group" | "peer" | "industry" | "macro" | "ip";
  tags: string[];
  reasons: string[];
  reasoning: string | null;
  scoredBy: string;
} | null;

type NewsItem = {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  publishedAt: string;
  source: string;
  category: string | null;
  relevance: RelevanceInfo;
};

type EventTimelineItem = {
  id: string;
  eventId: string;
  title: string;
  summary: string | null;
  eventType: string;
  eventDate: string | null;
  lastSeen: string;
  investorValueScore: number;
  confidenceScore: number;
  exposure: {
    type: string;
    score: number;
    confidence: number;
    rationale: string | null;
    reasons: string[];
    sourceCompanyName: string | null;
  };
  evidence: Array<{
    documentId: string;
    title: string;
    url: string;
    sourceId: string;
    sourceName: string;
    publishedAt: string | null;
    relevanceScore: number;
    reasons: string[];
  }>;
};

const SOURCE_LABELS: Record<string, string> = {
  e24: "E24",
  dn: "Dagens Naeringsliv",
  "nrk-okonomi": "NRK Okonomi",
  finansavisen: "Finansavisen",
  hegnar: "Hegnar Online",
  shifter: "Shifter",
  kampanje: "Kampanje",
  na24: "NA24",
  tu: "Teknisk Ukeblad",
  regjeringen: "Regjeringen.no",
  newsweb: "NewsWeb",
  oslobors: "Oslo Bors",
  norgesbank: "Norges Bank",
  finanstilsynet: "Finanstilsynet",
  konkurransetilsynet: "Konkurransetilsynet",
  "bbc-business": "BBC Business",
  "guardian-business": "The Guardian",
  "guardian-world": "The Guardian",
  "ssb-business-financials": "SSB",
  "ssb-energy-industry": "SSB",
  "ssb-tech-innovation": "SSB",
  "ssb-transport-travel": "SSB",
  "ssb-construction-property": "SSB",
  "ssb-bank-finance": "SSB",
  "norsk-olje-gass": "Norsk olje og gass",
  "sodir-news": "Sokkeldirektoratet",
  "sodir-production": "Sokkeldirektoratet",
  "sodir-drilling-permits": "Sokkeldirektoratet",
  "sodir-exploration-results": "Sokkeldirektoratet",
  "eia-today": "EIA",
  "eia-press": "EIA",
  "eia-petroleum-weekly": "EIA",
  "nasa-breaking": "NASA",
  "fda-press": "FDA",
  "ecb-press": "ECB",
  "federalreserve-press": "Federal Reserve",
  "iea-news": "IEA",
  "offshore-energy": "Offshore Energy",
  offshorewind: "Offshore Wind",
  "worldoil-news": "World Oil",
  "worldoil-permian": "World Oil",
  pulpapernews: "PulpaperNews",
  "mining-com": "MINING.COM",
  "mining-technology": "Mining Technology",
  marinelink: "MarineLink",
  freightwaves: "FreightWaves",
  splash247: "Splash247",
  "undercurrent-news": "Undercurrent News",
  fishfarmer: "Fish Farmer",
  "renewable-energy-world": "Renewable Energy World",
  semiengineering: "SemiEngineering",
  siliconangle: "SiliconANGLE",
  fiercebiotech: "Fierce Biotech",
  biopharmadive: "BioPharma Dive",
  constructiondive: "Construction Dive",
  recyclingtoday: "Recycling Today",
  spacenews: "SpaceNews",
  defensenews: "Defense News",
  "army-technology": "Army Technology",
  "airport-technology": "Airport Technology",
  agfunder: "AgFunderNews",
  insurancejournal: "Insurance Journal",
  "scmp-business": "SCMP",
  asiafinancial: "Asia Financial",
  "reuters-business": "Reuters",
};

function getSourceLabel(sourceId: string) {
  if (sourceId.startsWith("google-news-")) return "Google News";
  if (sourceId.startsWith("ssb-")) return "SSB";
  return SOURCE_LABELS[sourceId] ?? sourceId;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  buyback: "Tilbakekjop",
  dividend: "Utbytte",
  financial_result: "Resultat",
  capital_raise: "Kapital",
  insider_transaction: "Innsidehandel",
  mna: "M&A",
  regulatory_change: "Regulering",
  regulatory_approval: "Godkjenning",
  license_award: "Lisens",
  license_loss: "Lisens",
  production_update: "Produksjon",
  commodity_price_exposure: "Ravare",
  interest_rate: "Rente",
  sector_news: "Sektor",
  macro_news: "Makro",
  investigation: "Undersokelse",
  contract: "Kontrakt",
  discovery: "Funn",
  low_signal_mention: "Lavsignal",
};

const EXPOSURE_BADGES: Record<string, { label: string; className: string }> = {
  direct: { label: "Direkte", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  petroleum: { label: "Petroleum", className: "border-slate-300 bg-slate-100 text-slate-700" },
  sector: { label: "Sektor", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  commodity: { label: "Ravare", className: "border-amber-200 bg-amber-50 text-amber-700" },
  regulatory: { label: "Regulering", className: "border-amber-200 bg-amber-50 text-amber-700" },
  value_chain: { label: "Verdikjede", className: "border-slate-300 bg-slate-100 text-slate-700" },
};

const RELEVANCE_BADGES: Record<string, { label: string; className: string }> = {
  direct: { label: "Direkte", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  group: { label: "Konsern", className: "border-slate-300 bg-slate-100 text-slate-700" },
  peer: { label: "Konkurrent", className: "border-rose-200 bg-rose-50 text-rose-700" },
  industry: { label: "Bransje", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  macro: { label: "Makro", className: "border-amber-200 bg-amber-50 text-amber-700" },
  ip: { label: "Patent/innovasjon", className: "border-slate-300 bg-slate-100 text-slate-700" },
};

function formatRelativeDate(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "Akkurat na";
  if (hours < 24) return `${hours}t siden`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d siden`;
  return new Date(dateStr).toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function normalizeForDedupe(value: string) {
  return value
    .toLowerCase()
    .replace(/\s[-–]\s[^-–]+$/u, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(equinor|asa|bp|shell|exxonmobil|exxon|chevron|totalenergies|conocophillips)\b/g, " ")
    .replace(/\b(announces|announcement|melding|for|of|the|and|og|av|til)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyDuplicateTitle(left: string, right: string) {
  const a = normalizeForDedupe(left);
  const b = normalizeForDedupe(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < 18 || b.length < 18) return false;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  return longer.includes(shorter);
}

function dedupeArticlesAgainstEvents(articles: NewsItem[], events: EventTimelineItem[]) {
  const eventUrls = new Set(events.flatMap((event) => event.evidence.map((evidence) => evidence.url)));
  return articles.filter((article) => {
    if (eventUrls.has(article.url)) {
      return false;
    }

    return !events.some(
      (event) =>
        isLikelyDuplicateTitle(event.title, article.title) ||
        event.evidence.some((evidence) => isLikelyDuplicateTitle(evidence.title, article.title)),
    );
  });
}

function RelevanceBadge({ relevance }: { relevance: RelevanceInfo }) {
  if (!relevance) return null;
  const badge = RELEVANCE_BADGES[relevance.primaryType];
  if (!badge) return null;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}
      title={relevance.reasoning ?? undefined}
    >
      {badge.label}
    </span>
  );
}

function shouldShowSummary(article: NewsItem) {
  if (!article.summary) return false;
  if (article.summary === article.category) return false;
  if (article.relevance?.scoredBy === "newsweb-direct-value-ranked" && article.relevance.totalScore < 0.65) {
    return false;
  }
  return true;
}

function NewsCard({ article }: { article: NewsItem }) {
  const sourceLabel = getSourceLabel(article.source);
  const reasonsLabel = article.relevance?.reasons.slice(0, 1).join(" · ") ?? null;
  const showSummary = shouldShowSummary(article);

  return (
    <article className="grid gap-2 border-b border-[rgba(15,23,42,0.06)] px-4 py-3 last:border-b-0 hover:bg-[rgba(248,249,250,0.8)] md:grid-cols-[8.5rem_minmax(0,1fr)_auto] md:items-start md:gap-4">
      <div className="flex flex-wrap items-center gap-1.5 md:block">
        <span className="data-label text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--px-muted)]">
          {sourceLabel}
        </span>
        <span className="text-[10px] text-slate-400 md:hidden">·</span>
        <span className="text-[10px] text-slate-400 md:mt-1 md:block">{formatRelativeDate(article.publishedAt)}</span>
      </div>

      <div className="min-w-0">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-1 text-sm font-semibold leading-snug text-slate-900 hover:text-[var(--px-accent)]"
        >
          {article.title}
        </a>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-snug text-slate-500">
          {showSummary ? <span className="line-clamp-1 min-w-0 flex-1">{article.summary}</span> : null}
          {reasonsLabel ? <span className="font-medium text-[var(--px-muted)]">{reasonsLabel}</span> : null}
          {article.relevance?.reasoning && !showSummary ? (
            <span className="line-clamp-1 min-w-0 flex-1 italic text-slate-400">{article.relevance.reasoning}</span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center md:justify-end">
        {article.relevance ? <RelevanceBadge relevance={article.relevance} /> : null}
      </div>
    </article>
  );
}

function EventTimelineCard({ event }: { event: EventTimelineItem }) {
  const primaryEvidence = event.evidence[0];
  const sourceLabel = primaryEvidence?.sourceName ?? event.exposure.sourceCompanyName ?? "Event";
  const eventLabel = EVENT_TYPE_LABELS[event.eventType] ?? event.eventType.replaceAll("_", " ");
  const exposureBadge = EXPOSURE_BADGES[event.exposure.type] ?? {
    label: event.exposure.type.replaceAll("_", " "),
    className: "border-slate-300 bg-slate-100 text-slate-700",
  };
  const href = primaryEvidence?.url;
  const description = event.summary ?? event.exposure.rationale;
  const whyReasons = [...event.exposure.reasons, ...event.evidence.flatMap((evidence) => evidence.reasons)]
    .filter((value, index, array) => value && array.indexOf(value) === index)
    .slice(0, 5);
  const exposureContext =
    event.exposure.type !== "direct" && event.exposure.sourceCompanyName
      ? `Knyttet via ${event.exposure.sourceCompanyName}`
      : null;

  const content = (
    <>
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className="data-label text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--px-muted)]">
            {sourceLabel}
          </span>
          <span className="text-[10px] text-slate-400">·</span>
          <span className="text-[10px] text-slate-400">{formatRelativeDate(event.eventDate ?? event.lastSeen)}</span>
          <span className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
            {eventLabel}
          </span>
        </div>
        <h3 className="line-clamp-1 text-sm font-semibold leading-snug text-slate-950">{event.title}</h3>
        {description ? (
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-500">{description}</p>
        ) : null}
        {exposureContext ? (
          <p className="mt-1 text-[11px] font-medium text-[var(--px-muted)]">{exposureContext}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${exposureBadge.className}`}>
          {exposureBadge.label}
        </span>
        <span className="data-label text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          {Math.round(event.investorValueScore)}
        </span>
      </div>
    </>
  );

  return (
    <article className="border-b border-[rgba(15,23,42,0.06)] px-4 py-3 last:border-b-0 hover:bg-[rgba(248,249,250,0.8)]">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-4">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="contents">
            {content}
          </a>
        ) : (
          content
        )}
      </div>

      <details className="mt-2 rounded-xl bg-[rgba(248,249,250,0.62)] p-3">
        <summary className="cursor-pointer list-none text-[11px] font-medium text-[var(--px-accent)]">
          Hvorfor ser jeg dette?
        </summary>
        <div className="mt-2 space-y-2 text-[11px] leading-5 text-[var(--px-muted)]">
          {event.exposure.rationale ? <p>{event.exposure.rationale}</p> : null}
          {whyReasons.length > 0 ? <p>{whyReasons.join(" · ")}</p> : null}
          {event.evidence.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {event.evidence.slice(0, 2).map((evidence) => (
                <a
                  key={evidence.documentId}
                  href={evidence.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-[var(--px-border)] bg-white px-2 py-1 text-[10px] text-[var(--px-text)] hover:bg-[var(--px-subtle)]"
                >
                  {evidence.sourceName}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </details>
    </article>
  );
}

function FilterPill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
        active
          ? "border-[var(--px-accent)] bg-[var(--px-accent-soft)] text-[var(--px-accent)]"
          : "border-[var(--px-border)] bg-[var(--px-surface)] text-[var(--px-muted)] hover:bg-[var(--px-subtle)]"
      }`}
    >
      {label}
    </button>
  );
}

async function fetchNews(slug: string): Promise<NewsItem[]> {
  const res = await fetch(`/api/companies/${slug}/news?limit=30`, { cache: "no-store" });
  if (!res.ok) {
    let message = "Failed to fetch news";
    try {
      const errorJson = (await res.json()) as { error?: string };
      if (typeof errorJson.error === "string" && errorJson.error.trim()) {
        message = errorJson.error;
      }
    } catch {
      // Ignore malformed error payloads.
    }
    throw new Error(message);
  }

  const json = (await res.json()) as { data: NewsItem[] };
  return json.data;
}

async function fetchEvents(slug: string): Promise<EventTimelineItem[]> {
  const res = await fetch(`/api/companies/${slug}/events?limit=20&minExposure=0.58`, { cache: "no-store" });
  if (!res.ok) {
    return [];
  }

  const json = (await res.json()) as { data: EventTimelineItem[] };
  return json.data;
}

export function CompanyNewsTab({ slug }: { slug: string }) {
  const [articles, setArticles] = React.useState<NewsItem[]>([]);
  const [events, setEvents] = React.useState<EventTimelineItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [selectedExposure, setSelectedExposure] = React.useState<string>("all");

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [eventData, data] = await Promise.all([fetchEvents(slug), fetchNews(slug)]);
        if (!cancelled) {
          setEvents(eventData);
          setArticles(data);
          setLastUpdated(new Date());
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Kunne ikke laste nyheter");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const interval = setInterval(() => {
      void load();
    }, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [slug]);

  React.useEffect(() => {
    setSelectedExposure("all");
  }, [slug]);

  if (loading) {
    return <div className="animate-pulse px-5 py-10 text-sm text-slate-400">Laster nyheter...</div>;
  }

  if (error) {
    return (
      <div className="px-5 py-10 text-sm text-slate-500">
        <p className="font-medium text-slate-700">Kunne ikke laste nyheter</p>
        <p className="mt-1">{error}</p>
      </div>
    );
  }

  if (articles.length === 0 && events.length === 0) {
    return (
      <div className="px-5 py-10 text-sm text-slate-500">
        <p className="font-medium text-slate-700">Ingen nyheter tilgjengelig</p>
        <p className="mt-1">
          Kjor <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">npm run news:sync</code> for
          a hente, koble og score nyheter mot selskapet.
        </p>
      </div>
    );
  }

  const minutesAgo = lastUpdated ? Math.floor((Date.now() - lastUpdated.getTime()) / 60_000) : null;
  const exposureTypes = Array.from(new Set(events.map((event) => event.exposure.type)));
  const filteredEvents =
    selectedExposure === "all"
      ? events
      : events.filter((event) => event.exposure.type === selectedExposure);
  const dedupedArticles = dedupeArticlesAgainstEvents(articles, events);

  return (
    <div>
      <div className="flex items-center justify-between border-b border-[rgba(15,23,42,0.08)] px-4 py-2.5">
        <span className="data-label text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
          {events.length > 0 ? `${events.length} hendelser · ` : ""}
          {dedupedArticles.length} artikler
        </span>
        <span className="text-xs text-slate-400">
          {minutesAgo === 0 ? "Oppdatert na" : minutesAgo === null ? "" : `Oppdatert for ${minutesAgo} min siden`}
        </span>
      </div>

      {events.length > 0 ? (
        <div className="border-b border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.62)]">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <span className="data-label text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                Event intelligence
              </span>
              <p className="mt-1 text-[11px] text-slate-400">Direkte og read-across, uten a vise samme sak to ganger.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterPill active={selectedExposure === "all"} label="Alle" onClick={() => setSelectedExposure("all")} />
              {exposureTypes.map((exposureType) => (
                <FilterPill
                  key={exposureType}
                  active={selectedExposure === exposureType}
                  label={EXPOSURE_BADGES[exposureType]?.label ?? exposureType}
                  onClick={() => setSelectedExposure(exposureType)}
                />
              ))}
            </div>
          </div>
          {filteredEvents.map((event) => (
            <EventTimelineCard key={event.id} event={event} />
          ))}
          {filteredEvents.length === 0 ? (
            <div className="px-4 py-5 text-sm text-[var(--px-muted)]">Ingen hendelser matcher dette filteret.</div>
          ) : null}
        </div>
      ) : null}

      <div>
        {dedupedArticles.map((article) => (
          <NewsCard key={article.id} article={article} />
        ))}
      </div>
    </div>
  );
}
