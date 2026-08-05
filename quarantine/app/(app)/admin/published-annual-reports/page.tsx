import Link from "next/link";

import {
  listPublishedAnnualReports,
  type PublishedAnnualReportMode,
} from "@/server/services/admin-published-annual-reports-service";

function asSingle(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

const MODE_OPTIONS: Array<{
  value: PublishedAnnualReportMode | "ALL";
  label: string;
}> = [
  { value: "ALL", label: "Alle publiseringsmåter" },
  { value: "AUTOMATIC", label: "Automatisk publisert" },
  { value: "REVIEWED_WITHOUT_CHANGES", label: "Manuelt vurdert uten endringer" },
  { value: "MANUALLY_CORRECTED", label: "Manuelt korrigert før publisering" },
];

export default async function PublishedAnnualReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = asSingle(params.query) ?? "";
  const mode =
    (asSingle(params.mode) as PublishedAnnualReportMode | "ALL" | undefined) ?? "ALL";

  const result = await listPublishedAnnualReports({
    query,
    mode,
  });

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
        <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
          Godkjente årsregnskaper
        </p>
        <h1 className="editorial-display mt-3 text-[2.25rem] leading-tight text-[var(--px-text)]">
          Publiserte årsregnskaper
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--px-muted)]">
          Her ser du alle årsregnskaper som er publisert, og om publiseringen skjedde
          automatisk, etter manuell vurdering uten endringer, eller etter manuell korrigering.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {result.summary.map((item) => (
          <div
            key={item.key}
            className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6"
          >
            <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-muted)]">
              {item.label}
            </p>
            <p className="editorial-display mt-3 text-[2rem] leading-none text-[var(--px-text)]">
              {item.count.toLocaleString("nb-NO")}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
        <form method="GET" className="flex flex-wrap gap-3">
          <input
            type="text"
            name="query"
            defaultValue={query}
            placeholder="Søk selskap eller organisasjonsnummer"
            className="min-w-[280px] rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-3 text-sm text-[var(--px-text)] outline-none focus:border-[var(--px-accent)]"
          />
          <select
            name="mode"
            defaultValue={mode}
            className="rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-3 text-sm text-[var(--px-text)] outline-none focus:border-[var(--px-accent)]"
          >
            {MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-full bg-[var(--px-action)] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--px-action-hover)]"
          >
            Filtrer
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)]">
        {result.rows.length === 0 ? (
          <div className="p-8 text-sm leading-6 text-[var(--px-muted)]">
            Ingen publiserte årsregnskaper matcher filtrene dine.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse">
              <thead className="bg-[var(--px-subtle)]">
                <tr>
                  {[
                    "Selskap",
                    "Regnskapsår",
                    "Publiseringsmåte",
                    "Scope",
                    "Publisert",
                    "Handling",
                  ].map((label, index) => (
                    <th
                      key={label}
                      className={`px-4 py-4 text-left data-label text-[11px] uppercase tracking-widest text-[var(--px-text)] ${
                        index === 5 ? "text-right" : ""
                      }`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.filingId} className="border-t border-[var(--px-border)]">
                    <td className="px-4 py-4">
                      <div className="font-semibold text-[var(--px-text)]">{row.companyName}</div>
                      <div className="mt-1 text-sm text-[var(--px-muted)]">{row.orgNumber}</div>
                    </td>
                    <td className="px-4 py-4 text-sm text-[var(--px-text)]">{row.fiscalYear}</td>
                    <td className="px-4 py-4">
                      <span className="inline-flex rounded-full border border-[var(--px-border)] bg-[var(--px-subtle)] px-3 py-1 text-xs font-medium text-[var(--px-text)]">
                        {row.publishModeLabel}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-[var(--px-muted)]">{row.scopeLabel}</td>
                    <td className="px-4 py-4 text-sm text-[var(--px-muted)]">{row.publishedAt}</td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {row.reviewHref ? (
                          <Link
                            href={row.reviewHref as never}
                            className="rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-2 text-sm font-medium text-[var(--px-text)] transition-colors hover:bg-[var(--px-subtle)]"
                          >
                            Åpne kontroll
                          </Link>
                        ) : null}
                        <a
                          href={row.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--px-action-hover)]"
                        >
                          Åpne kildefil
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
