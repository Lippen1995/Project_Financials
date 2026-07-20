"use client";

import React, { useState } from "react";

import type { NjordVisualization } from "@/lib/njord-visualization";

const revenueFormatter = new Intl.NumberFormat("nb-NO", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const percentFormatter = new Intl.NumberFormat("nb-NO", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const WIDTH = 620;
const HEIGHT = 360;
const PADDING = { top: 24, right: 24, bottom: 58, left: 72 };
const TICKS = 4;

function formatAxisValue(value: number, unit: "NOK" | "percent") {
  return unit === "percent"
    ? `${percentFormatter.format(value)} %`
    : revenueFormatter.format(value);
}

function axisBounds(values: number[]) {
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(0, ...values);
  const range = Math.max(rawMax - rawMin, 1);
  return { min: rawMin - range * 0.08, max: rawMax + range * 0.08 };
}

function Scatterplot({ visualization }: { visualization: NjordVisualization }) {
  const { points } = visualization;
  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--px-border)] bg-[var(--px-subtle)] p-5 text-sm text-[var(--px-muted)]">
        Ingen operatørselskaper har tilstrekkelige, sammenlignbare regnskapstall for de valgte aksene.
      </div>
    );
  }

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const xBounds = axisBounds(points.map((point) => point.x));
  const yBounds = axisBounds(points.map((point) => point.y));

  const x = (value: number) =>
    PADDING.left + ((value - xBounds.min) / (xBounds.max - xBounds.min)) * plotWidth;
  const y = (value: number) =>
    PADDING.top + ((yBounds.max - value) / (yBounds.max - yBounds.min)) * plotHeight;

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)]">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto min-w-[520px] w-full"
        role="img"
        aria-label={`${visualization.title}. ${points.length} selskaper, ${visualization.xAxis.label} på x-aksen og ${visualization.yAxis.label} på y-aksen.`}
      >
        <title>{visualization.title}</title>
        {Array.from({ length: TICKS + 1 }, (_, index) => {
          const ratio = index / TICKS;
          const tickX = PADDING.left + ratio * plotWidth;
          const tickValue = xBounds.min + ratio * (xBounds.max - xBounds.min);
          return (
            <g key={`x-${index}`}>
              <line
                x1={tickX}
                x2={tickX}
                y1={PADDING.top}
                y2={PADDING.top + plotHeight}
                stroke="var(--px-border)"
              />
              <text
                x={tickX}
                y={PADDING.top + plotHeight + 22}
                textAnchor="middle"
                fill="var(--px-muted)"
                fontSize="11"
                className="data-label tabular-nums"
              >
                {formatAxisValue(tickValue, visualization.xAxis.unit)}
              </text>
            </g>
          );
        })}
        {Array.from({ length: TICKS + 1 }, (_, index) => {
          const ratio = index / TICKS;
          const tickValue = yBounds.max - ratio * (yBounds.max - yBounds.min);
          const tickY = PADDING.top + ratio * plotHeight;
          return (
            <g key={`y-${index}`}>
              <line
                x1={PADDING.left}
                x2={PADDING.left + plotWidth}
                y1={tickY}
                y2={tickY}
                stroke="var(--px-border)"
              />
              <text
                x={PADDING.left - 12}
                y={tickY + 4}
                textAnchor="end"
                fill="var(--px-muted)"
                fontSize="11"
                className="data-label tabular-nums"
              >
                {formatAxisValue(tickValue, visualization.yAxis.unit)}
              </text>
            </g>
          );
        })}
        <line
          x1={PADDING.left}
          x2={PADDING.left + plotWidth}
          y1={y(0)}
          y2={y(0)}
          stroke="var(--px-text)"
          strokeOpacity="0.45"
        />
        <line
          x1={x(0)}
          x2={x(0)}
          y1={PADDING.top}
          y2={PADDING.top + plotHeight}
          stroke="var(--px-text)"
          strokeOpacity="0.45"
        />
        {points.map((point) => (
          <a key={point.orgNumber} href={`/companies/${point.orgNumber}`}>
            <circle
              cx={x(point.x)}
              cy={y(point.y)}
              r="5"
              fill="var(--px-accent)"
              fillOpacity="0.78"
              stroke="var(--px-surface)"
              strokeWidth="1.5"
            >
              <title>{`${point.name}: ${visualization.xAxis.label} ${formatAxisValue(point.x, visualization.xAxis.unit)}, ${visualization.yAxis.label} ${formatAxisValue(point.y, visualization.yAxis.unit)}, ${point.fiscalYear}`}</title>
            </circle>
          </a>
        ))}
        <text
          x={PADDING.left + plotWidth / 2}
          y={HEIGHT - 12}
          textAnchor="middle"
          fill="var(--px-text)"
          fontSize="12"
          fontWeight="600"
          className="data-label"
        >
          {visualization.xAxis.label} ({visualization.xAxis.unit})
        </text>
        <text
          x="16"
          y={PADDING.top + plotHeight / 2}
          textAnchor="middle"
          fill="var(--px-text)"
          fontSize="12"
          fontWeight="600"
          className="data-label"
          transform={`rotate(-90 16 ${PADDING.top + plotHeight / 2})`}
        >
          {visualization.yAxis.label} ({visualization.yAxis.unit})
        </text>
      </svg>
    </div>
  );
}

export function NjordScatterplot({ visualization }: { visualization: NjordVisualization }) {
  const [isOpen, setIsOpen] = useState(visualization.state === "rendered");
  const coverage = visualization.coverage;

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mt-3 flex w-full items-center justify-between gap-4 rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-3 text-left text-sm font-semibold text-[var(--px-text)] transition-colors hover:bg-[var(--px-subtle)]"
      >
        <span>{visualization.suggestionLabel}</span>
        <span className="material-symbols-outlined text-[18px] text-[var(--px-accent)]" aria-hidden="true">
          scatter_plot
        </span>
      </button>
    );
  }

  return (
    <section className="mt-3 w-full rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5 text-[var(--px-text)]">
      <div className="mb-4">
        <div className="data-label mb-1 text-[9px] uppercase text-[var(--px-accent)]">Analyse</div>
        <h3 className="text-sm font-semibold">{visualization.title}</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--px-muted)]">{visualization.description}</p>
      </div>
      <Scatterplot visualization={visualization} />
      <div className="mt-4 text-xs leading-5 text-[var(--px-muted)]">
        {coverage.plottedCount} av {coverage.operatorCount} operatørselskaper vises. Selskaper uten tilstrekkelig regnskapsdekning er utelatt.
      </div>
      <div className="mt-2 text-[10px] leading-4 text-[var(--px-muted)]">{visualization.sourceNote}</div>
    </section>
  );
}
