import Link from "next/link";

import { listPendingBoardReportExtractions } from "@/server/persistence/board-report-extraction-repository";

export default async function BoardReportReviewQueuePage() {
  const extractions = await listPendingBoardReportExtractions(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="editorial-display text-3xl text-[var(--px-text)]">
          Kontroll av styreberetninger
        </h1>
        <p className="mt-2 text-sm text-[var(--px-muted)]">
          Kontroller dokumentgrenser og tekst for uttrekk som ikke kan publiseres automatisk.
        </p>
      </div>

      <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
        {extractions.length === 0 ? (
          <div className="rounded-xl bg-[var(--px-subtle)] p-6 text-sm text-[var(--px-muted)]">
            Ingen styreberetninger venter på kontroll.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--px-border)] text-left">
                  <th className="data-label px-2 py-3 text-[var(--px-muted)]">Selskap</th>
                  <th className="data-label px-2 py-3 text-[var(--px-muted)]">År</th>
                  <th className="data-label px-2 py-3 text-[var(--px-muted)]">Status</th>
                  <th className="data-label px-2 py-3 text-[var(--px-muted)]">Rute</th>
                  <th className="data-label px-2 py-3 text-[var(--px-muted)]">Konfidens</th>
                  <th className="px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {extractions.map((extraction) => (
                  <tr key={extraction.id} className="border-b border-[var(--px-border)] last:border-0">
                    <td className="px-2 py-3">
                      <div className="font-medium text-[var(--px-text)]">{extraction.company.name}</div>
                      <div className="data-label text-xs text-[var(--px-muted)]">
                        {extraction.company.orgNumber}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-[var(--px-text)]">{extraction.fiscalYear}</td>
                    <td className="px-2 py-3">
                      <span className="data-label rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">
                        {extraction.status}
                      </span>
                    </td>
                    <td className="data-label px-2 py-3 text-xs text-[var(--px-muted)]">
                      {extraction.route}
                    </td>
                    <td className="px-2 py-3 text-[var(--px-text)]">
                      {Math.round(extraction.confidence * 100)}%
                    </td>
                    <td className="px-2 py-3 text-right">
                      <Link
                        href={`/admin/board-report-reviews/${extraction.id}`}
                        className="inline-flex rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-medium text-[var(--px-surface)] hover:bg-[var(--px-action-hover)]"
                      >
                        Åpne kontroll
                      </Link>
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
