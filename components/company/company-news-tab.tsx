import { getCompanyNews } from "@/server/services/news-aggregator-service";

type NewsItem = Awaited<ReturnType<typeof getCompanyNews>>[number];

const SOURCE_LABELS: Record<string, string> = {
  e24: "E24",
  dn: "Dagens Næringsliv",
  "nrk-okonomi": "NRK Økonomi",
};

function formatRelativeDate(date: Date): string {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "Akkurat nå";
  if (hours < 24) return `${hours}t siden`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d siden`;
  return new Date(date).toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" });
}

function NewsCard({ article }: { article: NewsItem }) {
  const sourceLabel = SOURCE_LABELS[article.source] ?? article.source;
  return (
    <article className="border-b border-[rgba(15,23,42,0.06)] px-5 py-5 last:border-b-0 hover:bg-[rgba(248,249,250,0.8)]">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="data-label text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--px-muted)]">
          {sourceLabel}
        </span>
        <span className="text-[10px] text-slate-400">·</span>
        <span className="text-[10px] text-slate-400">{formatRelativeDate(article.publishedAt)}</span>
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
    </article>
  );
}

export async function CompanyNewsTab({
  companyId,
}: {
  companyId: string;
}) {
  const articles = await getCompanyNews(companyId, 30);

  if (articles.length === 0) {
    return (
      <div className="px-5 py-10 text-sm text-slate-500">
        <p className="font-medium text-slate-700">Ingen nyheter tilgjengelig</p>
        <p className="mt-1">
          Kjør <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">npm run news:sync</code> for
          å hente nyheter fra E24, DN og NRK Økonomi og koble dem til selskaper.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-[rgba(15,23,42,0.08)] px-5 py-3">
        <span className="data-label text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
          {articles.length} artikler
        </span>
        <span className="text-xs text-slate-400">Kilde: E24, DN, NRK Økonomi</span>
      </div>
      <div>
        {articles.map((article) => (
          <NewsCard key={article.id} article={article} />
        ))}
      </div>
    </div>
  );
}
