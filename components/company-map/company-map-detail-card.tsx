"use client";

import Link from "next/link";
import * as React from "react";

import {
  formatCompactAmount,
  formatCount,
  formatSourceDate,
} from "@/components/company-map/company-map-format";
import type { CompanyMapCompany } from "@/components/company-map/company-map-types";

function MetricCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "positive" | "negative";
}) {
  return (
    <div className="border-r border-t border-[var(--px-border-subtle)] px-3 py-2.5 last:border-r-0">
      <dt className="data-label text-[9px] text-[var(--px-muted)]">{label}</dt>
      <dd
        className={`m-0 mt-0.5 font-mono text-[14px] font-semibold tabular-nums ${
          tone === "positive"
            ? "text-[var(--px-success)]"
            : tone === "negative"
              ? "text-[var(--px-error)]"
              : "text-[var(--px-text)]"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function signedTone(value: string | null) {
  if (value === null) return "neutral" as const;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "neutral" as const;
  return amount < 0 ? ("negative" as const) : ("positive" as const);
}

export function CompanyMapDetailCard({
  company,
  groupTaxYear,
  isAuthenticated,
  onClose,
  onRequestSignIn,
}: {
  company: CompanyMapCompany;
  groupTaxYear: number | null;
  isAuthenticated: boolean;
  onClose: () => void;
  onRequestSignIn: () => void;
}) {
  const scopeLabel =
    company.statementScope === "CONSOLIDATED"
      ? "Konsernregnskap"
      : "Selskapsregnskap";

  return (
    <div
      role="region"
      aria-label={`Detaljer om ${company.name}`}
      className="absolute left-4 top-4 z-[8] max-h-[calc(100%-2rem)] w-[340px] max-w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface-strong)] p-5 shadow-[0_12px_32px_rgba(15,23,42,0.16)]"
    >
      <div className="flex items-start justify-between gap-2.5">
        <span className="data-label rounded-full border border-[var(--px-border)] bg-[var(--px-subtle)] px-2.5 py-1 text-[10px] font-semibold uppercase text-[var(--px-muted)]">
          {company.organisationForm ?? "Registrert enhet"}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex rounded-md p-0.5 text-[var(--px-muted)] hover:bg-[var(--px-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)]"
        >
          <span aria-hidden className="material-symbols-outlined text-[20px]">
            close
          </span>
          <span className="sr-only">Lukk detaljkortet</span>
        </button>
      </div>

      <h2 className="editorial-display mt-3 text-[21px] leading-tight text-[var(--px-text)]">
        {company.name}
      </h2>
      <p className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-[12.5px] text-[var(--px-muted)]">
        <span className="font-mono tabular-nums">
          Org.nr {company.orgNumber}
        </span>
      </p>

      {company.municipality ? (
        <p className="mt-2.5 flex items-start gap-1.5 text-[13px] text-[var(--px-text)]">
          <span
            aria-hidden
            className="material-symbols-outlined text-[18px] text-[var(--px-muted)]"
          >
            place
          </span>
          {company.municipality}
        </p>
      ) : null}

      {company.groupLabel ? (
        <p className="mt-2.5 flex items-start gap-1.5 text-[13px] text-[var(--px-text)]">
          <span
            aria-hidden
            className="material-symbols-outlined text-[18px] text-[var(--px-muted)]"
          >
            hub
          </span>
          <span>
            {company.groupLabel}
            {groupTaxYear
              ? `. Eierstruktur per 31. desember ${groupTaxYear}.`
              : ""}
          </span>
        </p>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-[var(--px-border-subtle)]">
        <p className="data-label bg-[var(--px-subtle)] px-3 py-2 text-[9px] text-[var(--px-muted)]">
          {company.fiscalYear
            ? `${scopeLabel.toUpperCase()} · ${company.fiscalYear}`
            : "INGEN PUBLISERTE TALL FOR OMFANGET"}
        </p>
        <dl className="grid grid-cols-2">
          <MetricCell
            label="OMSETNING"
            value={formatCompactAmount(company.revenue, company.currency)}
            tone="neutral"
          />
          <MetricCell
            label="EBIT"
            value={formatCompactAmount(company.ebit, company.currency)}
            tone={signedTone(company.ebit)}
          />
          <MetricCell
            label="ÅRSRESULTAT"
            value={formatCompactAmount(company.netIncome, company.currency)}
            tone={signedTone(company.netIncome)}
          />
          <MetricCell
            label="ANSATTE"
            value={formatCount(company.employeeCount)}
            tone="neutral"
          />
        </dl>
      </div>

      {company.financialSource ? (
        <p className="mt-2.5 text-[11px] leading-5 text-[var(--px-muted)]">
          Kilde:{" "}
          {company.financialSource.sourceSystem === "BRREG"
            ? "Brønnøysundregistrene"
            : company.financialSource.sourceSystem}
          {company.financialSource.publishedAt
            ? ` · Publisert ${formatSourceDate(company.financialSource.publishedAt)}`
            : ""}
          {` · Hentet ${formatSourceDate(company.financialSource.fetchedAt)}`}
        </p>
      ) : null}

      <div className="mt-4 flex gap-2">
        <Link
          href={company.profileHref as never}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--px-action)] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[var(--px-action-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)] focus-visible:ring-offset-2"
        >
          <span aria-hidden className="material-symbols-outlined text-[18px]">
            arrow_forward
          </span>
          Se full profil
        </Link>
        {isAuthenticated ? null : (
          <button
            type="button"
            onClick={onRequestSignIn}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-[var(--px-border)] bg-[var(--px-surface-strong)] px-4 py-2.5 text-[13px] font-semibold text-[var(--px-text)] hover:bg-[var(--px-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)]"
          >
            <span
              aria-hidden
              className="material-symbols-outlined text-[17px] text-[var(--px-watch)]"
            >
              lock
            </span>
            Følg
          </button>
        )}
      </div>
    </div>
  );
}
