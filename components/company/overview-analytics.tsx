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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr),340px]">
      <Card className="border-[#E7ECF1] bg-[linear-gradient(180deg,#FFFFFF_0%,#FBFCFD_100%)] shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[1.65rem] font-semibold tracking-tight text-[#101828]">Oversikt</h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#667085]">
              Historisk utvikling i inntekt, EBIT-margin og EBIT basert på verifiserte Brreg-regnskap.
            </p>
          </div>
          <div className="rounded-full border border-[#DCE4EB] bg-[#F8FAFC] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#667085]">
            BRREG
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
