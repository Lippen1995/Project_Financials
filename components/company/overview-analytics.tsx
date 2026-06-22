"use client";

import { useMemo, useState } from "react";

import { FinancialChart } from "@/components/company/financial-chart";
import { OverviewSidePanel } from "@/components/company/overview-side-panel";
import { getOverviewChartPoints } from "@/lib/overview-chart";
import {
  DataAvailability,
  NormalizedCompany,
  NormalizedFinancialStatement,
} from "@/lib/types";
import { cn, formatDate, formatNumber } from "@/lib/utils";

export function OverviewAnalytics({
  company,
  statements,
  healthScore,
  investigationNotes,
  financialsAvailability,
  rolesAvailability,
}: {
  company: NormalizedCompany;
  statements: NormalizedFinancialStatement[];
  healthScore: number;
  investigationNotes: string[];
  financialsAvailability: DataAvailability;
  rolesAvailability: DataAvailability;
}) {
  const points = useMemo(() => getOverviewChartPoints(statements), [statements]);
  const defaultYear = points.at(-1)?.fiscalYear ?? null;
  const [overviewYear, setOverviewYear] = useState<number | null>(defaultYear);
  const facts = [
    { label: "Juridisk form", value: company.legalForm ?? "Ikke tilgjengelig", wide: false },
    {
      label: "Registrert",
      value: company.registeredAt
        ? String(new Date(company.registeredAt).getFullYear())
        : "Ikke tilgjengelig",
      wide: false,
    },
    {
      label: "Status",
      value: company.status === "ACTIVE" ? "Aktiv" : company.status,
      wide: false,
    },
    {
      label: "Forretningsadresse",
      value: company.municipality ?? company.addresses[0]?.city ?? "Ikke tilgjengelig",
      wide: false,
    },
    {
      label: "Næringskode",
      value: company.industryCode?.code
        ? `${company.industryCode.code}${company.industryCode.title ? ` · ${company.industryCode.title}` : ""}`
        : "Ikke tilgjengelig",
      wide: true,
    },
    {
      label: "Merverdiavgift",
      value:
        company.vatRegistered === null || company.vatRegistered === undefined
          ? "Ikke tilgjengelig"
          : company.vatRegistered
            ? "Registrert i MVA-registeret"
            : "Ikke registrert",
      wide: false,
    },
    { label: "Ansatte", value: formatNumber(company.employeeCount), wide: false },
  ];

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr),320px] 2xl:grid-cols-[minmax(0,1fr),340px]">
      <div className="min-w-0 space-y-4">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)]">
          <div className="flex flex-col gap-4 border-b border-[var(--px-border)] p-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="data-label text-[11px] font-semibold uppercase text-[var(--px-muted)]">
                Finansiell utvikling
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-[var(--px-text)]">
                Omsetning og driftsresultat
              </h2>
              <p className="mt-1 text-sm text-[var(--px-muted)]">
                Historiske, normaliserte regnskapstall fra tilgjengelige kilder.
              </p>
            </div>
            <div className="data-label rounded-full border border-[var(--px-border)] bg-[var(--px-subtle)] px-3 py-2 text-[10px] font-semibold uppercase text-[var(--px-muted)]">
              {points.length > 1
                ? `${points[0].fiscalYear}–${points[points.length - 1].fiscalYear}`
                : points[0]?.fiscalYear ?? "Ingen historikk"}
            </div>
          </div>
          <div className="p-5">
            <FinancialChart
              points={points}
              activeYear={overviewYear}
              onActiveYearChange={setOverviewYear}
            />
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
          <div className="data-label text-[11px] font-semibold uppercase text-[var(--px-muted)]">
            Selskapsfakta
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
            {facts.map((fact) => (
              <div
                key={fact.label}
                className={cn(
                  "border-t border-[var(--px-border)] pt-4 first:border-t-0 first:pt-0 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0 sm:first:border-l-0 sm:first:pl-0",
                  fact.wide && "2xl:col-span-2",
                )}
              >
                <div className="text-xs text-[var(--px-muted)]">{fact.label}</div>
                <div className="mt-1 text-sm font-semibold leading-5 text-[var(--px-text)]">
                  {fact.value}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-[var(--px-border)] pt-4 text-xs text-[var(--px-muted)]">
            Kilde: {company.sourceSystem} · hentet {formatDate(company.fetchedAt)}
          </div>
        </section>
      </div>

      <OverviewSidePanel
        company={company}
        statements={statements}
        activeYear={overviewYear}
        healthScore={healthScore}
        investigationNotes={investigationNotes}
        financialsAvailability={financialsAvailability}
        rolesAvailability={rolesAvailability}
      />
    </div>
  );
}
