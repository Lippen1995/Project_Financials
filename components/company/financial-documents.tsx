import React from "react";

import type { NormalizedFinancialDocument } from "@/lib/types";

type AnnualReportLink = {
  id: string;
  url: string;
  label: string;
};

type AnnualReportYear = {
  year: number;
  links: AnnualReportLink[];
};

function linkLabel(url: string) {
  try {
    return new URL(url).hostname.endsWith("brreg.no") ? "Brreg" : "Publisert rapport";
  } catch {
    return "Årsrapport";
  }
}

function groupAnnualReports(documents: NormalizedFinancialDocument[]): AnnualReportYear[] {
  const reportsByYear = new Map<number, Map<string, AnnualReportLink>>();

  for (const document of documents) {
    const links = reportsByYear.get(document.year) ?? new Map<string, AnnualReportLink>();
    for (const file of document.files) {
      if (file.type !== "aarsregnskap" || !file.url || links.has(file.url)) continue;
      links.set(file.url, {
        id: file.id,
        url: file.url,
        label: linkLabel(file.url),
      });
    }
    reportsByYear.set(document.year, links);
  }

  return [...reportsByYear.entries()]
    .sort(([leftYear], [rightYear]) => rightYear - leftYear)
    .map(([year, links]) => ({ year, links: [...links.values()] }));
}

export function FinancialDocuments({
  documents,
  latestYear,
}: {
  documents: NormalizedFinancialDocument[];
  latestYear?: number | null;
}) {
  const reportYears = groupAnnualReports(documents);
  const resolvedLatestYear = Math.max(
    latestYear ?? Number.NEGATIVE_INFINITY,
    reportYears[0]?.year ?? Number.NEGATIVE_INFINITY,
  );

  if (reportYears.length === 0 && !Number.isFinite(resolvedLatestYear)) return null;

  if (reportYears.length === 0) {
    return (
      <div
        data-financial-documents-variant="inline"
        data-financial-documents-surface="page"
        className="flex items-center gap-4 px-1 py-2 text-sm text-[var(--px-muted)]"
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">description</span>
        <span>Årsrapport {resolvedLatestYear} er registrert, men dokumentlenken er ikke tilgjengelig.</span>
      </div>
    );
  }

  const yearCountLabel = reportYears.length === 1
    ? "1 regnskapsår"
    : `${reportYears.length} regnskapsår`;

  return (
    <details
      data-financial-documents-variant="inline"
      data-financial-documents-surface="page"
      className="group"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-1 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)] [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-4">
          <span
            className="material-symbols-outlined text-[18px] text-[var(--px-muted)]"
            aria-hidden="true"
          >
            description
          </span>
          <span className="font-semibold text-[var(--px-text)]">Årsrapporter</span>
          <span className="hidden text-sm text-[var(--px-muted)] sm:inline">
            Nyeste {resolvedLatestYear} · {yearCountLabel}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-4 text-sm font-medium text-[var(--px-muted)]">
          <span className="sm:hidden">{yearCountLabel}</span>
          <span>Vis</span>
          <span
            className="material-symbols-outlined text-[18px] transition-transform group-open:rotate-180"
            aria-hidden="true"
          >
            expand_more
          </span>
        </span>
      </summary>

      <div className="grid gap-x-6 border-t border-[var(--px-border)] px-1 pb-3 md:grid-cols-2">
        {reportYears.map((reportYear) => (
          <div
            key={reportYear.year}
            data-financial-document-year={reportYear.year}
            className="flex min-h-11 items-center justify-between gap-4 border-b border-[var(--px-border)] py-2"
          >
            <span className="font-mono text-sm font-semibold text-[var(--px-text)]">
              {reportYear.year}
            </span>
            <span className="flex flex-wrap justify-end gap-4">
              {reportYear.links.length > 0 ? reportYear.links.map((link) => (
                <a
                  key={`${reportYear.year}:${link.url}`}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${link.label}, årsrapport ${reportYear.year}`}
                  className="inline-flex items-center rounded-full border border-[var(--px-border)] px-3 py-1 text-xs font-semibold text-[var(--px-text)] transition-colors hover:bg-[var(--px-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)]"
                >
                  {link.label}
                  <span className="material-symbols-outlined ml-1 text-[14px]" aria-hidden="true">
                    open_in_new
                  </span>
                </a>
              )) : (
                <span className="text-xs text-[var(--px-muted)]">Lenke mangler</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}
