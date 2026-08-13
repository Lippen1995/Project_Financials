"use client";

import * as React from "react";

import {
  COMPANY_MAP_RANGE_FIELDS,
  COMPANY_MAP_STATUS_LABELS,
  type CompanyMapFilterState,
  type CompanyMapStatus,
} from "@/components/company-map/company-map-filter-state";
import { formatCount } from "@/components/company-map/company-map-format";
import type { CompanyMapRangeKey } from "@/lib/company-map";
import { NORWEGIAN_COUNTIES } from "@/lib/norwegian-counties";

const FIELD_CLASS =
  "h-9 rounded-lg border border-[var(--px-border)] bg-[var(--px-surface-strong)] text-[13.5px] text-[var(--px-text)] outline-none focus-visible:border-[var(--px-accent)] focus-visible:ring-[3px] focus-visible:ring-[var(--px-accent-soft)]";

function chipClass(active: boolean) {
  return [
    "min-h-9 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)] focus-visible:ring-offset-2",
    active
      ? "border-[var(--px-accent)] bg-[var(--px-accent-soft)] text-[var(--px-accent)]"
      : "border-[var(--px-border)] bg-[var(--px-surface-strong)] text-[var(--px-text)] hover:bg-[var(--px-subtle)]",
  ].join(" ");
}

function FilterToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-md py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)]"
    >
      <span className="text-[13px] text-[var(--px-text)]">{label}</span>
      <span
        aria-hidden
        className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors ${
          checked ? "bg-[var(--px-accent)]" : "bg-[rgba(15,23,42,0.18)]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-[left] ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export function CompanyMapToolbar({
  filters,
  onFiltersChange,
  onReset,
  panelOpen,
  onPanelOpenChange,
  activeFilterCount,
  totalLabel,
  busy,
}: {
  filters: CompanyMapFilterState;
  onFiltersChange: (next: CompanyMapFilterState) => void;
  onReset: () => void;
  panelOpen: boolean;
  onPanelOpenChange: (open: boolean) => void;
  activeFilterCount: number;
  totalLabel: string | null;
  busy: boolean;
}) {
  const panelId = React.useId();
  const moreActive = panelOpen || activeFilterCount > 0;

  function toggleStatus(status: CompanyMapStatus) {
    const next = filters.companyStatuses.includes(status)
      ? filters.companyStatuses.filter((item) => item !== status)
      : [...filters.companyStatuses, status];
    if (next.length === 0) return;
    onFiltersChange({ ...filters, companyStatuses: next });
  }

  function setRange(
    key: CompanyMapRangeKey,
    bound: "min" | "max",
    value: string,
  ) {
    onFiltersChange({
      ...filters,
      ranges: {
        ...filters.ranges,
        [key]: { ...filters.ranges[key], [bound]: value },
      },
    });
  }

  return (
    <div className="relative z-30 shrink-0">
      <div className="flex h-[52px] items-center gap-2.5 overflow-hidden border-b border-[var(--px-border)] bg-[var(--px-surface-strong)] px-4 sm:px-[18px]">
        <div className="relative min-w-[140px] max-w-[300px] flex-[1_1_240px]">
          <label htmlFor="company-map-search" className="sr-only">
            Søk etter selskapsnavn eller organisasjonsnummer
          </label>
          <span
            aria-hidden
            className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[19px] text-[var(--px-muted)]"
          >
            search
          </span>
          <input
            id="company-map-search"
            type="search"
            value={filters.search}
            onChange={(event) =>
              onFiltersChange({ ...filters, search: event.target.value })
            }
            placeholder="Søk navn eller org.nr"
            className={`${FIELD_CLASS} w-full py-2 pl-[37px] pr-3`}
          />
        </div>

        <div className="relative shrink-0">
          <label htmlFor="company-map-county" className="sr-only">
            Fylke
          </label>
          <select
            id="company-map-county"
            value={filters.county}
            onChange={(event) =>
              onFiltersChange({ ...filters, county: event.target.value })
            }
            className={`${FIELD_CLASS} max-w-[170px] cursor-pointer appearance-none py-2 pl-3 pr-8`}
          >
            <option value="">Hele Norge</option>
            {NORWEGIAN_COUNTIES.map((county) => (
              <option key={county.code} value={county.code}>
                {county.name}
              </option>
            ))}
          </select>
          <span
            aria-hidden
            className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[18px] text-[var(--px-muted)]"
          >
            expand_more
          </span>
        </div>

        <button
          type="button"
          aria-expanded={panelOpen}
          aria-controls={panelId}
          onClick={() => onPanelOpenChange(!panelOpen)}
          className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)] focus-visible:ring-offset-2 ${
            moreActive
              ? "border-[var(--px-accent)] bg-[var(--px-accent-soft)] text-[var(--px-accent)]"
              : "border-[var(--px-border)] bg-[var(--px-surface-strong)] text-[var(--px-text)]"
          }`}
        >
          <span aria-hidden className="material-symbols-outlined text-[18px]">
            tune
          </span>
          Flere filtre
          {activeFilterCount > 0 ? (
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--px-accent)] px-1.5 font-mono text-[11px] tabular-nums text-white">
              {activeFilterCount}
            </span>
          ) : null}
        </button>

        <div className="flex-1" />

        <span
          role="status"
          className="data-label hidden whitespace-nowrap text-[11px] tabular-nums text-[var(--px-muted)] sm:block"
        >
          {busy ? "OPPDATERER …" : totalLabel ? `${totalLabel} TREFF` : ""}
        </span>

        <button
          type="button"
          onClick={onReset}
          className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-[12.5px] font-semibold text-[var(--px-muted)] hover:bg-[var(--px-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)]"
        >
          <span aria-hidden className="material-symbols-outlined text-[17px]">
            restart_alt
          </span>
          Nullstill
        </button>
      </div>

      {panelOpen ? (
        <div
          id={panelId}
          className="absolute inset-x-0 top-full border-b border-[var(--px-border)] bg-[var(--px-surface-strong)] px-5 pb-5 pt-[18px] shadow-[0_12px_24px_rgba(15,23,42,0.18)]"
        >
          <p className="data-label m-0 mb-3 text-[10px] text-[var(--px-muted)]">
            NØKKELTALL · MIN / MAKS
          </p>
          <div className="grid max-w-[1200px] grid-cols-[repeat(auto-fit,minmax(172px,1fr))] gap-x-[18px] gap-y-3.5">
            {COMPANY_MAP_RANGE_FIELDS.map((field) => (
              <div key={field.key} className="min-w-0">
                <span
                  id={`${panelId}-${field.key}`}
                  className="data-label block truncate text-[9.5px] text-[var(--px-muted)]"
                >
                  {field.label}{" "}
                  <span className="text-[var(--px-accent)]">{field.unit}</span>
                </span>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <input
                    type="number"
                    inputMode="decimal"
                    aria-label={`${field.label} minimum${field.unit ? ` i ${field.unit}` : ""}`}
                    value={filters.ranges[field.key].min}
                    onChange={(event) =>
                      setRange(field.key, "min", event.target.value)
                    }
                    placeholder="Min"
                    className={`${FIELD_CLASS} w-full min-w-0 px-2 py-1.5 font-mono text-[12px] tabular-nums`}
                  />
                  <span aria-hidden className="text-[12px] text-[var(--px-muted)]">
                    –
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    aria-label={`${field.label} maksimum${field.unit ? ` i ${field.unit}` : ""}`}
                    value={filters.ranges[field.key].max}
                    onChange={(event) =>
                      setRange(field.key, "max", event.target.value)
                    }
                    placeholder="Maks"
                    className={`${FIELD_CLASS} w-full min-w-0 px-2 py-1.5 font-mono text-[12px] tabular-nums`}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-[18px] grid max-w-[1200px] grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-7 gap-y-4 border-t border-[var(--px-border-subtle)] pt-4">
            <fieldset className="min-w-0 border-0 p-0">
              <legend className="data-label text-[9.5px] text-[var(--px-muted)]">
                ORGANISASJONSFORM
              </legend>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  aria-pressed={filters.organisationForms === "AS,ASA"}
                  onClick={() =>
                    onFiltersChange({ ...filters, organisationForms: "AS,ASA" })
                  }
                  className={chipClass(filters.organisationForms === "AS,ASA")}
                >
                  AS og ASA
                </button>
                <button
                  type="button"
                  aria-pressed={filters.organisationForms === "ALL"}
                  onClick={() =>
                    onFiltersChange({ ...filters, organisationForms: "ALL" })
                  }
                  className={chipClass(filters.organisationForms === "ALL")}
                >
                  Alle former
                </button>
              </div>
            </fieldset>

            <fieldset className="min-w-0 border-0 p-0">
              <legend className="data-label text-[9.5px] text-[var(--px-muted)]">
                STATUS
              </legend>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(
                  Object.keys(COMPANY_MAP_STATUS_LABELS) as CompanyMapStatus[]
                ).map((status) => (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={filters.companyStatuses.includes(status)}
                    onClick={() => toggleStatus(status)}
                    className={chipClass(
                      filters.companyStatuses.includes(status),
                    )}
                  >
                    {COMPANY_MAP_STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="flex min-w-0 flex-col gap-0.5">
              <FilterToggle
                label="Kun konsern / morselskap"
                checked={filters.onlyGroupMembers}
                onChange={(next) =>
                  onFiltersChange({ ...filters, onlyGroupMembers: next })
                }
              />
              <FilterToggle
                label="Har publisert regnskap"
                checked={filters.requirePublishedFinancials}
                onChange={(next) =>
                  onFiltersChange({
                    ...filters,
                    requirePublishedFinancials: next,
                  })
                }
              />
            </div>
          </div>

          <p className="mt-4 max-w-[720px] text-[11px] leading-5 text-[var(--px-muted)]">
            Beløpsfiltrene måles mot det valgte regnskapsomfanget. Selskaper uten
            publisert regnskap for omfanget faller utenfor et beløpsfilter.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function formatToolbarTotal(total: number | null) {
  return total === null ? null : formatCount(total);
}
