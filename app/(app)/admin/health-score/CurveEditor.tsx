"use client";

import * as React from "react";

import {
  formatHealthMetricValue,
  scoreOnCurve,
  type HealthCurvePoint,
  type HealthMetricUnit,
} from "@/lib/health-score";

/**
 * Editor for one metric's scoring curve: the table of (raw value → points)
 * breakpoints, with a plot of the resulting curve so the admin can see the shape
 * they are describing rather than reading it out of numbers.
 */

function CurvePlot({
  curve,
  unit,
  width = 260,
  height = 96,
}: {
  curve: HealthCurvePoint[];
  unit: HealthMetricUnit;
  width?: number;
  height?: number;
}) {
  const sorted = [...curve].sort((left, right) => left.value - right.value);
  if (sorted.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-[var(--px-border)] text-[11px] text-[var(--px-muted)]"
        style={{ width, height }}
      >
        Legg til minst to punkter
      </div>
    );
  }

  const padX = 6;
  const padY = 8;
  const min = sorted[0].value;
  const max = sorted[sorted.length - 1].value;
  const span = max - min || 1;

  const x = (value: number) => padX + ((value - min) / span) * (width - padX * 2);
  const y = (score: number) => padY + (1 - score / 100) * (height - padY * 2);

  // Sample the interpolation itself rather than joining the breakpoints, so the
  // plot shows exactly what `scoreOnCurve` will return.
  const samples = Array.from({ length: 61 }, (_, index) => {
    const value = min + (span * index) / 60;
    return `${index === 0 ? "M" : "L"}${x(value).toFixed(1)},${y(scoreOnCurve(sorted, value)).toFixed(1)}`;
  }).join(" ");

  return (
    <svg width={width} height={height} className="rounded-lg bg-[rgba(15,23,42,0.03)]">
      {[0, 50, 100].map((line) => (
        <line
          key={line}
          x1={padX}
          x2={width - padX}
          y1={y(line)}
          y2={y(line)}
          stroke="var(--px-chart-grid)"
          strokeWidth={0.8}
        />
      ))}
      <path d={samples} fill="none" stroke="var(--px-chart-1)" strokeWidth={1.6} />
      {sorted.map((point) => (
        <circle
          key={`${point.value}-${point.score}`}
          cx={x(point.value)}
          cy={y(point.score)}
          r={2.6}
          fill="var(--px-chart-1)"
        >
          <title>{`${formatHealthMetricValue(point.value, unit)} → ${point.score} poeng`}</title>
        </circle>
      ))}
    </svg>
  );
}

export function CurveEditor({
  curve,
  unit,
  onChange,
}: {
  curve: HealthCurvePoint[];
  unit: HealthMetricUnit;
  onChange: (curve: HealthCurvePoint[]) => void;
}) {
  const update = (index: number, patch: Partial<HealthCurvePoint>) => {
    onChange(curve.map((point, position) => (position === index ? { ...point, ...patch } : point)));
  };

  const remove = (index: number) => {
    if (curve.length <= 2) return;
    onChange(curve.filter((_, position) => position !== index));
  };

  const add = () => {
    if (curve.length >= 12) return;
    const sorted = [...curve].sort((left, right) => left.value - right.value);
    const last = sorted[sorted.length - 1];
    onChange([...curve, { value: last.value + 1, score: last.score }]);
  };

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500">
              <th scope="col" className="pb-1 pr-2 text-left font-medium">
                Verdi
              </th>
              <th scope="col" className="pb-1 pr-2 text-left font-medium">
                Poeng (0–100)
              </th>
              <th scope="col" className="pb-1" />
            </tr>
          </thead>
          <tbody>
            {curve.map((point, index) => (
              <tr key={index}>
                <td className="py-0.5 pr-2">
                  <input
                    type="number"
                    step="any"
                    value={point.value}
                    aria-label={`Verdi for punkt ${index + 1}`}
                    onChange={(event) => update(index, { value: Number(event.target.value) })}
                    className="w-full rounded-md border border-slate-200 px-2 py-1 tabular-nums"
                  />
                </td>
                <td className="py-0.5 pr-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    value={point.score}
                    aria-label={`Poeng for punkt ${index + 1}`}
                    onChange={(event) => update(index, { score: Number(event.target.value) })}
                    className="w-full rounded-md border border-slate-200 px-2 py-1 tabular-nums"
                  />
                </td>
                <td className="py-0.5 text-right">
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    disabled={curve.length <= 2}
                    className="rounded px-1.5 py-1 text-[11px] text-slate-500 hover:text-rose-700 disabled:opacity-30"
                    aria-label={`Fjern punkt ${index + 1}`}
                  >
                    Fjern
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          onClick={add}
          disabled={curve.length >= 12}
          className="mt-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 hover:border-slate-400 disabled:opacity-40"
        >
          Legg til punkt
        </button>
      </div>

      <div className="shrink-0">
        <CurvePlot curve={curve} unit={unit} />
        <p className="mt-1 max-w-[260px] text-[10.5px] leading-snug text-slate-500">
          Verdier mellom to punkter interpoleres rett linje. Verdier utenfor kurven låses til
          nærmeste endepunkt.
        </p>
      </div>
    </div>
  );
}
