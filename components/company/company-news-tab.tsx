"use client";

import React from "react";

type RelevanceInfo = {
  totalScore: number;
  type: "direct" | "sector" | "macro" | "competitor";
  tags: string[];
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

const SOURCE_LABELS: Record<string, string> = {
  e24: "E24",
  dn: "Dagens Næringsliv",
  "nrk-okonomi": "NRK Økonomi",
  finansavisen: "Finansavisen",
  hegnar: "Hegnar Online",
  shifter: "Shifter",
  kampanje: "Kampanje",
  na24: "NA24",
  tu: "Teknisk Ukeblad",
  regjeringen: "Regjeringen.no",
  oslobors: "Oslo Børs",
  norgesbank: "Norges Bank",
  finanstilsynet: "Finanstilsynet",
  konkurransetilsynet: "Konkurransetilsynet",
  "norsk-olje-gass": "Norsk olje og gass",
  bygg: "Bygg.no",
  "intrafish-no": "Intrafish",
  sysla: "Sysla",
  upstream: "Upstream Online",
  "reuters-business": "Reuters",
};

const RELEVANCE_BADGES: Record<string, { label: string; className: string }> = {
  direct: { label: "Direkte", className: "bg-blue-50 text-blue-700 border-blue-200" },
  sector: { label: "Sektor", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  macro: { label: "Makro", className: "bg-amber-50 text-amber-700 border-amber-200" },
  competitor: { label: "Konkurrent", className: "bg-purple-50 text-purple-700 border-purple-200" },
};

function formatRelativeDate(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "Akkurat nå";
  if (hours < 24) return `${hours}t siden`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d siden`;
  return new Date(dateStr).toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" });
}

function RelevanceBadge({ relevance }: { relevance: RelevanceInfo }) {
  if (!relevance) return null;
  const badge = RELEVANCE_BADGES[relevance.type];
  if (!badge) return null;

  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}
      title={relevance.reasoning ?? undefined}
    >
      {badge.label}
    </span>
  );
}

function NewsCard({ article }: { article: NewsItem }) {
  const sourceLabel = SOURCE_LABELS[article.source] ?? article.source;
  return (
    <article className="border-b border-[rgba(15,23,42,0.06)] px-5 py-5 last:border-b-0 hover:bg-[rgba(248,249,250,0.8)]">
      <div className="mb-1.5 flex items-center gap-2 flex-wrap">
        <span className="data-label text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--px-muted)]">
          {sourceLabel}
        </span>
        <span className="text-[10px] text-slate-400">·</span>
        <span className="text-[10px] text-slate-400">{formatRelativeDate(article.publishedAt)}</span>
        {article.relevance && <RelevanceBadge relevance={article.relevance} />}
      </div>
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-semibold leading-snug text-slate-900 hover:text-[var(--px-accent)]"
      >
        {article.title}
      </a>
      {article.summary && (
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500 line-clamp-2">
          {article.summary}
        </p>
      )}
      {article.relevance?.reasoning && (
        <p className="mt-1 text-[11px] text-slate-400 italic">{article.relevance.reasoning}</p>
      )}
    </article>
  );
}

async function fetchNews(slug: string): Promise<NewsItem[]> {
  const res = await fetch(`/api/companies/${slug}/news?limit=30`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch news");
  const json = (await res.json()) as { data: NewsItem[] };
  return json.data;
}

export function CompanyNewsTab({ slug }: { slug: string }) {
  const [articles, setArticles] = React.useState<NewsItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchNews(slug);
        if (!cancelled) {
          setArticles(data);
          setLastUpdated(new Date());
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

  if (loading) {
    return (
      <div className="px-5 py-10 text-sm text-slate-400 animate-pulse">
        Laster nyheter…
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="px-5 py-10 text-sm text-slate-500">
        <p className="font-medium text-slate-700">Ingen nyheter tilgjengelig</p>
        <p className="mt-1">
          Kjør <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">npm run news:sync</code> for
          å hente nyheter og score dem mot selskapet.
        </p>
      </div>
    );
  }

  const minutesAgo = lastUpdated
    ? Math.floor((Date.now() - lastUpdated.getTime()) / 60_000)
    : null;

  return (
    <div>
      <div className="flex items-center justify-between border-b border-[rgba(15,23,42,0.08)] px-5 py-3">
        <span className="data-label text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
          {articles.length} artikler
        </span>
        <span className="text-xs text-slate-400">
          {minutesAgo === 0
            ? "Oppdatert nå"
            : minutesAgo === null
              ? ""
              : `Oppdatert for ${minutesAgo} min siden`}
        </span>
      </div>
      <div>
        {articles.map((article) => (
          <NewsCard key={article.id} article={article} />
        ))}
      </div>
    </div>
  );
}
