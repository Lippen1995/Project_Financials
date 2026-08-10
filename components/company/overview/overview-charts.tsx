"use client";

import * as React from "react";

import { SimulatedValueMarker } from "@/components/company/simulated-financials-notice";
import type { FinancialDisclosure } from "@/lib/financial-simulation-disclosure";
import { formatCompactNok, getReportingCurrency } from "@/lib/overview-chart";
import { formatMetricPercent, getOverviewMetricSeries, OverviewMetric } from "@/lib/overview-metrics";
import { NormalizedFinancialLineItem, NormalizedFinancialStatement } from "@/lib/types";
import { cn } from "@/lib/utils";

const NDASH = "–";
const MAX_YEARS = 6;
const BAR_COLOR = "var(--px-chart-1)";
const LINE_COLOR = "var(--px-chart-2)";

/** Default four metrics shown in the 2×2 grid, matching the 5C design slots. */
const DEFAULT_SLOTS = ["rev", "ebit", "eqPct", "ebitM"];

type ChartKind = "bar" | "line";

function fmtValue(metric: Pick<OverviewMetric, "type"> | null, value: number | null, currency: string) {
  if (!metric || value === null || value === undefined || !Number.isFinite(value)) return NDASH;
  return metric.type === "mar" ? formatMetricPercent(value) : (formatCompactNok(value, currency) ?? NDASH);
}

function lastDefinedIndex(values: (number | null)[]): number {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const v = values[i];
    if (v !== null && Number.isFinite(v)) return i;
  }
  return -1;
}

/* ── one compact metric chart (bar or line), null-safe ──────────────────── */
function MiniChart({
  values,
  years,
  kind,
  color,
}: {
  values: (number | null)[];
  years: number[];
  kind: ChartKind;
  color: string;
}) {
  const W = 320;
  const H = 132;
  const padT = 10;
  const padB = 20;
  const padX = 6;
  const plotH = H - padT - padB;
  const n = values.length;
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));

  if (nums.length === 0) {
    return (
      <div className="flex h-[132px] items-center justify-center text-xs text-[var(--px-muted)]">
        Ikke tilgjengelig
      </div>
    );
  }

  const max = Math.max(0, ...nums);
  const min = Math.min(0, ...nums);
  const range = max - min || 1;
  const band = (W - padX * 2) / n;
  const y = (v: number) => padT + plotH - ((v - min) / range) * plotH;
  const cx = (i: number) => padX + band * i + band / 2;
  const baseline = y(0);

  const linePts: string[] = [];
  values.forEach((v, i) => {
    if (v === null) return;
    linePts.push(`${cx(i)},${y(v)}`);
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block overflow-visible" aria-hidden="true">
      {/* zero baseline */}
      <line x1={padX} x2={W - padX} y1={baseline} y2={baseline} stroke="var(--px-chart-grid)" strokeWidth={1} />

      {kind === "bar"
        ? values.map((v, i) => {
            if (v === null) return null;
            const barW = Math.min(band * 0.5, 34);
            const yTop = Math.min(y(v), baseline);
            const h = Math.max(Math.abs(baseline - y(v)), 1);
            return <rect key={i} x={cx(i) - barW / 2} y={yTop} width={barW} height={h} rx={2} fill={color} opacity={0.9} />;
          })
        : (
            <>
              <polyline points={linePts.join(" ")} fill="none" stroke={color} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
              {values.map((v, i) =>
                v === null ? null : <circle key={i} cx={cx(i)} cy={y(v)} r={3} fill="#fff" stroke={color} strokeWidth={2} />,
              )}
            </>
          )}

      {years.map((yr, i) => (
        <text
          key={yr}
          x={cx(i)}
          y={H - 6}
          textAnchor="middle"
          style={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--px-muted)" }}
        >
          {`'${String(yr).slice(2)}`}
        </text>
      ))}
    </svg>
  );
}

export function OverviewCharts({
  statements,
  lineItems,
  disclosure,
}: {
  statements: NormalizedFinancialStatement[];
  lineItems: NormalizedFinancialLineItem[];
  disclosure?: FinancialDisclosure;
}) {
  const { years: allYears, metrics } = React.useMemo(
    () => getOverviewMetricSeries(statements, lineItems),
    [lineItems, statements],
  );
  const currency = React.useMemo(() => getReportingCurrency(statements), [statements]);

  const byKey = React.useMemo(() => new Map(metrics.map((m) => [m.key, m])), [metrics]);

  // Window to the most recent MAX_YEARS so the small charts stay legible.
  const startIdx = Math.max(0, allYears.length - MAX_YEARS);
  const years = allYears.slice(startIdx);
  const windowValues = React.useCallback(
    (m: OverviewMetric | undefined) => (m ? m.values.slice(startIdx) : []),
    [startIdx],
  );

  const initialSlots = React.useMemo(() => {
    const available = DEFAULT_SLOTS.filter((k) => byKey.has(k));
    const fill = metrics.map((m) => m.key).filter((k) => !available.includes(k));
    return [...available, ...fill].slice(0, 4);
  }, [byKey, metrics]);

  const [slots, setSlots] = React.useState<string[]>(initialSlots);
  const [kinds, setKinds] = React.useState<ChartKind[]>(() =>
    initialSlots.map((k) => (byKey.get(k)?.type === "mar" ? "line" : "bar")),
  );
  const [selected, setSelected] = React.useState(0);
  const [showAll, setShowAll] = React.useState(false);

  if (allYears.length === 0 || metrics.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--px-border)] bg-[var(--px-subtle)] p-6 text-sm leading-6 text-[var(--px-muted)]">
        Historiske regnskapstall er ikke tilgjengelige for denne virksomheten ennå.
      </div>
    );
  }

  const activeSlots = slots.slice(0, 4);
  const selKey = activeSlots[selected] ?? activeSlots[0];
  const selMetric = byKey.get(selKey) ?? null;
  const selKind = kinds[selected] ?? "bar";
  const selColor = selKind === "line" ? LINE_COLOR : BAR_COLOR;

  const assignToSelected = (key: string) => {
    setSlots((prev) => prev.map((k, i) => (i === selected ? key : k)));
    setKinds((prev) => prev.map((kind, i) => (i === selected ? (byKey.get(key)?.type === "mar" ? "line" : "bar") : kind)));
  };
  const setKind = (i: number, kind: ChartKind) => setKinds((prev) => prev.map((k, idx) => (idx === i ? kind : k)));

  const listMetrics = showAll ? metrics : metrics.slice(0, 6);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      {/* 2×2 chart grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {activeSlots.map((key, i) => {
          const m = byKey.get(key);
          const isSel = i === selected;
          const kind = kinds[i] ?? "bar";
          const color = kind === "line" ? LINE_COLOR : BAR_COLOR;
          return (
            <button
              key={`${key}-${i}`}
              type="button"
              onClick={() => setSelected(i)}
              className={cn(
                "block cursor-pointer rounded-xl border px-3 pb-1.5 pt-2.5 text-left transition-colors",
                isSel ? "border-[var(--px-accent)] bg-[var(--px-accent-soft)]" : "border-transparent hover:bg-[rgba(15,23,42,0.02)]",
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="data-label text-[10px] text-[var(--px-text)]">
                  {m?.label ?? key}{" "}
                  <span className="text-[var(--px-muted)]">· {m?.type === "mar" ? "%" : currency}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  {isSel ? <span className="data-label text-[8px] text-[var(--px-accent)]">VALGT</span> : null}
                  <span className="flex gap-0.5">
                    <span
                      role="button"
                      tabIndex={0}
                      title="Stolpegraf"
                      onClick={(e) => {
                        e.stopPropagation();
                        setKind(i, "bar");
                      }}
                      className={cn("material-symbols-outlined text-[17px]", kind === "bar" ? "text-[var(--px-accent)]" : "text-[var(--px-muted)]")}
                    >
                      bar_chart
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      title="Linjegraf"
                      onClick={(e) => {
                        e.stopPropagation();
                        setKind(i, "line");
                      }}
                      className={cn("material-symbols-outlined text-[17px]", kind === "line" ? "text-[var(--px-accent)]" : "text-[var(--px-muted)]")}
                    >
                      show_chart
                    </span>
                  </span>
                </div>
              </div>
              <MiniChart values={windowValues(m)} years={years} kind={kind} color={color} />
            </button>
          );
        })}
      </div>

      {/* metric picker list for the selected chart */}
      <div>
        <div className="flex items-baseline justify-between border-b border-[var(--px-border)] pb-2">
          <span className="data-label text-[10px] text-[var(--px-muted)]">Velg tall for valgt graf</span>
          <span className="data-label tabular-nums text-[10px] text-[var(--px-text)]">
            {years.at(-1) ?? ""}
          </span>
        </div>
        <div className="flex items-center gap-2 py-2.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: selColor }} />
          <span className="text-xs text-[var(--px-muted)]">
            Viser nå: <span className="font-semibold text-[var(--px-text)]">{selMetric?.label ?? NDASH}</span>
          </span>
        </div>
        <div>
          {listMetrics.map((m) => {
            const isActive = m.key === selKey;
            const marker = isActive ? selColor : "transparent";
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => assignToSelected(m.key)}
                className={cn(
                  "flex w-full items-center gap-2.5 border-b border-[var(--px-border-subtle)] px-2 py-2.5 text-left transition-colors",
                  isActive ? "bg-[var(--px-accent-soft)]" : "hover:bg-[rgba(248,249,250,0.7)]",
                )}
                style={{ borderLeft: `3px solid ${marker}` }}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{
                    background: isActive ? selColor : "transparent",
                    border: `1.5px solid ${isActive ? selColor : "var(--px-border)"}`,
                  }}
                />
                <span
                  className={cn(
                    "flex-1 truncate text-[12.5px]",
                    isActive ? "font-semibold text-[var(--px-text)]" : "text-[var(--px-text)]",
                  )}
                >
                  {m.label}
                </span>
                <span className="data-label shrink-0 text-[8px] text-[var(--px-muted)]">
                  {m.type === "mar" ? "%" : currency}
                </span>
                <span className="shrink-0 whitespace-nowrap font-mono text-[12.5px] font-semibold tabular-nums text-[var(--px-text)]">
                  {fmtValue(m, m.values[lastDefinedIndex(m.values)] ?? null, currency)}
                  {m.origins[lastDefinedIndex(m.values)] === "synthetic" ? (
                    <SimulatedValueMarker />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
        {metrics.length > 6 ? (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-3 inline-flex items-center gap-1 border-0 bg-transparent p-0 text-xs font-medium text-[var(--px-accent)]"
          >
            <span className="material-symbols-outlined text-[17px]">{showAll ? "expand_less" : "expand_more"}</span>
            {showAll ? "Vis færre" : `Vis alle (${metrics.length})`}
          </button>
        ) : null}
        <p className="mt-3.5 border-t border-[var(--px-border-subtle)] pt-3 text-[11px] leading-relaxed text-[var(--px-muted)]">
          Beløp i {currency} der ikke annet er oppgitt. Marger og avkastning vises i prosent.{" "}
          {disclosure?.simulated
            ? "Kilde: FI-SIM demonstrasjonsdatasett."
            : "Kilde: BRREG · Regnskapsregisteret."}
        </p>
      </div>
    </div>
  );
}
