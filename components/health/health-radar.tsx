"use client";

import * as React from "react";

/**
 * The financial-health radar: one axis per scoring dimension, each plotted at its
 * 0–100 score. Hand-rolled SVG, matching the rest of the charts in this app —
 * there is no chart dependency to reach for.
 *
 * Shared deliberately between the company overview and the admin editor's live
 * preview, so an admin sees the exact shape a reader will see when they move a
 * weight.
 */

export type HealthRadarAxis = {
  key: string;
  label: string;
  /** 0–100, or null when the dimension had no data behind it. */
  score: number | null;
  /** Share of the total score this dimension carried, 0–100. */
  weightShare: number;
};

const RING_STEPS = [25, 50, 75, 100];

type Point = { x: number; y: number };

function polar(center: number, radius: number, angleDeg: number): Point {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    x: center + radius * Math.cos(radians),
    y: center + radius * Math.sin(radians),
  };
}

function polygonPath(points: Point[]): string {
  if (points.length === 0) return "";
  return `${points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ")} Z`;
}

export function HealthRadar({
  axes,
  size = 260,
  variant = "dark",
  className,
}: {
  axes: HealthRadarAxis[];
  size?: number;
  variant?: "dark" | "light";
  className?: string;
}) {
  const [active, setActive] = React.useState<string | null>(null);

  // The label ring needs room outside the plot, so the plot radius is well short
  // of half the viewport.
  const center = size / 2;
  const radius = size * 0.32;
  const labelRadius = radius + size * 0.105;

  const stroke = variant === "dark" ? "rgba(255,255,255,0.16)" : "var(--px-chart-grid)";
  const axisStroke = variant === "dark" ? "rgba(255,255,255,0.22)" : "rgba(15,23,42,0.14)";
  const labelFill = variant === "dark" ? "rgba(255,255,255,0.72)" : "var(--px-muted)";
  const shapeStroke = variant === "dark" ? "#7cc4e0" : "var(--px-accent)";
  const shapeFill = variant === "dark" ? "rgba(124,196,224,0.26)" : "rgba(0,102,138,0.16)";

  if (axes.length < 3) {
    return (
      <div
        className={className}
        style={{ width: size, height: size }}
        role="img"
        aria-label="Ikke nok dimensjoner til å tegne en graf"
      >
        <div
          className="flex h-full items-center justify-center text-center text-[11px]"
          style={{ color: labelFill }}
        >
          Modellen må ha minst tre påslåtte dimensjoner for å vise grafen.
        </div>
      </div>
    );
  }

  const step = 360 / axes.length;
  // Start at 12 o'clock so the first dimension reads as the "top" of the shape.
  const angleFor = (index: number) => -90 + index * step;

  const vertices = axes.map((axis, index) => {
    const value = axis.score ?? 0;
    return {
      axis,
      angle: angleFor(index),
      point: polar(center, (radius * Math.max(0, Math.min(100, value))) / 100, angleFor(index)),
      outer: polar(center, radius, angleFor(index)),
      label: polar(center, labelRadius, angleFor(index)),
    };
  });

  const shape = polygonPath(vertices.map((vertex) => vertex.point));
  const activeVertex = vertices.find((vertex) => vertex.axis.key === active) ?? null;

  const summary = axes
    .map((axis) => `${axis.label}: ${axis.score === null ? "ikke tilgjengelig" : Math.round(axis.score)}`)
    .join(", ");

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`Finansiell helse per dimensjon. ${summary}.`}
    >
      {RING_STEPS.map((ring) => (
        <path
          key={ring}
          d={polygonPath(
            vertices.map((vertex) => polar(center, (radius * ring) / 100, vertex.angle)),
          )}
          fill="none"
          stroke={stroke}
          strokeWidth={ring === 100 ? 1.1 : 0.8}
        />
      ))}

      {vertices.map((vertex) => (
        <line
          key={`axis-${vertex.axis.key}`}
          x1={center}
          y1={center}
          x2={vertex.outer.x}
          y2={vertex.outer.y}
          stroke={axisStroke}
          strokeWidth={0.8}
        />
      ))}

      <path d={shape} fill={shapeFill} stroke={shapeStroke} strokeWidth={1.6} strokeLinejoin="round" />

      {vertices.map((vertex) => {
        const missing = vertex.axis.score === null;
        return (
          <circle
            key={`dot-${vertex.axis.key}`}
            cx={vertex.point.x}
            cy={vertex.point.y}
            r={active === vertex.axis.key ? 4.6 : 3.2}
            fill={missing ? (variant === "dark" ? "#192536" : "#ffffff") : shapeStroke}
            stroke={shapeStroke}
            strokeWidth={1.4}
          />
        );
      })}

      {vertices.map((vertex) => {
        // Nudge the anchor so labels on the left and right of the wheel do not
        // collide with the plot.
        const cos = Math.cos((vertex.angle * Math.PI) / 180);
        const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
        const sin = Math.sin((vertex.angle * Math.PI) / 180);
        const dy = sin > 0.6 ? 9 : sin < -0.6 ? -3 : 3;

        return (
          <g key={`label-${vertex.axis.key}`}>
            <text
              x={vertex.label.x}
              y={vertex.label.y + dy}
              textAnchor={anchor}
              fill={active === vertex.axis.key ? shapeStroke : labelFill}
              fontSize={10.5}
              letterSpacing="0.02em"
            >
              {vertex.axis.label}
            </text>
            {/* Generous invisible hit target — the dots alone are too small to hover. */}
            <circle
              cx={vertex.outer.x}
              cy={vertex.outer.y}
              r={size * 0.09}
              fill="transparent"
              onMouseEnter={() => setActive(vertex.axis.key)}
              onMouseLeave={() => setActive(null)}
            />
          </g>
        );
      })}

      {activeVertex ? (
        <g pointerEvents="none">
          <rect
            x={center - 62}
            y={center - 20}
            width={124}
            height={40}
            rx={7}
            fill={variant === "dark" ? "rgba(9,15,25,0.92)" : "var(--px-panel)"}
          />
          <text x={center} y={center - 5} textAnchor="middle" fill="#ffffff" fontSize={10.5}>
            {activeVertex.axis.label}
          </text>
          <text
            x={center}
            y={center + 11}
            textAnchor="middle"
            fill="rgba(255,255,255,0.75)"
            fontSize={10}
          >
            {activeVertex.axis.score === null
              ? "Ikke tilgjengelig"
              : `${Math.round(activeVertex.axis.score)} / 100 · vekt ${Math.round(activeVertex.axis.weightShare)} %`}
          </text>
        </g>
      ) : null}
    </svg>
  );
}
