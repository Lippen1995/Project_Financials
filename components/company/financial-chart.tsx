"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { formatAxisNok, formatCompactNok, formatSignedPercent, OverviewChartPoint } from "@/lib/overview-chart";

const CHART_HEIGHT = 336;
const CHART_WIDTH_PER_YEAR = 78;
const CHART_PADDING = { top: 18, right: 72, bottom: 42, left: 72 };

function buildRevenueTicks(maxValue: number) {
  return [0, maxValue * 0.16, maxValue * 0.33, maxValue * 0.5, maxValue * 0.66, maxValue * 0.83, maxValue];
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
  if (absolute <= 5) {
    return 5;
  }
  if (absolute <= 10) {
    return 10;
  }
  if (absolute <= 15) {
    return 15;
  }
  if (absolute <= 25) {
    return 25;
  }
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
      <div className="rounded-[1.35rem] border border-dashed border-[#D8DFE6] bg-[#FAFBFC] p-6 text-sm text-[#667085]">
        Historiske regnskapslinjer er ikke tilgjengelige fra verifiserte Brreg-kilder ennå.
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
  const plotWidth = Math.max(points.length * CHART_WIDTH_PER_YEAR, 560);
  const svgWidth = CHART_PADDING.left + plotWidth + CHART_PADDING.right;
  const groupWidth = plotWidth / Math.max(points.length, 1);
  const barWidth = Math.min(26, groupWidth * 0.34);
  const revenueTicks = buildRevenueTicks(maxRevenue);
  const marginTicks = buildLinearTicks(minMargin, maxMargin, 7);
  const zeroY =
    CHART_PADDING.top + ((maxMargin - 0) / marginRange) * plotHeight;

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-[#D8DFE6] bg-white p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          <button
            type="button"
            onClick={() => setShowRevenue((current) => !current)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold tracking-[0.01em] transition",
              showRevenue ? "bg-[#113E49] text-white" : "text-[#475467] hover:bg-[#F4F6F8]",
            )}
          >
            <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", showRevenue ? "bg-white" : "bg-[#2D6F78]")} />
            Inntekt
          </button>
          <button
            type="button"
            onClick={() => setShowMargin((current) => !current)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold tracking-[0.01em] transition",
              showMargin ? "bg-[#7A4A23] text-white" : "text-[#475467] hover:bg-[#F4F6F8]",
            )}
          >
            <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", showMargin ? "bg-white" : "bg-[#A4642D]")} />
            EBIT-margin
          </button>
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#98A2B3]">
          {points[0].fiscalYear} - {points[points.length - 1].fiscalYear}
        </p>
      </div>

      <div className="rounded-[1.4rem] border border-[#E4EAF0] bg-[linear-gradient(180deg,#FFFFFF_0%,#FBFCFD_100%)] px-3 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
        <div className="relative overflow-x-auto">
          <div className="min-w-[620px]">
            {activePoint && activeIndex >= 0 ? (
              <div
                className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-[1rem] border border-[#E4EAF0] bg-white px-3 py-2 shadow-[0_16px_36px_rgba(15,23,42,0.12)]"
                style={{
                  left: `${CHART_PADDING.left + groupWidth * activeIndex + groupWidth / 2}px`,
                  top: 10,
                }}
              >
                <div className="border-b border-[#EEF2F6] pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#667085]">
                  {activePoint.fiscalYear}
                </div>
                <div className="mt-2 space-y-1.5 text-sm">
                  <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                    <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#2D6F78]" />
                    <span className="text-[#475467]">Inntekt</span>
                    <span className="text-right font-semibold tabular-nums text-[#101828]">
                      {formatCompactNok(activePoint.revenue)}
                    </span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={cn("h-2 w-2 rounded-full", (activePoint.operatingMargin ?? 0) < 0 ? "bg-[#8B3A2B]" : "bg-[#A4642D]")}
                    />
                    <span className="text-[#475467]">EBIT-margin</span>
                    <span
                      className={cn(
                        "text-right font-semibold tabular-nums",
                        (activePoint.operatingMargin ?? 0) < 0 ? "text-[#8B3A2B]" : "text-[#101828]",
                      )}
                    >
                      {formatSignedPercent(activePoint.operatingMargin)}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            <svg
              viewBox={`0 0 ${svgWidth} ${CHART_HEIGHT}`}
              className="h-[23.5rem] w-full"
              role="img"
              aria-label="Historisk utvikling i inntekt og EBIT-margin"
            >
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
                      stroke="#E9EEF4"
                      strokeDasharray="2 5"
                      strokeWidth={1}
                    />
                    <text
                      x={CHART_PADDING.left - 10}
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
                      x={svgWidth - CHART_PADDING.right + 10}
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
                    if (point.revenue === null) {
                      return null;
                    }
                    const x = CHART_PADDING.left + groupWidth * index + groupWidth / 2 - barWidth / 2;
                    const y = yRevenue(point.revenue);
                    return (
                      <rect
                        key={`revenue-${point.fiscalYear}`}
                        x={x}
                        y={y}
                        width={barWidth}
                        height={Math.max(CHART_HEIGHT - CHART_PADDING.bottom - y, 6)}
                        rx={7}
                        fill={activePoint?.fiscalYear === point.fiscalYear ? "#1E5964" : "#2D6F78"}
                        opacity={activePoint?.fiscalYear === point.fiscalYear ? 1 : 0.88}
                      />
                    );
                  })
                : null}

              {showMargin && marginPath ? (
                <path
                  d={marginPath}
                  fill="none"
                  stroke="#A4642D"
                  strokeWidth={2.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}

              {showMargin
                ? points.map((point, index) => {
                    if (point.operatingMargin === null) {
                      return null;
                    }
                    const cx = CHART_PADDING.left + groupWidth * index + groupWidth / 2;
                    const cy = yMargin(point.operatingMargin);
                    return (
                      <circle
                        key={`margin-${point.fiscalYear}`}
                        cx={cx}
                        cy={cy}
                        r={activePoint?.fiscalYear === point.fiscalYear ? 5 : 4}
                        fill={(point.operatingMargin ?? 0) < 0 ? "#8B3A2B" : "#A4642D"}
                        stroke="#FFFFFF"
                        strokeWidth={2}
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
    </div>
  );
}
