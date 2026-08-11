"use client";

import * as React from "react";

import { HealthRadar } from "@/components/health/health-radar";
import {
  computeHealthScore,
  formatHealthMetricValue,
  type HealthFacts,
  type HealthScoreConfig,
} from "@/lib/health-score";

/**
 * Live preview for the model editor.
 *
 * The admin scores a test company that they control, so the effect of a weight
 * change or a moved grade line is visible immediately and against a known case.
 * It runs the exact same `computeHealthScore` the company page runs — there is no
 * second, approximate implementation of the model here.
 */

const NDASH = "–";

export type PreviewScenarioKey = "solid" | "marginal" | "distressed" | "thin";

type ScenarioDefinition = { label: string; description: string; facts: HealthFacts };

function facts(partial: {
  status?: HealthFacts["status"];
  employeeCount?: number | null;
  companyAgeYears?: number | null;
  yearsSinceLastReport?: number | null;
  reportedYearCount?: number;
  positiveEbitShare?: number | null;
  latest: Partial<HealthFacts["latest"]> & { fiscalYear: number };
  previous?: (Partial<HealthFacts["latest"]> & { fiscalYear: number }) | null;
  earliest?: (Partial<HealthFacts["latest"]> & { fiscalYear: number }) | null;
}): HealthFacts {
  const year = (
    input: (Partial<HealthFacts["latest"]> & { fiscalYear: number }) | null | undefined,
  ) =>
    input
      ? {
          fiscalYear: input.fiscalYear,
          revenue: input.revenue ?? null,
          operatingProfit: input.operatingProfit ?? null,
          netIncome: input.netIncome ?? null,
          equity: input.equity ?? null,
          assets: input.assets ?? null,
          debt:
            input.equity !== null && input.equity !== undefined && input.assets !== null && input.assets !== undefined
              ? input.assets - input.equity
              : null,
          currentAssets: input.currentAssets ?? null,
          currentLiabilities: input.currentLiabilities ?? null,
          inventory: input.inventory ?? null,
          cash: input.cash ?? null,
          financialExpense: input.financialExpense ?? null,
          payrollExpense: input.payrollExpense ?? null,
        }
      : null;

  return {
    status: partial.status ?? "ACTIVE",
    employeeCount: partial.employeeCount ?? null,
    companyAgeYears: partial.companyAgeYears ?? null,
    yearsSinceLastReport: partial.yearsSinceLastReport ?? null,
    reportedYearCount: partial.reportedYearCount ?? 0,
    positiveEbitShare: partial.positiveEbitShare ?? null,
    latest: year(partial.latest),
    previous: year(partial.previous),
    earliest: year(partial.earliest ?? partial.previous),
  };
}

/**
 * Four reference companies covering the range the model has to behave sensibly
 * across: a healthy operator, a thin-margin one, a company in trouble, and one
 * where we only hold the headline figures.
 */
export const previewScenarios: Record<PreviewScenarioKey, ScenarioDefinition> = {
  solid: {
    label: "Solid selskap",
    description: "God margin, sterk balanse, jevn vekst og full linjeoppløsning.",
    facts: facts({
      employeeCount: 42,
      companyAgeYears: 14,
      yearsSinceLastReport: 0,
      reportedYearCount: 6,
      positiveEbitShare: 100,
      latest: {
        fiscalYear: 2024,
        revenue: 186_000_000,
        operatingProfit: 24_500_000,
        netIncome: 18_100_000,
        equity: 92_000_000,
        assets: 148_000_000,
        currentAssets: 71_000_000,
        currentLiabilities: 38_000_000,
        inventory: 12_000_000,
        cash: 26_000_000,
        financialExpense: 1_900_000,
        payrollExpense: 68_000_000,
      },
      previous: {
        fiscalYear: 2023,
        revenue: 162_000_000,
        operatingProfit: 19_800_000,
        equity: 78_000_000,
        assets: 133_000_000,
      },
      earliest: { fiscalYear: 2019, revenue: 96_000_000 },
    }),
  },
  marginal: {
    label: "Marginalt selskap",
    description: "Så vidt positiv drift, tynn egenkapital og likviditetsgrad rundt 1.",
    facts: facts({
      employeeCount: 18,
      companyAgeYears: 6,
      yearsSinceLastReport: 0,
      reportedYearCount: 4,
      positiveEbitShare: 50,
      latest: {
        fiscalYear: 2024,
        revenue: 41_000_000,
        operatingProfit: 620_000,
        netIncome: 140_000,
        equity: 4_100_000,
        assets: 33_000_000,
        currentAssets: 15_400_000,
        currentLiabilities: 15_100_000,
        inventory: 5_200_000,
        cash: 1_300_000,
        financialExpense: 900_000,
        payrollExpense: 21_000_000,
      },
      previous: {
        fiscalYear: 2023,
        revenue: 43_500_000,
        operatingProfit: 1_400_000,
        equity: 4_000_000,
        assets: 31_000_000,
      },
      earliest: { fiscalYear: 2021, revenue: 38_000_000 },
    }),
  },
  distressed: {
    label: "Selskap i vansker",
    description: "Driftsunderskudd, negativ egenkapital og etterslep i rapporteringen.",
    facts: facts({
      employeeCount: 9,
      companyAgeYears: 3,
      yearsSinceLastReport: 2,
      reportedYearCount: 3,
      positiveEbitShare: 0,
      latest: {
        fiscalYear: 2022,
        revenue: 12_400_000,
        operatingProfit: -4_100_000,
        netIncome: -4_900_000,
        equity: -2_300_000,
        assets: 9_800_000,
        currentAssets: 3_200_000,
        currentLiabilities: 9_600_000,
        inventory: 1_800_000,
        cash: 190_000,
        financialExpense: 810_000,
        payrollExpense: 9_900_000,
      },
      previous: {
        fiscalYear: 2021,
        revenue: 17_800_000,
        operatingProfit: -1_200_000,
        equity: 2_400_000,
        assets: 13_100_000,
      },
      earliest: { fiscalYear: 2020, revenue: 19_500_000 },
    }),
  },
  thin: {
    label: "Bare hovedtall",
    description: "Typisk småselskap der vi kun har de fem hovedtallene fra Brreg.",
    facts: facts({
      companyAgeYears: 9,
      yearsSinceLastReport: 0,
      reportedYearCount: 2,
      positiveEbitShare: 100,
      latest: {
        fiscalYear: 2024,
        revenue: 6_200_000,
        operatingProfit: 540_000,
        netIncome: 390_000,
        equity: 2_800_000,
        assets: 5_100_000,
      },
      previous: { fiscalYear: 2023, revenue: 5_700_000, operatingProfit: 410_000, equity: 2_500_000 },
    }),
  },
};

export function HealthScorePreview({ config }: { config: HealthScoreConfig }) {
  const [scenario, setScenario] = React.useState<PreviewScenarioKey>("solid");
  const [status, setStatus] = React.useState<HealthFacts["status"]>("ACTIVE");

  const active = previewScenarios[scenario];
  const result = React.useMemo(
    () => computeHealthScore({ ...active.facts, status }, config),
    [active, status, config],
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-[15px] font-semibold text-slate-900">Forhåndsvisning</h3>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(previewScenarios) as PreviewScenarioKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setScenario(key)}
              className={`rounded-full border px-3 py-1 text-[11.5px] ${
                scenario === key
                  ? "border-[var(--px-action)] bg-[var(--px-action)] text-white"
                  : "border-slate-200 text-slate-600 hover:border-slate-400"
              }`}
            >
              {previewScenarios[key].label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[12px] text-slate-500">{active.description}</p>

      <label className="mt-3 flex items-center gap-2 text-[12px] text-slate-600">
        Registerstatus
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as HealthFacts["status"])}
          className="rounded-md border border-slate-200 px-2 py-1"
        >
          <option value="ACTIVE">Aktiv</option>
          <option value="BANKRUPT">Konkurs</option>
          <option value="DISSOLVED">Oppløst</option>
        </select>
      </label>

      <div className="mt-4 grid gap-4 xl:grid-cols-[300px_1fr]">
        <div className="rounded-2xl bg-[var(--px-panel)] px-4 pb-3 pt-4 text-white">
          <div className="flex items-baseline gap-2">
            <span className="text-[34px] font-semibold leading-none tabular-nums">
              {result.score}
            </span>
            <span className="text-[12px] text-white/55">/ 100</span>
          </div>
          <div className="mt-1 text-[11.5px] text-white/70">
            Karakter {result.grade} · {result.gradeLabel} · risiko {result.riskLabel.toLowerCase()}
          </div>
          <HealthRadar
            axes={result.pillars.map((pillar) => ({
              key: pillar.key,
              label: pillar.label,
              score: pillar.score,
              weightShare: pillar.weightShare,
            }))}
            size={268}
            variant="dark"
            className="mx-auto mt-1"
          />
          <div className="border-t border-white/10 pt-2 text-[10.5px] leading-relaxed text-white/55">
            Datadekning {result.coverage} %{result.thinData ? " · under terskelen" : ""}
            <br />
            Vektet snitt {result.rawScore}
            {result.coveragePenaltyPoints > 0
              ? ` · −${result.coveragePenaltyPoints} for tynn dekning`
              : ""}
            {result.overrideApplied ? " · overstyrt av registerstatus" : ""}
          </div>
        </div>

        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                <th scope="col" className="py-1.5 pr-3 text-left font-medium">
                  Dimensjon / nøkkeltall
                </th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                  Verdi
                </th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                  Poeng
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Vekt
                </th>
              </tr>
            </thead>
            <tbody>
              {result.pillars.map((pillar) => (
                <React.Fragment key={pillar.key}>
                  <tr className="border-b border-slate-100 bg-slate-50/70">
                    <th scope="row" className="py-1.5 pr-3 text-left font-semibold text-slate-800">
                      {pillar.label}
                    </th>
                    <td className="py-1.5 pr-3 text-right text-slate-400">{NDASH}</td>
                    <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-slate-800">
                      {pillar.score === null ? NDASH : Math.round(pillar.score)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-600">
                      {Math.round(pillar.weightShare)} %
                    </td>
                  </tr>
                  {pillar.metrics.map((metric) => (
                    <tr key={metric.key} className="border-b border-slate-100">
                      <th
                        scope="row"
                        className="py-1 pl-4 pr-3 text-left font-normal text-slate-600"
                      >
                        {metric.label}
                        {!metric.available ? (
                          <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-slate-500">
                            mangler data
                          </span>
                        ) : null}
                      </th>
                      <td className="py-1 pr-3 text-right tabular-nums text-slate-700">
                        {metric.available
                          ? formatHealthMetricValue(metric.value, metric.unit)
                          : NDASH}
                      </td>
                      <td className="py-1 pr-3 text-right tabular-nums text-slate-700">
                        {metric.score === null ? NDASH : Math.round(metric.score)}
                      </td>
                      <td className="py-1 text-right tabular-nums text-slate-500">
                        {Math.round(metric.weightShare)} %
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
