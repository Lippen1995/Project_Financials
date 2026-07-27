import React from "react";
import Link from "next/link";

import type {
  AnalysisStatus,
  AnalysisSummary,
  AnalysisWorkflow,
} from "@/server/analysis/analysis-read-service";

const WORKFLOW_LABELS: Record<AnalysisWorkflow, string> = {
  MNA_SCREENING: "M&A-screening",
  SOURCING: "Sourcing",
  COMPETITOR_ANALYSIS: "Konkurrentanalyse",
};

const STATUS_LABELS: Record<AnalysisStatus, string> = {
  DRAFT: "Utkast",
  IN_PROGRESS: "Pågår",
  COMPLETED: "Fullført",
  ARCHIVED: "Arkivert",
};

const STATUS_CLASSES: Record<AnalysisStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  ARCHIVED: "bg-slate-100 text-slate-500",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AnalysisList({ analyses }: { analyses: AnalysisSummary[] }) {
  if (analyses.length === 0) {
    return (
      <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
        <div className="data-label text-[11px] text-[var(--px-accent)]">Analysearkiv</div>
        <h2 className="mt-3 text-lg font-semibold text-[var(--px-text)]">
          Ingen analyser lagret ennå
        </h2>
        <p className="mt-2 max-w-[62ch] text-sm text-[var(--px-muted)]">
          Opprettelse fra arbeidsflyten kommer i neste leveranse. Inntil da kan du bygge et
          dokumentert selskapsgrunnlag i søket.
        </p>
        <Link
          href="/search"
          className="mt-5 inline-flex rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-semibold text-[var(--px-surface)] hover:bg-[var(--px-action-hover)]"
        >
          Søk etter selskaper
        </Link>
      </section>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {analyses.map((analysis) => (
        <article
          key={analysis.id}
          className="flex flex-col rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5"
        >
          <div className="flex flex-wrap items-center gap-4">
            <span className="data-label text-[11px] text-[var(--px-accent)]">
              {WORKFLOW_LABELS[analysis.workflow]}
            </span>
            <span
              className={`data-label rounded-full px-2.5 py-1 text-[10px] ${STATUS_CLASSES[analysis.status]}`}
            >
              {STATUS_LABELS[analysis.status]}
            </span>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-[var(--px-text)]">
            {analysis.title}
          </h2>
          <p className="mt-2 line-clamp-3 text-sm text-[var(--px-muted)]">
            {analysis.purpose}
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-[var(--px-border)] pt-4 text-sm">
            <div>
              <dt className="data-label text-[10px] text-[var(--px-muted)]">Workspace</dt>
              <dd className="mt-1 text-[var(--px-text)]">{analysis.workspaceName}</dd>
            </div>
            <div>
              <dt className="data-label text-[10px] text-[var(--px-muted)]">Arbeidslister</dt>
              <dd className="mt-1 tabular-nums text-[var(--px-text)]">
                {analysis.worklistCount} {analysis.worklistCount === 1 ? "arbeidsliste" : "arbeidslister"}
              </dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <span className="text-xs text-[var(--px-muted)]">
              Oppdatert {formatDate(analysis.updatedAt)}
            </span>
            <Link
              href={`/analyses/${analysis.id}` as never}
              className="rounded-full border border-[var(--px-border)] px-4 py-2 text-sm font-semibold text-[var(--px-text)] hover:bg-[var(--px-subtle)]"
            >
              Fortsett analysen
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}

export {
  STATUS_CLASSES as analysisStatusClasses,
  STATUS_LABELS as analysisStatusLabels,
  WORKFLOW_LABELS as analysisWorkflowLabels,
};
