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

/** A 1/2/2,5/5/10 × 10^n step giving roughly `target` intervals over `span`. */
function niceStep(span: number, target: number) {
  const raw = span / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

/**
 * Rounds the value domain outward to whole steps so every gridline lands on a
 * readable number. Both ends are kept because the series can straddle zero.
 */
function buildScale(min: number, max: number, target = 3) {
  if (!(max > min)) return { lo: min, hi: min + 1, ticks: [min], step: 1 };
  const step = niceStep(max - min, target);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = lo, guard = 0; value <= hi + step / 2 && guard < 16; value += step, guard += 1) {
    ticks.push(Number(value.toPrecision(12)));
  }
  return { lo, hi, ticks, step };
}

/**
 * Axis labels drop the unit — the card header already states % or the currency
 * — and share one magnitude across all ticks so the column reads as a scale.
 */
function makeTickFormatter(isPercent: boolean, step: number, maxAbs: number) {
  if (isPercent) {
    const decimals = step < 1 ? 1 : 0;
    const nf = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return (value: number) => `${nf.format(value)} %`;
  }
  const { divisor, suffix } =
    maxAbs >= 1_000_000_000
      ? { divisor: 1_000_000_000, suffix: " mrd" }
      : maxAbs >= 1_000_000
        ? { divisor: 1_000_000, suffix: " mill" }
        : maxAbs >= 1_000
          ? { divisor: 1_000, suffix: "k" }
          : { divisor: 1, suffix: "" };
  const decimals = step / divisor < 1 ? 1 : 0;
  const nf = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (value: number) => (value === 0 ? "0" : `${nf.format(value / divisor)}${suffix}`);
}

/* ── one compact metric chart (bar or line), null-safe ──────────────────── */
function MiniChart({
  values,
  years,
  kind,
  color,
  isPercent,
  currency,
}: {
  values: (number | null)[];
  years: number[];
  kind: ChartKind;
  color: string;
  isPercent: boolean;
  currency: string;
}) {
  const W = 320;
  const H = 132;
  const padT = 10;
  const padB = 20;
  const padL = 46;
  const padR = 6;
  const plotH = H - padT - padB;
  const n = values.length;
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));

  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [hover, setHover] = React.useState<number | null>(null);

  if (nums.length === 0) {
    return (
      <div className="flex h-[132px] items-center justify-center text-xs text-[var(--px-muted)]">
        Ikke tilgjengelig
      </div>
    );
  }

  // Zero stays in the domain so bar heights are read against a true baseline.
  const scale = buildScale(Math.min(0, ...nums), Math.max(0, ...nums));
  const range = scale.hi - scale.lo || 1;
  const band = (W - padL - padR) / n;
  const y = (v: number) => padT + plotH - ((v - scale.lo) / range) * plotH;
  const cx = (i: number) => padL + band * i + band / 2;
  const baseline = y(0);
  const formatTick = makeTickFormatter(isPercent, scale.step, Math.max(Math.abs(scale.lo), Math.abs(scale.hi)));

  const linePts: string[] = [];
  values.forEach((v, i) => {
    if (v === null) return;
    linePts.push(`${cx(i)},${y(v)}`);
  });

  /** Maps the pointer to the nearest year band; points without a value pass. */
  const trackPointer = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const xInChart = ((clientX - rect.left) / rect.width) * W;
    const index = Math.round((xInChart - padL - band / 2) / band);
    const clamped = Math.min(n - 1, Math.max(0, index));
    setHover(values[clamped] === null ? null : clamped);
  };

  const hoverValue = hover === null ? null : values[hover];
  const hoverLabel = fmtValue({ type: isPercent ? "mar" : "abs" }, hoverValue ?? null, currency);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseMove={(event) => trackPointer(event.clientX)}
      onMouseLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block overflow-visible" aria-hidden="true">
        {/* y-axis: one gridline plus label per tick */}
        {scale.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--px-chart-grid)"
              strokeWidth={1}
              opacity={tick === 0 ? 1 : 0.45}
            />
            <text
              x={padL - 8}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--px-muted)" }}
            >
              {formatTick(tick)}
            </text>
          </g>
        ))}

        {/* hover guide for the year under the pointer */}
        {hover !== null ? (
          <line
            x1={cx(hover)}
            x2={cx(hover)}
            y1={padT}
            y2={padT + plotH}
            stroke={color}
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.4}
          />
        ) : null}

        {kind === "bar"
          ? values.map((v, i) => {
              if (v === null) return null;
              const barW = Math.min(band * 0.5, 34);
              const yTop = Math.min(y(v), baseline);
              const h = Math.max(Math.abs(baseline - y(v)), 1);
              return (
                <rect
                  key={i}
                  x={cx(i) - barW / 2}
                  y={yTop}
                  width={barW}
                  height={h}
                  rx={2}
                  fill={color}
                  opacity={hover === null || hover === i ? 0.9 : 0.45}
                />
              );
            })
          : (
              <>
                <polyline points={linePts.join(" ")} fill="none" stroke={color} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
                {values.map((v, i) =>
                  v === null ? null : (
                    <circle
                      key={i}
                      cx={cx(i)}
                      cy={y(v)}
                      r={hover === i ? 4.5 : 3}
                      fill="#fff"
                      stroke={color}
                      strokeWidth={2}
                    />
                  ),
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

      {hover !== null && hoverValue !== null ? (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-[var(--px-border)] bg-[var(--px-bg)] px-2 py-1 shadow-md"
          style={{
            left: `${Math.min(88, Math.max(14, (cx(hover) / W) * 100))}%`,
            top: `${(y(hoverValue) / H) * 100}%`,
            marginTop: -8,
          }}
        >
          <span className="data-label mr-2 text-[9px] tabular-nums text-[var(--px-muted)]">
            {years[hover] ?? ""}
          </span>
          <span className="font-mono text-[11.5px] font-semibold tabular-nums text-[var(--px-text)]">
            {hoverLabel}
          </span>
        </div>
      ) : null}
    </div>
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
  // `null` means no chart is marked — the picker list then has no target.
  const [selected, setSelected] = React.useState<number | null>(0);
  const [showAll, setShowAll] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  // Clicking anywhere outside the widget (or pressing Escape) clears the mark.
  React.useEffect(() => {
    if (selected === null) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target)) setSelected(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [selected]);

  if (allYears.length === 0 || metrics.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--px-border)] bg-[var(--px-subtle)] p-6 text-sm leading-6 text-[var(--px-muted)]">
        Historiske regnskapstall er ikke tilgjengelige for denne virksomheten ennå.
      </div>
    );
  }

  const activeSlots = slots.slice(0, 4);
  const selKey = selected === null ? null : activeSlots[selected] ?? null;
  const selMetric = selKey ? byKey.get(selKey) ?? null : null;
  const selKind = selected === null ? null : kinds[selected] ?? "bar";
  const selColor = selKind === "line" ? LINE_COLOR : BAR_COLOR;

  const assignToSelected = (key: string) => {
    if (selected === null) return;
    setSlots((prev) => prev.map((k, i) => (i === selected ? key : k)));
    setKinds((prev) => prev.map((kind, i) => (i === selected ? (byKey.get(key)?.type === "mar" ? "line" : "bar") : kind)));
  };
  const setKind = (i: number, kind: ChartKind) => setKinds((prev) => prev.map((k, idx) => (idx === i ? kind : k)));

  const listMetrics = showAll ? metrics : metrics.slice(0, 6);

  return (
    <div ref={rootRef} className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
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
              aria-pressed={isSel}
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
              <MiniChart
                values={windowValues(m)}
                years={years}
                kind={kind}
                color={color}
                isPercent={m?.type === "mar"}
                currency={currency}
              />
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
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: selected === null ? "var(--px-border)" : selColor }}
          />
          <span className="text-xs text-[var(--px-muted)]">
            {selected === null ? (
              "Ingen graf er valgt — trykk på en graf for å velge den."
            ) : (
              <>
                Viser nå: <span className="font-semibold text-[var(--px-text)]">{selMetric?.label ?? NDASH}</span>
              </>
            )}
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
                disabled={selected === null}
                title={selected === null ? "Velg en graf først" : undefined}
                onClick={() => assignToSelected(m.key)}
                className={cn(
                  "flex w-full items-center gap-2.5 border-b border-[var(--px-border-subtle)] px-2 py-2.5 text-left transition-colors",
                  isActive ? "bg-[var(--px-accent-soft)]" : "hover:bg-[rgba(248,249,250,0.7)]",
                  selected === null ? "cursor-default opacity-70 hover:bg-transparent" : "",
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
