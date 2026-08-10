"use client";

import * as React from "react";

import {
  SimulatedFinancialsBanner,
  SimulatedValueMarker,
} from "@/components/company/simulated-financials-notice";
import {
  FINANCIAL_UNIT_LABELS,
  FinancialUnit,
  formatPercent,
  formatUnitAmount,
} from "@/lib/financial-report";
import type { FinancialDisclosure } from "@/lib/financial-simulation-disclosure";
import { getHeadlineFinancialStatements } from "@/lib/financial-statements";
import {
  combineFinancialValueOrigins,
  financialHeadlineOriginsForStatement,
  type FinancialHeadlineOrigins,
} from "@/lib/financial-value-origin";
import type {
  FinancialValueOrigin,
  NormalizedFinancialLineItem,
  NormalizedFinancialStatement,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const UNIT_OPTIONS: FinancialUnit[] = ["NOK", "kNOK", "MNOK"];

type FigureType = "amount" | "pct" | "ratio";

type FigureDef = {
  key: string;
  label: string;
  group: string;
  type: FigureType;
  info: string;
  /** value per year index, aligned to `years`. null = not available. */
  pick: (row: YearRow) => number | null;
  origin: (row: YearRow) => FinancialValueOrigin | null;
};

type YearRow = {
  fiscalYear: number;
  revenue: number | null;
  ebit: number | null;
  net: number | null;
  equity: number | null;
  assets: number | null;
  debt: number | null;
  prevRevenue: number | null;
  prevNet: number | null;
  origins: FinancialHeadlineOrigins;
  prevOrigins: FinancialHeadlineOrigins | null;
};

function num(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) ? value : null;
}

function ratio(n: number | null, d: number | null): number | null {
  if (n === null || d === null || d === 0) return null;
  return (n / d) * 100;
}

function growth(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function buildYearRows(
  statements: NormalizedFinancialStatement[],
  lineItems: readonly NormalizedFinancialLineItem[],
): YearRow[] {
  const headline = getHeadlineFinancialStatements(statements)
    .slice()
    .sort((a, b) => a.fiscalYear - b.fiscalYear);

  return headline.map((s, i) => {
    const prev = headline[i - 1] ?? null;
    const equity = num(s.equity);
    const assets = num(s.assets);
    return {
      fiscalYear: s.fiscalYear,
      revenue: num(s.revenue),
      ebit: num(s.operatingProfit),
      net: num(s.netIncome),
      equity,
      assets,
      debt: assets !== null && equity !== null ? assets - equity : null,
      prevRevenue: prev ? num(prev.revenue) : null,
      prevNet: prev ? num(prev.netIncome) : null,
      origins: financialHeadlineOriginsForStatement(s, lineItems),
      prevOrigins: prev ? financialHeadlineOriginsForStatement(prev, lineItems) : null,
    };
  });
}

const FIGURE_DEFS: FigureDef[] = [
  // Hovedtall — absolute amounts (respond to the unit toggle)
  { key: "rev", label: "Driftsinntekter", group: "Hovedtall", type: "amount", info: "Sum driftsinntekter fra resultatregnskapet.", pick: (r) => r.revenue, origin: (r) => r.origins.revenue },
  { key: "ebit", label: "Driftsresultat (EBIT)", group: "Hovedtall", type: "amount", info: "Driftsinntekter minus driftskostnader.", pick: (r) => r.ebit, origin: (r) => r.origins.operatingProfit },
  { key: "net", label: "Årsresultat", group: "Hovedtall", type: "amount", info: "Resultat etter skatt for regnskapsåret.", pick: (r) => r.net, origin: (r) => r.origins.netIncome },
  { key: "equity", label: "Egenkapital", group: "Hovedtall", type: "amount", info: "Sum egenkapital ved årets slutt.", pick: (r) => r.equity, origin: (r) => r.origins.equity },
  { key: "assets", label: "Sum eiendeler", group: "Hovedtall", type: "amount", info: "Sum eiendeler i balansen ved årets slutt.", pick: (r) => r.assets, origin: (r) => r.origins.assets },

  // Lønnsomhet — profitability ratios (%)
  { key: "ebitM", label: "Driftsmargin", group: "Lønnsomhet", type: "pct", info: "Driftsresultat i prosent av driftsinntekter.", pick: (r) => ratio(r.ebit, r.revenue), origin: (r) => combineFinancialValueOrigins(r.origins.operatingProfit, r.origins.revenue) },
  { key: "netM", label: "Nettomargin", group: "Lønnsomhet", type: "pct", info: "Årsresultat i prosent av driftsinntekter.", pick: (r) => ratio(r.net, r.revenue), origin: (r) => combineFinancialValueOrigins(r.origins.netIncome, r.origins.revenue) },
  { key: "roe", label: "Egenkapitalavkastning", group: "Lønnsomhet", type: "pct", info: "Årsresultat i prosent av egenkapital (ROE).", pick: (r) => ratio(r.net, r.equity), origin: (r) => combineFinancialValueOrigins(r.origins.netIncome, r.origins.equity) },
  { key: "roa", label: "Totalrentabilitet", group: "Lønnsomhet", type: "pct", info: "Driftsresultat i prosent av sum eiendeler (ROA).", pick: (r) => ratio(r.ebit, r.assets), origin: (r) => combineFinancialValueOrigins(r.origins.operatingProfit, r.origins.assets) },

  // Soliditet — solvency
  { key: "eqPct", label: "Egenkapitalandel", group: "Soliditet", type: "pct", info: "Egenkapital i prosent av sum eiendeler.", pick: (r) => ratio(r.equity, r.assets), origin: (r) => combineFinancialValueOrigins(r.origins.equity, r.origins.assets) },
  { key: "gjeld", label: "Gjeldsgrad", group: "Soliditet", type: "ratio", info: "Gjeld delt på egenkapital (ganger).", pick: (r) => (r.debt !== null && r.equity !== null && r.equity !== 0 ? r.debt / r.equity : null), origin: (r) => combineFinancialValueOrigins(r.origins.assets, r.origins.equity) },

  // Vekst — year-over-year growth (%)
  { key: "revG", label: "Omsetningsvekst", group: "Vekst", type: "pct", info: "Endring i driftsinntekter fra året før.", pick: (r) => growth(r.revenue, r.prevRevenue), origin: (r) => combineFinancialValueOrigins(r.origins.revenue, r.prevOrigins?.revenue) },
  { key: "netG", label: "Resultatvekst", group: "Vekst", type: "pct", info: "Endring i årsresultat fra året før.", pick: (r) => growth(r.net, r.prevNet), origin: (r) => combineFinancialValueOrigins(r.origins.netIncome, r.prevOrigins?.netIncome) },
];

const GROUP_ORDER = ["Hovedtall", "Lønnsomhet", "Soliditet", "Vekst"];

function formatRatio(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  return `${new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}×`;
}

export function KeyFiguresTable({
  statements,
  lineItems,
  disclosure,
}: {
  statements: NormalizedFinancialStatement[];
  lineItems: NormalizedFinancialLineItem[];
  /** Says whether the statements these ratios are computed from are generated. */
  disclosure?: FinancialDisclosure;
}) {
  const [unit, setUnit] = React.useState<FinancialUnit>("MNOK");

  const rows = React.useMemo(() => buildYearRows(statements, lineItems), [lineItems, statements]);
  const years = rows.map((r) => r.fiscalYear);
  const latestYear = years.at(-1) ?? null;

  // Keep only figures that have a value in at least one year.
  const figures = FIGURE_DEFS.filter((def) => rows.some((r) => def.pick(r) !== null));
  const groups = GROUP_ORDER.map((g) => ({ group: g, items: figures.filter((f) => f.group === g) })).filter(
    (g) => g.items.length > 0,
  );

  const scope = statements.some((s) => s.statementScope === "CONSOLIDATED") ? "Konsern" : "Selskap";
  const rangeLabel = years.length > 0 ? `${years[0]}–${years[years.length - 1]}` : "";

  const formatCell = (def: FigureDef, value: number | null): string => {
    if (value === null || !Number.isFinite(value)) return "";
    if (def.type === "amount") return formatUnitAmount(value, unit, { report: true });
    if (def.type === "ratio") return formatRatio(value);
    return formatPercent(value);
  };

  if (years.length === 0 || groups.length === 0) {
    return (
      <div className="pt-6">
        <div className="rounded-xl border border-dashed border-[var(--px-border)] bg-[var(--px-subtle)] p-6 text-sm leading-6 text-[var(--px-muted)]">
          Nøkkeltall er ikke tilgjengelige for denne virksomheten ennå.
        </div>
      </div>
    );
  }

  const colCount = 1 + years.length;

  return (
    <div className="pt-6">
      {disclosure?.simulated ? (
        <SimulatedFinancialsBanner disclosure={disclosure} className="mb-5" />
      ) : null}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="data-label text-[11px] uppercase text-[var(--px-muted)]">
            Nøkkeltall · {scope} · Beregnet
          </div>
          <h2 className="editorial-display mt-1.5 text-[32px] tracking-[-0.03em] text-[var(--px-text)]">
            Nøkkeltall over tid
          </h2>
          <p className="mt-2 flex items-center gap-1.5 text-[12.5px] leading-relaxed text-[var(--px-muted)]">
            <span className="material-symbols-outlined text-[15px]">insights</span>
            {disclosure?.simulated
              ? "Beregnet av Fjord Insight fra simulerte demonstrasjonstall. Eldste år til venstre."
              : "Beregnet av Fjord Insight fra innleverte regnskapstall. Eldste år til venstre."}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="inline-flex gap-0.5 rounded-full border border-[var(--px-border-subtle)] p-0.5">
            {UNIT_OPTIONS.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className={cn(
                  "cursor-pointer rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                  u === unit ? "bg-[var(--px-action)] text-white" : "bg-transparent text-[var(--px-muted)] hover:text-[var(--px-text)]",
                )}
              >
                {FINANCIAL_UNIT_LABELS[u]}
              </button>
            ))}
          </div>
          {rangeLabel ? (
            <span className="data-label tabular-nums text-[11px] text-[var(--px-text)]">{rangeLabel}</span>
          ) : null}
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b-2 border-[var(--px-text)]">
              <th className="data-label px-2 py-2.5 text-left text-[10px] uppercase text-[var(--px-muted)]">
                Nøkkeltall
              </th>
              {years.map((year) => (
                <th
                  key={year}
                  className={cn(
                    "tabular-nums px-2 py-2.5 text-right font-mono text-xs",
                    year === latestYear ? "font-bold text-[var(--px-text)]" : "font-semibold text-[var(--px-muted)]",
                  )}
                >
                  {year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <React.Fragment key={group.group}>
                <tr className="bg-[var(--px-subtle)]">
                  <td colSpan={colCount} className="px-2 py-1.5">
                    <span className="data-label text-[9.5px] uppercase text-[var(--px-muted)]">{group.group}</span>
                  </td>
                </tr>
                {group.items.map((def) => (
                  <tr key={def.key} className="border-b border-[var(--px-border-subtle)]">
                    <th scope="row" className="px-2 py-2.5 text-left text-[13px] font-medium text-[var(--px-text)]">
                      <span className="inline-flex items-center gap-1.5">
                        {def.label}
                        <span className="group relative inline-flex cursor-help items-center outline-none" tabIndex={0}>
                          <span className="material-symbols-outlined text-[15px] text-[var(--px-muted)]">info</span>
                          <span className="pointer-events-none absolute left-6 top-1/2 z-40 w-[260px] -translate-y-1/2 rounded-md bg-[var(--px-panel)] p-3 text-[11.5px] font-normal normal-case leading-relaxed tracking-normal text-white opacity-0 shadow-[var(--shadow-md)] transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100">
                            {def.info}
                          </span>
                        </span>
                      </span>
                    </th>
                    {rows.map((r) => (
                      <td
                        key={r.fiscalYear}
                        className={cn(
                          "tabular-nums px-2 py-2.5 text-right font-mono text-[13px] text-[var(--px-text)]",
                          r.fiscalYear === latestYear && "bg-[var(--px-accent-soft)] font-semibold",
                        )}
                      >
                        {formatCell(def, def.pick(r))}
                        {def.pick(r) !== null && def.origin(r) === "synthetic" ? (
                          <SimulatedValueMarker />
                        ) : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 border-t border-[var(--px-border-subtle)] pt-3 text-[11px] leading-relaxed text-[var(--px-muted)]">
        {disclosure?.simulated
          ? "Nøkkeltall er beregnet av Fjord Insight fra simulerte demonstrasjonstall."
          : "Nøkkeltall er beregnet av Fjord Insight fra innleverte og verifiserte regnskapstall."}{" "}
        Hovedtall vises i{" "}
        {FINANCIAL_UNIT_LABELS[unit]}; marginer og avkastning i prosent, gjeldsgrad i ganger. Tomme felt betyr at
        grunnlaget ikke er tilgjengelig for året. Hold pekeren over{" "}
        <span className="material-symbols-outlined align-middle text-[13px]">info</span> for definisjon.
      </p>
    </div>
  );
}
