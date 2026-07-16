"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { DistressDetailPanel } from "@/components/distress/distress-detail-panel";
import { DistressHealthBar } from "@/components/distress/distress-health-bar";
import { DistressSparkline } from "@/components/distress/distress-sparkline";
import {
  formatCompactAmount,
  formatDaysInStatus,
  formatEquityRatio,
  formatPercentValue,
  formatRatio,
  getDaysInStatusColor,
  getEquityRatioColor,
  getLiquidityColor,
  getStatusTone,
} from "@/lib/distress-presentation";
import { DistressCompanyRow, DistressFilterOptions, DistressSortKey } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type QueryParams = Record<string, string | string[] | undefined>;

const SORT_COLUMNS: Record<string, { asc: DistressSortKey; desc: DistressSortKey }> = {
  healthScore: { asc: "healthScore_asc", desc: "healthScore_desc" },
  liquidityRatio: { asc: "liquidityRatio_asc", desc: "liquidityRatio_desc" },
  realizableAssets: { asc: "realizableAssets_asc", desc: "realizableAssets_desc" },
};

const SEARCH_DEBOUNCE_MS = 350;

function buildHref(workspaceId: string, params: QueryParams, patch: Record<string, string | undefined>): Route {
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (key in patch || key === "page") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item.trim()) {
          next.append(key, item);
        }
      }
      continue;
    }

    if (typeof value === "string" && value.trim()) {
      next.set(key, value);
    }
  }

  for (const [key, value] of Object.entries(patch)) {
    if (value && value.trim()) {
      next.set(key, value);
    }
  }

  const queryString = next.toString();
  return `/workspaces/${workspaceId}/distress${queryString ? `?${queryString}` : ""}` as Route;
}

function SortHeader({
  label,
  columnKey,
  currentSort,
  align,
  onSort,
}: {
  label: string;
  columnKey: keyof typeof SORT_COLUMNS;
  currentSort?: DistressSortKey;
  align: "left" | "right";
  onSort: (sort: DistressSortKey) => void;
}) {
  const config = SORT_COLUMNS[columnKey];
  const isDesc = currentSort === config.desc;
  const isAsc = currentSort === config.asc;
  const nextSort = isDesc ? config.asc : config.desc;

  return (
    <th
      aria-sort={isDesc ? "descending" : isAsc ? "ascending" : "none"}
      className={`whitespace-nowrap px-4 py-3 ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        type="button"
        onClick={() => onSort(nextSort)}
        className="data-label inline-flex items-center gap-1 text-[11px] text-[var(--px-muted)] hover:text-[var(--px-text)]"
      >
        {label}
        <span aria-hidden>{isDesc ? "↓" : isAsc ? "↑" : ""}</span>
      </button>
    </th>
  );
}

function ColumnHeader({ label, align = "left" }: { label: string; align?: "left" | "right" }) {
  return (
    <th
      className={`data-label whitespace-nowrap px-4 py-3 text-[11px] text-[var(--px-muted)] ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {label}
    </th>
  );
}

export function DistressModuleTable({
  workspaceId,
  rows,
  totalCount,
  filterOptions,
  searchParams,
  activeSort,
}: {
  workspaceId: string;
  rows: DistressCompanyRow[];
  totalCount: number;
  filterOptions: DistressFilterOptions;
  searchParams: QueryParams;
  /** The sort actually applied, which is the page's default when the URL carries none. */
  activeSort: DistressSortKey;
}) {
  const router = useRouter();
  const currentQuery = typeof searchParams.query === "string" ? searchParams.query : "";
  const currentSector = typeof searchParams.sectorCode === "string" ? searchParams.sectorCode : "";
  const currentStatus = typeof searchParams.status === "string" ? searchParams.status : "";
  const currentSort = activeSort;

  const [draft, setDraft] = useState(currentQuery);
  const [selectedOrgNumber, setSelectedOrgNumber] = useState<string | null>(null);
  const previousQuery = useRef(currentQuery);

  // The URL is the source of truth: when navigation changes it underneath us (a link, the back
  // button), adopt it rather than pushing our stale draft back over it.
  useEffect(() => {
    if (previousQuery.current !== currentQuery) {
      previousQuery.current = currentQuery;
      setDraft(currentQuery);
    }
  }, [currentQuery]);

  useEffect(() => {
    if (draft === currentQuery) {
      return;
    }

    const timer = setTimeout(() => {
      router.replace(buildHref(workspaceId, searchParams, { query: draft || undefined }), { scroll: false });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [draft, currentQuery, router, searchParams, workspaceId]);

  const selectedRow = useMemo(
    () => rows.find((row) => row.company.orgNumber === selectedOrgNumber) ?? null,
    [rows, selectedOrgNumber],
  );

  const navigate = (patch: Record<string, string | undefined>) => {
    router.replace(buildHref(workspaceId, searchParams, patch), { scroll: false });
  };

  const sectorLabel = filterOptions.sectors.find((option) => option.value === currentSector)?.label ?? currentSector;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--px-border-subtle)] bg-[var(--px-surface-strong)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--px-border-subtle)] p-4">
        <div className="relative min-w-[240px] flex-1">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Søk selskap eller org.nr…"
            aria-label="Søk selskap eller organisasjonsnummer"
            className="w-full rounded-lg border border-[var(--px-border)] bg-[var(--px-bg)] px-3 py-2 text-sm text-[var(--px-text)] placeholder:text-[var(--px-muted)]"
          />
        </div>
        <select
          value={currentSector}
          onChange={(event) => navigate({ sectorCode: event.target.value || undefined })}
          aria-label="Filtrer på sektor"
          className="cursor-pointer rounded-lg border border-[var(--px-border)] bg-[var(--px-bg)] px-3 py-2 text-[13.5px] text-[var(--px-text)]"
        >
          <option value="">Alle sektorer</option>
          {filterOptions.sectors.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} ({option.count})
            </option>
          ))}
        </select>
        <select
          value={currentStatus}
          onChange={(event) => navigate({ status: event.target.value || undefined })}
          aria-label="Filtrer på hendelse"
          className="cursor-pointer rounded-lg border border-[var(--px-border)] bg-[var(--px-bg)] px-3 py-2 text-[13.5px] text-[var(--px-text)]"
        >
          <option value="">Alle hendelser</option>
          {filterOptions.statuses.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} ({option.count})
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3">
        <div className="flex items-center gap-3">
          <div className="text-[13px] text-[var(--px-muted)]">
            <span className="font-semibold text-[var(--px-text)] tabular-nums">{totalCount.toLocaleString("nb-NO")}</span>{" "}
            selskaper i utvalget
          </div>
          {currentSector ? (
            <button
              type="button"
              onClick={() => navigate({ sectorCode: undefined })}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--px-accent-soft)] bg-[var(--px-accent-soft)] px-2 py-1 text-[11.5px] font-semibold text-[var(--px-accent)]"
            >
              {sectorLabel}
              <span aria-hidden>×</span>
              <span className="sr-only">Fjern sektorfilter</span>
            </button>
          ) : null}
        </div>
        <div className="text-xs text-[var(--px-muted)]">Klikk en rad for full vurdering</div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-[var(--px-border-subtle)] bg-[#f1f3f9]">
              <ColumnHeader label="Selskap" />
              <ColumnHeader label="Sektor" />
              <ColumnHeader label="Hendelse" />
              <SortHeader
                label="Finansiell helse"
                columnKey="healthScore"
                currentSort={currentSort}
                align="left"
                onSort={(sort) => navigate({ sort })}
              />
              <SortHeader
                label="Likviditet"
                columnKey="liquidityRatio"
                currentSort={currentSort}
                align="right"
                onSort={(sort) => navigate({ sort })}
              />
              <ColumnHeader label="EK-andel" align="right" />
              <SortHeader
                label="Anleggsmidler"
                columnKey="realizableAssets"
                currentSort={currentSort}
                align="right"
                onSort={(sort) => navigate({ sort })}
              />
              <ColumnHeader label="Varelager" align="right" />
              <ColumnHeader label="Kontanter" align="right" />
              <ColumnHeader label="Inntektstrend · 5 år" align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const tone = getStatusTone(row.distress.status);

              return (
                <tr
                  key={row.company.orgNumber}
                  onClick={() => setSelectedOrgNumber(row.company.orgNumber)}
                  className="cursor-pointer border-b border-[rgba(15,23,42,0.06)] transition-colors hover:bg-[rgba(248,249,250,0.85)]"
                >
                  <td className="px-4 py-4 align-middle">
                    <div className="text-[14.5px] font-semibold text-[var(--px-text)]">{row.company.name}</div>
                    <div className="data-label mt-1 text-[9.5px] text-[var(--px-muted)]">
                      {[row.company.legalForm, row.company.municipality, `org.nr ${row.company.orgNumber}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-middle text-[13px] text-[var(--px-text)]">
                    {row.sector?.label ?? row.sector?.code ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 align-middle">
                    <span
                      className="data-label inline-flex items-center rounded-full border px-2 py-1 text-[9.5px]"
                      style={{ background: tone.background, color: tone.foreground, borderColor: tone.border }}
                    >
                      {row.distress.label}
                    </span>
                    <div className="mt-1.5 text-[11px] text-[var(--px-muted)] tabular-nums">
                      {row.distress.statusStartedAt ? formatDate(row.distress.statusStartedAt) : "Ukjent dato"}
                    </div>
                    <div
                      className="mt-0.5 text-[10.5px] font-semibold tabular-nums"
                      style={{ color: getDaysInStatusColor(row.distress.daysInStatus) }}
                    >
                      {formatDaysInStatus(row.distress.daysInStatus)}
                    </div>
                  </td>
                  <td className="min-w-[150px] px-4 py-4 align-middle">
                    <DistressHealthBar health={row.healthScore} />
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-4 text-right align-middle font-mono text-[13px] tabular-nums"
                    style={{ color: getLiquidityColor(row.financials.liquidityRatio) }}
                  >
                    {formatRatio(row.financials.liquidityRatio)}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-4 text-right align-middle font-mono text-[13px] font-semibold tabular-nums"
                    style={{ color: getEquityRatioColor(row.financials.equityRatio) }}
                  >
                    {formatEquityRatio(row.financials.equityRatio)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-right align-middle text-[13.5px] font-semibold text-[var(--px-text)] tabular-nums">
                    {formatCompactAmount(row.financials.fixedAssets)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-right align-middle text-[13.5px] text-[var(--px-text)] tabular-nums">
                    {formatCompactAmount(row.financials.inventory)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-right align-middle text-[13.5px] text-[var(--px-text)] tabular-nums">
                    {formatCompactAmount(row.financials.cash)}
                  </td>
                  <td className="px-4 py-4 align-middle">
                    <div className="flex justify-end">
                      <DistressSparkline points={row.financials.revenueTrend} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 ? (
          <div className="p-14 text-center text-sm text-[var(--px-muted)]">Ingen selskaper matcher filteret.</div>
        ) : null}
      </div>

      {selectedRow ? (
        <DistressDetailPanel
          workspaceId={workspaceId}
          row={selectedRow}
          onClose={() => setSelectedOrgNumber(null)}
        />
      ) : null}
    </div>
  );
}
