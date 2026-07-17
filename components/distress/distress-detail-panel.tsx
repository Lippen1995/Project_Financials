"use client";

import Link from "next/link";
import { useEffect } from "react";

import { DistressHealthBar } from "@/components/distress/distress-health-bar";
import { DistressSparkline } from "@/components/distress/distress-sparkline";
import {
  formatCompactAmount,
  formatDaysInStatus,
  formatEquityRatio,
  formatPercentValue,
  formatRatio,
  getCoverageLabel,
  getStatusTone,
} from "@/lib/distress-presentation";
import { DistressCompanyRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="data-label text-[9.5px] text-[var(--px-muted)]">{label}</div>
      <div className="mt-1 text-[15px] font-semibold text-[var(--px-text)] tabular-nums">{value}</div>
    </div>
  );
}

/**
 * A read-only summary built entirely from the row already in memory, so opening it costs no fetch.
 * The full vurdering — announcements, documents, note excerpts — lives on the company page behind
 * "Åpne full vurdering", which is where the expensive document extraction happens.
 */
export function DistressDetailPanel({
  workspaceId,
  row,
  onClose,
}: {
  workspaceId: string;
  row: DistressCompanyRow;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const tone = getStatusTone(row.distress.status);
  const hasRealizableAssets =
    (row.financials.fixedAssets ?? null) !== null || (row.financials.inventory ?? null) !== null;
  const realizableAssets = hasRealizableAssets
    ? (row.financials.fixedAssets ?? 0) + (row.financials.inventory ?? 0)
    : null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Vurdering av ${row.company.name}`}>
      <button
        type="button"
        onClick={onClose}
        aria-label="Lukk vurdering"
        className="absolute inset-0 cursor-default bg-[rgba(15,23,42,0.3)]"
      />
      <div className="absolute right-0 top-0 flex h-full w-[480px] max-w-[94%] flex-col bg-[var(--px-surface-strong)] shadow-[var(--shadow-md)]">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--px-border-subtle)] py-3 pl-6 pr-3">
          <span className="data-label text-[10px] text-[var(--px-muted)]">Selskapsvurdering</span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--px-muted)] hover:bg-[rgba(15,23,42,0.05)]"
            aria-label="Lukk"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <div>
            <h2 className="text-[22px] font-semibold leading-tight text-[var(--px-text)]">{row.company.name}</h2>
            <div className="data-label mt-2 text-[9.5px] text-[var(--px-muted)]">
              {[row.company.legalForm, row.company.municipality, `org.nr ${row.company.orgNumber}`]
                .filter(Boolean)
                .join(" · ")}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className="data-label inline-flex items-center rounded-full border px-2 py-1 text-[9.5px]"
                style={{ background: tone.background, color: tone.foreground, borderColor: tone.border }}
              >
                {row.distress.label}
              </span>
              <span className="text-[11.5px] text-[var(--px-muted)]">
                {row.distress.statusStartedAt ? formatDate(row.distress.statusStartedAt) : "Ukjent dato"} ·{" "}
                {formatDaysInStatus(row.distress.daysInStatus)}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--px-border-subtle)] p-4">
            <div className="data-label text-[9.5px] text-[var(--px-muted)]">Finansiell helse</div>
            <div className="mt-2">
              <DistressHealthBar health={row.healthScore} />
            </div>
            <p className="mt-3 text-[12px] leading-5 text-[var(--px-muted)]">
              {row.healthScore === null || row.healthScore === undefined
                ? "Ingen regnskapstall er tilgjengelige for dette selskapet, så det er ikke gitt noen score. Formell status alene sier ingenting om finansiell helse."
                : `Regelbasert score (${row.scoreVersion}) fra status, egenkapitalandel, likviditet, driftsresultat og inntektstrend. Lav score = svak helse.`}
            </p>
          </div>

          <div>
            <div className="data-label mb-3 text-[9.5px] text-[var(--px-muted)]">
              Nøkkeltall · {row.financials.lastReportedYear ?? "ukjent år"}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Figure label="Likviditetsgrad" value={formatRatio(row.financials.liquidityRatio)} />
              <Figure label="EK-andel" value={formatEquityRatio(row.financials.equityRatio)} />
              <Figure label="Inntekter" value={formatCompactAmount(row.financials.revenue)} />
              <Figure label="Driftsresultat" value={formatCompactAmount(row.financials.ebit)} />
              <Figure label="Anleggsmidler" value={formatCompactAmount(row.financials.fixedAssets)} />
              <Figure label="Varelager" value={formatCompactAmount(row.financials.inventory)} />
              <Figure label="Kontanter" value={formatCompactAmount(row.financials.cash)} />
              <Figure label="Rentebærende gjeld" value={formatCompactAmount(row.financials.interestBearingDebt)} />
            </div>
          </div>

          <div className="rounded-lg border border-[var(--px-border-subtle)] p-4">
            <div className="data-label text-[9.5px] text-[var(--px-muted)]">Omsettelige verdier</div>
            <div className="mt-1 text-[24px] font-semibold text-[var(--px-accent)] tabular-nums">
              {formatCompactAmount(realizableAssets)}
            </div>
            <p className="mt-2 text-[12px] leading-5 text-[var(--px-muted)]">
              Anleggsmidler og varelager til bokført verdi. Panteheftelser er ikke trukket fra — se rentebærende gjeld
              over.
            </p>
          </div>

          {row.financials.revenueTrend && row.financials.revenueTrend.length >= 2 ? (
            <div>
              <div className="data-label mb-2 text-[9.5px] text-[var(--px-muted)]">Inntektstrend</div>
              <DistressSparkline points={row.financials.revenueTrend} width={416} height={70} />
              <div className="mt-1 flex justify-between text-[11px] text-[var(--px-muted)] tabular-nums">
                <span>{row.financials.revenueTrend[0].fiscalYear}</span>
                <span>{row.financials.revenueTrend[row.financials.revenueTrend.length - 1].fiscalYear}</span>
              </div>
            </div>
          ) : null}

          <div className="text-[11.5px] text-[var(--px-muted)]">{getCoverageLabel(row.dataCoverage)}</div>
        </div>

        <div className="shrink-0 border-t border-[var(--px-border-subtle)] p-4">
          <Link
            href={`/workspaces/${workspaceId}/distress/companies/${row.company.orgNumber}`}
            className="flex w-full items-center justify-center rounded-full bg-[var(--px-action)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--px-action-hover)]"
          >
            Åpne full vurdering
          </Link>
        </div>
      </div>
    </div>
  );
}
