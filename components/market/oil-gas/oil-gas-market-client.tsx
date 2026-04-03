"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { OilGasMap } from "@/components/market/oil-gas/oil-gas-map";
import { Card } from "@/components/ui/card";
import {
  DEFAULT_PETROLEUM_LAYERS,
  OPTIONAL_PETROLEUM_LAYERS,
  PETROLEUM_LAYER_LABELS,
  PETROLEUM_TABLE_MODE_LABELS,
  buildPetroleumSearchParams,
  parsePetroleumFilters,
} from "@/lib/petroleum-market";
import {
  PetroleumEntityDetail,
  PetroleumEventRow,
  PetroleumBbox,
  PetroleumFilterOption,
  PetroleumMapFeature,
  PetroleumMarketFilters,
  PetroleumLayerId,
  PetroleumSummaryResponse,
  PetroleumTableRow,
  PetroleumTableResponse,
  PetroleumTimeSeriesPoint,
} from "@/lib/types";
import { cn, formatDate, formatNumber } from "@/lib/utils";

const LAYER_SWATCHS: Record<PetroleumLayerId, string> = {
  fields: "#165d52",
  discoveries: "#bc6c25",
  licences: "#2f5d8a",
  facilities: "#9b2226",
  tuf: "#14213d",
  surveys: "#6b7280",
  regulatoryEvents: "#7c3aed",
  gasscoEvents: "#2563eb",
};

const COMPARE_COLORS = ["#165d52", "#2f5d8a", "#bc6c25"] as const;
const MAX_COMPARE_ITEMS = 3;

type CompareMode = "field" | "operator";
type FieldTableRow = Extract<PetroleumTableRow, { mode: "fields" }>;
type OperatorTableRow = Extract<PetroleumTableRow, { mode: "operators" }>;

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

function formatAreaSqKm(value?: number | null) {
  if (value === null || value === undefined) return "Ikke tilgjengelig";
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 }).format(value)} km²`;
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
      "Produksjon (mill. oe)",
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
        item.latestProductionOe,
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
    "Produksjon (mill. oe)",
    "Gjenværende (mill. oe)",
  ];
  const rows = table.items.map((row) => {
    const item = row as OperatorTableRow;
    return [
      item.operatorName,
      item.operatorOrgNumber,
      item.fieldCount,
      item.licenceCount,
      item.latestProductionOe,
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
    layers: filters.layers?.length ? filters.layers : DEFAULT_PETROLEUM_LAYERS,
    tableMode: filters.tableMode ?? "fields",
    page: filters.page ?? 0,
    size: filters.size ?? 15,
  };
}

async function fetchApi<T>(url: string) {
  const response = await fetch(url);
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

function SimpleTimeseriesChart({ points }: { points: PetroleumTimeSeriesPoint[] }) {
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
  const maxOe = Math.max(...ordered.map((point) => point.oe ?? 0), 1);
  const maxInvestments = Math.max(...ordered.map((point) => point.investments ?? 0), 1);
  const step = plotWidth / Math.max(ordered.length - 1, 1);

  const linePath = ordered
    .map((point, index) => {
      const x = padding.left + step * index;
      const y = padding.top + plotHeight - ((point.oe ?? 0) / maxOe) * plotHeight;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <div className="overflow-x-auto border border-[rgba(15,23,42,0.08)] bg-white">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[18rem] w-full min-w-[640px]">
        <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} fill="#F8FAFC" />
        <path d={linePath} fill="none" stroke="#165d52" strokeWidth={2.5} />
        {ordered.map((point, index) => {
          const x = padding.left + step * index;
          const barHeight = ((point.investments ?? 0) / maxInvestments) * plotHeight;
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
                cy={padding.top + plotHeight - ((point.oe ?? 0) / maxOe) * plotHeight}
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

function CompareTimeseriesChart({ points }: { points: PetroleumTimeSeriesPoint[] }) {
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
    values.set(`${point.year}`, point.oe ?? 0);
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
  const [isViewportPending, startViewportTransition] = React.useTransition();
  const compareIds = compareMode === "field" ? compareFieldIds : compareOperatorIds;
  const handleSelectEntity = React.useCallback((entityType: string, entityId: string) => {
    setSelectedEntityKey(`${entityType}:${entityId}`);
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
    setFilters((current) => ({ ...current, query: deferredQuery || undefined, page: 0 }));
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

    lastUrlWriteRef.current = nextSearch;
    router.replace((nextSearch ? `${pathname}?${nextSearch}` : pathname) as never, { scroll: false });
  }, [filters, pathname, queryInput, router, searchParamsString, selectedEntityKey]);

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      startViewportTransition(() => {
        setFilters((current) => {
          if (sameBbox(current.bbox ?? null, viewportBbox)) {
            return current;
          }

          return {
            ...current,
            bbox: viewportBbox,
            page: 0,
          };
        });
      });
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [viewportBbox]);

  React.useEffect(() => {
    const params = buildPetroleumSearchParams(filters);
    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;

    async function load() {
      setLoading(true);
      setError(null);

      const summaryPromise = fetchApi<PetroleumSummaryResponse>(`/api/market/oil-gas/summary?${params.toString()}`)
        .then((value) => {
          if (
            isMountedRef.current &&
            requestId >= lastAppliedRequestRef.current.summary
          ) {
            setSummary(value);
            lastAppliedRequestRef.current.summary = requestId;
          }

          return { ok: true as const };
        })
        .catch(() => ({ ok: false as const }));

      const featuresPromise = fetchApi<PetroleumMapFeature[]>(`/api/market/oil-gas/features?${params.toString()}`)
        .then((value) => {
          if (
            isMountedRef.current &&
            requestId >= lastAppliedRequestRef.current.features
          ) {
            setFeatures(value);
            lastAppliedRequestRef.current.features = requestId;
          }

          return { ok: true as const };
        })
        .catch(() => ({ ok: false as const }));

      const tablePromise = fetchApi<PetroleumTableResponse>(`/api/market/oil-gas/table?${params.toString()}`)
        .then((value) => {
          if (
            isMountedRef.current &&
            requestId >= lastAppliedRequestRef.current.table
          ) {
            setTable(value);
            lastAppliedRequestRef.current.table = requestId;
          }

          return { ok: true as const };
        })
        .catch(() => ({ ok: false as const }));

      const timeseriesPromise = fetchApi<PetroleumTimeSeriesPoint[]>(
        `/api/market/oil-gas/timeseries?${buildPetroleumSearchParams(filters, {
          entityType: "area",
          granularity: "year",
          measures: "oe,investments",
        }).toString()}`,
      )
        .then((value) => {
          if (
            isMountedRef.current &&
            requestId >= lastAppliedRequestRef.current.timeseries
          ) {
            setTimeseries(value);
            lastAppliedRequestRef.current.timeseries = requestId;
          }

          return { ok: true as const };
        })
        .catch(() => ({ ok: false as const }));

      const eventsPromise = fetchApi<PetroleumEventRow[]>(`/api/market/oil-gas/events?${params.toString()}&limit=40`)
        .then((value) => {
          if (
            isMountedRef.current &&
            requestId >= lastAppliedRequestRef.current.events
          ) {
            setEvents(value);
            lastAppliedRequestRef.current.events = requestId;
          }

          return { ok: true as const };
        })
        .catch(() => ({ ok: false as const }));

      const [summaryResult, featuresResult] = await Promise.all([summaryPromise, featuresPromise]);

      if (isMountedRef.current && requestId === latestRequestIdRef.current) {
        if (!summaryResult.ok && !featuresResult.ok) {
          setError("Kunne ikke laste olje- og gassmodulen.");
        }

        setLoading(false);
      }

      const [tableResult, timeseriesResult, eventsResult] = await Promise.all([
        tablePromise,
        timeseriesPromise,
        eventsPromise,
      ]);

      if (!isMountedRef.current || requestId !== latestRequestIdRef.current) {
        return;
      }

      const failedCount = [
        summaryResult,
        featuresResult,
        tableResult,
        timeseriesResult,
        eventsResult,
      ].filter((result) => !result.ok).length;

      if (failedCount === 5) {
        setError("Kunne ikke laste olje- og gassmodulen.");
      } else if (failedCount > 0) {
        setError("Noen datakilder svarte ikke, men resten av flaten er lastet.");
      }
    }

    void load();
  }, [filters]);

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
    let cancelled = false;
    const fieldParams = buildPetroleumSearchParams({
      ...filters,
      tableMode: "fields",
      page: 0,
      size: 500,
    });
    const operatorParams = buildPetroleumSearchParams({
      ...filters,
      tableMode: "operators",
      page: 0,
      size: 500,
    });

    Promise.all([
      fetchApi<PetroleumTableResponse>(`/api/market/oil-gas/table?${fieldParams.toString()}`),
      fetchApi<PetroleumTableResponse>(`/api/market/oil-gas/table?${operatorParams.toString()}`),
    ])
      .then(([fieldTable, operatorTable]) => {
        if (cancelled) {
          return;
        }

        setFieldCompareRows(fieldTable.items.filter((item): item is FieldTableRow => item.mode === "fields"));
        setOperatorCompareRows(
          operatorTable.items.filter((item): item is OperatorTableRow => item.mode === "operators"),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setFieldCompareRows([]);
          setOperatorCompareRows([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filters]);

  React.useEffect(() => {
    setCompareFieldIds((current) =>
      current.filter((id) => fieldCompareRows.some((row) => row.entityId === id)),
    );
  }, [fieldCompareRows]);

  React.useEffect(() => {
    setCompareOperatorIds((current) =>
      current.filter((id) => operatorCompareRows.some((row) => row.operatorId === id)),
    );
  }, [operatorCompareRows]);

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
      measures: "oe",
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
  }, [compareIds, compareMode, filters]);

  const toggleArrayValue = React.useCallback(
    (key: "layers" | "status" | "areas" | "operatorIds" | "licenseeIds" | "hcTypes", value: string) => {
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
  const isMapDrivingResults = Boolean(filters.bbox);
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

      {error ? (
        <div className="rounded-[1rem] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">{error}</div>
      ) : null}

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
          {!isMapExpanded ? (
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiTile label="Aktive felt" value={formatNumber(summary?.kpis.activeFieldCount)} />
            <KpiTile label="Aktive lisenser" value={formatNumber(summary?.kpis.activeLicenceCount)} />
            <KpiTile label="Produksjon" value={formatOe(summary?.kpis.selectedLatestProductionOe)} />
            <KpiTile label="Gjenværende OE" value={formatOe(summary?.kpis.selectedRemainingOe)} />
            <KpiTile label="Operatører" value={formatNumber(summary?.kpis.selectedOperatorCount)} />
            <KpiTile label="Hendelser 12 mnd" value={formatNumber(summary?.kpis.recentEventCount)} />
            </div>
          ) : null}

          {isMapExpanded ? (
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
                      loading || isViewportPending ? "bg-amber-500" : "bg-emerald-500",
                    )}
                  />
                  {loading || isViewportPending ? "Oppdaterer utsnitt" : "Utsnitt synkronisert"}
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
                  isMapExpanded ? "h-[72vh] xl:h-[78vh]" : "h-[40rem] xl:h-[48rem]",
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
                  <div className="mt-4 space-y-2 rounded-[0.85rem] border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] p-3 text-sm text-slate-700">
                    <div>Operatør: {detail?.operator?.companyName ?? selectedFeature?.operator?.companyName ?? "Ikke tilgjengelig"}</div>
                    <div>Hydrokarbon: {detail?.hcType ?? selectedFeature?.hcType ?? "Ikke tilgjengelig"}</div>
                    <div>Produksjon: {formatOe(selectedFeature?.latestProductionOe ?? detail?.timeseries.at(-1)?.oe ?? null)}</div>
                    <div>Gjenværende: {formatOe(detail?.reserve?.remainingOe ?? selectedFeature?.remainingOe ?? null)}</div>
                    <div>Forv. investering: {formatCompactNok(detail?.investment?.expectedFutureInvestmentNok ?? selectedFeature?.expectedFutureInvestmentNok ?? null)}</div>
                  </div>
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
              {loading || isViewportPending ? (
                <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/70 bg-white/92 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
                  Oppdaterer kart og analyser…
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
              </div>
            </div>
          </Card>

          {!isMapExpanded ? (
            <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Tidsserie</div>
              <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Produksjon og investeringer</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Grønn linje viser oljeekvivalenter. Lyse søyler viser historiske investeringer.
              </p>
              <div className="mt-5">
                <SimpleTimeseriesChart points={timeseries} />
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
                      <span className="text-slate-500">{formatOe(row.oe)}</span>
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

          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Sammenligning</div>
                <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Sammenlign utvikling</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  Sammenlign opptil tre felt eller operatører i det samme markedsutsnittet. Linjene viser
                  oljeekvivalenter per år for valgte objekter.
                </p>
              </div>
              <div className="inline-flex rounded-full border border-[rgba(15,23,42,0.1)] bg-[#F4F6F8] p-1">
                {([
                  ["field", "Felt"],
                  ["operator", "Operatører"],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setCompareMode(mode)}
                    className={cn(
                      "rounded-full px-3.5 py-2 text-xs font-semibold",
                      compareMode === mode ? "bg-[#172535] text-white" : "text-slate-600",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              <div className="lg:col-span-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Raske valg
                </div>
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
              <CompareTimeseriesChart points={compareSeries} />
            </div>

            {compareMode === "field" && selectedFieldCompareRows.length > 0 ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {selectedFieldCompareRows.map((row, index) => (
                  <div
                    key={row.entityId}
                    className="rounded-[1rem] border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] p-4"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: COMPARE_COLORS[index % COMPARE_COLORS.length] }}
                      />
                      <div className="text-sm font-semibold text-slate-900">{row.name}</div>
                    </div>
                    <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                      <div>Operatør: {row.operatorName ?? "Ikke tilgjengelig"}</div>
                      <div>Produksjon: {formatOe(row.latestProductionOe)}</div>
                      <div>Gjenværende: {formatOe(row.remainingOe)}</div>
                      <div>Forv. investering: {formatCompactNok(row.expectedFutureInvestmentNok)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {compareMode === "operator" && selectedOperatorCompareRows.length > 0 ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {selectedOperatorCompareRows.map((row, index) => (
                  <div
                    key={row.operatorId}
                    className="rounded-[1rem] border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] p-4"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: COMPARE_COLORS[index % COMPARE_COLORS.length] }}
                      />
                      <div className="text-sm font-semibold text-slate-900">{row.operatorName}</div>
                    </div>
                    <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                      <div>Felt: {formatNumber(row.fieldCount)}</div>
                      <div>Lisenser: {formatNumber(row.licenceCount)}</div>
                      <div>Produksjon: {formatOe(row.latestProductionOe)}</div>
                      <div>Gjenværende: {formatOe(row.remainingOe)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>

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
                    <th className="px-4 py-3 font-medium">Nøkkeltall</th>
                  </tr>
                </thead>
                <tbody>
                  {table?.items.map((item) => (
                    <tr key={"entityId" in item ? `${item.mode}:${item.entityId}` : `${item.mode}:${item.operatorName}`} className="border-t border-[rgba(15,23,42,0.08)] bg-white">
                      <td className="px-4 py-3 text-slate-900">{("name" in item ? item.name : item.operatorName) ?? "Ikke tilgjengelig"}</td>
                      <td className="px-4 py-3 text-slate-600">{("area" in item ? item.area : null) ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{("status" in item ? item.status : null) ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{("operatorName" in item ? item.operatorName : item.operatorName) ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {item.mode === "fields"
                          ? formatOe(item.latestProductionOe)
                          : item.mode === "licences"
                            ? `${item.transferCount} transfers`
                            : `${item.fieldCount} felt / ${item.licenceCount} lisenser`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
            </>
          ) : null}
        </div>

        <div className={cn("space-y-6", isMapExpanded && "hidden")}>
          <Card className="p-5">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Detaljpanel</div>
            {!detail ? (
              <div className="mt-4 text-sm leading-7 text-slate-600">
                Velg et felt, en lisens, en innretning eller en rørledning i kartet for å se produksjon,
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
                  Operatør: {detail.operator?.companyName ?? "Ikke tilgjengelig"}
                  <br />
                  Hydrokarbon: {detail.hcType ?? "Ikke tilgjengelig"}
                  <br />
                  Reserver: {formatOe(detail.reserve?.remainingOe)}
                  <br />
                  Forventet investering: {formatCompactNok(detail.investment?.expectedFutureInvestmentNok)}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">Rettighetshavere</div>
                  <div className="mt-2 space-y-2">
                    {detail.licensees.length === 0 ? (
                      <div className="text-sm text-slate-500">Ingen lisensandeler tilgjengelig.</div>
                    ) : (
                      detail.licensees.map((licensee, index) => (
                        <div key={`${licensee.companyName}-${index}`} className="rounded-[0.85rem] border border-[rgba(15,23,42,0.08)] bg-white px-3 py-2 text-sm text-slate-700">
                          {licensee.companyName ?? "Ukjent"} · {licensee.share ?? "—"}%
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
