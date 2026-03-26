"use client";

import { useMemo, useState } from "react";

import { EbitChart } from "@/components/company/ebit-chart";
import { FinancialChart } from "@/components/company/financial-chart";
import { OverviewSidePanel } from "@/components/company/overview-side-panel";
import { Card } from "@/components/ui/card";
import { getOverviewChartPoints } from "@/lib/overview-chart";
import { NormalizedCompany, NormalizedFinancialStatement } from "@/lib/types";

export function OverviewAnalytics({
  company,
  statements,
}: {
  company: NormalizedCompany;
  statements: NormalizedFinancialStatement[];
}) {
  const points = useMemo(() => getOverviewChartPoints(statements), [statements]);
  const defaultYear = points.at(-1)?.fiscalYear ?? null;
  const [activeYear, setActiveYear] = useState<number | null>(defaultYear);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr),320px]">
      <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.92)] shadow-none">
        <div className="flex items-start justify-between gap-4 border-b border-[rgba(15,23,42,0.08)] pb-4">
          <div>
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Oversikt</div>
            <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Drift og utvikling</h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">
              Les utviklingen i omsetning, margin og driftsresultat over tid i en rolig analyseflate.
            </p>
          </div>
          <div className="data-label rounded-full border border-[rgba(15,23,42,0.1)] bg-[rgba(49,73,95,0.05)] px-3 py-1.5 text-[11px] font-semibold uppercase text-slate-600">
            Oversikt
          </div>
        </div>

        <div className="mt-5 space-y-5">
          <FinancialChart points={points} activeYear={activeYear} onActiveYearChange={setActiveYear} />
          <EbitChart points={points} activeYear={activeYear} onActiveYearChange={setActiveYear} />
        </div>
      </Card>

      <OverviewSidePanel company={company} statements={statements} activeYear={activeYear} />
    </div>
  );
}
