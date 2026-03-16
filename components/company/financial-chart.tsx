"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { formatAxisNok, formatCompactNok, OverviewChartPoint } from "@/lib/overview-chart";

const CHART_HEIGHT = 336;
const CHART_WIDTH_PER_YEAR = 78;
const CHART_PADDING = { top: 18, right: 18, bottom: 42, left: 72 };

function niceCeiling(value: number) {
  if (value <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;

  if (normalized <= 1.5) {
    return 1.5 * magnitude;
  }

  if (normalized <= 3) {
    return 3 * magnitude;
  }

  if (normalized <= 5) {
    return 5 * magnitude;
  }

  return 10 * magnitude;
}

function buildTicks(minValue: number, maxValue: number) {
  if (minValue >= 0) {
    return [0, maxValue * 0.25, maxValue * 0.5, maxValue * 0.75, maxValue];
  }

  return [minValue, minValue * 0.5, 0, maxValue * 0.5, maxValue];
}

function getDefaultYear(points: OverviewChartPoint[]) {
  return points.at(-1)?.fiscalYear ?? null;
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
  const fallbackYear = getDefaultYear(points);
  const resolvedActiveYear = activeYear ?? fallbackYear;
  const activeIndex = points.findIndex((point) => point.fiscalYear === resolvedActiveYear);
  const activePoint = activeIndex >= 0 ? points[activeIndex] : null;

  const maxRevenue = Math.max(...points.map((point) => point.revenue ?? 0), 0);
  const maxPositiveEbit = Math.max(...points.map((point) => Math.max(point.operatingProfit ?? 0, 0)), 0);
  const minNegativeEbit = Math.min(...points.map((point) => Math.min(point.operatingProfit ?? 0, 0)), 0);
  const maxDomain = niceCeiling(Math.max(maxRevenue, maxPositiveEbit, 1));
  const minDomain = minNegativeEbit < 0 ? -niceCeiling(Math.abs(minNegativeEbit)) : 0;
  const totalRange = maxDomain - minDomain || 1;
  const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const plotWidth = Math.max(points.length * CHART_WIDTH_PER_YEAR, 560);
  const svgWidth = CHART_PADDING.left + plotWidth + CHART_PADDING.right;
  const groupWidth = plotWidth / Math.max(points.length, 1);
  const barWidth = Math.min(26, groupWidth * 0.34);
  const ticks = buildTicks(minDomain, maxDomain);
  const zeroY = CHART_PADDING.top + ((maxDomain - 0) / totalRange) * plotHeight;

  if (points.length === 0) {
    return (
      <div className="rounded-[1.35rem] border border-dashed border-[#D8DFE6] bg-[#FAFBFC] p-6 text-sm text-[#667085]">
        Historiske regnskapslinjer er ikke tilgjengelige fra verifiserte Brreg-kilder ennå.
      </div>
    );
  }

  function yScale(value: number) {
    return CHART_PADDING.top + ((maxDomain - value) / totalRange) * plotHeight;
  }

  const ebitPath = points
    .filter((point) => point.operatingProfit !== null)
    .map((point, index) => {
      const originalIndex = points.findIndex((candidate) => candidate.fiscalYear === point.fiscalYear);
      const x = CHART_PADDING.left + groupWidth * originalIndex + groupWidth / 2 + barWidth * 0.72;
      const y = yScale(point.operatingProfit ?? 0);
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
            Omsetning
          </button>
          <button
            type="button"
            onClick={() => setShowEbit((current) => !current)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold tracking-[0.01em] transition",
              showEbit ? "bg-[#7A4A23] text-white" : "text-[#475467] hover:bg-[#F4F6F8]",
            )}
          >
            <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", showEbit ? "bg-white" : "bg-[#A4642D]")} />
            Driftsresultat (EBIT)
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
                    <span className="text-[#475467]">Omsetning</span>
                    <span className="text-right font-semibold tabular-nums text-[#101828]">
                      {formatCompactNok(activePoint.revenue)}
                    </span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={cn("h-2 w-2 rounded-full", (activePoint.operatingProfit ?? 0) < 0 ? "bg-[#8B3A2B]" : "bg-[#A4642D]")}
                    />
                    <span className="text-[#475467]">EBIT</span>
                    <span
                      className={cn(
                        "text-right font-semibold tabular-nums",
                        (activePoint.operatingProfit ?? 0) < 0 ? "text-[#8B3A2B]" : "text-[#101828]",
                      )}
                    >
                      {formatCompactNok(activePoint.operatingProfit)}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            <svg
              viewBox={`0 0 ${svgWidth} ${CHART_HEIGHT}`}
              className="h-[23.5rem] w-full"
              role="img"
              aria-label="Historisk utvikling i omsetning og driftsresultat"
            >
              <line
                x1={CHART_PADDING.left}
                x2={CHART_PADDING.left}
                y1={CHART_PADDING.top}
                y2={CHART_HEIGHT - CHART_PADDING.bottom}
                stroke="#D7DEE7"
                strokeWidth={1}
              />

              {ticks.map((tick) => {
                const y = yScale(tick);
                const isZero = Math.abs(tick) < 1;

                return (
                  <g key={tick}>
                    <line
                      x1={CHART_PADDING.left}
                      x2={svgWidth - CHART_PADDING.right}
                      y1={y}
                      y2={y}
                      stroke={isZero ? "#C6D1DE" : "#E9EEF4"}
                      strokeDasharray={isZero ? undefined : "2 5"}
                      strokeWidth={isZero ? 1.4 : 1}
                    />
                    <text
                      x={CHART_PADDING.left - 10}
                      y={y + 4}
                      textAnchor="end"
                      className={cn(
                        "fill-[#667085] text-[10px] font-medium tabular-nums",
                        isZero && "fill-[#475467] font-semibold",
                      )}
                    >
                      {formatAxisNok(tick)}
                    </text>
                  </g>
                );
              })}

              {showRevenue
                ? points.map((point, index) => {
                    if (point.revenue === null) {
                      return null;
                    }

                    const x = CHART_PADDING.left + groupWidth * index + groupWidth / 2 - barWidth;
                    const y = yScale(point.revenue);

                    return (
                      <rect
                        key={`revenue-${point.fiscalYear}`}
                        x={x}
                        y={y}
                        width={barWidth}
                        height={Math.max(zeroY - y, 6)}
                        rx={7}
                        fill={activePoint?.fiscalYear === point.fiscalYear ? "#1E5964" : "#2D6F78"}
                        opacity={activePoint?.fiscalYear === point.fiscalYear ? 1 : 0.88}
                      />
                    );
                  })
                : null}

              {showEbit && ebitPath ? (
                <path
                  d={ebitPath}
                  fill="none"
                  stroke="#A4642D"
                  strokeWidth={2.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}

              {showEbit
                ? points.map((point) => {
                    if (point.operatingProfit === null) {
                      return null;
                    }

                    const index = points.findIndex((candidate) => candidate.fiscalYear === point.fiscalYear);
                    const cx = CHART_PADDING.left + groupWidth * index + groupWidth / 2 + barWidth * 0.72;
                    const cy = yScale(point.operatingProfit);

                    return (
                      <circle
                        key={`ebit-${point.fiscalYear}`}
                        cx={cx}
                        cy={cy}
                        r={activePoint?.fiscalYear === point.fiscalYear ? 5 : 4}
                        fill={(point.operatingProfit ?? 0) < 0 ? "#8B3A2B" : "#A4642D"}
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
                      <>
                        <rect
                          x={groupX + groupWidth * 0.18}
                          y={CHART_PADDING.top}
                          width={groupWidth * 0.64}
                          height={plotHeight}
                          rx={12}
                          fill="#F8FAFC"
                        />
                        <line
                          x1={centerX}
                          x2={centerX}
                          y1={CHART_PADDING.top}
                          y2={CHART_HEIGHT - CHART_PADDING.bottom}
                          stroke="#D5DEE8"
                          strokeDasharray="3 5"
                          strokeWidth={1}
                        />
                      </>
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
