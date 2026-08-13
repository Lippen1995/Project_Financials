"use client";

import Link from "next/link";
import * as React from "react";

import {
  formatCompactAmount,
  formatCount,
  formatPercent,
  formatSourceDate,
  ratioPercent,
} from "@/components/company-map/company-map-format";
import type {
  CompanyMapCompany,
  CompanyMapListData,
} from "@/components/company-map/company-map-types";

export type CompanyMapResultView = "CARDS" | "TABLE";

function statusDotClass(company: CompanyMapCompany) {
  return company.revenue === null
    ? "bg-[var(--px-muted)]"
    : "bg-[var(--px-accent)]";
}

function CompanyCard({
  company,
  selected,
  onSelect,
}: {
  company: CompanyMapCompany;
  selected: boolean;
  onSelect: () => void;
}) {
  const margin = ratioPercent(company.ebit, company.revenue);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-[236px] shrink-0 rounded-[14px] border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)] focus-visible:ring-offset-2 ${
        selected
          ? "border-[var(--px-accent)] bg-[var(--px-accent-soft)]"
          : "border-[var(--px-border)] bg-[var(--px-surface-strong)] hover:bg-[var(--px-subtle)]"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[13.5px] font-semibold leading-tight text-[var(--px-text)]">
          {company.name}
        </span>
        <span
          aria-hidden
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass(company)}`}
        />
      </span>
      <span className="mt-1 block truncate text-[11px] text-[var(--px-muted)]">
        {[company.municipality, company.organisationForm]
          .filter(Boolean)
          .join(" · ") || "Kommune ikke oppgitt"}
      </span>
      <span className="mt-2.5 flex items-end gap-3.5">
        <span className="block">
          <span className="data-label block text-[8px] text-[var(--px-muted)]">
            OMSETNING
          </span>
          <span className="block font-mono text-[13px] font-semibold tabular-nums text-[var(--px-text)]">
            {formatCompactAmount(company.revenue, company.currency)}
          </span>
        </span>
        <span className="block">
          <span className="data-label block text-[8px] text-[var(--px-muted)]">
            ANSATTE
          </span>
          <span className="block font-mono text-[13px] font-semibold tabular-nums text-[var(--px-text)]">
            {formatCount(company.employeeCount)}
          </span>
        </span>
        <span className="ml-auto block text-right">
          <span className="data-label block text-[8px] text-[var(--px-muted)]">
            EBIT-MARGIN
          </span>
          <span
            className={`block font-mono text-[13px] font-semibold tabular-nums ${
              margin === null
                ? "text-[var(--px-muted)]"
                : margin < 0
                  ? "text-[var(--px-error)]"
                  : "text-[var(--px-success)]"
            }`}
          >
            {formatPercent(margin)}
          </span>
        </span>
      </span>
    </button>
  );
}

const TABLE_HEADINGS = [
  "Selskap",
  "Omsetning",
  "EBIT",
  "Resultat før skatt",
  "Årsresultat",
  "Egenkapital",
  "Sum eiendeler",
  "Ansatte",
];

function CompanyTable({
  data,
  groupTaxYear,
}: {
  data: CompanyMapListData;
  groupTaxYear: number;
}) {
  return (
    <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
      <caption className="sr-only">
        Registrerte selskaper sortert etter omsetning, med siste publiserte
        nøkkeltall og antall ansatte.
      </caption>
      <thead>
        <tr className="border-b border-[var(--px-border)] text-[var(--px-muted)]">
          {TABLE_HEADINGS.map((heading) => (
            <th
              key={heading}
              scope="col"
              className="data-label bg-[var(--px-subtle)] px-3 py-2.5 text-[9.5px] uppercase"
            >
              {heading}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.companies.map((company) => (
          <tr
            key={company.orgNumber}
            className="border-b border-[var(--px-border-subtle)] last:border-0"
          >
            <th scope="row" className="px-3 py-3 font-normal">
              <Link
                href={company.profileHref as never}
                className="font-semibold text-[var(--px-accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)]"
              >
                {company.name}
              </Link>
              <span className="mt-1 block text-xs text-[var(--px-muted)]">
                {company.orgNumber}
                {company.organisationForm ? ` · ${company.organisationForm}` : ""}
                {company.municipality ? ` · ${company.municipality}` : ""}
              </span>
              {company.groupLabel ? (
                <span className="mt-1 block text-xs text-[var(--px-muted)]">
                  {company.groupLabel}. Eierstruktur per 31. desember{" "}
                  {groupTaxYear}.
                </span>
              ) : null}
              {company.fiscalYear && company.financialSource ? (
                <span className="mt-1 block text-xs text-[var(--px-muted)]">
                  {company.statementScope === "CONSOLIDATED"
                    ? "Konsernregnskap"
                    : "Selskapsregnskap"}
                  {` · ${company.fiscalYear} · ${company.currency ?? "Valuta mangler"}`}
                  {` · Kilde: ${company.financialSource.sourceSystem === "BRREG" ? "Brønnøysundregistrene" : company.financialSource.sourceSystem}`}
                  {company.financialSource.publishedAt
                    ? ` · Publisert ${formatSourceDate(company.financialSource.publishedAt)}`
                    : ""}
                  {` · Hentet ${formatSourceDate(company.financialSource.fetchedAt)}`}
                </span>
              ) : (
                <span className="mt-1 block text-xs text-[var(--px-muted)]">
                  Regnskapstall er ikke tilgjengelige for dette omfanget.
                </span>
              )}
            </th>
            {(
              [
                company.revenue,
                company.ebit,
                company.preTaxProfit,
                company.netIncome,
                company.equity,
                company.totalAssets,
              ] as Array<string | null>
            ).map((value, index) => (
              <td
                key={index}
                className="whitespace-nowrap px-3 py-3 font-mono tabular-nums"
              >
                {value === null &&
                index === 2 &&
                company.preTaxProfitStatus === "AMBIGUOUS"
                  ? "Flertydige kildelinjer"
                  : formatCompactAmount(value, company.currency)}
              </td>
            ))}
            <td className="px-3 py-3 font-mono tabular-nums">
              {formatCount(company.employeeCount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CompanyMapResultsStrip({
  data,
  loading,
  open,
  onOpenChange,
  view,
  onViewChange,
  selectedOrgNumber,
  onSelectCompany,
  onLoadMore,
  loadingMore,
  scopeLabel,
}: {
  data: CompanyMapListData | null;
  loading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: CompanyMapResultView;
  onViewChange: (view: CompanyMapResultView) => void;
  selectedOrgNumber: string | null;
  onSelectCompany: (company: CompanyMapCompany) => void;
  onLoadMore: () => void;
  loadingMore: boolean;
  scopeLabel: string;
}) {
  const bodyId = React.useId();
  const isEmpty = !loading && data?.companies.length === 0;

  return (
    <section
      id="company-results"
      aria-labelledby="company-results-heading"
      className="z-20 shrink-0 border-t border-[var(--px-border)] bg-[var(--px-surface-strong)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2
            id="company-results-heading"
            className="text-[13px] font-semibold text-[var(--px-text)]"
          >
            {scopeLabel}
          </h2>
          <p className="data-label truncate text-[11px] tabular-nums text-[var(--px-muted)]">
            {data ? formatCount(data.page.total) : "—"} · SORTERT ETTER OMSETNING ↓
          </p>
        </div>
        <div className="flex items-center gap-1">
          <div
            role="group"
            aria-label="Visning av resultatlisten"
            className="flex gap-0.5 rounded-lg bg-[rgba(15,23,42,0.05)] p-0.5"
          >
            {(
              [
                ["CARDS", "Kort"],
                ["TABLE", "Tabell"],
              ] as Array<[CompanyMapResultView, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => onViewChange(value)}
                className={`rounded-md px-2.5 py-1.5 text-[12px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)] ${
                  view === value
                    ? "bg-[var(--px-surface-strong)] text-[var(--px-accent)] shadow-sm"
                    : "text-[var(--px-muted)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => onOpenChange(!open)}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold text-[var(--px-muted)] hover:bg-[var(--px-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)]"
          >
            <span aria-hidden className="material-symbols-outlined text-[18px]">
              {open ? "expand_more" : "expand_less"}
            </span>
            {open ? "Skjul" : "Vis"}
          </button>
        </div>
      </div>

      {open ? (
        <div id={bodyId} className="border-t border-[var(--px-border-subtle)]">
          {loading ? (
            <p role="status" className="px-5 py-4 text-sm text-[var(--px-muted)]">
              Laster selskaper …
            </p>
          ) : isEmpty ? (
            <p className="flex items-center gap-2.5 px-5 py-4 text-sm text-[var(--px-muted)]">
              <span aria-hidden className="material-symbols-outlined text-[20px]">
                search_off
              </span>
              Ingen selskaper i utsnittet matcher filtrene.
            </p>
          ) : view === "CARDS" ? (
            <div className="flex gap-3 overflow-x-auto px-5 pb-4 pt-3">
              {data?.companies.map((company) => (
                <CompanyCard
                  key={company.orgNumber}
                  company={company}
                  selected={company.orgNumber === selectedOrgNumber}
                  onSelect={() => onSelectCompany(company)}
                />
              ))}
              {data?.page.hasMore ? (
                <button
                  type="button"
                  onClick={onLoadMore}
                  disabled={loadingMore}
                  className="w-[152px] shrink-0 rounded-[14px] border border-dashed border-[var(--px-border)] text-[13px] font-semibold text-[var(--px-accent)] hover:bg-[var(--px-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)] disabled:opacity-60"
                >
                  {loadingMore ? "Laster …" : "Last 100 til"}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="max-h-[42vh] overflow-auto">
              {data ? (
                <CompanyTable
                  data={data}
                  groupTaxYear={data.provenance.groupTaxYear}
                />
              ) : null}
              {data?.page.hasMore ? (
                <div className="p-4 text-center">
                  <button
                    type="button"
                    onClick={onLoadMore}
                    disabled={loadingMore}
                    className="min-h-11 rounded-full bg-[var(--px-action)] px-5 text-sm font-semibold text-white hover:bg-[var(--px-action-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)] focus-visible:ring-offset-2 disabled:opacity-60"
                  >
                    {loadingMore ? "Laster …" : "Last 100 til"}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
