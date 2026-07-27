import React from "react";
import Link from "next/link";

import type { AnalysisDetail } from "@/server/analysis/analysis-read-service";
import {
  analysisStatusClasses,
  analysisStatusLabels,
  analysisWorkflowLabels,
} from "./analysis-list";

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function formatOrgNumber(orgNumber: string) {
  return orgNumber.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function valueLabel(value: unknown) {
  if (Array.isArray(value)) {
    if (value.every((item) => (
      typeof item === "string" || typeof item === "number" || typeof item === "boolean"
    ))) {
      return value.map(String).join(", ");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "Ja" : "Nei";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object") return JSON.stringify(value);
  return null;
}

type SourceMetadataView = {
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: string;
  normalizedAt: string;
};

function sourceMetadata(value: unknown): SourceMetadataView | null {
  const item = record(value);
  if (
    !item ||
    typeof item.sourceSystem !== "string" ||
    typeof item.sourceEntityType !== "string" ||
    typeof item.sourceId !== "string" ||
    typeof item.fetchedAt !== "string" ||
    typeof item.normalizedAt !== "string"
  ) {
    return null;
  }
  return {
    sourceSystem: item.sourceSystem,
    sourceEntityType: item.sourceEntityType,
    sourceId: item.sourceId,
    fetchedAt: item.fetchedAt,
    normalizedAt: item.normalizedAt,
  };
}

function sourceMetadataList(value: unknown) {
  return Array.isArray(value)
    ? value.map(sourceMetadata).filter((item): item is SourceMetadataView => item != null)
    : [];
}

function ContextPanel({
  title,
  version,
  value,
  emptyLabel,
}: {
  title: string;
  version: string | null;
  value: unknown;
  emptyLabel: string;
}) {
  const entries = Object.entries(record(value) ?? {})
    .map(([key, item]) => [key, valueLabel(item)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] != null);

  return (
    <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-[var(--px-text)]">{title}</h2>
        {version ? (
          <span className="data-label rounded-full bg-[var(--px-subtle)] px-2.5 py-1 text-[10px] text-[var(--px-muted)]">
            {version}
          </span>
        ) : null}
      </div>
      {entries.length > 0 ? (
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {entries.map(([key, label]) => (
            <div key={key} className="rounded-xl bg-[var(--px-subtle)] p-4">
              <dt className="data-label text-[10px] text-[var(--px-muted)]">{key}</dt>
              <dd className="mt-1 break-words text-sm text-[var(--px-text)]">{label}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-4 text-sm text-[var(--px-muted)]">{emptyLabel}</p>
      )}
    </section>
  );
}

export function AnalysisDetailView({ analysis }: { analysis: AnalysisDetail }) {
  const analysisSources = sourceMetadataList(analysis.sourceBasis);
  return (
    <main className="flex flex-col gap-8 pb-16">
      <header>
        <Link
          href={"/analyses" as never}
          className="text-sm font-medium text-[var(--px-accent)] hover:text-[var(--px-text)]"
        >
          ← Alle analyser
        </Link>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <span className="data-label text-[11px] text-[var(--px-accent)]">
            {analysisWorkflowLabels[analysis.workflow]}
          </span>
          <span
            className={`data-label rounded-full px-2.5 py-1 text-[10px] ${analysisStatusClasses[analysis.status]}`}
          >
            {analysisStatusLabels[analysis.status]}
          </span>
        </div>
        <h1 className="editorial-display mt-3 text-[38px] leading-[1.08] text-[var(--px-text)]">
          {analysis.title}
        </h1>
        <p className="mt-3 max-w-[72ch] text-sm text-[var(--px-muted)]">{analysis.purpose}</p>
        <div className="mt-5 flex flex-wrap gap-4 text-xs text-[var(--px-muted)]">
          <span>{analysis.workspaceName}</span>
          <span>Versjon {analysis.version}</span>
          <span>Oppdatert {formatDate(analysis.updatedAt)}</span>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-3">
        <ContextPanel
          title="Kriterier"
          version={analysis.criteriaVersion}
          value={analysis.criteria}
          emptyLabel="Ingen kriterier er lagret."
        />
        <ContextPanel
          title="Univers"
          version={analysis.universeQueryVersion}
          value={analysis.universeQuery}
          emptyLabel="Ingen universdefinisjon er lagret."
        />
        <ContextPanel
          title="Beregning"
          version={analysis.calculationVersion}
          value={analysis.calculationConfig}
          emptyLabel="Ingen rangering eller beregning er valgt."
        />
      </div>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="data-label text-[11px] text-[var(--px-accent)]">Arbeidsgrunnlag</div>
            <h2 className="mt-2 text-xl font-semibold text-[var(--px-text)]">Arbeidslister</h2>
          </div>
          <span className="text-sm tabular-nums text-[var(--px-muted)]">
            {analysis.worklists.length} lagret
          </span>
        </div>

        {analysis.worklists.length === 0 ? (
          <div className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6 text-sm text-[var(--px-muted)]">
            Ingen arbeidslister er lagret i denne analysen ennå.
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {analysis.worklists.map((worklist) => (
              <article
                key={worklist.id}
                className="overflow-hidden rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)]"
              >
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="data-label rounded-full bg-[var(--px-accent-soft)] px-2.5 py-1 text-[10px] text-[var(--px-accent)]">
                      {worklist.type}
                    </span>
                    <span className="text-xs text-[var(--px-muted)]">
                      {worklist.items.length} selskaper
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-[var(--px-text)]">
                    {worklist.name}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--px-muted)]">{worklist.purpose}</p>
                </div>

                <div className="overflow-x-auto border-t border-[var(--px-border)]">
                  <table className="min-w-full border-collapse text-left text-sm">
                    <thead className="bg-[var(--px-subtle)]">
                      <tr className="data-label text-[10px] text-[var(--px-muted)]">
                        <th className="px-4 py-3 font-medium">#</th>
                        <th className="px-4 py-3 font-medium">Selskap</th>
                        <th className="px-4 py-3 font-medium">Inklusjonsgrunn</th>
                        <th className="px-4 py-3 font-medium">Datagap</th>
                        <th className="px-4 py-3 font-medium">Kilder</th>
                      </tr>
                    </thead>
                    <tbody>
                      {worklist.items.map((item) => {
                        const inclusionBasis = stringArray(item.inclusionBasis);
                        const dataGaps = stringArray(item.dataGaps);
                        const sourceCount = sourceMetadataList(item.sourceBasis).length;
                        return (
                          <tr key={item.id} className="border-t border-[var(--px-border)]">
                            <td className="px-4 py-3 tabular-nums text-[var(--px-muted)]">
                              {item.sortOrder}
                            </td>
                            <td className="px-4 py-3">
                              <Link
                                href={`/search?query=${encodeURIComponent(item.orgNumber)}` as never}
                                className="font-semibold text-[var(--px-text)] hover:text-[var(--px-accent)]"
                              >
                                {item.companyName}
                              </Link>
                              <div className="data-label mt-1 text-[10px] text-[var(--px-muted)]">
                                {formatOrgNumber(item.orgNumber)}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-[var(--px-text)]">
                              {inclusionBasis.length > 0 ? inclusionBasis.join(", ") : "Ikke dokumentert"}
                            </td>
                            <td className="px-4 py-3 text-[var(--px-muted)]">
                              {dataGaps.length > 0 ? dataGaps.join(", ") : "Ingen datagap"}
                            </td>
                            <td className="px-4 py-3 tabular-nums text-[var(--px-muted)]">
                              {sourceCount} {sourceCount === 1 ? "kilde" : "kilder"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <ContextPanel
          title="Konklusjon"
          version={`analyse-v${analysis.version}`}
          value={analysis.conclusion}
          emptyLabel="Konklusjon er ikke lagret ennå."
        />
        <ContextPanel
          title="Oppfølging"
          version={null}
          value={analysis.followUp}
          emptyLabel="Ingen oppfølging er lagret ennå."
        />
      </div>

      <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-[var(--px-text)]">Kildegrunnlag</h2>
          <span className="data-label text-[10px] text-[var(--px-muted)]">
            {analysisSources.length} validerte kilder
          </span>
        </div>
        {analysisSources.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--px-muted)]">
            Ingen kildeposter er knyttet til konklusjonen ennå.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {analysisSources.map((source) => (
              <div
                key={`${source.sourceSystem}:${source.sourceEntityType}:${source.sourceId}`}
                className="rounded-xl bg-[var(--px-subtle)] p-4"
              >
                <div className="data-label text-[10px] text-[var(--px-accent)]">
                  {source.sourceSystem} · {source.sourceEntityType}
                </div>
                <div className="mt-2 break-all text-sm text-[var(--px-text)]">
                  {source.sourceId}
                </div>
                <div className="mt-2 text-xs text-[var(--px-muted)]">
                  Hentet {formatDate(source.fetchedAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
