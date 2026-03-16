"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import {
  formatCompactNok,
  getOverviewChartPoints,
} from "@/lib/overview-chart";
import { NormalizedFinancialStatement } from "@/lib/types";

const CHART_HEIGHT = 280;
const CHART_WIDTH_PER_YEAR = 76;
const CHART_PADDING = { top: 22, right: 18, bottom: 34, left: 10 };

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
    return [0, maxValue * 0.33, maxValue * 0.66, maxValue];
  }

  return [minValue, minValue * 0.5, 0, maxValue * 0.5, maxValue];
}

export function FinancialChart({
  statements,
}: {
  statements: NormalizedFinancialStatement[];
}) {
  const points = useMemo(() => getOverviewChartPoints(statements), [statements]);
  const [showRevenue, setShowRevenue] = useState(true);
  const [showEbit, setShowEbit] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number | null>(points.length > 0 ? points.length - 1 : null);

  const activePoint = activeIndex !== null ? points[activeIndex] ?? null : null;
  const maxRevenue = Math.max(...points.map((point) => point.revenue ?? 0), 0);
  const maxPositiveEbit = Math.max(...points.map((point) => Math.max(point.operatingProfit ?? 0, 0)), 0);
  const minNegativeEbit = Math.min(...points.map((point) => Math.min(point.operatingProfit ?? 0, 0)), 0);
  const maxDomain = niceCeiling(Math.max(maxRevenue, maxPositiveEbit, 1));
  const minDomain = minNegativeEbit < 0 ? -niceCeiling(Math.abs(minNegativeEbit)) : 0;
  const totalRange = maxDomain - minDomain || 1;
  const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const plotWidth = Math.max(points.length * CHART_WIDTH_PER_YEAR, 520);
  const svgWidth = CHART_PADDING.left + plotWidth + CHART_PADDING.right;
  const zeroY = CHART_PADDING.top + ((maxDomain - 0) / totalRange) * plotHeight;
  const groupWidth = plotWidth / Math.max(points.length, 1);
  const resolvedActiveIndex = activeIndex ?? Math.max(points.length - 1, 0);
  const barWidth = Math.min(24, groupWidth * 0.34);
  const ticks = buildTicks(minDomain, maxDomain);

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
    .map((point, index, filtered) => {
      const originalIndex = points.findIndex((candidate) => candidate.fiscalYear === point.fiscalYear);
      const x = CHART_PADDING.left + groupWidth * originalIndex + groupWidth / 2 + barWidth * 0.7;
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
              showRevenue ? "bg-[#103E4A] text-white" : "text-[#4B5563] hover:bg-[#F4F6F8]",
            )}
          >
            <span
              aria-hidden="true"
              className={cn("h-2 w-2 rounded-full", showRevenue ? "bg-white" : "bg-[#2D6F78]")}
            />
            Omsetning
          </button>
          <button
            type="button"
            onClick={() => setShowEbit((current) => !current)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold tracking-[0.01em] transition",
              showEbit ? "bg-[#7A4A23] text-white" : "text-[#4B5563] hover:bg-[#F4F6F8]",
            )}
          >
            <span
              aria-hidden="true"
              className={cn("h-2 w-2 rounded-full", showEbit ? "bg-white" : "bg-[#A4642D]")}
            />
            Driftsresultat (EBIT)
          </button>
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A94A6]">
          {points[0].fiscalYear} - {points[points.length - 1].fiscalYear}
        </p>
      </div>

      <div className="rounded-[1.5rem] border border-[#E8EDF2] bg-[linear-gradient(180deg,#FFFFFF_0%,#FBFCFD_100%)] px-3 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
        <div className="relative overflow-x-auto">
          <div className="min-w-[540px]">
            {activePoint ? (
              <div
                className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-2xl border border-[#E4E9EF] bg-white/95 px-3 py-2 shadow-[0_18px_40px_rgba(15,23,42,0.12)] backdrop-blur"
                style={{
                  left: `${CHART_PADDING.left + groupWidth * resolvedActiveIndex + groupWidth / 2}px`,
                  top: 8,
                }}
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A94A6]">
                  {activePoint.fiscalYear}
                </div>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[#667085]">Omsetning</span>
                    <span className="font-semibold tabular-nums text-[#101828]">
                      {formatCompactNok(activePoint.revenue)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[#667085]">EBIT</span>
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
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
              className="h-[21rem] w-full"
              role="img"
              aria-label="Historisk utvikling i omsetning og driftsresultat"
            >
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
                      stroke={isZero ? "#C9D3DF" : "#EEF2F6"}
                      strokeDasharray={isZero ? undefined : "3 5"}
                      strokeWidth={isZero ? 1.25 : 1}
                    />
                    <text
                      x={svgWidth - CHART_PADDING.right}
                      y={y - 6}
                      textAnchor="end"
                      className="fill-[#98A2B3] text-[10px] font-medium tabular-nums"
                    >
                      {formatCompactNok(tick)}
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
                        height={Math.max(zeroY - y, 4)}
                        rx={8}
                        fill={activeIndex === index ? "#184E59" : "#2D6F78"}
                        opacity={activeIndex === null || activeIndex === index ? 0.96 : 0.72}
                      />
                    );
                  })
                : null}

              {showEbit && ebitPath ? (
                <path
                  d={ebitPath}
                  fill="none"
                  stroke="#A4642D"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.95}
                />
              ) : null}

              {showEbit
                ? points.map((point, index) => {
                    if (point.operatingProfit === null) {
                      return null;
                    }

                    const cx = CHART_PADDING.left + groupWidth * index + groupWidth / 2 + barWidth * 0.7;
                    const cy = yScale(point.operatingProfit);

                    return (
                      <g key={`ebit-${point.fiscalYear}`}>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={activeIndex === index ? 5 : 4}
                          fill={(point.operatingProfit ?? 0) < 0 ? "#8B3A2B" : "#A4642D"}
                          stroke="#FFFDF8"
                          strokeWidth={2}
                        />
                      </g>
                    );
                  })
                : null}

              {points.map((point, index) => {
                const groupX = CHART_PADDING.left + groupWidth * index;

                return (
                  <g key={`hover-${point.fiscalYear}`}>
                    <rect
                      x={groupX + 4}
                      y={CHART_PADDING.top}
                      width={groupWidth - 8}
                      height={plotHeight}
                      rx={12}
                      fill={activeIndex === index ? "#F5F8FA" : "transparent"}
                    />
                    <rect
                      x={groupX}
                      y={CHART_PADDING.top}
                      width={groupWidth}
                      height={plotHeight}
                      fill="transparent"
                      onMouseEnter={() => setActiveIndex(index)}
                      onFocus={() => setActiveIndex(index)}
                    />
                    <text
                      x={groupX + groupWidth / 2}
                      y={CHART_HEIGHT - 10}
                      textAnchor="middle"
                      className="fill-[#667085] text-[11px] font-semibold tabular-nums"
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

      <div className="flex gap-3 overflow-x-auto pb-1">
        {points.map((point) => (
          <div
            key={point.fiscalYear}
            className="min-w-[168px] rounded-[1.1rem] border border-[#E7ECF1] bg-white px-4 py-3 shadow-[0_4px_12px_rgba(15,23,42,0.03)]"
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A94A6]">
              {point.fiscalYear}
            </div>
            <div className="mt-2 space-y-1.5 text-sm tabular-nums">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#667085]">Omsetning</span>
                <span className="font-medium text-[#101828]">{formatCompactNok(point.revenue)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#667085]">EBIT</span>
                <span
                  className={cn(
                    "font-medium",
                    (point.operatingProfit ?? 0) < 0 ? "text-[#8B3A2B]" : "text-[#101828]",
                  )}
                >
                  {formatCompactNok(point.operatingProfit)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
