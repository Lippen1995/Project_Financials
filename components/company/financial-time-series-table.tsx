"use client";

import { ReactNode, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import {
  buildFinancialReportDataset,
  FinancialDensityMode,
  FinancialReportRow,
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
    formatter: (dataset, year) =>
      year ? formatCompactCurrency(dataset.valuesByYear[year]?.ebit ?? null) : "—",
  },
  {
    label: "EBIT-margin",
    formatter: (dataset, year) => {
      if (!year) return "—";

      const revenue = dataset.valuesByYear[year]?.total_operating_revenue ?? null;
      const ebit = dataset.valuesByYear[year]?.ebit ?? null;
      if (revenue === null || ebit === null || revenue === 0) return "—";

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
    formatter: (dataset, year) =>
      year ? formatCompactCurrency(dataset.valuesByYear[year]?.total_assets ?? null) : "—",
  },
  {
    label: "Egenkapital",
    formatter: (dataset, year) =>
      year ? formatCompactCurrency(dataset.valuesByYear[year]?.total_equity ?? null) : "—",
  },
  {
    label: "Langsiktig gjeld",
    formatter: (dataset, year) =>
      year ? formatCompactCurrency(dataset.valuesByYear[year]?.total_long_term_debt ?? null) : "—",
  },
  {
    label: "Egenkapitalandel",
    formatter: (dataset, year) => {
      if (!year) return "—";

      const totalAssets = dataset.valuesByYear[year]?.total_assets ?? null;
      const equity = dataset.valuesByYear[year]?.total_equity ?? null;
      if (totalAssets === null || equity === null || totalAssets === 0) return "—";

      return formatPercent((equity / totalAssets) * 100);
    },
  },
];

function formatCell(value: number | null, mode: FinancialValueMode) {
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

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-[rgba(15,23,42,0.1)] bg-[#F8FAFC] p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full px-3 py-2 text-sm font-medium transition",
            value === option.value
              ? "bg-[#162233] text-white"
              : "text-slate-600 hover:bg-white hover:text-slate-950",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
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
    <div className="flex flex-col gap-3 border-y border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.62)] px-5 py-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SegmentedControl
          value={mode}
          onChange={onModeChange}
          options={[
            { value: "amount", label: modeLabels.amount },
            { value: "margin", label: modeLabels.margin },
            { value: "growth", label: modeLabels.growth },
          ]}
        />

        <SegmentedControl
          value={densityMode}
          onChange={onDensityChange}
          options={[
            { value: "main", label: densityLabels.main },
            { value: "all", label: densityLabels.all },
          ]}
        />
      </div>

      <p className="data-label text-[11px] font-semibold uppercase text-slate-500">Tall i NOK</p>
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
      <div className="border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-6 text-sm leading-7 text-slate-600">
        Regnskapstall er ikke tilgjengelige for denne virksomheten ennå.
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
    <section className="border border-[rgba(15,23,42,0.08)] bg-white">
      <div className="grid gap-6 border-b border-[rgba(15,23,42,0.08)] p-5 xl:grid-cols-[220px,minmax(0,1fr)]">
        <div>
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
            Finansiell visning
          </div>
          <h3 className="mt-3 text-[1.9rem] font-semibold text-slate-950">{meta.title}</h3>
          <p className="mt-2 text-sm leading-7 text-slate-600">{meta.subtitle}</p>
        </div>

        <div className="space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <SegmentedControl
              value={activeStatement}
              onChange={setActiveStatement}
              options={[
                { value: "income", label: statementMeta.income.title },
                { value: "balance", label: statementMeta.balance.title },
              ]}
            />

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
                className="border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.62)] px-4 py-4"
              >
                <p className="data-label text-[11px] font-semibold uppercase text-slate-500">
                  {item.label}
                </p>
                <p className="mt-2 text-[1.6rem] font-semibold tracking-tight text-slate-950">
                  {item.formatter(dataset, latestYear)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
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
            <tr className="bg-[#162233]">
              <th
                scope="col"
                className="data-label sticky left-0 z-30 min-w-[320px] border-b border-[#101826] bg-[#162233] px-5 py-4 text-left text-xs font-semibold uppercase text-slate-200"
              >
                Linje
              </th>
              {dataset.years.map((year) => (
                <th
                  key={`${activeStatement}-${year}`}
                  scope="col"
                  className="data-label border-b border-[#101826] px-5 py-4 text-right text-xs font-semibold uppercase text-slate-200"
                >
                  {year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => {
              const rows = getRenderedRows(section.key);
              if (rows.length === 0) return null;

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
                          "group transition hover:bg-slate-50",
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
                                  className="inline-flex h-7 w-7 items-center justify-center border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
                                >
                                  {expanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
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
                                  (row.type === "subtotal" || row.type === "key_metric") &&
                                    "font-semibold",
                                  row.type === "total" && "font-semibold text-slate-950",
                                )}
                              >
                                {row.label}
                              </span>
                            </div>
                            {activeStatement === "balance" &&
                            latestYear &&
                            (row.key === "total_assets" ||
                              row.key === "total_equity_and_liabilities") ? (
                              <span
                                className={cn(
                                  "shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
                                  dataset.balanceValidationByYear[latestYear]?.balanced
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                    : "border-amber-200 bg-amber-50 text-amber-900",
                                )}
                              >
                                {dataset.balanceValidationByYear[latestYear]?.balanced
                                  ? "Avstemt"
                                  : "Sjekk"}
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
    </section>
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
          className="data-label border-b border-slate-200 px-5 py-3 text-left text-[11px] font-semibold uppercase text-slate-500"
        >
          {title}
        </th>
      </tr>
      {children}
    </>
  );
}
