"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { formatAxisNok, formatCompactNok, OverviewChartPoint } from "@/lib/overview-chart";

const CHART_HEIGHT = 300;
const CHART_WIDTH_PER_YEAR = 84;
const CHART_PADDING = { top: 22, right: 22, bottom: 42, left: 84 };

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
}: {
  points: OverviewChartPoint[];
}) {
  const [activeYear, setActiveYear] = React.useState<number | null>(points.at(-1)?.fiscalYear ?? null);
  const activePoint = points.find((point) => point.fiscalYear === activeYear) ?? points.at(-1) ?? null;
  const minValue = Math.min(...points.map((point) => point.operatingProfit ?? 0), 0);
  const maxValue = Math.max(...points.map((point) => point.operatingProfit ?? 0), 1);
  const upperBound = maxValue;
  const lowerBound = minValue < 0 ? minValue : 0;
  const range = upperBound - lowerBound || 1;
  const ticks = buildTicks(lowerBound, upperBound);
  const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const plotWidth = Math.max(points.length * CHART_WIDTH_PER_YEAR, 600);
  const svgWidth = CHART_PADDING.left + plotWidth + CHART_PADDING.right;
  const groupWidth = plotWidth / Math.max(points.length, 1);
  const barWidth = Math.min(24, groupWidth * 0.3);

  function yScale(value: number) {
    return CHART_PADDING.top + ((upperBound - value) / range) * plotHeight;
  }

  const zeroY = yScale(0);

  return (
    <section className="grid gap-0 border border-[rgba(15,23,42,0.08)] bg-white">
      <div className="grid gap-5 border-b border-[rgba(15,23,42,0.08)] p-5 lg:grid-cols-[220px,minmax(0,1fr)]">
        <div>
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
            Sekundær serie
          </div>
          <h3 className="mt-3 text-[1.45rem] font-semibold text-slate-950">
            Driftsresultat (EBIT)
          </h3>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Viser absolutt driftsresultat separat for å gjøre nivåskifter og eventuelle negativeslag tydeligere.
          </p>
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
          <div className="border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] px-4 py-3 sm:col-span-2">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
              Driftsresultat
            </div>
            <div
              className={cn(
                "mt-2 text-lg font-semibold tabular-nums",
                (activePoint?.operatingProfit ?? 0) < 0 ? "text-[#8B3A2B]" : "text-slate-950",
              )}
            >
              {formatCompactNok(activePoint?.operatingProfit ?? null)}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#F7F9FB] px-4 py-4">
        <div className="relative overflow-x-auto border border-[rgba(15,23,42,0.08)] bg-white">
          <div className="min-w-[680px]">
            <svg
              viewBox={`0 0 ${svgWidth} ${CHART_HEIGHT}`}
              className="h-[21rem] w-full"
              aria-label="Historisk driftsresultat"
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

              {ticks.map((tick) => {
                const y = yScale(tick);
                const isZero = Math.abs(tick) < 0.01;
                return (
                  <g key={tick}>
                    <line
                      x1={CHART_PADDING.left}
                      x2={svgWidth - CHART_PADDING.right}
                      y1={y}
                      y2={y}
                      stroke={isZero ? "#C6D1DE" : "#E7EDF3"}
                      strokeDasharray={isZero ? undefined : "2 6"}
                      strokeWidth={isZero ? 1.4 : 1}
                    />
                    <text
                      x={CHART_PADDING.left - 12}
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

              <line
                x1={CHART_PADDING.left}
                x2={svgWidth - CHART_PADDING.right}
                y1={zeroY}
                y2={zeroY}
                stroke="#BFCADA"
                strokeWidth={1.6}
              />

              {points.map((point, index) => {
                const value = point.operatingProfit ?? 0;
                const centerX = CHART_PADDING.left + groupWidth * index + groupWidth / 2;
                const y = yScale(value);
                const isActive = activePoint?.fiscalYear === point.fiscalYear;

                return (
                  <g key={point.fiscalYear}>
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
                      x={centerX - barWidth / 2}
                      y={value >= 0 ? y : zeroY}
                      width={barWidth}
                      height={Math.max(Math.abs(zeroY - y), 6)}
                      rx={5}
                      fill={value < 0 ? "#8B3A2B" : isActive ? "#6D4D2A" : "#8B6338"}
                      opacity={isActive ? 1 : 0.9}
                    />
                    <rect
                      x={CHART_PADDING.left + groupWidth * index}
                      y={CHART_PADDING.top}
                      width={groupWidth}
                      height={plotHeight}
                      fill="transparent"
                      onMouseEnter={() => setActiveYear(point.fiscalYear)}
                      onClick={() => setActiveYear(point.fiscalYear)}
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
