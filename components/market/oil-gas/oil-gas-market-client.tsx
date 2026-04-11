"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { OilGasMap } from "@/components/market/oil-gas/oil-gas-map";
import { Card } from "@/components/ui/card";
import { PETROLEUM_CONCEPTS } from "@/lib/petroleum-concepts";
import {
  PETROLEUM_COMPARISON_LABELS,
  DEFAULT_PETROLEUM_LAYERS,
  PETROLEUM_DEFAULT_COMPARISON,
  PETROLEUM_DEFAULT_PRODUCT,
  PETROLEUM_DEFAULT_TAB,
  PETROLEUM_DEFAULT_VIEW,
  OPTIONAL_PETROLEUM_LAYERS,
  PETROLEUM_PRODUCT_LABELS,
  PETROLEUM_TAB_LABELS,
  PETROLEUM_LAYER_LABELS,
  PETROLEUM_TABLE_MODE_LABELS,
  PETROLEUM_VIEW_LABELS,
  buildPetroleumSearchParams,
  parsePetroleumFilters,
} from "@/lib/petroleum-market";
import {
  PetroleumConceptEntry,
  PetroleumEntityDetail,
  PetroleumEventRow,
  PetroleumBbox,
  PetroleumFilterOption,
  PetroleumMapFeature,
  PetroleumMarketFilters,
  PetroleumLayerId,
  PetroleumMarketTab,
  PetroleumMetricView,
  PetroleumProductSeries,
  PetroleumPublicationSnapshot,
  PetroleumRateUnit,
  PetroleumSeismicSummaryResponse,
  PetroleumSeismicTableResponse,
  PetroleumSeismicTableRow,
  PetroleumSummaryResponse,
  PetroleumTableRow,
  PetroleumTableResponse,
  PetroleumTimeSeriesComparison,
  PetroleumTimeSeriesPoint,
} from "@/lib/types";
import { cn, formatDate, formatNumber } from "@/lib/utils";

const LAYER_SWATCHS: Record<PetroleumLayerId, string> = {
  fields: "#165d52",
  discoveries: "#bc6c25",
  licences: "#2f5d8a",
  facilities: "#9b2226",
  tuf: "#14213d",
  wellbores: "#0f766e",
  surveys: "#6b7280",
  regulatoryEvents: "#7c3aed",
  gasscoEvents: "#2563eb",
};

const COMPARE_COLORS = ["#165d52", "#2f5d8a", "#bc6c25"] as const;
const MAX_COMPARE_ITEMS = 3;
const MARKET_TABS: PetroleumMarketTab[] = [
  "market",
  "exploration",
  "wells",
  "infrastructure",
  "seismic",
  "seabed",
  "companies",
  "events",
  "concepts",
];
const RATE_UNIT_LABELS: Record<PetroleumRateUnit, string> = {
  boepd: "boepd",
  billSm3: "mrd. Sm3",
  msm3: "mill. Sm3",
  nok: "NOK",
};

type CompareMode = "field" | "operator";
type FieldTableRow = Extract<PetroleumTableRow, { mode: "fields" }>;
type OperatorTableRow = Extract<PetroleumTableRow, { mode: "operators" }>;
type SeismicTableRow = PetroleumSeismicTableRow;

function formatCompactNok(value?: number | null) {
  if (value === null || value === undefined) return "Ikke tilgjengelig";
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatOe(value?: number | null) {
  if (value === null || value === undefined) return "Ikke tilgjengelig";
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 }).format(value)} mill. oe`;
}

function formatMeters(value?: number | null) {
  if (value === null || value === undefined) return "Ikke tilgjengelig";
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(value)} m`;
}

function formatAreaSqKm(value?: number | null) {
  if (value === null || value === undefined) return "Ikke tilgjengelig";
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 }).format(value)} km²`;
}

function formatDeltaPercent(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Ikke tilgjengelig";
  const sign = value > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("nb-NO", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value)}`;
}

function formatRateOrVolume(value?: number | null, unit?: PetroleumRateUnit | null) {
  if (value === null || value === undefined || !unit) return "Ikke tilgjengelig";
  return `${new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: unit === "boepd" ? 0 : 2,
  }).format(value)} ${RATE_UNIT_LABELS[unit]}`;
}

function formatDetailMetadataValue(value: string | number | boolean | null) {
  if (value === null || value === undefined || value === "") {
    return "Ikke tilgjengelig";
  }

  if (typeof value === "boolean") {
    return value ? "Ja" : "Nei";
  }

  if (typeof value === "number") {
    return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(value);
  }

  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate) && value.includes("T")) {
    return formatDate(new Date(asDate));
  }

  return value;
}

function formatMetricHeadline(
  value?: number | null,
  unit?: PetroleumRateUnit | null,
  fallbackOe?: number | null,
) {
  if (value !== null && value !== undefined && unit) {
    return formatRateOrVolume(value, unit);
  }

  return formatOe(fallbackOe);
}

function formatOptionalDate(value?: string | Date | null) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : formatDate(date);
}

function formatDateRangeLabel(from?: string | Date | null, to?: string | Date | null) {
  const fromLabel = formatOptionalDate(from);
  const toLabel = formatOptionalDate(to);

  if (fromLabel && toLabel) {
    return `${fromLabel} - ${toLabel}`;
  }

  return fromLabel ?? toLabel ?? null;
}

function getDisplayEntityType(
  detail: PetroleumEntityDetail | null,
  selectedFeature: PetroleumMapFeature | null,
) {
  return (detail?.entityType ?? selectedFeature?.entityType ?? null) as
    | "FIELD"
    | "DISCOVERY"
    | "LICENCE"
    | "FACILITY"
    | "TUF"
    | "SURVEY"
    | "WELLBORE"
    | null;
}

function getCompactInspectorRows(
  detail: PetroleumEntityDetail | null,
  selectedFeature: PetroleumMapFeature | null,
  options: {
    selectedMetricLabel: string;
    selectedMetricUnit?: PetroleumRateUnit | null;
    selectedView: PetroleumMetricView;
  },
) {
  const entityType = getDisplayEntityType(detail, selectedFeature);
  const rows: Array<{ label: string; value: string | null }> = [];

  if (entityType === "SURVEY") {
    rows.push(
      {
        label: "Rapportert av",
        value:
          (typeof detail?.metadata.companyName === "string" ? detail.metadata.companyName : null) ??
          selectedFeature?.companyName ??
          null,
      },
      {
        label: "Kategori",
        value:
          (typeof detail?.metadata.category === "string" ? detail.metadata.category : null) ??
          selectedFeature?.category ??
          null,
      },
      {
        label: "Subtype",
        value:
          (typeof detail?.metadata.subType === "string" ? detail.metadata.subType : null) ??
          selectedFeature?.subType ??
          null,
      },
      {
        label: "År",
        value:
          typeof selectedFeature?.surveyYear === "number"
            ? new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(selectedFeature.surveyYear)
            : null,
      },
      {
        label: "Planperiode",
        value: formatDateRangeLabel(
          typeof detail?.metadata.plannedFromDate === "string" ? detail.metadata.plannedFromDate : null,
          typeof detail?.metadata.plannedToDate === "string" ? detail.metadata.plannedToDate : null,
        ),
      },
      {
        label: "Gjennomført",
        value: formatDateRangeLabel(
          typeof detail?.metadata.startedAt === "string" ? detail.metadata.startedAt : null,
          typeof detail?.metadata.finalizedAt === "string" ? detail.metadata.finalizedAt : null,
        ),
      },
    );
  } else if (entityType === "WELLBORE") {
    rows.push(
      {
        label: "Operatør",
        value: detail?.operator?.companyName ?? selectedFeature?.operator?.companyName ?? null,
      },
      {
        label: "Brønntype",
        value:
          (typeof detail?.metadata.wellType === "string" ? detail.metadata.wellType : null) ??
          selectedFeature?.wellType ??
          null,
      },
      {
        label: "Formål",
        value:
          (typeof detail?.metadata.purpose === "string" ? detail.metadata.purpose : null) ??
          selectedFeature?.purpose ??
          null,
      },
      {
        label: "Felt",
        value:
          (typeof detail?.metadata.fieldName === "string" ? detail.metadata.fieldName : null) ??
          selectedFeature?.relatedFieldName ??
          null,
      },
      {
        label: "Vanndyp",
        value: formatMeters(
          typeof detail?.metadata.waterDepth === "number"
            ? detail.metadata.waterDepth
            : selectedFeature?.waterDepth ?? null,
        ),
      },
      {
        label: "Totaldybde",
        value: formatMeters(
          typeof detail?.metadata.totalDepth === "number"
            ? detail.metadata.totalDepth
            : selectedFeature?.totalDepth ?? null,
        ),
      },
    );
  } else {
    rows.push(
      {
        label: "Operatør",
        value: detail?.operator?.companyName ?? selectedFeature?.operator?.companyName ?? null,
      },
      {
        label: "Hydrokarbon",
        value: detail?.hcType ?? selectedFeature?.hcType ?? null,
      },
      {
        label: options.selectedMetricLabel,
        value: formatRateOrVolume(
          selectedFeature?.selectedProductionValue ??
            (options.selectedView === "rate"
              ? detail?.timeseries.at(-1)?.selectedRate ?? null
              : detail?.timeseries.at(-1)?.selectedValue ?? detail?.timeseries.at(-1)?.oe ?? null),
          selectedFeature?.selectedProductionUnit ?? detail?.timeseries.at(-1)?.selectedUnit ?? options.selectedMetricUnit,
        ),
      },
      {
        label: "Gjenværende",
        value: formatOe(detail?.reserve?.remainingOe ?? selectedFeature?.remainingOe ?? null),
      },
      {
        label: "Forv. investering",
        value: formatCompactNok(
          detail?.investment?.expectedFutureInvestmentNok ?? selectedFeature?.expectedFutureInvestmentNok ?? null,
        ),
      },
    );
  }

  return rows.filter((row) => row.value && row.value !== "Ikke tilgjengelig");
}

function getTimeseriesDisplayValue(point: PetroleumTimeSeriesPoint, view: PetroleumMetricView) {
  return view === "rate"
    ? (point.selectedRate ?? point.selectedValue ?? point.oe ?? 0)
    : (point.selectedValue ?? point.oe ?? 0);
}

function getPublicationCategoryLabel(category: PetroleumPublicationSnapshot["category"]) {
  switch (category) {
    case "MONTHLY_PRODUCTION":
      return "Produksjonstall";
    case "SHELF_YEAR":
      return "Sokkelåret";
    case "RESOURCE_REPORT":
      return "Ressursrapport";
    default:
      return category;
  }
}

function toCsvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return "";
  }

  const normalized = `${value}`.replaceAll('"', '""');
  return `"${normalized}"`;
}

function buildTableCsv(table: PetroleumTableResponse) {
  if (table.mode === "fields") {
    const headers = [
      "Navn",
      "Område",
      "Status",
      "Hydrokarbon",
      "Operatør",
      "Produksjon",
      "Produksjonsenhet",
      "Gjenværende (mill. oe)",
      "Forventet investering (NOK)",
    ];
    const rows = table.items.map((row) => {
      const item = row as FieldTableRow;
      return [
        item.name,
        item.area,
        item.status,
        item.hcType,
        item.operatorName,
        item.latestProductionValue,
        item.latestProductionUnit,
        item.remainingOe,
        item.expectedFutureInvestmentNok,
      ];
    });

    return [headers, ...rows]
      .map((row) => row.map((value) => toCsvCell(value)).join(";"))
      .join("\n");
  }

  if (table.mode === "licences") {
    const headers = [
      "Navn",
      "Område",
      "Status",
      "Fase",
      "Operatør",
      "Nåværende areal (km2)",
      "Opprinnelig areal (km2)",
      "Antall overføringer",
    ];
    const rows = table.items.map((row) => [
      "name" in row ? row.name : "",
      "area" in row ? row.area : "",
      "status" in row ? row.status : "",
      "currentPhase" in row ? row.currentPhase : "",
      "operatorName" in row ? row.operatorName : "",
      "currentAreaSqKm" in row ? row.currentAreaSqKm : "",
      "originalAreaSqKm" in row ? row.originalAreaSqKm : "",
      "transferCount" in row ? row.transferCount : "",
    ]);

    return [headers, ...rows]
      .map((row) => row.map((value) => toCsvCell(value)).join(";"))
      .join("\n");
  }

  const headers = [
    "Operatør",
    "Orgnummer",
    "Felt",
    "Lisenser",
    "Produksjon",
    "Produksjonsenhet",
    "Gjenværende (mill. oe)",
  ];
  const rows = table.items.map((row) => {
    const item = row as OperatorTableRow;
    return [
      item.operatorName,
      item.operatorOrgNumber,
      item.fieldCount,
      item.licenceCount,
      item.latestProductionValue,
      item.latestProductionUnit,
      item.remainingOe,
    ];
  });

  return [headers, ...rows]
    .map((row) => row.map((value) => toCsvCell(value)).join(";"))
    .join("\n");
}

function sameBbox(left?: PetroleumBbox | null, right?: PetroleumBbox | null) {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.every((value, index) => Math.abs(value - right[index]) < 0.001);
}

function normalizeFiltersForUi(filters: PetroleumMarketFilters): PetroleumMarketFilters {
  return {
    ...filters,
    tab: filters.tab ?? PETROLEUM_DEFAULT_TAB,
    product: filters.product ?? PETROLEUM_DEFAULT_PRODUCT,
    view: filters.view ?? PETROLEUM_DEFAULT_VIEW,
    comparison: filters.comparison ?? PETROLEUM_DEFAULT_COMPARISON,
    layers: filters.layers?.length ? filters.layers : DEFAULT_PETROLEUM_LAYERS,
    tableMode: filters.tableMode ?? "fields",
    page: filters.page ?? 0,
    size: filters.size ?? 15,
  };
}

async function fetchApi<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { data: T };
  return payload.data;
}

function KpiTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="border border-[rgba(15,23,42,0.08)] bg-white px-4 py-4">
      <div className="data-label text-[11px] font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-3 text-[1.65rem] font-semibold text-slate-950">{value}</div>
      {detail ? <div className="mt-1 text-xs text-slate-500">{detail}</div> : null}
    </div>
  );
}

function OptionChecklist({
  title,
  options,
  selectedValues,
  onToggle,
}: {
  title: string;
  options: PetroleumFilterOption[];
  selectedValues: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <details className="rounded-[0.95rem] border border-[rgba(15,23,42,0.1)] bg-white">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-700">
        {title}
      </summary>
      <div className="max-h-72 space-y-2 overflow-y-auto border-t border-[rgba(15,23,42,0.08)] px-4 py-3">
        {options.length === 0 ? (
          <div className="text-sm text-slate-500">Ingen valg tilgjengelig ennå.</div>
        ) : (
          options.map((option) => (
            <label key={option.value} className="flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={selectedValues.includes(option.value)}
                onChange={() => onToggle(option.value)}
                className="mt-1 h-4 w-4 rounded border-[rgba(15,23,42,0.18)]"
              />
              <span className="leading-6">
                {option.label}
                <span className="ml-2 text-xs text-slate-500">({option.count})</span>
              </span>
            </label>
          ))
        )}
      </div>
    </details>
  );
}

function SimpleTimeseriesChart({
  points,
  view,
  unit,
}: {
  points: PetroleumTimeSeriesPoint[];
  view: PetroleumMetricView;
  unit?: PetroleumRateUnit | null;
}) {
  if (points.length === 0) {
    return <div className="text-sm text-slate-500">Produksjonsserier er ikke tilgjengelige for dette utvalget ennå.</div>;
  }

  const ordered = [...points].sort((left, right) =>
    left.year === right.year ? (left.month ?? 0) - (right.month ?? 0) : left.year - right.year,
  );
  const width = Math.max(ordered.length * 72, 640);
  const height = 260;
  const padding = { top: 24, right: 24, bottom: 32, left: 56 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxSeries = Math.max(...ordered.map((point) => getTimeseriesDisplayValue(point, view)), 1);
  const maxInvestments = Math.max(...ordered.map((point) => point.investments ?? 0), 1);
  const step = plotWidth / Math.max(ordered.length - 1, 1);

  const linePath = ordered
    .map((point, index) => {
      const x = padding.left + step * index;
      const y = padding.top + plotHeight - (getTimeseriesDisplayValue(point, view) / maxSeries) * plotHeight;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <div className="overflow-x-auto border border-[rgba(15,23,42,0.08)] bg-white">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[18rem] w-full min-w-[640px]">
        <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} fill="#F8FAFC" />
        <path d={linePath} fill="none" stroke="#165d52" strokeWidth={2.5} />
        {unit ? (
          <text x={padding.left} y={padding.top - 8} className="fill-slate-500 text-[10px] font-medium">
            {RATE_UNIT_LABELS[unit]}
          </text>
        ) : null}
        {ordered.map((point, index) => {
          const x = padding.left + step * index;
          const barHeight = ((point.investments ?? 0) / maxInvestments) * plotHeight;
          const selectedValue = getTimeseriesDisplayValue(point, view);
          return (
            <g key={`${point.key}-${index}`}>
              <rect
                x={x - 10}
                y={padding.top + plotHeight - barHeight}
                width={20}
                height={Math.max(barHeight, 2)}
                fill="#b7c9d7"
                opacity={0.9}
              />
              <circle
                cx={x}
                cy={padding.top + plotHeight - (selectedValue / maxSeries) * plotHeight}
                r={4.5}
                fill="#165d52"
              />
              <text x={x} y={height - 8} textAnchor="middle" className="fill-slate-500 text-[10px] font-medium">
                {point.month ? `${point.month}/${String(point.year).slice(2)}` : point.year}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function CompareTimeseriesChart({
  points,
  view,
  unit,
}: {
  points: PetroleumTimeSeriesPoint[];
  view: PetroleumMetricView;
  unit?: PetroleumRateUnit | null;
}) {
  if (points.length === 0) {
    return (
      <div className="text-sm text-slate-500">
        Velg opptil tre felt eller operatører for å sammenligne utviklingen over tid.
      </div>
    );
  }

  const orderedPoints = [...points].sort((left, right) => left.year - right.year);
  const periodKeys = [...new Set(orderedPoints.map((point) => `${point.year}`))];
  const seriesMap = new Map<string, Map<string, number>>();

  for (const point of orderedPoints) {
    const values = seriesMap.get(point.label) ?? new Map<string, number>();
    values.set(`${point.year}`, getTimeseriesDisplayValue(point, view));
    seriesMap.set(point.label, values);
  }

  const series = [...seriesMap.entries()];
  const width = Math.max(periodKeys.length * 64, 640);
  const height = 260;
  const padding = { top: 24, right: 24, bottom: 32, left: 56 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...series.flatMap(([, values]) => [...values.values()]));
  const step = plotWidth / Math.max(periodKeys.length - 1, 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {series.map(([label], index) => (
          <div
            key={label}
            className="inline-flex items-center gap-2 rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2 text-xs font-medium text-slate-700"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: COMPARE_COLORS[index % COMPARE_COLORS.length] }}
            />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto border border-[rgba(15,23,42,0.08)] bg-white">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[18rem] w-full min-w-[640px]">
          <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} fill="#F8FAFC" />
          {unit ? (
            <text x={padding.left} y={padding.top - 8} className="fill-slate-500 text-[10px] font-medium">
              {RATE_UNIT_LABELS[unit]}
            </text>
          ) : null}

          {periodKeys.map((period, index) => {
            const x = padding.left + step * index;
            return (
              <text
                key={period}
                x={x}
                y={height - 8}
                textAnchor="middle"
                className="fill-slate-500 text-[10px] font-medium"
              >
                {period}
              </text>
            );
          })}

          {series.map(([label, values], index) => {
            const stroke = COMPARE_COLORS[index % COMPARE_COLORS.length];
            const path = periodKeys
              .map((period, periodIndex) => {
                const value = values.get(period) ?? 0;
                const x = padding.left + step * periodIndex;
                const y = padding.top + plotHeight - (value / maxValue) * plotHeight;
                return `${periodIndex === 0 ? "M" : "L"} ${x} ${y}`;
              })
              .join(" ");

            return (
              <g key={label}>
                <path d={path} fill="none" stroke={stroke} strokeWidth={2.5} />
                {periodKeys.map((period, periodIndex) => {
                  const value = values.get(period) ?? 0;
                  const x = padding.left + step * periodIndex;
                  const y = padding.top + plotHeight - (value / maxValue) * plotHeight;
                  return <circle key={`${label}-${period}`} cx={x} cy={y} r={4} fill={stroke} />;
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function MarketTabNav({
  activeTab,
  onSelectTab,
}: {
  activeTab: PetroleumMarketTab;
  onSelectTab: (tab: PetroleumMarketTab) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-[1rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(247,247,245,0.86)] px-2 py-2 backdrop-blur-sm">
      <div className="inline-flex min-w-full gap-1">
        {MARKET_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onSelectTab(tab)}
            className={cn(
              "rounded-[0.8rem] px-4 py-2.5 text-sm font-medium transition",
              activeTab === tab
                ? "bg-[#182535] text-white"
                : "text-slate-600 hover:bg-white hover:text-slate-900",
            )}
          >
            {PETROLEUM_TAB_LABELS[tab]}
          </button>
        ))}
      </div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-[rgba(15,23,42,0.1)] bg-[#F4F6F8] p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full px-3.5 py-2 text-xs font-semibold",
            value === option.value ? "bg-[#172535] text-white" : "text-slate-600",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ForecastPanel({ summary }: { summary: PetroleumSummaryResponse | null }) {
  if (!summary?.forecast) {
    return (
      <Card className="p-5">
        <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Forecast</div>
        <div className="mt-3 text-sm text-slate-500">Siste offisielle forecast er ikke tilgjengelig ennå.</div>
      </Card>
    );
  }

  const forecast = summary.forecast;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Forecast</div>
          <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Siste sokkelprognose</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {forecast.summary ?? "Ingen oppsummering tilgjengelig."}
          </p>
        </div>
        <div className="inline-flex items-center rounded-full border border-[rgba(15,23,42,0.1)] bg-[#F8FAFC] px-3 py-2 text-xs font-semibold text-slate-600">
          {forecast.scope === "FILTERED" ? "Filtertilpasset avledning" : "Offisiell NCS-forecast"}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Publisert</div>
          <div className="mt-2 text-sm font-medium text-slate-900">
            {forecast.publishedAt ? formatDate(forecast.publishedAt) : "Ikke tilgjengelig"}
          </div>
        </div>
        <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Horisont</div>
          <div className="mt-2 text-sm font-medium text-slate-900">
            {forecast.horizonLabel ?? "Ikke tilgjengelig"}
          </div>
        </div>
        <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Trend</div>
          <div className="mt-2 text-sm font-medium text-slate-900">
            {forecast.trendLabel ?? "Ikke tilgjengelig"}
          </div>
        </div>
        <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Decline / investering</div>
          <div className="mt-2 text-sm font-medium text-slate-900">
            {forecast.declineRatePercent !== null && forecast.declineRatePercent !== undefined
              ? formatDeltaPercent(-Math.abs(forecast.declineRatePercent))
              : formatCompactNok(forecast.investmentLevelNok)}
          </div>
        </div>
      </div>

      {forecast.keyPoints.length > 0 ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {forecast.keyPoints.map((point) => (
            <div
              key={point}
              className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3 text-sm leading-6 text-slate-700"
            >
              {point}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {forecast.detailUrl ? (
          <a
            href={forecast.detailUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-xs font-semibold text-slate-700"
          >
            pne forecast-kilde
          </a>
        ) : null}
        {forecast.backgroundDataUrl ? (
          <a
            href={forecast.backgroundDataUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-xs font-semibold text-slate-700"
          >
            Bakgrunnstall
          </a>
        ) : null}
      </div>
    </Card>
  );
}

function ConceptGrid({
  concepts,
  onOpenConceptsTab,
}: {
  concepts: PetroleumConceptEntry[];
  onOpenConceptsTab?: () => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {concepts.map((concept) => (
        <div
          key={concept.id}
          id={`concept-${concept.slug}`}
          className="rounded-[1rem] border border-[rgba(15,23,42,0.08)] bg-white p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-slate-950">{concept.label}</div>
              <div className="mt-1 text-sm text-slate-500">{concept.shortDefinition}</div>
            </div>
            <span className="rounded-full bg-[#F8FAFC] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Begrep
            </span>
          </div>
          <p className="mt-4 text-sm leading-7 text-slate-600">{concept.explanation}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {concept.relatedProducts?.map((product) => (
              <span
                key={`${concept.id}-${product}`}
                className="rounded-full border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] px-3 py-1.5 text-xs font-medium text-slate-600"
              >
                {PETROLEUM_PRODUCT_LABELS[product]}
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a
              href={concept.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-xs font-semibold text-slate-700"
            >
              {concept.sourceLabel}
            </a>
            {onOpenConceptsTab ? (
              <button
                type="button"
                onClick={onOpenConceptsTab}
                className="inline-flex items-center rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-xs font-semibold text-slate-700"
              >
                Se alle begreper
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function OilGasMarketClient({ premium }: { premium: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const initialUrlState = React.useMemo(() => {
    const params = new URLSearchParams(searchParamsString);
    return {
      filters: normalizeFiltersForUi(parsePetroleumFilters(params)),
      queryInput: params.get("query")?.trim() ?? "",
      entity: params.get("entity")?.trim() || null,
    };
  }, [searchParamsString]);
  const isMountedRef = React.useRef(true);
  const latestRequestIdRef = React.useRef(0);
  const lastUrlWriteRef = React.useRef<string | null>(null);
  const lastAppliedRequestRef = React.useRef({
    summary: 0,
    features: 0,
    table: 0,
    timeseries: 0,
    events: 0,
  });
  const [filters, setFilters] = React.useState<PetroleumMarketFilters>(initialUrlState.filters);
  const [queryInput, setQueryInput] = React.useState(initialUrlState.queryInput);
  const deferredQuery = React.useDeferredValue(queryInput);
  const [summary, setSummary] = React.useState<PetroleumSummaryResponse | null>(null);
  const [features, setFeatures] = React.useState<PetroleumMapFeature[]>([]);
  const [table, setTable] = React.useState<PetroleumTableResponse | null>(null);
  const [seismicSummary, setSeismicSummary] = React.useState<PetroleumSeismicSummaryResponse | null>(null);
  const [seismicTable, setSeismicTable] = React.useState<PetroleumSeismicTableResponse | null>(null);
  const [timeseries, setTimeseries] = React.useState<PetroleumTimeSeriesPoint[]>([]);
  const [events, setEvents] = React.useState<PetroleumEventRow[]>([]);
  const [detail, setDetail] = React.useState<PetroleumEntityDetail | null>(null);
  const [selectedEntityKey, setSelectedEntityKey] = React.useState<string | null>(initialUrlState.entity);
  const [viewportBbox, setViewportBbox] = React.useState<PetroleumBbox | null>(null);
  const [resetViewNonce, setResetViewNonce] = React.useState(0);
  const [isMapExpanded, setIsMapExpanded] = React.useState(false);
  const [compareMode, setCompareMode] = React.useState<CompareMode>("field");
  const [compareFieldIds, setCompareFieldIds] = React.useState<string[]>([]);
  const [compareOperatorIds, setCompareOperatorIds] = React.useState<string[]>([]);
  const [fieldCompareRows, setFieldCompareRows] = React.useState<FieldTableRow[]>([]);
  const [operatorCompareRows, setOperatorCompareRows] = React.useState<OperatorTableRow[]>([]);
  const [compareSeries, setCompareSeries] = React.useState<PetroleumTimeSeriesPoint[]>([]);
  const [compareLoading, setCompareLoading] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const activeTab = filters.tab ?? PETROLEUM_DEFAULT_TAB;
  const isOverviewTab = activeTab === "market";
  const selectedProduct = filters.product ?? PETROLEUM_DEFAULT_PRODUCT;
  const selectedView = filters.view ?? PETROLEUM_DEFAULT_VIEW;
  const selectedComparison = filters.comparison ?? PETROLEUM_DEFAULT_COMPARISON;
  const compareIds = compareMode === "field" ? compareFieldIds : compareOperatorIds;
  const handleSelectEntity = React.useCallback((entityType: string, entityId: string) => {
    setSelectedEntityKey(`${entityType}:${entityId}`);
  }, []);
  const handleSelectTab = React.useCallback((tab: PetroleumMarketTab) => {
    setFilters((current) => ({
      ...current,
      tab,
      page: 0,
    }));
  }, []);
  const handleSelectProduct = React.useCallback((product: PetroleumProductSeries) => {
    setFilters((current) => ({
      ...current,
      product,
      page: 0,
    }));
  }, []);
  const handleSelectView = React.useCallback((view: PetroleumMetricView) => {
    setFilters((current) => ({
      ...current,
      view,
      page: 0,
    }));
  }, []);
  const handleSelectComparison = React.useCallback((comparison: PetroleumTimeSeriesComparison) => {
    setFilters((current) => ({
      ...current,
      comparison,
      page: 0,
    }));
  }, []);
  const handleViewportChange = React.useCallback((bbox: PetroleumBbox) => {
    setViewportBbox((current) => (sameBbox(current, bbox) ? current : bbox));
  }, []);
  const handleResetViewport = React.useCallback(() => {
    setSelectedEntityKey(null);
    setViewportBbox(null);
    setFilters((current) => ({
      ...current,
      bbox: null,
      page: 0,
    }));
    setResetViewNonce((current) => current + 1);
  }, []);

  React.useEffect(() => {
    if (activeTab !== "seismic") {
      return;
    }

    setFilters((current) => {
      if ((current.layers ?? DEFAULT_PETROLEUM_LAYERS).includes("surveys")) {
        return current;
      }

      const nextLayers = new Set(current.layers?.length ? current.layers : DEFAULT_PETROLEUM_LAYERS);
      nextLayers.add("surveys");
      return {
        ...current,
        layers: [...nextLayers],
      };
    });
  }, [activeTab]);

  React.useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  React.useEffect(() => {
    if (lastUrlWriteRef.current === searchParamsString) {
      return;
    }

    setFilters((current) => {
      const next = normalizeFiltersForUi(parsePetroleumFilters(new URLSearchParams(searchParamsString)));
      const currentSerialized = buildPetroleumSearchParams(current).toString();
      const nextSerialized = buildPetroleumSearchParams(next).toString();
      return currentSerialized === nextSerialized ? current : next;
    });
    setViewportBbox((current) => {
      const next = normalizeFiltersForUi(parsePetroleumFilters(new URLSearchParams(searchParamsString))).bbox ?? null;
      return sameBbox(current, next) ? current : next;
    });

    const nextQuery = new URLSearchParams(searchParamsString).get("query")?.trim() ?? "";
    setQueryInput((current) => (current === nextQuery ? current : nextQuery));

    const nextEntity = new URLSearchParams(searchParamsString).get("entity")?.trim() || null;
    setSelectedEntityKey((current) => (current === nextEntity ? current : nextEntity));
  }, [searchParamsString]);

  React.useEffect(() => {
    setFilters((current) => {
      const nextQuery = deferredQuery || undefined;
      if (current.query === nextQuery && current.page === 0) {
        return current;
      }

      return { ...current, query: nextQuery, page: 0 };
    });
  }, [deferredQuery]);

  React.useEffect(() => {
    const params = buildPetroleumSearchParams(filters, {
      query: queryInput.trim() || undefined,
      entity: selectedEntityKey ?? undefined,
    });
    const nextSearch = params.toString();
    const currentSearch = searchParamsString;

    if (nextSearch === currentSearch) {
      lastUrlWriteRef.current = currentSearch;
      return;
    }

    if (lastUrlWriteRef.current === nextSearch) {
      return;
    }

    lastUrlWriteRef.current = nextSearch;
    router.replace((nextSearch ? `${pathname}?${nextSearch}` : pathname) as never, { scroll: false });
  }, [filters, pathname, queryInput, router, searchParamsString, selectedEntityKey]);

  React.useEffect(() => {
    const params = buildPetroleumSearchParams(filters);
    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;
    const abortController = new AbortController();
    const featureBbox = viewportBbox ?? filters.bbox ?? null;
    const shouldFetchMapFeatures = Boolean(featureBbox);
    const featureParams = buildPetroleumSearchParams(filters, {
      bbox: featureBbox?.join(","),
    });

    async function load() {
      setLoading(true);
      setError(null);

      const summaryPromise = fetchApi<PetroleumSummaryResponse>(
        `/api/market/oil-gas/summary?${params.toString()}`,
        { signal: abortController.signal },
      )
        .then((value) => {
          if (
            isMountedRef.current &&
            requestId >= lastAppliedRequestRef.current.summary
          ) {
            setSummary(value);
            lastAppliedRequestRef.current.summary = requestId;
          }

          return { ok: true as const, aborted: false as const };
        })
        .catch((error: unknown) =>
          error instanceof Error && error.name === "AbortError"
            ? ({ ok: false as const, aborted: true as const })
            : ({ ok: false as const, aborted: false as const }),
        );

      const featuresPromise = shouldFetchMapFeatures
        ? fetchApi<PetroleumMapFeature[]>(
            `/api/market/oil-gas/features?${featureParams.toString()}`,
            { signal: abortController.signal },
          )
            .then((value) => {
              if (
                isMountedRef.current &&
                requestId >= lastAppliedRequestRef.current.features
              ) {
                setFeatures(value);
                lastAppliedRequestRef.current.features = requestId;
              }

              return { ok: true as const, aborted: false as const };
            })
            .catch((error: unknown) =>
              error instanceof Error && error.name === "AbortError"
                ? ({ ok: false as const, aborted: true as const })
                : ({ ok: false as const, aborted: false as const }),
            )
        : Promise.resolve({ ok: true as const, aborted: false as const });

      const [summaryResult, featuresResult] = await Promise.all([summaryPromise, featuresPromise]);

      if (isMountedRef.current && requestId === latestRequestIdRef.current) {
        if (!summaryResult.ok && !featuresResult.ok && !summaryResult.aborted && !featuresResult.aborted) {
          setError("Kunne ikke laste olje- og gassmodulen.");
        }

        setLoading(false);
      }

      const tableResult = await fetchApi<PetroleumTableResponse>(`/api/market/oil-gas/table?${params.toString()}`, {
        signal: abortController.signal,
      })
        .then((value) => {
          if (
            isMountedRef.current &&
            requestId >= lastAppliedRequestRef.current.table
          ) {
            setTable(value);
            lastAppliedRequestRef.current.table = requestId;
          }

          return { ok: true as const, aborted: false as const };
        })
        .catch((error: unknown) =>
          error instanceof Error && error.name === "AbortError"
            ? ({ ok: false as const, aborted: true as const })
            : ({ ok: false as const, aborted: false as const }),
        );

      const timeseriesResult = await fetchApi<PetroleumTimeSeriesPoint[]>(
        `/api/market/oil-gas/timeseries?${buildPetroleumSearchParams(filters, {
          entityType: "area",
          granularity: "year",
          measures: `${selectedProduct},investments`,
          product: selectedProduct,
          view: selectedView,
          comparison: selectedComparison,
        }).toString()}`,
        { signal: abortController.signal },
      )
        .then((value) => {
          if (
            isMountedRef.current &&
            requestId >= lastAppliedRequestRef.current.timeseries
          ) {
            setTimeseries(value);
            lastAppliedRequestRef.current.timeseries = requestId;
          }

          return { ok: true as const, aborted: false as const };
        })
        .catch((error: unknown) =>
          error instanceof Error && error.name === "AbortError"
            ? ({ ok: false as const, aborted: true as const })
            : ({ ok: false as const, aborted: false as const }),
        );

      const eventsResult = await fetchApi<PetroleumEventRow[]>(
        `/api/market/oil-gas/events?${params.toString()}&limit=40`,
        { signal: abortController.signal },
      )
        .then((value) => {
          if (
            isMountedRef.current &&
            requestId >= lastAppliedRequestRef.current.events
          ) {
            setEvents(value);
            lastAppliedRequestRef.current.events = requestId;
          }

          return { ok: true as const, aborted: false as const };
        })
        .catch((error: unknown) =>
          error instanceof Error && error.name === "AbortError"
            ? ({ ok: false as const, aborted: true as const })
            : ({ ok: false as const, aborted: false as const }),
        );

      if (!isMountedRef.current || requestId !== latestRequestIdRef.current) {
        return;
      }

      const failedCount = [
        summaryResult,
        featuresResult,
        tableResult,
        timeseriesResult,
        eventsResult,
      ].filter((result) => !result.ok && !result.aborted).length;

      if (failedCount === 5) {
        setError("Kunne ikke laste olje- og gassmodulen.");
      } else if (failedCount > 0) {
        setError("Noen datakilder svarte ikke, men resten av flaten er lastet.");
      }
    }

    void load();
    return () => {
      abortController.abort();
    };
  }, [filters, selectedComparison, selectedProduct, selectedView, viewportBbox]);

  React.useEffect(() => {
    if (activeTab !== "seismic") {
      return;
    }

    let cancelled = false;
    const params = buildPetroleumSearchParams(filters, {
      page: 0,
      size: 50,
    });

    Promise.all([
      fetchApi<PetroleumSeismicSummaryResponse>(`/api/market/oil-gas/seismic/summary?${params.toString()}`),
      fetchApi<PetroleumSeismicTableResponse>(`/api/market/oil-gas/seismic/table?${params.toString()}`),
    ])
      .then(([summaryPayload, tablePayload]) => {
        if (cancelled) {
          return;
        }

        setSeismicSummary(summaryPayload);
        setSeismicTable(tablePayload);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setSeismicSummary(null);
        setSeismicTable(null);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, filters]);

  React.useEffect(() => {
    if (!selectedEntityKey) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    const [entityType, entityId] = selectedEntityKey.split(":");

    fetchApi<PetroleumEntityDetail>(`/api/market/oil-gas/entities/${entityType}/${entityId}`)
      .then((payload) => {
        if (!cancelled) {
          setDetail(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetail(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedEntityKey]);

  React.useEffect(() => {
    if (!isMapExpanded) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMapExpanded(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMapExpanded]);

  React.useEffect(() => {
    if (compareIds.length === 0) {
      setCompareSeries([]);
      return;
    }

    let cancelled = false;
    setCompareLoading(true);
    const compareParams = buildPetroleumSearchParams(filters, {
      entityType: compareMode,
      entityIds: compareIds.join(","),
      granularity: "year",
      measures: selectedProduct,
      product: selectedProduct,
      view: selectedView,
      comparison: selectedComparison,
    });

    fetchApi<PetroleumTimeSeriesPoint[]>(`/api/market/oil-gas/timeseries?${compareParams.toString()}`)
      .then((payload) => {
        if (!cancelled) {
          setCompareSeries(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCompareSeries([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCompareLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [compareIds, compareMode, filters, selectedComparison, selectedProduct, selectedView]);

  const toggleArrayValue = React.useCallback(
    (
      key:
        | "layers"
        | "status"
        | "surveyStatuses"
        | "surveyCategories"
        | "areas"
        | "operatorIds"
        | "licenseeIds"
        | "hcTypes",
      value: string,
    ) => {
      setFilters((current) => {
        const next = new Set((current[key] ?? []) as string[]);
        if (next.has(value)) {
          next.delete(value);
        } else {
          next.add(value);
        }

        return {
          ...current,
          [key]: [...next],
          page: 0,
        };
      });
    },
    [],
  );
  const operatorMax = Math.max(
    ...(summary?.operatorConcentration.map((item) => item.oe ?? 0) ?? [1]),
    1,
  );
  const activeLayerCounts = React.useMemo(() => {
    const counts = new Map<PetroleumLayerId, number>();
    for (const feature of features) {
      counts.set(feature.layerId, (counts.get(feature.layerId) ?? 0) + 1);
    }

    return (filters.layers ?? DEFAULT_PETROLEUM_LAYERS).map((layerId) => ({
      layerId,
      count: counts.get(layerId) ?? 0,
    }));
  }, [features, filters.layers]);
  const isMapDrivingResults = Boolean(viewportBbox ?? filters.bbox);
  const gasscoRealtimeEvents = React.useMemo(
    () => events.filter((event) => event.source === "GASSCO" && event.eventType === "REALTIME_NOMINATION"),
    [events],
  );
  const marketEvents = React.useMemo(
    () => events.filter((event) => !(event.source === "GASSCO" && event.eventType === "REALTIME_NOMINATION")),
    [events],
  );
  const selectedFeature = React.useMemo(
    () =>
      selectedEntityKey
        ? features.find((item) => `${item.entityType}:${item.entityId}` === selectedEntityKey) ?? null
        : null,
    [features, selectedEntityKey],
  );
  const selectedEntityType = React.useMemo(
    () => getDisplayEntityType(detail, selectedFeature),
    [detail, selectedFeature],
  );
  const selectedMetricUnit = summary?.kpis.selectedLatestProductionUnit ?? timeseries.at(-1)?.selectedUnit ?? null;
  const selectedMetricLabel =
    selectedView === "rate"
      ? `${PETROLEUM_PRODUCT_LABELS[selectedProduct]} som dagrate`
      : `${PETROLEUM_PRODUCT_LABELS[selectedProduct]} som volum`;
  const compactInspectorRows = React.useMemo(
    () =>
      getCompactInspectorRows(detail, selectedFeature, {
        selectedMetricLabel,
        selectedMetricUnit,
        selectedView,
      }),
    [detail, selectedFeature, selectedMetricLabel, selectedMetricUnit, selectedView],
  );
  const wellboreFeatures = React.useMemo(
    () => features.filter((feature) => feature.layerId === "wellbores"),
    [features],
  );
  const surveyMapFeatureCount = React.useMemo(
    () => features.filter((feature) => feature.layerId === "surveys").length,
    [features],
  );
  const seismicRecentItems = seismicSummary?.recentItems ?? [];
  const seismicRows: SeismicTableRow[] = seismicTable?.items ?? [];
  const surveyLayerVisible = (filters.layers ?? DEFAULT_PETROLEUM_LAYERS).includes("surveys");
  const wellboreLayerVisible = (filters.layers ?? DEFAULT_PETROLEUM_LAYERS).includes("wellbores");
  const infrastructureFeatures = React.useMemo(
    () => features.filter((feature) => feature.layerId === "facilities" || feature.layerId === "tuf"),
    [features],
  );
  const discoveryFeatures = React.useMemo(
    () => features.filter((feature) => feature.layerId === "discoveries"),
    [features],
  );
  const conceptEntries = detail?.concepts?.length ? detail.concepts : PETROLEUM_CONCEPTS;
  const detailMetadataEntries = React.useMemo(
    () =>
      detail
        ? Object.entries(detail.metadata ?? {}).filter(
            ([key, value]) =>
              !["sourceSystem", "sourceEntityType", "sourceId"].includes(key) &&
              value !== null &&
              value !== "",
          )
        : [],
    [detail],
  );
  const fallbackFieldCompareRows = React.useMemo<FieldTableRow[]>(
    () =>
      (summary?.topFields ?? []).map((row) => ({
        mode: "fields",
        entityId: row.entityId,
        npdId: row.npdId,
        name: row.name,
        area: row.area ?? null,
        status: row.status ?? null,
        hcType: null,
        operatorName: row.operatorName ?? null,
        operatorSlug: row.operatorSlug ?? null,
        latestProductionOe: row.oe ?? null,
        remainingOe: row.remainingOe ?? null,
        expectedFutureInvestmentNok: row.expectedFutureInvestmentNok ?? null,
      })),
    [summary],
  );
  const fallbackOperatorCompareRows = React.useMemo<OperatorTableRow[]>(() => {
    const operatorLookup = new Map((summary?.filterOptions.operators ?? []).map((option) => [option.label, option.value]));
    return (summary?.operatorConcentration ?? []).map((row) => ({
      mode: "operators",
      operatorId: operatorLookup.get(row.operatorName) ?? row.operatorName,
      operatorName: row.operatorName,
      operatorOrgNumber: row.operatorOrgNumber ?? null,
      operatorSlug: row.operatorSlug ?? null,
      fieldCount: row.fieldCount,
      licenceCount: 0,
      latestProductionOe: row.oe ?? null,
      remainingOe: null,
    }));
  }, [summary]);
  const resolvedFieldCompareRows = fieldCompareRows.length ? fieldCompareRows : fallbackFieldCompareRows;
  const resolvedOperatorCompareRows = operatorCompareRows.length ? operatorCompareRows : fallbackOperatorCompareRows;
  const fieldCompareOptions = React.useMemo(
    () =>
      resolvedFieldCompareRows.map((row) => ({
        value: row.entityId,
        label: row.name,
        detail: [row.area, row.operatorName].filter(Boolean).join(" · "),
      })),
    [resolvedFieldCompareRows],
  );
  const operatorCompareOptions = React.useMemo(
    () =>
      resolvedOperatorCompareRows.map((row) => ({
        value: row.operatorId,
        label: row.operatorName,
        detail: `${row.fieldCount} felt · ${row.licenceCount} lisenser`,
      })),
    [resolvedOperatorCompareRows],
  );
  const compareQuickPicks = React.useMemo(() => {
    if (compareMode === "field") {
      return [...resolvedFieldCompareRows]
        .sort((left, right) => (right.latestProductionOe ?? 0) - (left.latestProductionOe ?? 0))
        .slice(0, 6)
        .map((row) => ({
          value: row.entityId,
          label: row.name,
        }));
    }

    return [...resolvedOperatorCompareRows]
      .sort((left, right) => (right.latestProductionOe ?? 0) - (left.latestProductionOe ?? 0))
      .slice(0, 6)
      .map((row) => ({
        value: row.operatorId,
        label: row.operatorName,
      }));
  }, [compareMode, resolvedFieldCompareRows, resolvedOperatorCompareRows]);
  const selectedFieldCompareRows = React.useMemo(() => {
    const lookup = new Map(resolvedFieldCompareRows.map((row) => [row.entityId, row]));
    return compareFieldIds
      .map((id) => lookup.get(id))
      .filter((row): row is FieldTableRow => Boolean(row));
  }, [compareFieldIds, resolvedFieldCompareRows]);
  const selectedOperatorCompareRows = React.useMemo(() => {
    const lookup = new Map(resolvedOperatorCompareRows.map((row) => [row.operatorId, row]));
    return compareOperatorIds
      .map((id) => lookup.get(id))
      .filter((row): row is OperatorTableRow => Boolean(row));
  }, [compareOperatorIds, resolvedOperatorCompareRows]);
  const compareSummaryCount =
    compareMode === "field" ? selectedFieldCompareRows.length : selectedOperatorCompareRows.length;
  const mapFocusSelectionLabels = React.useMemo(
    () =>
      (compareMode === "field" ? selectedFieldCompareRows : selectedOperatorCompareRows)
        .map((row) => ("name" in row ? row.name : row.operatorName))
        .slice(0, MAX_COMPARE_ITEMS),
    [compareMode, selectedFieldCompareRows, selectedOperatorCompareRows],
  );
  const setCompareSelection = React.useCallback(
    (index: number, value: string) => {
      const updater = (current: string[]) => {
        const next = [...current];
        if (!value) {
          next.splice(index, 1);
        } else {
          next[index] = value;
        }

        const unique = next.filter(Boolean).filter((item, itemIndex, array) => array.indexOf(item) === itemIndex);
        return unique.slice(0, MAX_COMPARE_ITEMS);
      };

      if (compareMode === "field") {
        setCompareFieldIds(updater);
        return;
      }

      setCompareOperatorIds(updater);
    },
    [compareMode],
  );
  const clearCompare = React.useCallback(() => {
    if (compareMode === "field") {
      setCompareFieldIds([]);
      return;
    }

    setCompareOperatorIds([]);
  }, [compareMode]);
  const toggleCompareChip = React.useCallback(
    (value: string) => {
      const updater = (current: string[]) => {
        if (current.includes(value)) {
          return current.filter((item) => item !== value);
        }

        if (current.length >= MAX_COMPARE_ITEMS) {
          return current;
        }

        return [...current, value];
      };

      if (compareMode === "field") {
        setCompareFieldIds(updater);
        return;
      }

      setCompareOperatorIds(updater);
    },
    [compareMode],
  );
  const handleExportTable = React.useCallback(async () => {
    try {
      setIsExporting(true);
      const exportParams = buildPetroleumSearchParams({
        ...filters,
        page: 0,
        size: Math.max(table?.totalCount ?? 0, 1_000),
      });
      const exportTable = await fetchApi<PetroleumTableResponse>(
        `/api/market/oil-gas/table?${exportParams.toString()}`,
      );
      const csv = buildTableCsv(exportTable);
      const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `projectx-oil-gas-${exportTable.mode}-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Kunne ikke eksportere markedstabellen.");
    } finally {
      setIsExporting(false);
    }
  }, [filters, table?.totalCount]);

  const renderTableSection = React.useCallback(
    () => (
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Markedstabell</div>
            <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Sorterbart utvalg</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleExportTable}
              className="inline-flex items-center rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700"
            >
              {isExporting ? "Eksporterer CSV..." : "Eksporter CSV"}
            </button>
            <div className="inline-flex rounded-full border border-[rgba(15,23,42,0.1)] bg-[#F4F6F8] p-1">
              {(["fields", "licences", "operators"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setFilters((current) => ({ ...current, tableMode: mode, page: 0 }))}
                  className={cn(
                    "rounded-full px-3.5 py-2 text-xs font-semibold",
                    filters.tableMode === mode ? "bg-[#172535] text-white" : "text-slate-600",
                  )}
                >
                  {PETROLEUM_TABLE_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto border border-[rgba(15,23,42,0.08)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#F8FAFC] text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Navn</th>
                <th className="px-4 py-3 font-medium">Område</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Operatør</th>
                <th className="px-4 py-3 font-medium">{selectedMetricLabel}</th>
              </tr>
            </thead>
            <tbody>
              {table?.items.map((item) => (
                <tr
                  key={"entityId" in item ? `${item.mode}:${item.entityId}` : `${item.mode}:${item.operatorName}`}
                  className="border-t border-[rgba(15,23,42,0.08)] bg-white"
                >
                  <td className="px-4 py-3 text-slate-900">
                    {("name" in item ? item.name : item.operatorName) ?? "Ikke tilgjengelig"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{("area" in item ? item.area : null) ?? ""}</td>
                  <td className="px-4 py-3 text-slate-600">{("status" in item ? item.status : null) ?? ""}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {("operatorName" in item ? item.operatorName : item.operatorName) ?? ""}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.mode === "fields"
                      ? formatRateOrVolume(item.latestProductionValue, item.latestProductionUnit)
                      : item.mode === "licences"
                        ? `${item.transferCount} overføringer`
                        : formatRateOrVolume(item.latestProductionValue, item.latestProductionUnit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    ),
    [filters.tableMode, handleExportTable, isExporting, selectedMetricLabel, table?.items],
  );

  const renderCompareSection = React.useCallback(
    () => (
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Sammenligning</div>
            <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Sammenlign utvikling</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Sammenlign opptil tre felt eller operatører i det samme markedsutsnittet.
            </p>
          </div>
          <SegmentedControl
            value={compareMode}
            onChange={setCompareMode}
            options={[
              { value: "field", label: "Felt" },
              { value: "operator", label: "Operatører" },
            ]}
          />
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <div className="lg:col-span-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Raske valg</div>
            <div className="flex flex-wrap gap-2">
              {compareQuickPicks.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleCompareChip(option.value)}
                  className={cn(
                    "rounded-full border px-3 py-2 text-xs font-semibold transition-colors",
                    compareIds.includes(option.value)
                      ? "border-[#172535] bg-[#172535] text-white"
                      : "border-[rgba(15,23,42,0.12)] bg-white text-slate-700",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {Array.from({ length: MAX_COMPARE_ITEMS }).map((_, index) => {
            const currentValue = compareIds[index] ?? "";
            const options = compareMode === "field" ? fieldCompareOptions : operatorCompareOptions;

            return (
              <label
                key={`${compareMode}-${index}`}
                className="rounded-[0.95rem] border border-[rgba(15,23,42,0.1)] bg-white p-4"
              >
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {compareMode === "field" ? `Felt ${index + 1}` : `Operatør ${index + 1}`}
                </div>
                <select
                  value={currentValue}
                  onChange={(event) => setCompareSelection(index, event.target.value)}
                  className="mt-3 w-full rounded-[0.75rem] border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2.5 text-sm text-slate-800 outline-none"
                >
                  <option value="">Velg objekt</option>
                  {options.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      disabled={Boolean(option.value !== currentValue && compareIds.includes(option.value))}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="mt-2 min-h-[1.25rem] text-xs text-slate-500">
                  {options.find((option) => option.value === currentValue)?.detail ?? "Ingen valgt ennå"}
                </div>
              </label>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={clearCompare}
            className="inline-flex items-center rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700"
          >
            Nullstill sammenligning
          </button>
          <div className="text-xs text-slate-500">
            {compareLoading ? "Oppdaterer sammenligning..." : `${formatNumber(compareSummaryCount)} objekter valgt`}
          </div>
        </div>

        <div className="mt-5">
          <CompareTimeseriesChart points={compareSeries} view={selectedView} unit={selectedMetricUnit} />
        </div>
      </Card>
    ),
    [
      clearCompare,
      compareIds,
      compareLoading,
      compareMode,
      compareQuickPicks,
      compareSeries,
      compareSummaryCount,
      fieldCompareOptions,
      operatorCompareOptions,
      selectedMetricUnit,
      selectedView,
      setCompareSelection,
      toggleCompareChip,
    ],
  );

  const renderPublicationsSection = React.useCallback(
    (title: string, publications: PetroleumPublicationSnapshot[]) => (
      <Card className="p-5">
        <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Rapporter</div>
        <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">{title}</h2>
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {publications.map((publication) => (
            <div
              key={publication.id}
              className="rounded-[1rem] border border-[rgba(15,23,42,0.08)] bg-white p-4"
            >
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                {getPublicationCategoryLabel(publication.category)}
              </div>
              <div className="mt-2 text-base font-semibold text-slate-950">{publication.title}</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                {publication.summary ?? "Ingen oppsummering tilgjengelig."}
              </div>
              <div className="mt-3 text-xs text-slate-500">
                {publication.publishedAt ? formatDate(publication.publishedAt) : "Dato ikke tilgjengelig"}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={publication.detailUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  pne rapport
                </a>
                {publication.backgroundDataUrl ? (
                  <a
                    href={publication.backgroundDataUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                  >
                    Bakgrunnstall
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Card>
    ),
    [],
  );

  const renderTabPanels = () => {
    const publications = summary?.publications ?? [];

    if (activeTab === "market") {
      return (
        <>
          <ForecastPanel summary={summary} />
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Tidsserie</div>
              <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Produksjon og investeringer</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Linjen følger valgt produkt og visningsenhet. Søylene viser historiske investeringer.
              </p>
              <div className="mt-5">
                <SimpleTimeseriesChart points={timeseries} view={selectedView} unit={selectedMetricUnit} />
              </div>
            </Card>

            <Card className="p-5">
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Markedssammendrag</div>
              <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Konsentrasjon og reserver</h2>
              <div className="mt-5 space-y-4">
                {summary?.operatorConcentration.map((row) => (
                  <div key={row.operatorName} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-800">{row.operatorName}</span>
                      <span className="text-slate-500">
                        {formatRateOrVolume(row.latestProductionValue, row.latestProductionUnit)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#E6ECF1]">
                      <div
                        className="h-full rounded-full bg-[#31495f]"
                        style={{
                          width: `${Math.min(100, ((row.oe ?? 0) / operatorMax) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
                <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] p-4 text-sm leading-6 text-slate-600">
                  Recoverable OE: {formatOe(summary?.benchmark.selectedRecoverableOe)}
                  <br />
                  Historiske investeringer: {formatCompactNok(summary?.benchmark.selectedHistoricalInvestmentsNok)}
                  <br />
                  Forventede investeringer: {formatCompactNok(summary?.benchmark.selectedFutureInvestmentsNok)}
                </div>
              </div>
            </Card>
          </div>
          {renderCompareSection()}
          {renderTableSection()}
          {renderPublicationsSection("Rapportgrunnlag for marked", publications)}
        </>
      );
    }

    if (activeTab === "exploration") {
      return (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Leting & funn</div>
              <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Funn nær infrastruktur</h2>
              <div className="mt-5 space-y-3">
                {discoveryFeatures.slice(0, 10).map((feature) => (
                  <div key={feature.id} className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">{feature.name}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      {feature.area ?? "Område ikke tilgjengelig"} · {feature.status ?? "Status ikke tilgjengelig"}
                    </div>
                  </div>
                ))}
                {discoveryFeatures.length === 0 ? (
                  <div className="text-sm text-slate-500">Ingen funn er tilgjengelige i gjeldende utsnitt.</div>
                ) : null}
              </div>
            </Card>
            <Card className="p-5">
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Lisenssignal</div>
              <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Modenhet og overføringer</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Bruk lisenslaget i kartet sammen med markedstabellen for å vurdere modne områder, Petreg-meldinger og
                aktivitet rundt funn som kan knyttes til eksisterende infrastruktur.
              </p>
              <div className="mt-5 rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] p-4 text-sm leading-6 text-slate-600">
                Aktive lisenser: {formatNumber(summary?.kpis.activeLicenceCount)}
                <br />
                Operatører i utvalget: {formatNumber(summary?.kpis.selectedOperatorCount)}
                <br />
                Regulatoriske hendelser: {formatNumber(summary?.kpis.recentEventCount)}
              </div>
            </Card>
          </div>
          {renderTableSection()}
          {renderPublicationsSection(
            "Sokkelåret og ressursgrunnlag",
            publications.filter((publication) => publication.category !== "MONTHLY_PRODUCTION"),
          )}
        </>
      );
    }

    if (activeTab === "wells") {
      return (
        <>
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Brønner & boring</div>
                <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Wellbore-aktivitet i kartutsnittet</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Slå på laget `Brønner` for å se wellbores i kartet. Listen under bygger på normaliserte SODIR-wellbores,
                  uten syntetisk berikelse.
                </p>
              </div>
              {!(filters.layers ?? []).includes("wellbores") ? (
                <button
                  type="button"
                  onClick={() => toggleArrayValue("layers", "wellbores")}
                  className="inline-flex items-center rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700"
                >
                  Vis brønner i kartet
                </button>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {wellboreFeatures.slice(0, 12).map((feature) => (
                <button
                  key={feature.id}
                  type="button"
                  onClick={() => handleSelectEntity(feature.entityType, feature.entityId)}
                  className="rounded-[1rem] border border-[rgba(15,23,42,0.08)] bg-white p-4 text-left"
                >
                  <div className="text-sm font-semibold text-slate-900">{feature.name}</div>
                  <div className="mt-2 text-sm text-slate-600">
                    {feature.status ?? "Status ikke tilgjengelig"} · {feature.area ?? "Område ikke tilgjengelig"}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Operatør: {feature.operator?.companyName ?? "Ikke tilgjengelig"}
                  </div>
                </button>
              ))}
            </div>
          </Card>
          {renderPublicationsSection("Rapporter og bakgrunnstall", publications)}
        </>
      );
    }

    if (activeTab === "infrastructure") {
      return (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Infrastruktur</div>
              <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Innretninger og TUF</h2>
              <div className="mt-5 space-y-3">
                {infrastructureFeatures.slice(0, 12).map((feature) => (
                  <button
                    key={feature.id}
                    type="button"
                    onClick={() => handleSelectEntity(feature.entityType, feature.entityId)}
                    className="w-full rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3 text-left"
                  >
                    <div className="text-sm font-semibold text-slate-900">{feature.name}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      {feature.status ?? feature.facilityKind ?? "Type ikke tilgjengelig"}
                    </div>
                  </button>
                ))}
              </div>
            </Card>
            <Card className="p-5">
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Nettverk</div>
              <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Tilknytning og modenhet</h2>
              <div className="mt-5 rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] p-4 text-sm leading-6 text-slate-600">
                Infrastruktur i utsnitt: {formatNumber(infrastructureFeatures.length)}
                <br />
                Funn i utsnitt: {formatNumber(discoveryFeatures.length)}
                <br />
                Kartet brukes som hovedflate for å se hvilke funn som ligger nær eksisterende anlegg og rør.
              </div>
            </Card>
          </div>
          {renderTableSection()}
        </>
      );
    }

    if (activeTab === "seismic") {
      return (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Seismikk & undersøkelser</div>
                  <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Surveydekning og borekontekst</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Denne fanen bruker åpne SODIR-surveys og wellbores som screeningflate for datadekning,
                    aktivitetsnivå og hvor det er naturlig å grave videre i letemodning.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!surveyLayerVisible ? (
                    <button
                      type="button"
                      onClick={() => toggleArrayValue("layers", "surveys")}
                      className="inline-flex items-center rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700"
                    >
                      Vis survey i kartet
                    </button>
                  ) : null}
                  {!wellboreLayerVisible ? (
                    <button
                      type="button"
                      onClick={() => toggleArrayValue("layers", "wellbores")}
                      className="inline-flex items-center rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700"
                    >
                      Vis brønner i kartet
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <KpiTile label="Survey i utsnitt" value={formatNumber(seismicSummary?.kpis.surveyCount)} />
                <KpiTile
                  label="Planlagt / pågående"
                  value={`${formatNumber(seismicSummary?.kpis.plannedSurveyCount)} / ${formatNumber(seismicSummary?.kpis.ongoingSurveyCount)}`}
                />
                <KpiTile
                  label="Wellbores"
                  value={formatNumber(seismicSummary?.kpis.wellboreCount)}
                  detail={`Exploration: ${formatNumber(seismicSummary?.kpis.explorationWellCount)}`}
                />
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <OptionChecklist
                  title="Surveykategori"
                  options={seismicSummary?.filterOptions.categories ?? []}
                  selectedValues={filters.surveyCategories ?? []}
                  onToggle={(value) => toggleArrayValue("surveyCategories", value)}
                />
                <OptionChecklist
                  title="Surveystatus"
                  options={seismicSummary?.filterOptions.statuses ?? []}
                  selectedValues={filters.surveyStatuses ?? []}
                  onToggle={(value) => toggleArrayValue("surveyStatuses", value)}
                />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="rounded-[0.95rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm text-slate-700">
                  <div className="mb-2 font-medium">Fra år</div>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="f.eks. 2020"
                    value={filters.surveyYearFrom ?? ""}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        surveyYearFrom: event.target.value ? Number(event.target.value) : undefined,
                        page: 0,
                      }))
                    }
                    className="w-full rounded-md border border-[rgba(15,23,42,0.12)] px-3 py-2 text-sm outline-none"
                  />
                </label>
                <label className="rounded-[0.95rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm text-slate-700">
                  <div className="mb-2 font-medium">Til år</div>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="f.eks. 2026"
                    value={filters.surveyYearTo ?? ""}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        surveyYearTo: event.target.value ? Number(event.target.value) : undefined,
                        page: 0,
                      }))
                    }
                    className="w-full rounded-md border border-[rgba(15,23,42,0.12)] px-3 py-2 text-sm outline-none"
                  />
                </label>
              </div>

              <div className="mt-4 rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] p-4 text-sm leading-6 text-slate-600">
                Siste surveyår i gjeldende utsnitt:{" "}
                <span className="font-semibold text-slate-900">
                  {seismicSummary?.kpis.latestSurveyYear ?? "Ikke tilgjengelig"}
                </span>
                <br />
                Surveyinventaret og footprintene kommer fra åpne SODIR-data. Kartlaget bruker offisielle
                survey-polygone fra FactMaps der SODIR publiserer geometri, mens inventaret fortsatt kan være
                større enn kartlaget for poster uten publisert polygon. På lav zoom viser kartet enklere
                survey-markører, og når du zoomer inn får du de fulle footprintene. Aktive survey-geometrier i kartet nå:{" "}
                <span className="font-semibold text-slate-900">{formatNumber(surveyMapFeatureCount)}</span>.
              </div>
            </Card>

            <Card className="p-5">
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Nylige objekter</div>
              <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Surveyinventar i utsnittet</h2>
              <div className="mt-5 space-y-3">
                {seismicRecentItems.map((item) => (
                  <button
                    key={`${item.entityType}:${item.entityId}`}
                    type="button"
                    onClick={() => handleSelectEntity(item.entityType, item.entityId)}
                    className="w-full rounded-[1rem] border border-[rgba(15,23,42,0.08)] bg-white p-4 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{item.name}</div>
                        <div className="mt-1 text-sm text-slate-600">
                          {[item.category, item.status, item.area].filter(Boolean).join(" · ") || "Ingen ekstra metadata"}
                        </div>
                      </div>
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        {item.year ?? "Ukjent år"}
                      </div>
                    </div>
                  </button>
                ))}
                {seismicRecentItems.length === 0 ? (
                  <div className="rounded-[0.95rem] border border-dashed border-[rgba(15,23,42,0.14)] bg-[#F8FAFC] p-4 text-sm text-slate-500">
                    Ingen surveys eller wellbores matcher gjeldende utsnitt og filtre ennå.
                  </div>
                ) : null}
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Survey inventory</div>
                <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Surveys og brønner i samme arbeidsflate</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Tabellen under er normalisert fra åpne SODIR-data og er ment som screening for dekning,
                  aktivitet og nærliggende borekontekst.
                </p>
              </div>
              <div className="text-sm text-slate-500">
                {seismicTable ? `${formatNumber(seismicTable.total)} rader` : "Laster inventar..."}
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                    <th className="border-b border-[rgba(15,23,42,0.08)] px-3 py-3">Objekt</th>
                    <th className="border-b border-[rgba(15,23,42,0.08)] px-3 py-3">Type</th>
                    <th className="border-b border-[rgba(15,23,42,0.08)] px-3 py-3">Status</th>
                    <th className="border-b border-[rgba(15,23,42,0.08)] px-3 py-3">Område</th>
                    <th className="border-b border-[rgba(15,23,42,0.08)] px-3 py-3">Operatør</th>
                    <th className="border-b border-[rgba(15,23,42,0.08)] px-3 py-3">r</th>
                    <th className="border-b border-[rgba(15,23,42,0.08)] px-3 py-3">Dybde / felt</th>
                  </tr>
                </thead>
                <tbody>
                  {seismicRows.map((row) => (
                    <tr key={`${row.entityType}:${row.entityId}`} className="text-sm text-slate-700">
                      <td className="border-b border-[rgba(15,23,42,0.06)] px-3 py-3">
                        <button
                          type="button"
                          onClick={() => handleSelectEntity(row.entityType, row.entityId)}
                          className="font-semibold text-slate-900 hover:text-slate-700"
                        >
                          {row.name}
                        </button>
                      </td>
                      <td className="border-b border-[rgba(15,23,42,0.06)] px-3 py-3">
                        {row.entityType === "SURVEY" ? row.category ?? "Survey" : row.category ?? "Brønn"}
                      </td>
                      <td className="border-b border-[rgba(15,23,42,0.06)] px-3 py-3">{row.status ?? "Ikke tilgjengelig"}</td>
                      <td className="border-b border-[rgba(15,23,42,0.06)] px-3 py-3">{row.area ?? "Ikke tilgjengelig"}</td>
                      <td className="border-b border-[rgba(15,23,42,0.06)] px-3 py-3">
                        {row.operatorName ?? "Ikke tilgjengelig"}
                      </td>
                      <td className="border-b border-[rgba(15,23,42,0.06)] px-3 py-3">{row.year ?? "Ukjent"}</td>
                      <td className="border-b border-[rgba(15,23,42,0.06)] px-3 py-3">
                        {row.entityType === "WELLBORE"
                          ? [row.relatedFieldName, row.totalDepth ? formatMeters(row.totalDepth) : null]
                              .filter(Boolean)
                              .join(" · ") || "Ikke tilgjengelig"
                          : row.relatedFieldName ?? "Ikke tilgjengelig"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {seismicRows.length === 0 ? (
                <div className="rounded-[0.95rem] border border-dashed border-[rgba(15,23,42,0.14)] bg-[#F8FAFC] p-4 text-sm text-slate-500">
                  Ingen rader er tilgjengelige for gjeldende kombinasjon av utsnitt og seismikkfiltre.
                </div>
              ) : null}
            </div>
          </Card>
          {renderPublicationsSection("Rapporter og bakgrunnstall", publications)}
        </>
      );
    }

    if (activeTab === "seabed") {
      return (
        <>
          <Card className="p-5">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Havbunn & nye næringer</div>
            <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Publikasjonsgrunnlag først</h2>
            <div className="mt-4 rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] p-4 text-sm leading-6 text-slate-600">
              Vi viser foreløpig rapport- og begrepsgrunnlaget for havbunn, CO2 og nye næringer mens egne objektlag fra
              SODIR bygges inn som separate domeneobjekter. Kartet beholdes, men vi fyller ikke denne fanen med
              uverifisert eller syntetisk innhold.
            </div>
          </Card>
          {renderPublicationsSection("Sokkelåret og ressursgrunnlag", publications)}
        </>
      );
    }

    if (activeTab === "companies") {
      return (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Operatører</div>
              <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Operatørbilde</h2>
              <div className="mt-5 space-y-4">
                {summary?.operatorConcentration.map((row) => (
                  <div key={row.operatorName} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-800">{row.operatorName}</span>
                      <span className="text-slate-500">
                        {formatRateOrVolume(row.latestProductionValue, row.latestProductionUnit)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">{formatNumber(row.fieldCount)} felt</div>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-5">
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Rettigheter</div>
              <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Toppeksponering</h2>
              <div className="mt-5 space-y-3">
                {(summary?.topFields ?? []).slice(0, 8).map((field) => (
                  <button
                    key={field.entityId}
                    type="button"
                    onClick={() => handleSelectEntity("FIELD", field.entityId)}
                    className="w-full rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3 text-left"
                  >
                    <div className="text-sm font-semibold text-slate-900">{field.name}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      {field.operatorName ?? "Operatør ikke tilgjengelig"} · {field.area ?? "Område ikke tilgjengelig"}
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          </div>
          {renderCompareSection()}
          {renderTableSection()}
        </>
      );
    }

    if (activeTab === "events") {
      return (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Hendelser</div>
              <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Regulatorisk og operasjonelt</h2>
              <div className="mt-5 space-y-3">
                {marketEvents.slice(0, 12).map((event) => (
                  <div key={event.id} className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">{event.title}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.08em] text-slate-500">{event.source}</div>
                    <div className="mt-2 text-sm leading-6 text-slate-600">
                      {event.summary ?? "Ingen sammendrag tilgjengelig."}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-5">
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Gassco sanntid</div>
              <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Nomineringer</h2>
              <div className="mt-5 space-y-3">
                {gasscoRealtimeEvents.slice(0, 12).map((event) => (
                  <div key={event.id} className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">{event.title}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.08em] text-slate-500">
                      {event.publishedAt ? `Oppdatert ${formatDate(event.publishedAt)}` : "Sanntidsfeed"}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-600">
                      {event.summary ?? "Ingen sanntidsoppsummering tilgjengelig."}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      );
    }

    return (
      <Card className="p-5">
        <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Begreper</div>
        <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Hvordan ting henger sammen</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Begrepsfanen forklarer sentrale petroleumstermer og hvordan de henger sammen med kartlag, tidsserier og
          forecast.
        </p>
        <div className="mt-5">
          <ConceptGrid concepts={PETROLEUM_CONCEPTS} />
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-0 border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.82)] xl:grid-cols-[minmax(0,1.25fr),340px]">
        <div className="p-8">
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Markedsanalyse</div>
          <h1 className="editorial-display mt-5 max-w-4xl text-[3rem] leading-[0.98] text-slate-950 sm:text-[4rem]">
            Norsk sokkel i ett arbeidsrom.
          </h1>
          <p className="mt-4 max-w-3xl text-[1.02rem] leading-8 text-slate-600">
            Kart, produksjonsserier, reserver, investeringer og regulatoriske hendelser for felt,
            lisenser, innretninger og hovedinfrastruktur.
          </p>
        </div>
        <aside className="border-t border-[rgba(15,23,42,0.08)] bg-[#182535] p-8 text-white xl:border-l xl:border-t-0">
          <div className="data-label text-[11px] font-semibold uppercase text-white/60">Premium analyseflate</div>
          <div className="mt-4 text-[1.45rem] font-semibold leading-tight">
            {premium ? "Premium-tilgang aktiv" : "Preview-modus"}
          </div>
          <p className="mt-4 text-sm leading-7 text-white/78">
            {premium
              ? "Du ser den fulle markedsflaten med SODIR-masterdata, tidsserier og overlays."
              : "Visningen er aktiv, men er tydelig merket som premium-modul i denne første versjonen."}
          </p>
          <div className="hidden mt-5 rounded-[1rem] border border-white/10 bg-white/10 p-4 text-sm leading-6 text-white/82">
            Gassco-overlay er koblet ærlig som utilgjengelig når UMM ikke lar seg hente stabilt maskinelt.
          </div>
          <div className="mt-5 rounded-[1rem] border border-white/10 bg-white/10 p-4 text-sm leading-6 text-white/82">
            Gassco sanntidsnomineringer hentes nå fra direkte Atom-feed. Full UMM-dekning holdes fortsatt
            konservativ til feedene er stabile over tid.
          </div>
        </aside>
      </section>

      <MarketTabNav activeTab={activeTab} onSelectTab={handleSelectTab} />

      {error ? (
        <div className="rounded-[1rem] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">{error}</div>
      ) : null}

      <section className="grid gap-4 rounded-[1rem] border border-[rgba(15,23,42,0.08)] bg-white p-5 xl:grid-cols-[1.6fr,1fr]">
        <div>
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Analysemodus</div>
          <div className="mt-3 flex flex-wrap gap-3">
            <SegmentedControl
              value={selectedProduct}
              onChange={handleSelectProduct}
              options={(
                ["oe", "oil", "gas", "liquids", "condensate", "ngl", "producedWater"] as PetroleumProductSeries[]
              ).map((product) => ({
                value: product,
                label: PETROLEUM_PRODUCT_LABELS[product],
              }))}
            />
            <SegmentedControl
              value={selectedView}
              onChange={handleSelectView}
              options={(
                ["volume", "rate"] as PetroleumMetricView[]
              ).map((view) => ({
                value: view,
                label: PETROLEUM_VIEW_LABELS[view],
              }))}
            />
            <SegmentedControl
              value={selectedComparison}
              onChange={handleSelectComparison}
              options={(
                ["none", "yoy", "ytd", "forecast"] as PetroleumTimeSeriesComparison[]
              ).map((comparison) => ({
                value: comparison,
                label: PETROLEUM_COMPARISON_LABELS[comparison],
              }))}
            />
          </div>
        </div>
        <div className="rounded-[1rem] border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Nå valgt</div>
          <div className="mt-2 text-lg font-semibold text-slate-950">{selectedMetricLabel}</div>
          <div className="mt-2 text-sm leading-6 text-slate-600">
            {selectedView === "rate"
              ? "Dagrate gjør det enklere å sammenligne tempo mot fjoråret før året er ferdig."
              : "Volum viser offisielle rapporterte mengder fra SODIR som grunnlag for marked og forecast."}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[260px,minmax(0,1.35fr),300px]">
        <Card className={cn("h-fit p-5", isMapExpanded && "hidden")}>
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Filtre</div>
          <div className="mt-4 space-y-3">
            <input
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="Søk etter felt, lisens eller innretning"
              className="w-full rounded-[0.9rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]"
            />

            <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3">
              <div className="text-sm font-medium text-slate-700">Kartlag</div>
              <div className="mt-3 space-y-2">
                {[...DEFAULT_PETROLEUM_LAYERS, ...OPTIONAL_PETROLEUM_LAYERS].map((layer) => (
                  <label key={layer} className="flex items-start gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={(filters.layers ?? []).includes(layer)}
                      onChange={() => toggleArrayValue("layers", layer)}
                      className="mt-1 h-4 w-4 rounded border-[rgba(15,23,42,0.18)]"
                    />
                    <span>{PETROLEUM_LAYER_LABELS[layer]}</span>
                  </label>
                ))}
              </div>
            </div>

            <OptionChecklist
              title="Status"
              options={summary?.filterOptions.statuses ?? []}
              selectedValues={filters.status ?? []}
              onToggle={(value) => toggleArrayValue("status", value)}
            />
            <OptionChecklist
              title="Områder"
              options={summary?.filterOptions.areas ?? []}
              selectedValues={filters.areas ?? []}
              onToggle={(value) => toggleArrayValue("areas", value)}
            />
            <OptionChecklist
              title="Operatører"
              options={summary?.filterOptions.operators ?? []}
              selectedValues={filters.operatorIds ?? []}
              onToggle={(value) => toggleArrayValue("operatorIds", value)}
            />
            <OptionChecklist
              title="Rettighetshavere"
              options={summary?.filterOptions.licensees ?? []}
              selectedValues={filters.licenseeIds ?? []}
              onToggle={(value) => toggleArrayValue("licenseeIds", value)}
            />
            <OptionChecklist
              title="Hydrokarbon"
              options={summary?.filterOptions.hcTypes ?? []}
              selectedValues={filters.hcTypes ?? []}
              onToggle={(value) => toggleArrayValue("hcTypes", value)}
            />

            <button
              type="button"
              onClick={() =>
                setFilters((current) => ({
                  layers: DEFAULT_PETROLEUM_LAYERS,
                  bbox: current.bbox ?? null,
                  tab: current.tab ?? PETROLEUM_DEFAULT_TAB,
                  product: current.product ?? PETROLEUM_DEFAULT_PRODUCT,
                  view: current.view ?? PETROLEUM_DEFAULT_VIEW,
                  comparison: current.comparison ?? PETROLEUM_DEFAULT_COMPARISON,
                  tableMode: "fields",
                  page: 0,
                  size: 15,
                }))
              }
              className="w-full rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-5 py-3 text-sm font-semibold text-slate-800"
            >
              Nullstill filtre
            </button>
          </div>
        </Card>

        <div className={cn("space-y-6", isMapExpanded && "xl:col-span-3")}>
          {isOverviewTab && !isMapExpanded ? (
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              {activeTab === "market" ? (
                <>
                  <KpiTile label="Aktive felt" value={formatNumber(summary?.kpis.activeFieldCount)} />
                  <KpiTile label="Aktive lisenser" value={formatNumber(summary?.kpis.activeLicenceCount)} />
                  <KpiTile
                    label={selectedView === "rate" ? "Produksjonstakt" : "Produksjon"}
                    value={formatMetricHeadline(
                      summary?.kpis.selectedLatestProductionValue,
                      selectedMetricUnit,
                      summary?.kpis.selectedLatestProductionOe,
                    )}
                    detail={selectedMetricLabel}
                  />
                  <KpiTile label="YoY YTD" value={formatDeltaPercent(summary?.kpis.yoyYtdDeltaPercent)} />
                  <KpiTile label="Måned vs i fjor" value={formatDeltaPercent(summary?.kpis.currentMonthVsLastYearPercent)} />
                  <KpiTile label="Forecast-avvik" value={formatDeltaPercent(summary?.kpis.forecastDeviationPercent)} />
                </>
              ) : activeTab === "wells" ? (
                <>
                  <KpiTile label="Brønner i utsnitt" value={formatNumber(wellboreFeatures.length)} />
                  <KpiTile label="Aktive felt" value={formatNumber(summary?.kpis.activeFieldCount)} />
                  <KpiTile label="Hendelser" value={formatNumber(summary?.kpis.recentEventCount)} />
                </>
              ) : activeTab === "infrastructure" ? (
                <>
                  <KpiTile label="Infrastruktur" value={formatNumber(infrastructureFeatures.length)} />
                  <KpiTile label="Aktive lisenser" value={formatNumber(summary?.kpis.activeLicenceCount)} />
                  <KpiTile label="Operatører" value={formatNumber(summary?.kpis.selectedOperatorCount)} />
                </>
              ) : activeTab === "seismic" ? (
                <>
                  <KpiTile label="Survey i utsnitt" value={formatNumber(seismicSummary?.kpis.surveyCount)} />
                  <KpiTile label="Pågående" value={formatNumber(seismicSummary?.kpis.ongoingSurveyCount)} />
                  <KpiTile label="Wellbores" value={formatNumber(seismicSummary?.kpis.wellboreCount)} />
                </>
              ) : activeTab === "companies" ? (
                <>
                  <KpiTile label="Operatører" value={formatNumber(summary?.kpis.selectedOperatorCount)} />
                  <KpiTile label="Aktive felt" value={formatNumber(summary?.kpis.activeFieldCount)} />
                  <KpiTile
                    label="Produksjon"
                    value={formatMetricHeadline(
                      summary?.kpis.selectedLatestProductionValue,
                      selectedMetricUnit,
                      summary?.kpis.selectedLatestProductionOe,
                    )}
                  />
                </>
              ) : activeTab === "events" ? (
                <>
                  <KpiTile label="Hendelser 12 mnd" value={formatNumber(summary?.kpis.recentEventCount)} />
                  <KpiTile label="Gassco sanntid" value={formatNumber(gasscoRealtimeEvents.length)} />
                  <KpiTile label="vrige hendelser" value={formatNumber(marketEvents.length)} />
                </>
              ) : (
                <>
                  <KpiTile label="Aktive felt" value={formatNumber(summary?.kpis.activeFieldCount)} />
                  <KpiTile label="Aktive lisenser" value={formatNumber(summary?.kpis.activeLicenceCount)} />
                  <KpiTile label="Operatører" value={formatNumber(summary?.kpis.selectedOperatorCount)} />
                </>
              )}
            </div>
          ) : null}

          {isOverviewTab && isMapExpanded ? (
            <button
              type="button"
              aria-label="Lukk kartfokus"
              onClick={() => setIsMapExpanded(false)}
              className="fixed inset-0 z-40 bg-[rgba(15,23,42,0.42)] backdrop-blur-[2px]"
            />
          ) : null}

          <Card
            className={cn(
              "overflow-hidden p-0",
              !isOverviewTab && "hidden",
              isMapExpanded &&
                "fixed inset-4 z-50 max-h-[calc(100vh-2rem)] overflow-hidden border-[rgba(15,23,42,0.18)] shadow-[0_28px_90px_rgba(15,23,42,0.28)]",
            )}
          >
            <div className="border-b border-[rgba(15,23,42,0.08)] px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Interaktivt kart</div>
                  <div className="mt-2 text-sm text-slate-600">
                    {isMapDrivingResults
                      ? `Kartet styrer analysen. Viser ${formatNumber(features.length)} objekter i gjeldende utsnitt.`
                      : "Panorer og zoom for å avgrense hele analysesiden til valgt kartutsnitt."}
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(15,23,42,0.1)] bg-[#F8FAFC] px-3 py-2 text-xs font-semibold text-slate-600">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-full",
                      loading ? "bg-amber-500" : "bg-emerald-500",
                    )}
                  />
                  {loading ? "Oppdaterer utsnitt" : "Utsnitt synkronisert"}
                </div>
                <button
                  type="button"
                  onClick={handleResetViewport}
                  className="inline-flex items-center rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-[#F8FAFC]"
                >
                  Nullstill utsnitt
                </button>
                <button
                  type="button"
                  onClick={() => setIsMapExpanded((current) => !current)}
                  className="inline-flex items-center rounded-full border border-[rgba(15,23,42,0.12)] bg-[#172535] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#223246]"
                >
                  {isMapExpanded ? "Lukk kartfokus" : "Ekspander kart"}
                </button>
              </div>
            </div>
            <div className="relative">
              <OilGasMap
                features={features}
                selectedEntityKey={selectedEntityKey}
                onSelectEntity={handleSelectEntity}
                onViewportChange={handleViewportChange}
                targetBbox={filters.bbox ?? null}
                resetViewNonce={resetViewNonce}
                className={cn(
                  "w-full bg-[#E8EEF2]",
                  isMapExpanded ? "h-[72vh] xl:h-[78vh]" : "h-[62vh] xl:h-[78vh]",
                )}
              />
              {selectedEntityKey ? (
                <div className="absolute bottom-4 left-4 z-[2] w-[20rem] max-w-[calc(100%-2rem)] rounded-[1rem] border border-white/80 bg-white/95 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.14)] backdrop-blur">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="data-label text-[10px] font-semibold uppercase text-slate-500">Kartinspektør</div>
                      <div className="mt-2 text-lg font-semibold text-slate-950">
                        {detail?.name ?? selectedFeature?.name ?? "Valgt objekt"}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {detail?.status ?? selectedFeature?.status ?? "Status ikke tilgjengelig"} ·{" "}
                        {detail?.area ?? selectedFeature?.area ?? "Område ikke tilgjengelig"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedEntityKey(null)}
                      className="rounded-full border border-[rgba(15,23,42,0.1)] px-2.5 py-1 text-xs font-semibold text-slate-600"
                    >
                      Lukk
                    </button>
                  </div>
                  {selectedEntityType === "SURVEY" || selectedEntityType === "WELLBORE" ? (
                    <div className="mt-4 space-y-2 rounded-[0.85rem] border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] p-3 text-sm text-slate-700">
                      {compactInspectorRows.length > 0 ? (
                        compactInspectorRows.map((row) => (
                          <div key={row.label}>
                            {row.label}: {row.value}
                          </div>
                        ))
                      ) : (
                        <div>Ingen objekttilpassede nøkkeltall tilgjengelig ennå.</div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 space-y-2 rounded-[0.85rem] border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] p-3 text-sm text-slate-700">
                    <div>Operatør: {detail?.operator?.companyName ?? selectedFeature?.operator?.companyName ?? "Ikke tilgjengelig"}</div>
                    <div>Hydrokarbon: {detail?.hcType ?? selectedFeature?.hcType ?? "Ikke tilgjengelig"}</div>
                    <div>
                      {selectedMetricLabel}:{" "}
                      {formatRateOrVolume(
                        selectedFeature?.selectedProductionValue ??
                          (selectedView === "rate"
                            ? detail?.timeseries.at(-1)?.selectedRate ?? null
                            : detail?.timeseries.at(-1)?.selectedValue ?? detail?.timeseries.at(-1)?.oe ?? null),
                        selectedFeature?.selectedProductionUnit ?? detail?.timeseries.at(-1)?.selectedUnit ?? selectedMetricUnit,
                      )}
                    </div>
                    <div>Gjenværende: {formatOe(detail?.reserve?.remainingOe ?? selectedFeature?.remainingOe ?? null)}</div>
                    <div>Forv. investering: {formatCompactNok(detail?.investment?.expectedFutureInvestmentNok ?? selectedFeature?.expectedFutureInvestmentNok ?? null)}</div>
                    </div>
                  )}
                  {detail?.concepts?.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {detail.concepts.slice(0, 3).map((concept) => (
                        <button
                          key={concept.id}
                          type="button"
                          onClick={() => handleSelectTab("concepts")}
                          className="inline-flex items-center rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                        >
                          {concept.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {detail?.factPageUrl || selectedFeature?.factPageUrl ? (
                      <a
                        href={detail?.factPageUrl ?? selectedFeature?.factPageUrl ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                      >
                        FactPage
                      </a>
                    ) : null}
                    {detail?.factMapUrl || selectedFeature?.factMapUrl ? (
                      <a
                        href={detail?.factMapUrl ?? selectedFeature?.factMapUrl ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                      >
                        Faktakart
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}
                {loading ? (
                  <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/70 bg-white/92 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
                    Oppdaterer kart og analyser
                  </div>
              ) : null}
            </div>
            <div className="border-t border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] px-5 py-4">
              {isMapExpanded ? (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Kartfokus aktiv</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Resten av analyseflaten er skjult mens du jobber i kartet.
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleExportTable}
                      className="inline-flex items-center rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700"
                    >
                      {isExporting ? "Eksporterer CSV..." : "Eksporter CSV"}
                    </button>
                    <div className="inline-flex items-center rounded-full border border-[rgba(15,23,42,0.1)] bg-[#F8FAFC] px-3 py-2 text-xs font-semibold text-slate-600">
                      {compareMode === "field" ? "Feltsammenligning" : "Operatørsammenligning"}:{" "}
                      {formatNumber(compareSummaryCount)} valgt
                    </div>
                    {selectedEntityKey ? (
                      <button
                        type="button"
                        onClick={() => setSelectedEntityKey(null)}
                        className="inline-flex items-center rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700"
                      >
                        Lukk valgt objekt
                      </button>
                    ) : null}
                  </div>
                  {mapFocusSelectionLabels.length > 0 ? (
                    <div className="flex w-full flex-wrap gap-2">
                      {mapFocusSelectionLabels.map((label) => (
                        <div
                          key={label}
                          className="inline-flex items-center rounded-full border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] px-3 py-2 text-xs font-medium text-slate-700"
                        >
                          {label}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Aktive lag</div>
                <div className="text-xs text-slate-500">
                  {isMapDrivingResults ? "Gjeldende kartutsnitt" : "Hele standardutsnittet"}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2.5">
                {activeLayerCounts.map(({ layerId, count }) => (
                  <div
                    key={layerId}
                    className="inline-flex items-center gap-2 rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2 text-xs font-medium text-slate-700"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: LAYER_SWATCHS[layerId] }}
                    />
                    <span>{PETROLEUM_LAYER_LABELS[layerId]}</span>
                    <span className="text-slate-500">{formatNumber(count)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                <div className="flex items-center gap-2 rounded-[0.85rem] border border-[rgba(15,23,42,0.08)] bg-white px-3 py-2">
                  <span className="h-2.5 w-5 rounded-sm bg-[#165d52]/70" />
                  Felt, funn og survey-flater
                </div>
                <div className="flex items-center gap-2 rounded-[0.85rem] border border-[rgba(15,23,42,0.08)] bg-white px-3 py-2">
                  <span className="h-2.5 w-5 rounded-sm border border-dashed border-[#2f5d8a]" />
                  Lisenspolygoner
                </div>
                <div className="flex items-center gap-2 rounded-[0.85rem] border border-[rgba(15,23,42,0.08)] bg-white px-3 py-2">
                  <span className="relative flex h-4 w-6 items-center justify-center">
                    <span className="h-3.5 w-3.5 rounded-full bg-[#9b2226]" />
                    <span className="absolute inset-0 rounded-full border border-white/80" />
                  </span>
                  Enkelte innretninger og clusterbobler
                </div>
                <div className="flex items-center gap-2 rounded-[0.85rem] border border-[rgba(15,23,42,0.08)] bg-white px-3 py-2">
                  <span className="h-0.5 w-6 bg-[#14213d]" />
                  TUF og hovedrørledninger
                </div>
                <div className="flex items-center gap-2 rounded-[0.85rem] border border-[rgba(15,23,42,0.08)] bg-white px-3 py-2">
                  <span className="relative flex h-4 w-6 items-center justify-center">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#0f766e]" />
                    <span className="absolute h-4 w-4 rounded-full border border-[#0f766e]/30" />
                  </span>
                  Wellbores og borepunkter
                </div>
              </div>
            </div>
          </Card>

          {!isMapExpanded && !isOverviewTab ? renderTabPanels() : null}
        </div>

        <div className={cn("space-y-6", (isMapExpanded || !isOverviewTab) && "hidden")}>
          <Card className="p-5">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Detaljpanel</div>
            {!detail ? (
              <div className="mt-4 text-sm leading-7 text-slate-600">
                Velg et objekt i kartet for å se produksjon, survey- eller brønnkontekst,
                reserver, investeringer og tilknyttede selskaper.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-[1.4rem] font-semibold text-slate-950">{detail.name}</div>
                  <div className="mt-1 text-sm text-slate-500">
                    {detail.status ?? "Status ikke tilgjengelig"} · {detail.area ?? "Område ikke tilgjengelig"}
                  </div>
                </div>
                <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] p-4 text-sm leading-6 text-slate-700">
                  Selskap: {detail.operator?.companyName ?? "Ikke tilgjengelig"}
                  <br />
                  Hydrokarbon: {detail.hcType ?? "Ikke tilgjengelig"}
                  <br />
                  Reserver: {formatOe(detail.reserve?.remainingOe)}
                  <br />
                  Forventet investering: {formatCompactNok(detail.investment?.expectedFutureInvestmentNok)}
                </div>
                {detailMetadataEntries.length > 0 ? (
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Fagmetadata</div>
                    <div className="mt-2 grid gap-2">
                      {detailMetadataEntries.map(([key, value]) => (
                        <div
                          key={key}
                          className="rounded-[0.85rem] border border-[rgba(15,23,42,0.08)] bg-white px-3 py-2 text-sm text-slate-700"
                        >
                          <span className="font-medium text-slate-900">{key}</span>: {formatDetailMetadataValue(value)}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div>
                  <div className="text-sm font-semibold text-slate-800">Rettighetshavere</div>
                  <div className="mt-2 space-y-2">
                    {detail.licensees.length === 0 ? (
                      <div className="text-sm text-slate-500">Ingen lisensandeler tilgjengelig.</div>
                    ) : (
                      detail.licensees.map((licensee, index) => (
                        <div key={`${licensee.companyName}-${index}`} className="rounded-[0.85rem] border border-[rgba(15,23,42,0.08)] bg-white px-3 py-2 text-sm text-slate-700">
                          {licensee.companyName ?? "Ukjent"} · {licensee.share ?? ""}%
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Datakilder</div>
            <div className="mt-4 space-y-3">
              {summary?.sourceStatus.map((source) => (
                <div key={source.source} className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-slate-900">{source.source}</div>
                    <span className={cn("text-xs font-semibold uppercase", source.available ? "text-emerald-700" : "text-amber-700")}>
                      {source.available ? "Aktiv" : "Begrenset"}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {source.message ?? `Sist oppdatert ${source.lastSuccessAt ? formatDate(source.lastSuccessAt) : "ikke tilgjengelig"}`}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {gasscoRealtimeEvents.length > 0 ? (
            <Card className="p-5">
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Gassco Sanntid</div>
              <div className="mt-4 space-y-3">
                {gasscoRealtimeEvents.slice(0, 10).map((event) => (
                  <div key={event.id} className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">{event.title}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.08em] text-slate-500">
                      {event.publishedAt ? `Oppdatert ${formatDate(event.publishedAt)}` : "Sanntidsfeed"}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-600">
                      {event.summary ?? "Ingen sanntidssammendrag tilgjengelig."}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card className="p-5">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Hendelser</div>
            <div className="mt-4 space-y-3">
              {marketEvents.slice(0, 8).map((event) => (
                <div key={event.id} className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3">
                  <div className="text-sm font-semibold text-slate-900">{event.title}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.08em] text-slate-500">{event.source}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-600">{event.summary ?? "Ingen sammendrag tilgjengelig."}</div>
                </div>
              ))}
              {marketEvents.length === 0 ? (
                <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3 text-sm text-slate-500">
                  Ingen regulatoriske eller lisensrelaterte hendelser tilgjengelig for gjeldende utsnitt.
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
