import { useId } from "react";

import { DistressRevenueTrendPoint } from "@/lib/types";

/**
 * A five-year revenue sparkline. Direction of travel is the whole point of the mark, so the stroke
 * colour is driven by first-to-last change and nothing else.
 */
export function DistressSparkline({
  points,
  width = 92,
  height = 34,
}: {
  points?: DistressRevenueTrendPoint[] | null;
  width?: number;
  height?: number;
}) {
  const gradientId = useId();
  const values = (points ?? [])
    .filter((point): point is { fiscalYear: number; revenue: number } => point.revenue !== null)
    .sort((left, right) => left.fiscalYear - right.fiscalYear);

  if (values.length < 2) {
    return <div style={{ width, height }} aria-hidden />;
  }

  const revenues = values.map((point) => point.revenue);
  const min = Math.min(...revenues);
  const max = Math.max(...revenues);
  const range = max - min || 1;
  const strokeWidth = 1.6;
  const padding = strokeWidth + 2;
  const innerHeight = height - padding * 2;

  const coordinates = revenues.map((revenue, index) => {
    const x = (index / (revenues.length - 1)) * (width - padding) + padding / 2;
    const y = padding + innerHeight - ((revenue - min) / range) * innerHeight;
    return [x, y] as const;
  });

  const isGrowing = revenues[revenues.length - 1] >= revenues[0];
  const stroke = isGrowing ? "var(--px-chart-pos)" : "var(--px-chart-neg)";
  const line = coordinates.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `M${coordinates[0][0]},${height} L${line.replaceAll(" ", " L")} L${
    coordinates[coordinates.length - 1][0]
  },${height} Z`;
  const [lastX, lastY] = coordinates[coordinates.length - 1];
  const firstYear = values[0].fiscalYear;
  const lastYear = values[values.length - 1].fiscalYear;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      className="block overflow-visible"
      role="img"
      aria-label={`Inntektstrend ${firstYear}–${lastYear}: ${isGrowing ? "stigende" : "fallende"}`}
    >
      <defs>
        <linearGradient id={gradientId} x1={0} y1={0} x2={0} y2={1}>
          <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} stroke="none" />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={strokeWidth + 0.75} fill={stroke} />
    </svg>
  );
}
