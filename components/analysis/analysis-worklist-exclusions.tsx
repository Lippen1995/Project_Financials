"use client";

import React, { useState } from "react";
import Link from "next/link";

type ExclusionItem = {
  orgNumber: string;
  companyName: string;
  reasons: unknown;
  sourceBasis: unknown;
};

type ExclusionPage = {
  items: ExclusionItem[];
  nextCursor: string | null;
};

type SourceMetadataView = {
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: string;
  normalizedAt: string;
};

const reasonLabels: Record<string, string> = {
  STATUS_NOT_INCLUDED: "Status er ikke inkludert",
  INDUSTRY_NOT_INCLUDED: "Næringskode er ikke inkludert",
  MUNICIPALITY_NOT_INCLUDED: "Kommune er ikke inkludert",
  LEGAL_FORM_NOT_INCLUDED: "Organisasjonsform er ikke inkludert",
  TEXT_NOT_MATCHED: "Navn eller organisasjonsnummer traff ikke søket",
  FINANCIAL_PERIOD_NOT_INCLUDED: "Valgt regnskapsperiode er ikke tilgjengelig",
  EMPLOYEE_COUNT_NOT_AVAILABLE: "Antall ansatte mangler",
  EMPLOYEE_COUNT_BELOW_MINIMUM: "Antall ansatte er under minimum",
  EMPLOYEE_COUNT_ABOVE_MAXIMUM: "Antall ansatte er over maksimum",
  REVENUE_NOT_AVAILABLE: "Driftsinntekt mangler",
  REVENUE_BELOW_MINIMUM: "Driftsinntekt er under minimum",
  REVENUE_ABOVE_MAXIMUM: "Driftsinntekt er over maksimum",
  OPERATING_MARGIN_NOT_AVAILABLE: "Driftsmargin mangler",
  OPERATING_MARGIN_BELOW_MINIMUM: "Driftsmargin er under minimum",
  OPERATING_MARGIN_ABOVE_MAXIMUM: "Driftsmargin er over maksimum",
};

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function sourceMetadata(value: unknown): SourceMetadataView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (
    typeof source.sourceSystem !== "string" ||
    typeof source.sourceEntityType !== "string" ||
    typeof source.sourceId !== "string" ||
    typeof source.fetchedAt !== "string" ||
    typeof source.normalizedAt !== "string"
  ) {
    return null;
  }
  return {
    sourceSystem: source.sourceSystem,
    sourceEntityType: source.sourceEntityType,
    sourceId: source.sourceId,
    fetchedAt: source.fetchedAt,
    normalizedAt: source.normalizedAt,
  };
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

export function ExclusionSourceEvidence({ value }: { value: unknown }) {
  const sources = Array.isArray(value)
    ? value.map(sourceMetadata).filter((source): source is SourceMetadataView => source != null)
    : [];
  if (sources.length === 0) {
    return <span className="text-sm text-[var(--px-muted)]">Ingen validerte kilder</span>;
  }
  return (
    <details>
      <summary className="cursor-pointer font-medium text-[var(--px-accent)]">
        {sources.length} {sources.length === 1 ? "kilde" : "kilder"}
      </summary>
      <div className="mt-4 flex min-w-72 flex-col gap-4">
        {sources.map((source) => (
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
            <dl className="mt-2 text-xs text-[var(--px-muted)]">
              <div>
                <dt className="inline font-medium">Hentet: </dt>
                <dd className="inline">{formatDate(source.fetchedAt)}</dd>
              </div>
              <div className="mt-1">
                <dt className="inline font-medium">Normalisert: </dt>
                <dd className="inline">{formatDate(source.normalizedAt)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </details>
  );
}

export function WorklistExclusionPanel({
  analysisId,
  worklistId,
  universeResultVersion,
  screeningVersion,
  rankingVersion,
  evaluatedCount,
  includedCount,
  excludedCount,
  truncatedCount,
  universeExecutedAt,
}: {
  analysisId: string;
  worklistId: string;
  universeResultVersion: string | null;
  screeningVersion: string | null;
  rankingVersion: string | null;
  evaluatedCount: number | null;
  includedCount: number | null;
  excludedCount: number | null;
  truncatedCount: number | null;
  universeExecutedAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ExclusionItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!universeResultVersion || !screeningVersion || !universeExecutedAt) return null;

  async function load(cursor: string | null) {
    setLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams({ limit: "50" });
      if (cursor) search.set("cursor", cursor);
      const response = await fetch(
        `/api/analyses/${analysisId}/worklists/${worklistId}/exclusions?${search}`,
      );
      const result = await response.json() as ExclusionPage & { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Kunne ikke laste eksklusjonsgrunnlaget.");
      }
      setItems((current) => cursor ? [...current, ...result.items] : result.items);
      setNextCursor(result.nextCursor);
      setLoaded(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Kunne ikke laste eksklusjonsgrunnlaget.",
      );
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && !loaded && !loading) {
      if ((excludedCount ?? 0) === 0) setLoaded(true);
      else void load(null);
    }
  }

  return (
    <section className="border-t border-[var(--px-border)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="data-label rounded-full bg-[var(--px-subtle)] px-2.5 py-1 text-[10px] text-[var(--px-muted)]">
              {screeningVersion}
            </span>
            {rankingVersion ? (
              <span className="data-label rounded-full bg-[var(--px-accent-soft)] px-2.5 py-1 text-[10px] text-[var(--px-accent)]">
                {rankingVersion}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-[var(--px-muted)]">
            {evaluatedCount ?? 0} vurdert · {includedCount ?? 0} inkludert ·{" "}
            {excludedCount ?? 0} ekskludert
            {(truncatedCount ?? 0) > 0 ? ` · ${truncatedCount} utenfor resultatgrensen` : ""}
          </p>
          <p className="mt-1 text-xs text-[var(--px-muted)]">
            Kjørt {formatDate(universeExecutedAt)} · {universeResultVersion}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="rounded-full border border-[var(--px-border)] px-4 py-2 text-sm font-semibold text-[var(--px-text)] hover:bg-[var(--px-subtle)]"
        >
          {open ? "Skjul eksklusjonsgrunnlag" : "Se eksklusjonsgrunnlag"}
        </button>
      </div>

      {open ? (
        <div className="mt-6">
          {loading && !loaded ? (
            <p role="status" className="text-sm text-[var(--px-muted)]">
              Laster eksklusjonsgrunnlag …
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">
              {error}
            </p>
          ) : null}
          {loaded && items.length === 0 ? (
            <p className="text-sm text-[var(--px-muted)]">
              Ingen virksomheter ble ekskludert i denne kjøringen.
            </p>
          ) : null}
          {items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="bg-[var(--px-subtle)]">
                  <tr className="data-label text-[10px] text-[var(--px-muted)]">
                    <th className="px-4 py-3 font-medium">Selskap</th>
                    <th className="px-4 py-3 font-medium">Eksklusjonsgrunn</th>
                    <th className="px-4 py-3 font-medium">Kilder</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const reasons = stringArray(item.reasons);
                    return (
                      <tr
                        key={item.orgNumber}
                        className="border-t border-[var(--px-border)]"
                      >
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
                          {reasons.map((reason) => reasonLabels[reason] ?? reason).join(", ")}
                        </td>
                        <td className="px-4 py-3 text-[var(--px-muted)]">
                          <ExclusionSourceEvidence value={item.sourceBasis} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {nextCursor ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                disabled={loading}
                onClick={() => void load(nextCursor)}
                className="rounded-full border border-[var(--px-border)] px-4 py-2 text-sm font-semibold text-[var(--px-text)] hover:bg-[var(--px-subtle)] disabled:opacity-60"
              >
                {loading ? "Laster …" : "Last flere"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
