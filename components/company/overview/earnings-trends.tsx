"use client";

import * as React from "react";

import { formatAxisNok, formatCompactNok, getReportingCurrency } from "@/lib/overview-chart";
import {
  formatMetricPercent,
  getOverviewMetricSeries,
  OverviewMetric,
} from "@/lib/overview-metrics";
import { NormalizedFinancialStatement } from "@/lib/types";
import { cn } from "@/lib/utils";

const RANGES = [
  { label: "3 år", span: 3 },
  { label: "5 år", span: 5 },
  { label: "10 år", span: 10 },
  { label: "Alle", span: Number.POSITIVE_INFINITY },
];

const NDASH = "–";

function fmtCell(metric: Pick<OverviewMetric, "type">, value: number | null, currency?: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NDASH;
  return metric.type === "mar" ? formatMetricPercent(value) : (formatCompactNok(value, currency) ?? NDASH);
}

function niceMax(value: number) {
  if (value <= 0) return 0;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  return Math.ceil(value / magnitude) * magnitude;
}

function niceMin(value: number) {
  if (value >= 0) return 0;
  const magnitude = Math.pow(10, Math.floor(Math.log10(-value)));
  return Math.floor(value / magnitude) * magnitude;
}

/* ── dual-axis chart: bars (abs) + line (ratio), null-safe ──────────────── */
function EarningsChart({
  years,
  barLabel,
  lineLabel,
  barType,
  lineType,
  barVals,
  lineVals,
  selected,
  onSelect,
  currency,
}: {
  years: number[];
  barLabel: string;
  lineLabel: string;
  barType: OverviewMetric["type"];
  lineType: OverviewMetric["type"];
  barVals: (number | null)[];
  lineVals: (number | null)[];
  selected: number;
  onSelect: (windowIndex: number) => void;
  currency: string;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const W = 960;
  const H = 320;
  const padL = 70;
  const padR = 62;
  const padT = 14;
  const padB = 36;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = years.length;

  const barNums = barVals.filter((v): v is number => v !== null);
  const lineNums = lineVals.filter((v): v is number => v !== null);

  const barMax = niceMax(Math.max(0, ...barNums) * 1.08) || 1;
  const barMin = niceMin(Math.min(0, ...barNums));
  const barRange = barMax - barMin || 1;
  const lineMax = Math.max(0, ...lineNums) * 1.15 || 1;
  const lineMin = Math.min(0, ...lineNums);
  const lineRange = lineMax - lineMin || 1;

  const band = plotW / n;
  const barW = Math.min(band * 0.42, 46);
  const yBar = (v: number) => padT + plotH - ((v - barMin) / barRange) * plotH;
  const yLine = (v: number) => padT + plotH - ((v - lineMin) / lineRange) * plotH;
  const baseline = yBar(0);
  const cx = (i: number) => padL + band * i + band / 2;

  const ticks = 4;
  const fmtLeftAxis = (v: number) => formatAxisNok(v, currency);
  const fmtRightAxis = (v: number) =>
    `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: v % 1 === 0 ? 0 : 1 }).format(v)} %`;
  const barTicks = Array.from({ length: ticks + 1 }, (_, i) => barMin + (barRange / ticks) * i);
  const lineTicks = Array.from({ length: ticks + 1 }, (_, i) => lineMin + (lineRange / ticks) * i);

  // Line path that breaks across missing years rather than bridging them.
  const segments: string[] = [];
  let current: string[] = [];
  lineVals.forEach((v, i) => {
    if (v === null) {
      if (current.length) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${current.length === 0 ? "M" : "L"}${cx(i)},${yLine(v)}`);
  });
  if (current.length) segments.push(current.join(" "));

  const active = hover ?? selected;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block overflow-visible" role="img"
        aria-label={`${barLabel} og ${lineLabel} per regnskapsår`}>
        {/* selected-year highlight band */}
        <rect x={padL + band * selected} y={padT} width={band} height={plotH} fill="var(--px-accent-soft)" />

        {/* grid + dual axes */}
        {barTicks.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={yBar(v)} y2={yBar(v)} stroke="var(--px-chart-grid)" strokeWidth={1} />
            <text x={padL - 10} y={yBar(v) + 4} textAnchor="end" className="fill-[var(--px-muted)]"
              style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
              {fmtLeftAxis(v)}
            </text>
            <text x={W - padR + 10} y={yLine(lineTicks[i]) + 4} textAnchor="start"
              style={{ fontFamily: "var(--font-mono)", fontSize: 12, fill: "var(--px-chart-2)" }}>
              {fmtRightAxis(lineTicks[i])}
            </text>
          </g>
        ))}

        {/* bars */}
        {barVals.map((v, i) => {
          if (v === null) return null;
          const yTop = Math.min(yBar(v), baseline);
          const h = Math.abs(baseline - yBar(v));
          return (
            <rect key={i} x={cx(i) - barW / 2} y={yTop} width={barW} height={Math.max(h, 0.5)} rx={2}
              fill="var(--px-chart-1)" opacity={i === selected ? 1 : i === hover ? 0.95 : 0.72} />
          );
        })}

        {/* line + dots */}
        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="var(--px-chart-2)" strokeWidth={2.5}
            strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {lineVals.map((v, i) =>
          v === null ? null : (
            <circle key={i} cx={cx(i)} cy={yLine(v)} r={i === active ? 5.5 : 4.5} fill="#fff"
              stroke="var(--px-chart-2)" strokeWidth={2.5} />
          ),
        )}

        {/* year labels + hit areas */}
        {years.map((y, i) => (
          <g key={y}>
            <text x={cx(i)} y={H - 14} textAnchor="middle"
              style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: i === selected ? 700 : 400,
                fill: i === selected ? "var(--px-accent)" : "var(--px-text)" }}>
              {y}
            </text>
            <rect x={padL + band * i} y={0} width={band} height={H} fill="transparent" className="cursor-pointer"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => onSelect(i)} />
          </g>
        ))}
      </svg>

      {hover !== null ? (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 translate-y-3 rounded-lg bg-[var(--px-panel)] p-3 text-white shadow-[var(--shadow-md)]"
          style={{ left: `${Math.min(85, Math.max(15, (cx(hover) / W) * 100))}%`, top: `${(padT / H) * 100}%`, minWidth: 168 }}>
          <div className="data-label mb-2 text-[10px] uppercase text-white/60">Regnskapsår {years[hover]}</div>
          {[
            { label: barLabel, value: fmtCell({ type: barType }, barVals[hover], currency) },
            { label: lineLabel, value: fmtCell({ type: lineType }, lineVals[hover], currency) },
          ].map((row) => (
            <div key={row.label} className="flex justify-between gap-4 py-0.5">
              <span className="text-xs text-white/80">{row.label}</span>
              <span className="text-xs font-semibold tabular-nums">{row.value}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ── interactive metric matrix — click a row to plot it ─────────────────── */
function MetricsTable({
  metrics,
  idxs,
  years,
  barKey,
  lineKey,
  selYear,
  onPick,
  currency,
}: {
  metrics: OverviewMetric[];
  idxs: number[];
  years: number[];
  barKey: string;
  lineKey: string;
  selYear: number;
  onPick: (metric: OverviewMetric) => void;
  currency: string;
}) {
  return (
    <table className="w-full border-collapse bg-white">
      <thead>
        <tr className="border-b border-[var(--px-border)]">
          <th className="px-4 py-2.5 text-left">
            <span className="data-label text-[10px] uppercase text-[var(--px-muted)]">Post</span>
          </th>
          {years.map((y) => (
            <th key={y} className="data-label px-4 py-2.5 text-right text-[11px] tabular-nums text-[var(--px-muted)]">
              {y}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {metrics.map((m, ri) => {
          const active = m.key === barKey || m.key === lineKey;
          const isAbs = m.type === "abs";
          const swatch = isAbs ? "var(--px-chart-1)" : "var(--px-chart-2)";
          const newGroup = ri === 0 || metrics[ri - 1].group !== m.group;
          return (
            <React.Fragment key={m.key}>
              {newGroup ? (
                <tr className="border-b border-[var(--px-border)] bg-[var(--px-subtle)]">
                  <td colSpan={1 + idxs.length} className="px-4 py-1.5">
                    <span className="data-label text-[9.5px] uppercase text-[var(--px-muted)]">{m.group}</span>
                  </td>
                </tr>
              ) : null}
              <tr
                onClick={() => onPick(m)}
                className={cn(
                  "cursor-pointer border-b border-[rgba(15,23,42,0.06)] transition-colors",
                  active ? "bg-[var(--px-accent-soft)]" : "hover:bg-[rgba(248,249,250,0.62)]",
                )}
              >
                <td className="px-4 py-2.5">
                  <span className={cn("inline-flex items-center gap-2.5", !isAbs && "pl-3")}>
                    <span
                      className="shrink-0 rounded-sm"
                      style={{
                        width: isAbs ? 11 : 14,
                        height: isAbs ? 11 : 3,
                        background: active ? swatch : "var(--px-border)",
                      }}
                    />
                    <span
                      className={cn(
                        "text-[13.5px]",
                        active ? "font-semibold text-[var(--px-text)]" : isAbs ? "font-medium text-[var(--px-text)]" : "text-[var(--px-muted)]",
                      )}
                    >
                      {m.label}
                    </span>
                    {active ? (
                      <span className="data-label text-[9px] uppercase text-[var(--px-accent)]">
                        {isAbs ? "Søyler" : "Linje"}
                      </span>
                    ) : null}
                  </span>
                </td>
                {idxs.map((i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-4 py-2.5 text-right text-[13px] tabular-nums text-[var(--px-text)]",
                      i === selYear && "bg-[var(--px-accent-soft)] font-semibold",
                    )}
                  >
                    {fmtCell(m, m.values[i], currency)}
                  </td>
                ))}
              </tr>
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function ctrlClass(disabled: boolean) {
  return cn(
    "inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[var(--px-border)] bg-white p-0 text-[var(--px-text)]",
    disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:border-[var(--px-accent)]",
  );
}

export function EarningsTrends({ statements }: { statements: NormalizedFinancialStatement[] }) {
  const { years, metrics } = React.useMemo(() => getOverviewMetricSeries(statements), [statements]);
  const currency = React.useMemo(() => getReportingCurrency(statements), [statements]);
  const N = years.length;

  const absMetrics = metrics.filter((m) => m.type === "abs");
  const marMetrics = metrics.filter((m) => m.type === "mar");

  const [barKey, setBarKey] = React.useState(() => absMetrics[0]?.key ?? "");
  const [lineKey, setLineKey] = React.useState(
    () => marMetrics.find((m) => m.key === "ebitM")?.key ?? marMetrics[0]?.key ?? "",
  );
  const [span, setSpan] = React.useState(() => Math.min(5, N || 1));
  const [start, setStart] = React.useState(() => Math.max(0, N - Math.min(5, N || 1)));
  const [year, setYear] = React.useState(() => Math.max(0, N - 1));
  const [open, setOpen] = React.useState(false);

  if (N === 0 || metrics.length === 0) {
    return (
      <section>
        <CardLabel icon="trending_up">Resultattrender</CardLabel>
        <div className="mt-3 rounded-xl border border-dashed border-[var(--px-border)] bg-[var(--px-subtle)] p-6 text-sm leading-6 text-[var(--px-muted)]">
          Historiske regnskapstall er ikke tilgjengelige for denne virksomheten ennå.
        </div>
      </section>
    );
  }

  const barM = metrics.find((m) => m.key === barKey && m.type === "abs") ?? absMetrics[0] ?? metrics[0];
  const lineM = metrics.find((m) => m.key === lineKey && m.type === "mar") ?? marMetrics[0] ?? null;

  const winLen = Math.min(span, N);
  const maxStart = Math.max(0, N - winLen);
  const vStart = Math.min(start, maxStart);
  const idxs = Array.from({ length: winLen }, (_, k) => vStart + k);
  const vYears = idxs.map((i) => years[i]);
  const selYear = Math.min(Math.max(year, vStart), vStart + winLen - 1);
  const selInWin = selYear - vStart;
  const wholeRange = winLen >= N;

  const setRange = (s: number) => {
    const w = Math.min(s, N);
    setSpan(s);
    setStart(Math.max(0, N - w));
  };
  const stepOlder = () => setStart((s) => Math.max(0, Math.min(s, maxStart) - 1));
  const stepNewer = () => setStart((s) => Math.min(maxStart, Math.min(s, maxStart) + 1));

  // Single-year readout — only the figures we actually have.
  const readoutDefs = ["rev", "ebit", "ebitM", "net", "netM", "equity", "assets", "eqPct", "roe"];
  const readoutRows = readoutDefs
    .map((key) => metrics.find((m) => m.key === key))
    .filter((m): m is OverviewMetric => Boolean(m))
    .map((m) => ({
      label: m.label,
      value: fmtCell(m, m.values[selYear], currency),
      sub: m.type !== "abs",
    }));

  return (
    <section>
      <div className="flex flex-wrap items-end gap-5">
        <div>
          <CardLabel icon="trending_up">Resultattrender</CardLabel>
          <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-[var(--px-text)]">
            {barM.label}
            {lineM ? <span className="font-normal text-[var(--px-muted)]"> · {lineM.label}</span> : null}
          </h2>
        </div>

        <div className="flex items-center gap-3 pb-px">
          <div className="flex overflow-hidden rounded-full border border-[var(--px-border)]">
            {RANGES.map((r) => {
              const on = winLen === Math.min(r.span, N);
              return (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => setRange(r.span)}
                  className={cn(
                    "data-label cursor-pointer border-0 px-3.5 py-1.5 text-[11px] font-semibold uppercase transition-colors",
                    on ? "bg-[var(--px-accent)] text-white" : "bg-transparent text-[var(--px-muted)] hover:text-[var(--px-text)]",
                  )}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-1.5">
            <button type="button" aria-label="Eldre år" title="Eldre år" disabled={wholeRange || vStart <= 0}
              onClick={stepOlder} className={ctrlClass(wholeRange || vStart <= 0)}>
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            <button type="button" aria-label="Nyere år" title="Nyere år" disabled={wholeRange || vStart >= maxStart}
              onClick={stepNewer} className={ctrlClass(wholeRange || vStart >= maxStart)}>
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex justify-end gap-4 pr-[6%]">
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--px-muted)]">
              <span className="h-2.5 w-2.5 rounded-sm bg-[var(--px-chart-1)]" />
              {barM.label}
            </span>
            {lineM ? (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--px-muted)]">
                <span className="h-[3px] w-3.5 rounded-sm bg-[var(--px-chart-2)]" />
                {lineM.label} (%)
              </span>
            ) : null}
          </div>
          <EarningsChart
            years={vYears}
            barLabel={barM.label}
            lineLabel={lineM?.label ?? ""}
            barType={barM.type}
            lineType={lineM?.type ?? "mar"}
            barVals={idxs.map((i) => barM.values[i])}
            lineVals={lineM ? idxs.map((i) => lineM.values[i]) : idxs.map(() => null)}
            selected={selInWin}
            onSelect={(k) => setYear(vStart + k)}
            currency={currency}
          />
        </div>

        <aside className="hidden w-[248px] shrink-0 self-start overflow-hidden rounded-xl border border-[var(--px-border-subtle)] bg-[var(--px-surface-strong)] lg:block">
          <div className="flex items-center justify-between border-b border-[var(--px-border-subtle)] px-3.5 py-2.5">
            <span className="data-label text-[10px] uppercase text-[var(--px-muted)]">Regnskapsår</span>
            <span className="editorial-display text-lg tabular-nums text-[var(--px-text)]">{years[selYear]}</span>
          </div>
          <div className="px-3.5 pb-2 pt-0.5">
            {readoutRows.map((r, i) => (
              <div
                key={r.label}
                className={cn(
                  "flex items-baseline justify-between gap-3",
                  r.sub ? "py-0.5 pl-3" : "py-1.5",
                  !r.sub && i !== 0 && "border-t border-[var(--px-border-subtle)]",
                )}
              >
                <span className={cn(r.sub ? "text-xs text-[var(--px-muted)]" : "text-[13px] font-medium text-[var(--px-text)]")}>
                  {r.label}
                </span>
                <span className={cn("font-semibold tabular-nums", r.sub ? "text-[12.5px] text-[var(--px-muted)]" : "text-sm text-[var(--px-text)]")}>
                  {r.value}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1.5 border-t border-[var(--px-border-subtle)] bg-[var(--px-subtle)] px-3.5 py-2 text-[11px] text-[var(--px-muted)]">
            <span className="material-symbols-outlined text-[14px]">ads_click</span>
            Klikk i grafen for å bytte år
          </div>
        </aside>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="data-label mt-3.5 inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[11px] font-semibold uppercase text-[var(--px-accent)]"
      >
        {open ? "Skjul tabell" : `Vis tabell (${winLen} år)`}
        <span className="material-symbols-outlined text-[18px] transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }}>
          expand_more
        </span>
      </button>

      {open ? (
        <div className="mt-2">
          <div className="data-label mb-1.5 text-[10px] uppercase text-[var(--px-muted)]">
            Beløp i {currency} · marginer og avkastning i %
          </div>
          <div className="overflow-x-auto rounded-md border border-[var(--px-border-subtle)]">
            <MetricsTable
              metrics={metrics}
              idxs={idxs}
              years={vYears}
              barKey={barM.key}
              lineKey={lineM?.key ?? ""}
              selYear={selYear}
              onPick={(m) => (m.type === "abs" ? setBarKey(m.key) : setLineKey(m.key))}
              currency={currency}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* shared small overline used across the overview sections */
export function CardLabel({ children, icon }: { children: React.ReactNode; icon?: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon ? (
        <span className="material-symbols-outlined text-[17px] text-[var(--px-muted)]" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="data-label text-[11px] uppercase text-[var(--px-muted)]">{children}</span>
    </div>
  );
}
