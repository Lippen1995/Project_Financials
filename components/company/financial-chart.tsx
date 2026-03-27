"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  formatAxisNok,
  formatCompactNok,
  formatSignedPercent,
  OverviewChartPoint,
} from "@/lib/overview-chart";

const CHART_HEIGHT = 352;
const CHART_WIDTH_PER_YEAR = 84;
const CHART_PADDING = { top: 22, right: 78, bottom: 46, left: 84 };

function buildRevenueTicks(maxValue: number) {
  return [
    0,
    maxValue * 0.16,
    maxValue * 0.33,
    maxValue * 0.5,
    maxValue * 0.66,
    maxValue * 0.83,
    maxValue,
  ];
}

function buildLinearTicks(minValue: number, maxValue: number, count = 7) {
  if (count <= 1 || minValue === maxValue) {
    return [minValue];
  }

  return Array.from({ length: count }, (_, index) => {
    const progress = index / (count - 1);
    return minValue + (maxValue - minValue) * progress;
  });
}

function niceMarginBound(value: number) {
  const absolute = Math.max(Math.abs(value), 5);
  if (absolute <= 5) return 5;
  if (absolute <= 10) return 10;
  if (absolute <= 15) return 15;
  if (absolute <= 25) return 25;
  return Math.ceil(absolute / 10) * 10;
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
  const [showMargin, setShowMargin] = React.useState(true);
  const resolvedActiveYear = activeYear ?? points.at(-1)?.fiscalYear ?? null;
  const activeIndex = points.findIndex((point) => point.fiscalYear === resolvedActiveYear);
  const activePoint = activeIndex >= 0 ? points[activeIndex] : null;

  if (points.length === 0) {
    return (
      <div className="border border-dashed border-[#D8DFE6] bg-[#FAFBFC] p-6 text-sm text-[#667085]">
        Historiske regnskapslinjer er ikke tilgjengelige ennå.
      </div>
    );
  }

  const maxRevenue = Math.max(...points.map((point) => point.revenue ?? 0), 1);
  const marginValues = points
    .map((point) => point.operatingMargin)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const maxMargin = niceMarginBound(Math.max(...marginValues, 0));
  const minMargin = marginValues.some((value) => value < 0)
    ? -niceMarginBound(Math.abs(Math.min(...marginValues, 0)))
    : 0;
  const marginRange = maxMargin - minMargin || 1;
  const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const plotWidth = Math.max(points.length * CHART_WIDTH_PER_YEAR, 600);
  const svgWidth = CHART_PADDING.left + plotWidth + CHART_PADDING.right;
  const groupWidth = plotWidth / Math.max(points.length, 1);
  const barWidth = Math.min(28, groupWidth * 0.34);
  const revenueTicks = buildRevenueTicks(maxRevenue);
  const marginTicks = buildLinearTicks(minMargin, maxMargin, 7);

  function yRevenue(value: number) {
    return CHART_PADDING.top + ((maxRevenue - value) / maxRevenue) * plotHeight;
  }

  function yMargin(value: number) {
    return CHART_PADDING.top + ((maxMargin - value) / marginRange) * plotHeight;
  }

  const marginPath = points
    .filter((point) => point.operatingMargin !== null)
    .map((point, index) => {
      const originalIndex = points.findIndex((candidate) => candidate.fiscalYear === point.fiscalYear);
      const x = CHART_PADDING.left + groupWidth * originalIndex + groupWidth / 2;
      const y = yMargin(point.operatingMargin ?? 0);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <section className="grid gap-0 border border-[rgba(15,23,42,0.08)] bg-white">
      <div className="grid gap-5 border-b border-[rgba(15,23,42,0.08)] p-5 lg:grid-cols-[220px,minmax(0,1fr)]">
        <div>
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
            Hovedserie
          </div>
          <h3 className="mt-3 text-[1.5rem] font-semibold text-slate-950">
            Omsetning og margin
          </h3>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Kombinerer nivå og lønnsomhet i samme visning, slik at utviklingen kan leses raskt år for år.
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-3 border-b border-[rgba(15,23,42,0.08)] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex rounded-full border border-[#D8DFE6] bg-[#F4F6F8] p-1">
              <button
                type="button"
                onClick={() => setShowRevenue((current) => !current)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold tracking-[0.01em] transition",
                  showRevenue ? "bg-[#172535] text-white" : "text-[#475467] hover:bg-white",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn("h-2 w-2 rounded-full", showRevenue ? "bg-white" : "bg-[#31495F]")}
                />
                Omsetning
              </button>
              <button
                type="button"
                onClick={() => setShowMargin((current) => !current)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold tracking-[0.01em] transition",
                  showMargin ? "bg-[#6D4D2A] text-white" : "text-[#475467] hover:bg-white",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn("h-2 w-2 rounded-full", showMargin ? "bg-white" : "bg-[#9A6C34]")}
                />
                EBIT-margin
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="data-label font-semibold uppercase text-[#98A2B3]">
                Periode
              </span>
              <span className="font-semibold tabular-nums text-slate-700">
                {points[0].fiscalYear} - {points[points.length - 1].fiscalYear}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] px-4 py-3">
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                Aktivt år
              </div>
              <div className="mt-2 text-lg font-semibold tabular-nums text-slate-950">
                {activePoint?.fiscalYear ?? "—"}
              </div>
            </div>
            <div className="border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] px-4 py-3">
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                Omsetning
              </div>
              <div className="mt-2 text-lg font-semibold tabular-nums text-slate-950">
                {formatCompactNok(activePoint?.revenue ?? null)}
              </div>
            </div>
            <div className="border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] px-4 py-3">
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                Margin
              </div>
              <div className="mt-2 text-lg font-semibold tabular-nums text-slate-950">
                {formatSignedPercent(activePoint?.operatingMargin ?? null)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#F7F9FB] px-4 py-4">
        <div className="relative overflow-x-auto border border-[rgba(15,23,42,0.08)] bg-white">
          <div className="min-w-[680px]">
            <svg
              viewBox={`0 0 ${svgWidth} ${CHART_HEIGHT}`}
              className="h-[25rem] w-full"
              role="img"
              aria-label="Historisk utvikling i omsetning og EBIT-margin"
            >
              <rect
                x={CHART_PADDING.left}
                y={CHART_PADDING.top}
                width={plotWidth}
                height={plotHeight}
                fill="#FBFCFD"
              />

              <line
                x1={CHART_PADDING.left}
                x2={CHART_PADDING.left}
                y1={CHART_PADDING.top}
                y2={CHART_HEIGHT - CHART_PADDING.bottom}
                stroke="#D7DEE7"
                strokeWidth={1}
              />
              <line
                x1={svgWidth - CHART_PADDING.right}
                x2={svgWidth - CHART_PADDING.right}
                y1={CHART_PADDING.top}
                y2={CHART_HEIGHT - CHART_PADDING.bottom}
                stroke="#D7DEE7"
                strokeWidth={1}
              />

              {revenueTicks.map((tick) => {
                const y = yRevenue(tick);
                return (
                  <g key={`revenue-tick-${tick}`}>
                    <line
                      x1={CHART_PADDING.left}
                      x2={svgWidth - CHART_PADDING.right}
                      y1={y}
                      y2={y}
                      stroke="#E7EDF3"
                      strokeDasharray="2 6"
                      strokeWidth={1}
                    />
                    <text
                      x={CHART_PADDING.left - 12}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-[#667085] text-[10px] font-medium tabular-nums"
                    >
                      {formatAxisNok(tick)}
                    </text>
                  </g>
                );
              })}

              {marginTicks.map((tick) => {
                const y = yMargin(tick);
                const isZero = Math.abs(tick) < 0.01;
                return (
                  <g key={`margin-tick-${tick}`}>
                    {isZero ? (
                      <line
                        x1={CHART_PADDING.left}
                        x2={svgWidth - CHART_PADDING.right}
                        y1={y}
                        y2={y}
                        stroke="#C6D1DE"
                        strokeWidth={1.4}
                      />
                    ) : null}
                    <text
                      x={svgWidth - CHART_PADDING.right + 12}
                      y={y + 4}
                      textAnchor="start"
                      className={cn(
                        "fill-[#667085] text-[10px] font-medium tabular-nums",
                        isZero && "fill-[#475467] font-semibold",
                      )}
                    >
                      {formatSignedPercent(tick)}
                    </text>
                  </g>
                );
              })}

              {showRevenue
                ? points.map((point, index) => {
                    if (point.revenue === null) return null;
                    const x = CHART_PADDING.left + groupWidth * index + groupWidth / 2 - barWidth / 2;
                    const y = yRevenue(point.revenue);
                    return (
                      <rect
                        key={`revenue-${point.fiscalYear}`}
                        x={x}
                        y={y}
                        width={barWidth}
                        height={Math.max(CHART_HEIGHT - CHART_PADDING.bottom - y, 6)}
                        rx={6}
                        fill={activePoint?.fiscalYear === point.fiscalYear ? "#1F3448" : "#4C637A"}
                        opacity={activePoint?.fiscalYear === point.fiscalYear ? 1 : 0.92}
                      />
                    );
                  })
                : null}

              {showMargin && marginPath ? (
                <path
                  d={marginPath}
                  fill="none"
                  stroke="#8B6338"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}

              {showMargin
                ? points.map((point, index) => {
                    if (point.operatingMargin === null) return null;
                    const cx = CHART_PADDING.left + groupWidth * index + groupWidth / 2;
                    const cy = yMargin(point.operatingMargin);
                    return (
                      <circle
                        key={`margin-${point.fiscalYear}`}
                        cx={cx}
                        cy={cy}
                        r={activePoint?.fiscalYear === point.fiscalYear ? 5.5 : 4.5}
                        fill="#8B6338"
                        stroke="#FFFFFF"
                        strokeWidth={2.5}
                      />
                    );
                  })
                : null}

              {points.map((point, index) => {
                const groupX = CHART_PADDING.left + groupWidth * index;
                const centerX = groupX + groupWidth / 2;
                const isActive = activePoint?.fiscalYear === point.fiscalYear;
                return (
                  <g key={`group-${point.fiscalYear}`}>
                    {isActive ? (
                      <line
                        x1={centerX}
                        x2={centerX}
                        y1={CHART_PADDING.top}
                        y2={CHART_HEIGHT - CHART_PADDING.bottom}
                        stroke="#CBD5E1"
                        strokeDasharray="2 6"
                        strokeWidth={1}
                      />
                    ) : null}
                    <rect
                      x={groupX}
                      y={CHART_PADDING.top}
                      width={groupWidth}
                      height={plotHeight}
                      fill="transparent"
                      onMouseEnter={() => onActiveYearChange(point.fiscalYear)}
                      onClick={() => onActiveYearChange(point.fiscalYear)}
                    />
                    <text
                      x={centerX}
                      y={CHART_HEIGHT - 12}
                      textAnchor="middle"
                      className={cn(
                        "fill-[#667085] text-[11px] font-semibold tabular-nums",
                        isActive && "fill-[#101828]",
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
      </div>
    </section>
  );
}
