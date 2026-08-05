import Link from "next/link";
import { type AnnualReportFilingStatus } from "@prisma/client";

import { listAdminFilings } from "@/server/services/admin-filings-service";

const STATUS_TONES: Record<AnnualReportFilingStatus, string> = {
  DISCOVERED: "bg-slate-50 text-slate-600 border-slate-200",
  DOWNLOADED: "bg-slate-50 text-slate-600 border-slate-200",
  PROCESSING: "bg-blue-50 text-blue-700 border-blue-200",
  PREFLIGHTED: "bg-blue-50 text-blue-700 border-blue-200",
  EXTRACTED: "bg-blue-50 text-blue-700 border-blue-200",
  VALIDATED: "bg-blue-50 text-blue-700 border-blue-200",
  MANUAL_REVIEW: "bg-amber-50 text-amber-700 border-amber-200",
  PUBLISHED: "bg-green-50 text-green-700 border-green-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
};

function asSingle(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function AdminFilingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const status = asSingle(sp.status) as AnnualReportFilingStatus | undefined;
  const query = asSingle(sp.q) ?? "";

  const result = await listAdminFilings({ status, query, limit: 200 });

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
        <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
          Admin · Alle rapporter
        </p>
        <h1 className="editorial-display mt-3 text-[2.25rem] leading-tight text-[var(--px-text)]">
          Alle innleste rapporter
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--px-muted)]">
          Fullstendig oversikt over alle årsrapporter som er registrert i systemet, uavhengig av status i pipelinen.
        </p>
      </section>

      <section className="flex flex-wrap gap-2">
        <Link
          href="/admin/filings"
          className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
            !status
              ? "border-[var(--px-accent)] bg-[var(--px-accent)] text-white"
              : "border-[var(--px-border)] bg-[var(--px-surface)] text-[var(--px-muted)] hover:bg-[var(--px-subtle)]"
          }`}
        >
          Alle ({result.statusCounts.reduce((sum, s) => sum + s.count, 0).toLocaleString("nb-NO")})
        </Link>
        {result.statusCounts
          .filter((s) => s.count > 0)
          .map((s) => (
            <Link
              key={s.status}
              href={`/admin/filings?status=${s.status}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                status === s.status
                  ? "border-[var(--px-accent)] bg-[var(--px-accent)] text-white"
                  : "border-[var(--px-border)] bg-[var(--px-surface)] text-[var(--px-muted)] hover:bg-[var(--px-subtle)]"
              }`}
            >
              {s.label} ({s.count.toLocaleString("nb-NO")})
            </Link>
          ))}
      </section>

      <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-4">
        <form method="GET" className="flex flex-wrap gap-3">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Søk selskap eller org.nr"
            className="min-w-[280px] rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-2.5 text-sm text-[var(--px-text)] outline-none focus:border-[var(--px-accent)]"
          />
          <button
            type="submit"
            className="rounded-full bg-[var(--px-action)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--px-action-hover)]"
          >
            Søk
          </button>
          {query || status ? (
            <Link
              href="/admin/filings"
              className="rounded-full border border-[var(--px-border)] px-5 py-2.5 text-sm font-medium text-[var(--px-muted)] hover:bg-[var(--px-subtle)]"
            >
              Nullstill
            </Link>
          ) : null}
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)]">
        <div className="border-b border-[var(--px-border)] px-6 py-4">
          <span className="text-sm text-[var(--px-muted)]">
            {result.totalCount.toLocaleString("nb-NO")} rapporter
            {status ? ` med status «${result.statusCounts.find((s) => s.status === status)?.label ?? status}»` : ""}
          </span>
        </div>
        {result.rows.length === 0 ? (
          <div className="p-8 text-sm text-[var(--px-muted)]">
            Ingen rapporter matcher søket.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="bg-[var(--px-subtle)]">
                <tr>
                  {["Selskap", "Org.nr", "Regnskapsår", "Status", "Parser", "Oppdatert", ""].map(
                    (label, i) => (
                      <th
                        key={label || i}
                        className={`px-4 py-3 data-label text-[11px] uppercase tracking-widest text-[var(--px-text)] ${
                          i === 6 ? "text-right" : "text-left"
                        }`}
                      >
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-[var(--px-border)] hover:bg-[var(--px-subtle)]"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--px-text)]">
                      {row.companyName}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--px-muted)]">
                      {row.orgNumber}
                    </td>
                    <td className="px-4 py-3 text-[var(--px-muted)]">{row.fiscalYear}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded border px-2.5 py-0.5 text-[11px] font-medium ${STATUS_TONES[row.status]}`}
                      >
                        {row.statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--px-muted)]">
                      {row.parserVersion ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--px-muted)]">{row.updatedAt}</td>
                    <td className="px-4 py-3 text-right">
                      {row.reviewHref ? (
                        <Link
                          href={row.reviewHref as never}
                          className="rounded border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-1 text-xs font-medium text-[var(--px-text)] hover:bg-[var(--px-subtle)]"
                        >
                          Åpne kontroll
                        </Link>
                      ) : null}
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
