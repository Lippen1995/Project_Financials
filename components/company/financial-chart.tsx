"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  formatAxisNok,
  formatCompactNok,
  OverviewChartPoint,
} from "@/lib/overview-chart";

const CHART_HEIGHT = 320;
const CHART_WIDTH_PER_YEAR = 104;
const CHART_PADDING = { top: 24, right: 84, bottom: 44, left: 86 };
const MOBILE_CHART_WIDTH = 320;
const MOBILE_CHART_HEIGHT = 190;
const MOBILE_CHART_PADDING = { top: 18, right: 12, bottom: 34, left: 12 };

function buildTicks(minValue: number, maxValue: number, count: number) {
  if (minValue === maxValue) return [minValue];
  return Array.from({ length: count }, (_, index) => {
    const progress = index / (count - 1);
    return minValue + (maxValue - minValue) * progress;
  });
}

export function FinancialChart({
  points,
  activeYear,
  onActiveYearChange,
}: {
  points: OverviewChartPoint[];
  activeYear: number | null;
  onActiveYearChange: (year: number | null) => void;
}) {
  const [showRevenue, setShowRevenue] = React.useState(true);
  const [showEbit, setShowEbit] = React.useState(true);
  const resolvedActiveYear = activeYear ?? points.at(-1)?.fiscalYear ?? null;
  const activePoint =
    points.find((point) => point.fiscalYear === resolvedActiveYear) ?? points.at(-1) ?? null;

  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--px-border)] bg-[var(--px-subtle)] p-6 text-sm text-[var(--px-muted)]">
        Historiske regnskapslinjer er ikke tilgjengelige ennå.
      </div>
    );
  }

  const maxRevenue = Math.max(...points.map((point) => point.revenue ?? 0), 1);
  const ebitValues = points
    .map((point) => point.operatingProfit)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const maxEbit = Math.max(...ebitValues, 1);
  const minEbit = Math.min(...ebitValues, 0);
  const ebitRange = maxEbit - minEbit || 1;
  const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const plotWidth = Math.max(points.length * CHART_WIDTH_PER_YEAR, 620);
  const svgWidth = CHART_PADDING.left + plotWidth + CHART_PADDING.right;
  const groupWidth = plotWidth / points.length;
  const revenueTicks = buildTicks(0, maxRevenue, 5);
  const ebitTicks = buildTicks(minEbit, maxEbit, 5);

  function xFor(index: number) {
    return CHART_PADDING.left + groupWidth * index + groupWidth / 2;
  }

  function yRevenue(value: number) {
    return CHART_PADDING.top + ((maxRevenue - value) / maxRevenue) * plotHeight;
  }

  function yEbit(value: number) {
    return CHART_PADDING.top + ((maxEbit - value) / ebitRange) * plotHeight;
  }

  function buildPath(
    selector: (point: OverviewChartPoint) => number | null,
    scale: (value: number) => number,
  ) {
    return points
      .map((point, index) => {
        const value = selector(point);
        return value === null ? null : `${index === 0 ? "M" : "L"} ${xFor(index)} ${scale(value)}`;
      })
      .filter(Boolean)
      .join(" ");
  }

  const revenuePath = buildPath((point) => point.revenue, yRevenue);
  const ebitPath = buildPath((point) => point.operatingProfit, yEbit);
  const revenueAreaPath = revenuePath
    ? `${revenuePath} L ${xFor(points.length - 1)} ${CHART_HEIGHT - CHART_PADDING.bottom} L ${xFor(0)} ${CHART_HEIGHT - CHART_PADDING.bottom} Z`
    : "";
  const mobilePlotWidth =
    MOBILE_CHART_WIDTH - MOBILE_CHART_PADDING.left - MOBILE_CHART_PADDING.right;
  const mobilePlotHeight =
    MOBILE_CHART_HEIGHT - MOBILE_CHART_PADDING.top - MOBILE_CHART_PADDING.bottom;
  const mobileXFor = (index: number) =>
    MOBILE_CHART_PADDING.left +
    (points.length === 1 ? mobilePlotWidth / 2 : (index / (points.length - 1)) * mobilePlotWidth);
  const mobileRevenueY = (value: number) =>
    MOBILE_CHART_PADDING.top + ((maxRevenue - value) / maxRevenue) * mobilePlotHeight;
  const mobileEbitY = (value: number) =>
    MOBILE_CHART_PADDING.top + ((maxEbit - value) / ebitRange) * mobilePlotHeight;
  const buildMobilePath = (
    selector: (point: OverviewChartPoint) => number | null,
    scale: (value: number) => number,
  ) =>
    points
      .map((point, index) => {
        const value = selector(point);
        return value === null
          ? null
          : `${index === 0 ? "M" : "L"} ${mobileXFor(index)} ${scale(value)}`;
      })
      .filter(Boolean)
      .join(" ");
  const mobileRevenuePath = buildMobilePath((point) => point.revenue, mobileRevenueY);
  const mobileEbitPath = buildMobilePath((point) => point.operatingProfit, mobileEbitY);

  return (
    <section className="min-w-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex self-start rounded-full border border-[var(--px-border)] bg-[var(--px-subtle)] p-1">
          <SeriesToggle
            active={showRevenue}
            onClick={() => setShowRevenue((current) => !current)}
            label="Omsetning"
            activeClassName="bg-[var(--px-panel)] text-white"
          />
          <SeriesToggle
            active={showEbit}
            onClick={() => setShowEbit((current) => !current)}
            label="EBIT"
            activeClassName="bg-rose-700 text-white"
          />
        </div>

        <div className="flex gap-6 text-right">
          <ChartValue label="Aktivt år" value={activePoint?.fiscalYear ?? "–"} />
          <ChartValue label="Omsetning" value={formatCompactNok(activePoint?.revenue ?? null)} />
          <ChartValue
            label="EBIT"
            value={formatCompactNok(activePoint?.operatingProfit ?? null)}
            negative={(activePoint?.operatingProfit ?? 0) < 0}
          />
        </div>
      </div>

      <div className="mt-4 border-t border-[var(--px-border)] pt-4 sm:hidden">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="data-label text-[9px] font-semibold uppercase text-[var(--px-muted)]">
            Relativ utvikling
          </div>
          <div className="text-[10px] text-[var(--px-muted)]">Separate skalaer</div>
        </div>
        <svg
          viewBox={`0 0 ${MOBILE_CHART_WIDTH} ${MOBILE_CHART_HEIGHT}`}
          className="h-auto w-full"
          role="img"
          aria-label="Relativ utvikling i omsetning og EBIT for alle tilgjengelige år"
        >
          {Array.from({ length: 4 }, (_, index) => {
            const y =
              MOBILE_CHART_PADDING.top + (index / 3) * mobilePlotHeight;
            return (
              <line
                key={index}
                x1={MOBILE_CHART_PADDING.left}
                x2={MOBILE_CHART_WIDTH - MOBILE_CHART_PADDING.right}
                y1={y}
                y2={y}
                stroke="rgba(15,23,42,0.10)"
                strokeDasharray="2 6"
              />
            );
          })}

          {showRevenue && mobileRevenuePath ? (
            <path
              d={mobileRevenuePath}
              fill="none"
              stroke="var(--px-accent)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {showEbit && mobileEbitPath ? (
            <path
              d={mobileEbitPath}
              fill="none"
              stroke="rgb(190 18 60)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {points.map((point, index) => {
            const isActive = point.fiscalYear === activePoint?.fiscalYear;
            const x = mobileXFor(index);
            return (
              <g
                key={point.fiscalYear}
                className="cursor-pointer outline-none"
                role="button"
                tabIndex={0}
                aria-label={`Vis regnskapstall for ${point.fiscalYear}`}
                onClick={() => onActiveYearChange(point.fiscalYear)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onActiveYearChange(point.fiscalYear);
                  }
                }}
              >
                {isActive ? (
                  <line
                    x1={x}
                    x2={x}
                    y1={MOBILE_CHART_PADDING.top}
                    y2={MOBILE_CHART_HEIGHT - MOBILE_CHART_PADDING.bottom}
                    stroke="rgba(15,23,42,0.14)"
                    strokeDasharray="2 5"
                  />
                ) : null}
                <rect
                  x={x - Math.max(16, mobilePlotWidth / points.length / 2)}
                  y={MOBILE_CHART_PADDING.top}
                  width={Math.max(32, mobilePlotWidth / points.length)}
                  height={mobilePlotHeight}
                  fill="transparent"
                />
                {showRevenue && point.revenue !== null ? (
                  <circle
                    cx={x}
                    cy={mobileRevenueY(point.revenue)}
                    r={isActive ? 4.5 : 3.5}
                    fill="var(--px-accent)"
                    stroke="white"
                    strokeWidth={2}
                  />
                ) : null}
                {showEbit && point.operatingProfit !== null ? (
                  <circle
                    cx={x}
                    cy={mobileEbitY(point.operatingProfit)}
                    r={isActive ? 4.5 : 3.5}
                    fill="rgb(190 18 60)"
                    stroke="white"
                    strokeWidth={2}
                  />
                ) : null}
                <text
                  x={x}
                  y={MOBILE_CHART_HEIGHT - 10}
                  textAnchor="middle"
                  className={cn(
                    "fill-slate-500 text-[9px] font-semibold tabular-nums",
                    isActive && "fill-slate-950",
                  )}
                >
                  {point.fiscalYear}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-4 hidden overflow-x-auto border-t border-[var(--px-border)] sm:block">
        <div className="min-w-[720px]">
          <svg
            viewBox={`0 0 ${svgWidth} ${CHART_HEIGHT}`}
            className="h-[22rem] w-full"
            role="img"
            aria-label="Historisk utvikling i omsetning og EBIT"
          >
            <rect
              x={CHART_PADDING.left}
              y={CHART_PADDING.top}
              width={plotWidth}
              height={plotHeight}
              fill="rgba(248,249,250,0.62)"
            />

            {revenueTicks.map((tick) => {
              const y = yRevenue(tick);
              return (
                <g key={`revenue-${tick}`}>
                  <line
                    x1={CHART_PADDING.left}
                    x2={svgWidth - CHART_PADDING.right}
                    y1={y}
                    y2={y}
                    stroke="rgba(15,23,42,0.10)"
                    strokeDasharray="2 6"
                  />
                  <text
                    x={CHART_PADDING.left - 12}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-500 text-[10px] font-medium tabular-nums"
                  >
                    {formatAxisNok(tick)}
                  </text>
                </g>
              );
            })}

            {ebitTicks.map((tick) => (
              <text
                key={`ebit-${tick}`}
                x={svgWidth - CHART_PADDING.right + 12}
                y={yEbit(tick) + 4}
                className="fill-slate-500 text-[10px] font-medium tabular-nums"
              >
                {formatAxisNok(tick)}
              </text>
            ))}

            {showRevenue && revenueAreaPath ? (
              <path d={revenueAreaPath} fill="var(--px-accent-soft)" />
            ) : null}
            {showRevenue && revenuePath ? (
              <path
                d={revenuePath}
                fill="none"
                stroke="var(--px-accent)"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            {showRevenue
              ? points.map((point, index) =>
                  point.revenue === null ? null : (
                    <circle
                      key={`revenue-point-${point.fiscalYear}`}
                      cx={xFor(index)}
                      cy={yRevenue(point.revenue)}
                      r={4}
                      fill="var(--px-accent)"
                      stroke="white"
                      strokeWidth={2}
                    />
                  ),
                )
              : null}

            {showEbit && ebitPath ? (
              <path
                d={ebitPath}
                fill="none"
                stroke="rgb(190 18 60)"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            {showEbit
              ? points.map((point, index) =>
                  point.operatingProfit === null ? null : (
                    <circle
                      key={`ebit-point-${point.fiscalYear}`}
                      cx={xFor(index)}
                      cy={yEbit(point.operatingProfit)}
                      r={4}
                      fill="rgb(190 18 60)"
                      stroke="white"
                      strokeWidth={2}
                    />
                  ),
                )
              : null}

            {points.map((point, index) => {
              const isActive = point.fiscalYear === activePoint?.fiscalYear;
              return (
                <g key={point.fiscalYear}>
                  {isActive ? (
                    <line
                      x1={xFor(index)}
                      x2={xFor(index)}
                      y1={CHART_PADDING.top}
                      y2={CHART_HEIGHT - CHART_PADDING.bottom}
                      stroke="rgba(15,23,42,0.14)"
                      strokeDasharray="2 6"
                    />
                  ) : null}
                  <rect
                    x={CHART_PADDING.left + groupWidth * index}
                    y={CHART_PADDING.top}
                    width={groupWidth}
                    height={plotHeight}
                    fill="transparent"
                    onMouseEnter={() => onActiveYearChange(point.fiscalYear)}
                    onClick={() => onActiveYearChange(point.fiscalYear)}
                  />
                  <text
                    x={xFor(index)}
                    y={CHART_HEIGHT - 12}
                    textAnchor="middle"
                    className={cn(
                      "fill-slate-500 text-[11px] font-semibold tabular-nums",
                      isActive && "fill-slate-950",
                    )}
                  >
                    {point.fiscalYear}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div className="hidden overflow-x-auto border-t border-[var(--px-border)] sm:block">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="data-label text-[10px] uppercase text-[var(--px-muted)]">
            <tr>
              <th className="px-3 py-2 font-semibold">År</th>
              {points.map((point) => (
                <th key={point.fiscalYear} className="px-3 py-2 font-semibold tabular-nums">
                  {point.fiscalYear}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--px-border)]">
            <DataRow label="Omsetning" points={points} selector={(point) => point.revenue} />
            <DataRow
              label="EBIT"
              points={points}
              selector={(point) => point.operatingProfit}
              negative
            />
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SeriesToggle({
  active,
  onClick,
  label,
  activeClassName,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  activeClassName: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-2 text-xs font-semibold transition-colors",
        active ? activeClassName : "text-[var(--px-muted)] hover:bg-white",
      )}
    >
      {label}
    </button>
  );
}

function ChartValue({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: string | number;
  negative?: boolean;
}) {
  return (
    <div>
      <div className="data-label text-[10px] uppercase text-[var(--px-muted)]">{label}</div>
      <div
        className={cn(
          "mt-1 text-sm font-semibold tabular-nums text-[var(--px-text)]",
          negative && "text-rose-700",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function DataRow({
  label,
  points,
  selector,
  negative = false,
}: {
  label: string;
  points: OverviewChartPoint[];
  selector: (point: OverviewChartPoint) => number | null;
  negative?: boolean;
}) {
  return (
    <tr>
      <th className="px-3 py-2 font-semibold text-[var(--px-muted)]">{label}</th>
      {points.map((point) => {
        const value = selector(point);
        return (
          <td
            key={point.fiscalYear}
            className={cn(
              "px-3 py-2 font-medium tabular-nums text-[var(--px-text)]",
              negative && value !== null && value < 0 && "text-rose-700",
            )}
          >
            {formatCompactNok(value)}
          </td>
        );
      })}
    </tr>
  );
}
