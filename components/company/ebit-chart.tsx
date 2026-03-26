"use client";

import { cn } from "@/lib/utils";
import { formatAxisNok, formatCompactNok, OverviewChartPoint } from "@/lib/overview-chart";

const CHART_HEIGHT = 336;
const CHART_WIDTH_PER_YEAR = 78;
const CHART_PADDING = { top: 18, right: 18, bottom: 40, left: 72 };

function buildTicks(minValue: number, maxValue: number) {
  if (minValue === maxValue) {
    return [minValue];
  }

  return Array.from({ length: 7 }, (_, index) => {
    const progress = index / 6;
    return minValue + (maxValue - minValue) * progress;
  });
}

export function EbitChart({
  points,
  activeYear,
  onActiveYearChange,
}: {
  points: OverviewChartPoint[];
  activeYear: number | null;
  onActiveYearChange: (year: number | null) => void;
}) {
  const activePoint = points.find((point) => point.fiscalYear === activeYear) ?? points.at(-1) ?? null;
  const minValue = Math.min(...points.map((point) => point.operatingProfit ?? 0), 0);
  const maxValue = Math.max(...points.map((point) => point.operatingProfit ?? 0), 1);
  const upperBound = maxValue;
  const lowerBound = minValue < 0 ? minValue : 0;
  const range = upperBound - lowerBound || 1;
  const ticks = buildTicks(lowerBound, upperBound);
  const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const plotWidth = Math.max(points.length * CHART_WIDTH_PER_YEAR, 560);
  const svgWidth = CHART_PADDING.left + plotWidth + CHART_PADDING.right;
  const groupWidth = plotWidth / Math.max(points.length, 1);
  const barWidth = Math.min(22, groupWidth * 0.28);

  function yScale(value: number) {
    return CHART_PADDING.top + ((upperBound - value) / range) * plotHeight;
  }

  const zeroY = yScale(0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(15,23,42,0.08)] pb-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#E4EAF0] bg-[#F8FAFC] px-3 py-2 text-xs font-semibold text-[#475467]">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#8B6338]" />
          Driftsresultat (EBIT)
        </div>
        <p className="data-label text-[11px] font-semibold uppercase text-[#98A2B3]">
          Separat serie for absolutt driftsresultat
        </p>
      </div>

      <div className="border border-[#E4EAF0] bg-white px-3 py-3">
        <div className="relative overflow-x-auto">
          <div className="min-w-[620px]">
            {activePoint ? (
              <div className="pointer-events-none absolute right-4 top-3 border border-[#E4EAF0] bg-white px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#667085]">
                  {activePoint.fiscalYear}
                </div>
                <div
                  className={cn(
                    "mt-1 text-sm font-semibold tabular-nums",
                    (activePoint.operatingProfit ?? 0) < 0 ? "text-[#8B3A2B]" : "text-[#101828]",
                  )}
                >
                  {formatCompactNok(activePoint.operatingProfit)}
                </div>
              </div>
            ) : null}

            <svg viewBox={`0 0 ${svgWidth} ${CHART_HEIGHT}`} className="h-[23.5rem] w-full" aria-label="Historisk driftsresultat">
              <line x1={CHART_PADDING.left} x2={CHART_PADDING.left} y1={CHART_PADDING.top} y2={CHART_HEIGHT - CHART_PADDING.bottom} stroke="#D7DEE7" strokeWidth={1} />
              {ticks.map((tick) => {
                const y = yScale(tick);
                const isZero = Math.abs(tick) < 0.01;
                return (
                  <g key={tick}>
                    <line x1={CHART_PADDING.left} x2={svgWidth - CHART_PADDING.right} y1={y} y2={y} stroke={isZero ? "#C6D1DE" : "#E9EEF4"} strokeDasharray={isZero ? undefined : "2 5"} strokeWidth={isZero ? 1.4 : 1} />
                    <text x={CHART_PADDING.left - 10} y={y + 4} textAnchor="end" className={cn("fill-[#667085] text-[10px] font-medium tabular-nums", isZero && "fill-[#475467] font-semibold")}>
                      {formatAxisNok(tick)}
                    </text>
                  </g>
                );
              })}

              <line x1={CHART_PADDING.left} x2={svgWidth - CHART_PADDING.right} y1={zeroY} y2={zeroY} stroke="#BFCADA" strokeWidth={1.6} />

              {points.map((point, index) => {
                const value = point.operatingProfit ?? 0;
                const centerX = CHART_PADDING.left + groupWidth * index + groupWidth / 2;
                const y = yScale(value);
                const isActive = activePoint?.fiscalYear === point.fiscalYear;

                return (
                  <g key={point.fiscalYear}>
                    {isActive ? <line x1={centerX} x2={centerX} y1={CHART_PADDING.top} y2={CHART_HEIGHT - CHART_PADDING.bottom} stroke="#CBD5E1" strokeDasharray="2 6" strokeWidth={1} /> : null}
                    <rect x={centerX - barWidth / 2} y={value >= 0 ? y : zeroY} width={barWidth} height={Math.max(Math.abs(zeroY - y), 6)} rx={5} fill={value < 0 ? "#8B3A2B" : "#8B6338"} opacity={isActive ? 1 : 0.88} />
                    <rect x={CHART_PADDING.left + groupWidth * index} y={CHART_PADDING.top} width={groupWidth} height={plotHeight} fill="transparent" onMouseEnter={() => onActiveYearChange(point.fiscalYear)} onClick={() => onActiveYearChange(point.fiscalYear)} />
                    <text x={centerX} y={CHART_HEIGHT - 12} textAnchor="middle" className={cn("fill-[#667085] text-[11px] font-semibold tabular-nums", isActive && "fill-[#101828]")}>
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
