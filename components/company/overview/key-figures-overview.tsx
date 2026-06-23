"use client";

import * as React from "react";

import { formatCompactNok, getReportingCurrency } from "@/lib/overview-chart";
import { formatMetricPercent, getOverviewMetricSeries, OverviewMetric } from "@/lib/overview-metrics";
import { NormalizedFinancialStatement } from "@/lib/types";
import { cn } from "@/lib/utils";

import { CardLabel } from "./earnings-trends";

function lastDefined(values: (number | null)[]): { value: number; index: number } | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const v = values[i];
    if (v !== null && Number.isFinite(v)) return { value: v, index: i };
  }
  return null;
}

function firstDefined(values: (number | null)[]): { value: number; index: number } | null {
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v !== null && Number.isFinite(v)) return { value: v, index: i };
  }
  return null;
}

function average(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function Sparkline({ values }: { values: (number | null)[] }) {
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (nums.length < 2) return <div className="h-[34px] w-[84px]" />;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  const w = 84;
  const h = 34;
  const pts = nums.map((v, i) => `${(i / (nums.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  const up = nums[nums.length - 1] >= nums[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[34px] w-[84px] shrink-0" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
        stroke={up ? "var(--px-success)" : "var(--px-error)"} />
    </svg>
  );
}

function metricBy(metrics: OverviewMetric[], key: string) {
  return metrics.find((m) => m.key === key) ?? null;
}

export function KeyFiguresOverview({ statements }: { statements: NormalizedFinancialStatement[] }) {
  const { years, metrics } = React.useMemo(() => getOverviewMetricSeries(statements), [statements]);
  const currency = React.useMemo(() => getReportingCurrency(statements), [statements]);

  const rev = metricBy(metrics, "rev");
  const ebit = metricBy(metrics, "ebit");
  const net = metricBy(metrics, "net");
  const ebitM = metricBy(metrics, "ebitM");
  const eqPct = metricBy(metrics, "eqPct");
  const roe = metricBy(metrics, "roe");

  if (years.length === 0) return null;

  const cagr = (m: OverviewMetric | null): number | null => {
    if (!m) return null;
    const a = firstDefined(m.values);
    const b = lastDefined(m.values);
    if (!a || !b || a.index === b.index || a.value <= 0 || b.value <= 0) return null;
    const span = years[b.index] - years[a.index];
    if (span <= 0) return null;
    return (Math.pow(b.value / a.value, 1 / span) - 1) * 100;
  };

  const yoy = (m: OverviewMetric | null): { delta: string; dir: "up" | "down" } | null => {
    if (!m) return null;
    const last = lastDefined(m.values);
    if (!last || last.index === 0) return null;
    const prev = lastDefined(m.values.slice(0, last.index));
    if (!prev || prev.value === 0) return null;
    const g = (last.value / prev.value - 1) * 100;
    return {
      delta: `${g >= 0 ? "+" : "−"}${formatMetricPercent(Math.abs(g))} Y/Y`,
      dir: g >= 0 ? "up" : "down",
    };
  };

  const stripDefs: Array<{ label: string; m: OverviewMetric | null; pct?: boolean }> = [
    { label: "Omsetning", m: rev },
    { label: "Driftsresultat (EBIT)", m: ebit },
    { label: "Egenkapitalandel", m: eqPct, pct: true },
  ];
  const strip = stripDefs
    .map((d) => {
      const last = d.m ? lastDefined(d.m.values) : null;
      if (!d.m || !last) return null;
      const delta = d.pct ? null : yoy(d.m);
      return {
        label: d.label,
        value: d.pct ? formatMetricPercent(last.value) : (formatCompactNok(last.value, currency) ?? "Ikke tilgjengelig"),
        delta,
        values: d.m.values,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const span = (() => {
    const a = rev ? firstDefined(rev.values) : null;
    const b = rev ? lastDefined(rev.values) : null;
    return a && b ? years[b.index] - years[a.index] : null;
  })();
  const spanLabel = span && span > 0 ? `${span} år` : "perioden";

  const lastEbitM = ebitM ? lastDefined(ebitM.values)?.value ?? null : null;
  const avgEbitM = ebitM ? average(ebitM.values) : null;
  const lastRoe = roe ? lastDefined(roe.values)?.value ?? null : null;
  const revCagr = cagr(rev);
  const netCagr = cagr(net);

  const gridDefs: Array<{ label: string; value: number | null; signed?: boolean }> = [
    { label: `Omsetnings-CAGR (${spanLabel})`, value: revCagr, signed: true },
    { label: `Resultat-CAGR (${spanLabel})`, value: netCagr, signed: true },
    { label: "Driftsmargin (siste)", value: lastEbitM },
    { label: "Snitt driftsmargin", value: avgEbitM },
    { label: "Egenkapitalavkastning", value: lastRoe },
  ];
  const grid = gridDefs
    .filter((d) => d.value !== null && Number.isFinite(d.value))
    .map((d) => ({
      label: d.label,
      value:
        d.signed && (d.value as number) >= 0
          ? `+${formatMetricPercent(d.value)}`
          : formatMetricPercent(d.value),
    }));

  if (strip.length === 0 && grid.length === 0) return null;

  return (
    <section>
      <CardLabel icon="bar_chart">Nøkkeltall</CardLabel>

      {strip.length > 0 ? (
        <div className="mt-2.5 grid border-t border-[var(--px-border-subtle)] sm:grid-cols-3">
          {strip.map((m, i) => (
            <div
              key={m.label}
              className={cn(
                "px-0 py-3.5 sm:px-4 sm:py-3.5",
                i > 0 && "border-t border-[var(--px-border-subtle)] sm:border-l sm:border-t-0",
                i === 0 && "sm:pl-0",
              )}
            >
              <div className="data-label text-[10px] uppercase text-[var(--px-muted)]">{m.label}</div>
              <div className="mt-1.5 flex items-end justify-between gap-3">
                <div>
                  <div className="text-[1.35rem] font-semibold tabular-nums tracking-tight text-[var(--px-text)]">
                    {m.value}
                  </div>
                  {m.delta ? (
                    <div className={cn("mt-0.5 text-xs font-medium tabular-nums", m.delta.dir === "up" ? "text-[var(--px-success)]" : "text-[var(--px-error)]")}>
                      {m.delta.delta}
                    </div>
                  ) : null}
                </div>
                <Sparkline values={m.values} />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {grid.length > 0 ? (
        <div className="grid border-t border-[var(--px-border-subtle)] sm:grid-cols-2 lg:grid-cols-3">
          {grid.map((cell, i) => (
            <div
              key={cell.label}
              className={cn(
                "px-0 py-3 sm:px-4",
                "border-t border-[var(--px-border-subtle)]",
                i % 3 !== 0 && "lg:border-l",
                i % 2 !== 0 && "sm:border-l lg:border-l",
              )}
            >
              <div className="data-label text-[10px] uppercase text-[var(--px-muted)]">{cell.label}</div>
              <div className="mt-1.5 text-lg font-semibold tabular-nums tracking-tight text-[var(--px-text)]">
                {cell.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
