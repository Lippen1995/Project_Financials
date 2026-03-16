"use client";

import { ReactNode, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import {
  buildFinancialReportDataset,
  FinancialReportRow,
  FinancialDensityMode,
  FinancialStatementType,
  FinancialValueMode,
  formatCompactCurrency,
  formatCurrency,
  formatPercent,
  getChildRows,
  getDisplayValue,
  getFinancialSections,
  getVisibleRows,
} from "@/lib/financial-report";
import { NormalizedFinancialDocument, NormalizedFinancialStatement } from "@/lib/types";
import { cn } from "@/lib/utils";

type KpiDefinition = {
  label: string;
  formatter: (dataset: ReturnType<typeof buildFinancialReportDataset>, year: number | undefined) => string;
};

const statementMeta: Record<FinancialStatementType, { title: string; subtitle: string }> = {
  income: {
    title: "Resultatregnskap",
    subtitle: "Beløp i NOK",
  },
  balance: {
    title: "Balanse",
    subtitle: "Beløp i NOK",
  },
};

const modeLabels: Record<FinancialValueMode, string> = {
  amount: "Beløp",
  margin: "Margin",
  growth: "Vekst",
};

const densityLabels: Record<FinancialDensityMode, string> = {
  main: "Hovedlinjer",
  all: "Alle linjer",
};

const incomeKpis: KpiDefinition[] = [
  {
    label: "Omsetning",
    formatter: (dataset, year) =>
      year ? formatCompactCurrency(dataset.valuesByYear[year]?.total_operating_revenue ?? null) : "—",
  },
  {
    label: "EBIT",
    formatter: (dataset, year) => (year ? formatCompactCurrency(dataset.valuesByYear[year]?.ebit ?? null) : "—"),
  },
  {
    label: "EBIT-margin",
    formatter: (dataset, year) => {
      if (!year) {
        return "—";
      }

      const revenue = dataset.valuesByYear[year]?.total_operating_revenue ?? null;
      const ebit = dataset.valuesByYear[year]?.ebit ?? null;
      if (revenue === null || ebit === null || revenue === 0) {
        return "—";
      }

      return formatPercent((ebit / revenue) * 100);
    },
  },
  {
    label: "Resultat før skatt",
    formatter: (dataset, year) =>
      year ? formatCompactCurrency(dataset.valuesByYear[year]?.profit_before_tax ?? null) : "—",
  },
];

const balanceKpis: KpiDefinition[] = [
  {
    label: "Sum eiendeler",
    formatter: (dataset, year) => (year ? formatCompactCurrency(dataset.valuesByYear[year]?.total_assets ?? null) : "—"),
  },
  {
    label: "Egenkapital",
    formatter: (dataset, year) => (year ? formatCompactCurrency(dataset.valuesByYear[year]?.total_equity ?? null) : "—"),
  },
  {
    label: "Langsiktig gjeld",
    formatter: (dataset, year) =>
      year ? formatCompactCurrency(dataset.valuesByYear[year]?.total_long_term_debt ?? null) : "—",
  },
  {
    label: "Egenkapitalandel",
    formatter: (dataset, year) => {
      if (!year) {
        return "—";
      }

      const totalAssets = dataset.valuesByYear[year]?.total_assets ?? null;
      const equity = dataset.valuesByYear[year]?.total_equity ?? null;
      if (totalAssets === null || equity === null || totalAssets === 0) {
        return "—";
      }

      return formatPercent((equity / totalAssets) * 100);
    },
  },
];

function formatCell(
  value: number | null,
  mode: FinancialValueMode,
) {
  if (mode === "amount") {
    return formatCurrency(value);
  }

  return formatPercent(value);
}

function NegativeValue({ children, negative }: { children: string; negative: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-2 rounded-md px-2 py-1",
        negative && "font-medium text-rose-800",
      )}
    >
      {negative ? <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-rose-500" /> : null}
      <span>{children}</span>
    </span>
  );
}

function TableControls({
  mode,
  densityMode,
  onModeChange,
  onDensityChange,
}: {
  mode: FinancialValueMode;
  densityMode: FinancialDensityMode;
  onModeChange: (value: FinancialValueMode) => void;
  onDensityChange: (value: FinancialDensityMode) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-y border-slate-200/80 bg-slate-50/75 px-4 py-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
          {(["amount", "margin", "growth"] as FinancialValueMode[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => onModeChange(option)}
              className={cn(
                "rounded-full px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500",
                mode === option
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              {modeLabels[option]}
            </button>
          ))}
        </div>

        <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
          {(["main", "all"] as FinancialDensityMode[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={densityMode === option}
              onClick={() => onDensityChange(option)}
              className={cn(
                "rounded-full px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500",
                densityMode === option
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              {densityLabels[option]}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm font-medium text-slate-500">Tall i NOK</p>
    </div>
  );
}

export function FinancialTimeSeriesTable({
  statements,
  documents,
}: {
  statements: NormalizedFinancialStatement[];
  documents: NormalizedFinancialDocument[];
}) {
  const dataset = useMemo(() => buildFinancialReportDataset(statements, documents), [documents, statements]);
  const [activeStatement, setActiveStatement] = useState<FinancialStatementType>("income");
  const [mode, setMode] = useState<FinancialValueMode>("amount");
  const [densityMode, setDensityMode] = useState<FinancialDensityMode>("main");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  if (dataset.years.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50/70 p-6 text-sm text-slate-600">
        Ingen verifiserte regnskapstall er tilgjengelige for denne virksomheten ennå. Når ekte Brreg-data finnes, vises resultatregnskap og balanse her.
      </div>
    );
  }

  const meta = statementMeta[activeStatement];
  const latestYear = dataset.latestYearByStatement[activeStatement];
  const sections = getFinancialSections(activeStatement);
  const visibleRows = getVisibleRows(activeStatement, densityMode);
  const kpis = activeStatement === "income" ? incomeKpis : balanceKpis;
  const balanceStatus = latestYear ? dataset.balanceValidationByYear[latestYear] : null;

  function hasDataForRow(row: FinancialReportRow) {
    return dataset.years.some((year) => dataset.valuesByYear[year]?.[row.key] !== null);
  }

  function getRenderedRows(sectionKey: string) {
    const rows = visibleRows.filter((row) => row.section === sectionKey);

    return rows.flatMap((row) => {
      const childRows = getChildRows(row.key).filter(
        (childRow) => childRow.section === sectionKey && hasDataForRow(childRow),
      );

      if (expandedRows[row.key] && childRows.length > 0) {
        return [row, ...childRows];
      }

      return [row];
    });
  }

  function toggleRow(rowKey: string) {
    setExpandedRows((current) => ({
      ...current,
      [rowKey]: !current[rowKey],
    }));
  }

  return (
    <div className="overflow-hidden rounded-[1.9rem] border border-slate-200/90 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.08)]">
      <div className="border-b border-slate-200 bg-[linear-gradient(135deg,rgba(248,250,252,0.95),rgba(239,246,255,0.92))] px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex rounded-full border border-slate-200 bg-white/90 p-1 shadow-sm">
                {(["income", "balance"] as FinancialStatementType[]).map((statement) => (
                  <button
                    key={statement}
                    type="button"
                    aria-pressed={activeStatement === statement}
                    onClick={() => setActiveStatement(statement)}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500",
                      activeStatement === statement
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                    )}
                  >
                    {statementMeta[statement].title}
                  </button>
                ))}
              </div>

              <div>
                <h3 className="text-2xl font-semibold tracking-tight text-slate-950">{meta.title}</h3>
                <p className="mt-1 text-sm text-slate-500">{meta.subtitle}</p>
              </div>
            </div>

            {activeStatement === "balance" ? (
              <div
                className={cn(
                  "inline-flex items-center gap-2 self-start rounded-full border px-3 py-2 text-sm font-medium",
                  balanceStatus?.balanced
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-900",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-2 w-2 rounded-full",
                    balanceStatus?.balanced ? "bg-emerald-500" : "bg-amber-500",
                  )}
                />
                <span>{balanceStatus?.balanced ? "Balanserer" : "Avvik"}</span>
                {balanceStatus?.difference !== null && !balanceStatus?.balanced ? (
                  <span className="text-xs font-normal text-current/80">
                    {formatCurrency(balanceStatus?.difference ?? null)}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {kpis.map((item) => (
              <div
                key={item.label}
                className="rounded-[1.35rem] border border-slate-200/80 bg-white/90 px-4 py-4 shadow-sm"
              >
                <p className="text-sm font-medium text-slate-500">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  {item.formatter(dataset, latestYear)}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-400">
                  {latestYear ? latestYear : "Ikke tilgjengelig"}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <TableControls
        mode={mode}
        densityMode={densityMode}
        onModeChange={setMode}
        onDensityChange={setDensityMode}
      />

      <div className="overflow-x-auto">
        <table className="min-w-[980px] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">
            {meta.title} vist som tidsserie med år fra venstre til høyre og verdier i NOK.
          </caption>
          <thead className="sticky top-0 z-20">
            <tr className="bg-slate-950">
              <th
                scope="col"
                className="sticky left-0 z-30 min-w-[320px] border-b border-slate-800 bg-slate-950 px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-200"
              >
                Linje
              </th>
              {dataset.years.map((year) => (
                <th
                  key={`${activeStatement}-${year}`}
                  scope="col"
                  className="border-b border-slate-800 px-5 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate-200"
                >
                  {year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => {
              const rows = getRenderedRows(section.key);
              if (rows.length === 0) {
                return null;
              }

              return (
                <FragmentSection key={section.key} title={section.title}>
                  {rows.map((row) => {
                    const childRows = getChildRows(row.key).filter(
                      (childRow) => childRow.section === section.key && hasDataForRow(childRow),
                    );
                    const canExpand = densityMode === "main" && childRows.length > 0;
                    const expanded = Boolean(expandedRows[row.key]);
                    const rowClassName =
                      row.type === "total"
                        ? "bg-slate-100"
                        : row.type === "subtotal" || row.type === "key_metric"
                          ? "bg-slate-50/90"
                          : "bg-white";

                    return (
                      <tr
                        key={`${row.key}-${activeStatement}`}
                        className={cn(
                          "group transition hover:bg-sky-50/60",
                          canExpand && "cursor-pointer",
                          rowClassName,
                        )}
                        onClick={canExpand ? () => toggleRow(row.key) : undefined}
                      >
                        <th
                          scope="row"
                          className={cn(
                            "sticky left-0 z-10 min-w-[320px] border-b border-slate-200 px-5 py-3.5 text-left align-middle",
                            rowClassName,
                            row.type === "total" && "py-4",
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              {canExpand ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleRow(row.key);
                                  }}
                                  aria-expanded={expanded}
                                  aria-label={`${expanded ? "Skjul" : "Vis"} detaljer for ${row.label}`}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
                                >
                                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </button>
                              ) : row.parentKey ? (
                                <span
                                  aria-hidden="true"
                                  className="inline-flex h-7 w-7 items-center justify-center text-slate-300"
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </span>
                              ) : null}

                              <span
                                className={cn(
                                  "text-sm text-slate-800",
                                  row.parentKey && "pl-2 text-slate-600",
                                  (row.type === "subtotal" || row.type === "key_metric") && "font-semibold",
                                  row.type === "total" && "font-semibold text-slate-950",
                                )}
                              >
                                {row.label}
                              </span>
                            </div>
                            {activeStatement === "balance" &&
                            latestYear &&
                            (row.key === "total_assets" || row.key === "total_equity_and_liabilities") ? (
                              <span
                                className={cn(
                                  "shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
                                  dataset.balanceValidationByYear[latestYear]?.balanced
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                    : "border-amber-200 bg-amber-50 text-amber-900",
                                )}
                              >
                                {dataset.balanceValidationByYear[latestYear]?.balanced ? "Balanced" : "Sjekk"}
                              </span>
                            ) : null}
                          </div>
                        </th>
                        {dataset.years.map((year) => {
                          const displayValue = getDisplayValue(row, year, mode, dataset);
                          const negative = displayValue !== null && displayValue < 0;

                          return (
                            <td
                              key={`${row.key}-${year}`}
                              className={cn(
                                "border-b border-slate-200 px-5 py-3.5 text-right align-middle",
                                row.type === "total" && "py-4",
                              )}
                            >
                              <NegativeValue negative={negative}>
                                {formatCell(displayValue, mode)}
                              </NegativeValue>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </FragmentSection>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <tr className="bg-slate-50">
        <th
          colSpan={999}
          scope="colgroup"
          className="border-b border-slate-200 px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500"
        >
          {title}
        </th>
      </tr>
      {children}
    </>
  );
}
