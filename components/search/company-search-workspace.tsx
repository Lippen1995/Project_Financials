"use client";

import { useMemo, useState } from "react";
import type { Route } from "next";
import Link from "next/link";

import { AiSearchPanel } from "@/components/search/ai-search-panel";
import {
  sortCompanySearchRows,
  type CompanySearchRow,
  type CompanySearchSortDirection,
  type CompanySearchSortKey,
} from "@/lib/company-search-sort";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

type SearchParams = {
  query: string;
  industryCode: string;
  city: string;
  legalForm: string;
  status: string;
  aiEnabled: boolean;
};

type SortState = {
  key: CompanySearchSortKey;
  direction: CompanySearchSortDirection;
} | null;

const pageSize = 15;

const sortColumns: Array<{
  key: CompanySearchSortKey;
  label: string;
  className?: string;
}> = [
  { key: "company", label: "Virksomhet", className: "w-[24%]" },
  { key: "orgNumber", label: "Org.nr", className: "w-[14%]" },
  { key: "industry", label: "Næring", className: "w-[22%]" },
  { key: "status", label: "Status", className: "w-[11%]" },
  { key: "revenue", label: "Inntekter", className: "w-[19%]" },
  { key: "employees", label: "Ansatte", className: "w-[10%]" },
];

function statusLabel(status: CompanySearchRow["status"]) {
  if (status === "ACTIVE") return "Aktiv";
  if (status === "DISSOLVED") return "Avviklet";
  return "Konkurs";
}

function SortIndicator({
  column,
  sort,
}: {
  column: CompanySearchSortKey;
  sort: SortState;
}) {
  if (sort?.key !== column) {
    return <span aria-hidden="true">↕</span>;
  }

  return <span aria-hidden="true">{sort.direction === "asc" ? "↑" : "↓"}</span>;
}

function FinancialMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[var(--px-border)] pb-3 last:border-b-0 last:pb-0">
      <div className="data-label text-[10px] font-medium uppercase text-[var(--px-muted)]">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold tabular-nums text-[var(--px-text)]">{value}</div>
    </div>
  );
}

export function CompanySearchWorkspace({
  rows,
  params,
  searchError,
}: {
  rows: CompanySearchRow[];
  params: SearchParams;
  searchError: string | null;
}) {
  const hasActiveFilters = Boolean(
    params.industryCode || params.city || params.legalForm || params.status,
  );
  const [advancedOpen, setAdvancedOpen] = useState(hasActiveFilters);
  const [aiEnabled, setAiEnabled] = useState(params.aiEnabled);
  const [sort, setSort] = useState<SortState>(null);
  const [selectedOrgNumber, setSelectedOrgNumber] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const sortedRows = useMemo(
    () => (sort ? sortCompanySearchRows(rows, sort.key, sort.direction) : rows),
    [rows, sort],
  );
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedRow = rows.find((row) => row.orgNumber === selectedOrgNumber) ?? null;

  function toggleSort(key: CompanySearchSortKey) {
    setSort((current) => ({
      key,
      direction: current?.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
    setPage(1);
  }

  const activeFilters = [
    params.industryCode ? `Næring ${params.industryCode}` : null,
    params.city ? `Sted ${params.city}` : null,
    params.legalForm ? `Form ${params.legalForm}` : null,
    params.status ? `Status ${params.status}` : null,
  ].filter((value): value is string => Boolean(value));
  const resetSearchParams = new URLSearchParams();
  if (params.query) resetSearchParams.set("query", params.query);
  if (params.aiEnabled) resetSearchParams.set("ai", "1");
  const resetHref = (resetSearchParams.size > 0
    ? `/search?${resetSearchParams.toString()}`
    : "/search") as Route;

  return (
    <main className={cn("space-y-6 pb-12", params.aiEnabled && "sm:pr-[400px]")}>
      <header className="grid gap-4 border-t-2 border-[var(--px-text)] pt-4">
        <div className="data-label text-[11px] font-medium uppercase text-[var(--px-muted)]">
          Søk i virksomhetsregisteret
        </div>
        <h1 className="text-base font-semibold text-[var(--px-text)]">Finn virksomhet</h1>
      </header>

      <form action="/search" method="get" className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-center">
          <input
            name="query"
            defaultValue={params.query}
            aria-label="Navn eller organisasjonsnummer"
            placeholder="Søk i virksomhetsregisteret"
            className="min-h-12 rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-4 text-sm text-[var(--px-text)] outline-none placeholder:text-[var(--px-muted)] focus:border-[var(--px-accent)]"
          />
          <button
            type="submit"
            className="min-h-11 rounded-full bg-[var(--px-action)] px-5 text-sm font-semibold text-[var(--px-bg)] transition-colors hover:bg-[var(--px-action-hover)]"
          >
            {aiEnabled ? "Søk og åpne chat" : "Søk"}
          </button>
          <label className="flex min-h-11 cursor-pointer items-center gap-4 rounded-full border border-[var(--px-border)] px-4 text-sm font-medium text-[var(--px-text)]">
            <input
              type="checkbox"
              name="ai"
              value="1"
              checked={aiEnabled}
              onChange={(event) => setAiEnabled(event.target.checked)}
              className="h-4 w-4 accent-[var(--px-accent)]"
            />
            AI-søk
          </label>
          <button
            type="button"
            aria-expanded={advancedOpen}
            aria-controls="advanced-company-search"
            onClick={() => setAdvancedOpen((current) => !current)}
            className="min-h-11 rounded-full border border-[var(--px-border)] px-4 text-sm font-medium text-[var(--px-text)] transition-colors hover:bg-[var(--px-subtle)]"
          >
            {advancedOpen ? "Skjul avansert søk" : "Avansert søk"}
          </button>
        </div>

        <section
          id="advanced-company-search"
          hidden={!advancedOpen}
          className="border-y border-[var(--px-border)] py-5"
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-4">
              <span className="data-label text-[10px] font-medium uppercase text-[var(--px-muted)]">
                Næringskode
              </span>
              <input
                name="industryCode"
                defaultValue={params.industryCode}
                placeholder="For eksempel 62.010"
                className="min-h-11 rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 text-sm outline-none focus:border-[var(--px-accent)]"
              />
            </label>
            <label className="grid gap-4">
              <span className="data-label text-[10px] font-medium uppercase text-[var(--px-muted)]">
                Poststed
              </span>
              <input
                name="city"
                defaultValue={params.city}
                placeholder="Alle poststeder"
                className="min-h-11 rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 text-sm outline-none focus:border-[var(--px-accent)]"
              />
            </label>
            <label className="grid gap-4">
              <span className="data-label text-[10px] font-medium uppercase text-[var(--px-muted)]">
                Organisasjonsform
              </span>
              <select
                name="legalForm"
                defaultValue={params.legalForm}
                className="min-h-11 rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 text-sm outline-none focus:border-[var(--px-accent)]"
              >
                <option value="">Alle former</option>
                <option value="AS">Aksjeselskap</option>
                <option value="ASA">Allmennaksjeselskap</option>
                <option value="ENK">Enkeltpersonforetak</option>
              </select>
            </label>
            <label className="grid gap-4">
              <span className="data-label text-[10px] font-medium uppercase text-[var(--px-muted)]">
                Status
              </span>
              <select
                name="status"
                defaultValue={params.status}
                className="min-h-11 rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 text-sm outline-none focus:border-[var(--px-accent)]"
              >
                <option value="">Alle statuser</option>
                <option value="ACTIVE">Aktiv</option>
                <option value="DISSOLVED">Avviklet eller slettet</option>
                <option value="BANKRUPT">Konkurs</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-4">
            <button
              type="submit"
              className="min-h-10 rounded-full bg-[var(--px-action)] px-5 text-sm font-semibold text-[var(--px-bg)] hover:bg-[var(--px-action-hover)]"
            >
              Vis treff
            </button>
            <Link
              href={resetHref}
              className="inline-flex min-h-10 items-center rounded-full border border-[var(--px-border)] px-5 text-sm font-medium text-[var(--px-text)] hover:bg-[var(--px-subtle)]"
            >
              Nullstill
            </Link>
          </div>
        </section>
      </form>

      {activeFilters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-4">
          <span className="data-label text-[10px] uppercase text-[var(--px-muted)]">
            Aktive filtre
          </span>
          {activeFilters.map((filter) => (
            <span
              key={filter}
              className="rounded-full border border-[var(--px-border)] px-3 py-1 text-xs text-[var(--px-text)]"
            >
              {filter}
            </span>
          ))}
        </div>
      ) : null}

      {searchError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
          {searchError}
        </div>
      ) : null}

      <section className="space-y-4" aria-labelledby="company-search-results-heading">
        <div className="flex flex-wrap items-end justify-between gap-4 border-y border-[var(--px-border)] py-3">
          <div>
            <h2
              id="company-search-results-heading"
              className="data-label text-[11px] font-medium uppercase text-[var(--px-text)]"
            >
              Treffliste
            </h2>
            <p className="mt-1 text-xs text-[var(--px-muted)]">
              {rows.length > 0
                ? `${rows.length} treff lastet fra virksomhetsregisteret.`
                : params.query || hasActiveFilters
                  ? "Ingen virksomheter samsvarer med søket."
                  : "Søk for å hente registrerte virksomheter."}
            </p>
          </div>
          {sort ? (
            <button
              type="button"
              onClick={() => setSort(null)}
              className="rounded-full px-3 py-1 text-xs font-medium text-[var(--px-muted)] hover:bg-[var(--px-subtle)] hover:text-[var(--px-text)]"
            >
              Tilbakestill sortering
            </button>
          ) : null}
        </div>

        {rows.length > 0 ? (
          <div
            className={cn(
              "grid gap-6",
              selectedRow ? "xl:grid-cols-[minmax(0,1fr)_260px]" : "grid-cols-1",
            )}
          >
            <div className="min-w-0 overflow-x-auto">
              <table className="min-w-[760px] table-fixed text-sm">
                <colgroup>
                  {sortColumns.map((column) => (
                    <col key={column.key} className={column.className} />
                  ))}
                </colgroup>
                <thead className="border-b border-[var(--px-border)]">
                  <tr>
                    {sortColumns.map((column) => (
                      <th
                        key={column.key}
                        scope="col"
                        aria-sort={
                          sort?.key === column.key
                            ? sort.direction === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                        className={cn(
                          "px-2 py-2 text-left",
                          column.key === "revenue" || column.key === "employees"
                            ? "text-right"
                            : "",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(column.key)}
                          className={cn(
                            "data-label inline-flex max-w-full items-center whitespace-nowrap text-[10px] font-medium uppercase tracking-normal text-[var(--px-muted)] hover:text-[var(--px-text)]",
                            column.key === "revenue" || column.key === "employees"
                              ? "justify-end"
                              : "",
                          )}
                        >
                          {column.label}
                          <span className="ml-1">
                            <SortIndicator column={column.key} sort={sort} />
                          </span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const selected = selectedOrgNumber === row.orgNumber;
                    return (
                      <tr
                        key={row.orgNumber}
                        className={cn(
                          "border-b border-[var(--px-border)] align-top transition-colors",
                          selected
                            ? "bg-[var(--px-accent-soft)]"
                            : "hover:bg-[var(--px-subtle)]",
                        )}
                      >
                        <td className="px-2 py-3">
                          <button
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setSelectedOrgNumber(row.orgNumber)}
                            className="text-left text-sm font-semibold text-[var(--px-text)] hover:text-[var(--px-accent)]"
                          >
                            {row.name}
                          </button>
                          {row.city ? (
                            <div className="mt-1 text-xs text-[var(--px-muted)]">{row.city}</div>
                          ) : null}
                        </td>
                        <td className="px-2 py-3 font-mono text-xs text-[var(--px-text)]">
                          {row.orgNumber}
                        </td>
                        <td className="px-2 py-3 text-xs leading-5 text-[var(--px-text)]">
                          {row.industry ?? "Ikke tilgjengelig"}
                        </td>
                        <td className="px-2 py-3">
                          <span className="data-label text-[9px] font-medium uppercase text-[var(--px-muted)]">
                            {statusLabel(row.status)}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums text-[var(--px-text)]">
                          {formatCurrency(row.revenue)}
                          {row.revenueFiscalYear ? (
                            <div className="mt-1 text-[10px] text-[var(--px-muted)]">
                              {row.revenueFiscalYear}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums text-[var(--px-text)]">
                          {formatNumber(row.employeeCount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {selectedRow ? (
              <aside className="space-y-4 border-t border-[var(--px-border)] pt-4 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                <div>
                  <div className="data-label text-[10px] uppercase text-[var(--px-muted)]">
                    Valgt virksomhet
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--px-text)]">{selectedRow.name}</h3>
                  <div className="data-label mt-2 text-[10px] uppercase text-[var(--px-muted)]">
                    {selectedRow.revenueFiscalYear
                      ? `Siste publiserte regnskapsår · ${selectedRow.revenueFiscalYear}`
                      : "Publisert regnskapsår ikke tilgjengelig"}
                  </div>
                </div>
                <div className="space-y-3">
                  <FinancialMetric label="Inntekter" value={formatCurrency(selectedRow.revenue)} />
                  <FinancialMetric label="EBITDA" value="Ikke tilgjengelig" />
                  <FinancialMetric
                    label="EBIT"
                    value={formatCurrency(selectedRow.operatingProfit)}
                  />
                  <FinancialMetric
                    label="Årsresultat"
                    value={formatCurrency(selectedRow.netIncome)}
                  />
                  <FinancialMetric label="Antall ansatte" value="Ikke tilgjengelig" />
                </div>
                <p className="text-xs leading-5 text-[var(--px-muted)]">
                  Ansatte i trefflisten er siste registrerte antall fra Brønnøysundregistrene.
                  Antall ansatte for regnskapsåret er ikke tilgjengelig i den normaliserte
                  regnskapskilden.
                </p>
                <Link
                  href={`/companies/${selectedRow.orgNumber}`}
                  className="inline-flex min-h-10 items-center rounded-full bg-[var(--px-action)] px-4 text-sm font-semibold text-[var(--px-bg)] hover:bg-[var(--px-action-hover)]"
                >
                  Åpne selskapsprofil
                </Link>
              </aside>
            ) : null}
          </div>
        ) : null}

        {totalPages > 1 ? (
          <nav className="flex items-center justify-between gap-4 border-t border-[var(--px-border)] pt-4 text-sm" aria-label="Resultatsider">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-full border border-[var(--px-border)] px-4 py-2 font-medium text-[var(--px-text)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Forrige
            </button>
            <span className="data-label text-[10px] uppercase text-[var(--px-muted)]">
              Side {currentPage} av {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              className="rounded-full border border-[var(--px-border)] px-4 py-2 font-medium text-[var(--px-text)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Neste
            </button>
          </nav>
        ) : null}
      </section>

      {params.aiEnabled ? <AiSearchPanel query={params.query || null} /> : null}
    </main>
  );
}
