import Link from "next/link";
import { notFound } from "next/navigation";

import { getBoardReportExtraction } from "@/server/persistence/board-report-extraction-repository";

import { BoardReportReviewActions } from "./BoardReportReviewActions";

function asWarnings(value: unknown): Array<{ code: string; message: string }> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is { code: string; message: string } =>
      Boolean(
        item &&
          typeof item === "object" &&
          typeof (item as { code?: unknown }).code === "string" &&
          typeof (item as { message?: unknown }).message === "string",
      ),
  );
}

export default async function BoardReportReviewPage({
  params,
}: {
  params: Promise<{ extractionId: string }>;
}) {
  const { extractionId } = await params;
  const extraction = await getBoardReportExtraction(extractionId);
  if (!extraction) notFound();
  const warnings = asWarnings(extraction.warnings);
  const sourcePage = extraction.pageStart ? `#page=${extraction.pageStart}` : "";

  return (
    <div className="space-y-6">
      <Link href="/admin/board-report-reviews" className="text-sm text-[var(--px-muted)] hover:text-[var(--px-text)]">
        Til kontrollkø
      </Link>

      <div>
        <h1 className="editorial-display text-3xl text-[var(--px-text)]">
          {extraction.company.name} - {extraction.fiscalYear}
        </h1>
        <p className="data-label mt-2 text-xs text-[var(--px-muted)]">
          {extraction.company.orgNumber} / {extraction.id}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--px-text)]">Foreslått styreberetning</h2>
              <p className="data-label mt-1 text-xs text-[var(--px-muted)]">
                Side {extraction.pageStart ?? "?"}-{extraction.pageEnd ?? "?"}
              </p>
            </div>
            <a
              href={`${extraction.filing.sourceUrl}${sourcePage}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-[var(--px-border)] px-4 py-2 text-sm text-[var(--px-text)] hover:bg-[var(--px-subtle)]"
            >
              Åpne kilde-PDF
            </a>
          </div>
          <div className="max-h-[70vh] overflow-y-auto rounded-xl bg-[var(--px-subtle)] p-5 whitespace-pre-wrap text-sm leading-7 text-[var(--px-text)]">
            {extraction.text ?? "Ingen tekst ble ekstrahert."}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
            <h2 className="text-lg font-semibold text-[var(--px-text)]">Kvalitet og kilde</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="data-label text-xs text-[var(--px-muted)]">Status</dt>
                <dd className="mt-1 text-[var(--px-text)]">{extraction.status}</dd>
              </div>
              <div>
                <dt className="data-label text-xs text-[var(--px-muted)]">Konfidens</dt>
                <dd className="mt-1 text-[var(--px-text)]">{Math.round(extraction.confidence * 100)}%</dd>
              </div>
              <div>
                <dt className="data-label text-xs text-[var(--px-muted)]">Parser-rute</dt>
                <dd className="mt-1 text-[var(--px-text)]">{extraction.route}</dd>
              </div>
              <div>
                <dt className="data-label text-xs text-[var(--px-muted)]">Dokumenthash</dt>
                <dd className="mt-1 break-all font-mono text-xs text-[var(--px-text)]">
                  {extraction.sourceDocumentHash}
                </dd>
              </div>
            </dl>
          </section>

          {warnings.length > 0 ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
              <h2 className="text-lg font-semibold text-amber-900">Advarsler</h2>
              <ul className="mt-4 space-y-4 text-sm text-amber-900">
                {warnings.map((warning) => (
                  <li key={`${warning.code}:${warning.message}`}>
                    <span className="data-label text-xs font-semibold">{warning.code}</span>
                    <p className="mt-1">{warning.message}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
            <h2 className="mb-4 text-lg font-semibold text-[var(--px-text)]">Beslutning</h2>
            <BoardReportReviewActions extractionId={extraction.id} />
          </section>
        </aside>
      </div>
    </div>
  );
}
