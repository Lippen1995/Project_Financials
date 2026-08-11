import React from "react";

import { HealthRadar, type HealthRadarAxis } from "@/components/health/health-radar";
import {
  formatHealthMetricValue,
  type HealthPillarResult,
  type HealthScoreResult,
} from "@/lib/health-score";

/**
 * The "Finansiell helse" block on the company overview: the headline score and
 * radar on a dark panel, with the dimension breakdown and the metrics behind each
 * dimension beside it.
 *
 * Everything shown here comes from the scoring model an admin owns, and the
 * model's name is printed with the score — a reader should always be able to see
 * which yardstick produced the number.
 */

const NDASH = "–";

function PillarBar({ pillar }: { pillar: HealthPillarResult }) {
  const score = pillar.score;
  const width = score === null ? 0 : Math.max(0, Math.min(100, score));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] font-medium text-[var(--px-text)]">{pillar.label}</span>
        <span className="text-[12px] tabular-nums text-[var(--px-muted)]">
          {score === null ? NDASH : Math.round(score)}
          <span className="text-[10px]"> / 100</span>
        </span>
      </div>
      <div className="mt-1.5 h-[6px] w-full rounded-full bg-[var(--px-chart-grid)]">
        <div
          className="h-full rounded-full bg-[var(--px-chart-1)]"
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--px-muted)]">
        {/* A dimension with no data carries no weight in the average, but it is
            not free: it drags the coverage that the score is docked for. */}
        <span>{score === null ? "Ingen data — trekker ned dekningen" : `Vekt ${Math.round(pillar.weightShare)} %`}</span>
        {score !== null && pillar.coverage < 100 ? (
          <span>Datadekning {Math.round(pillar.coverage)} %</span>
        ) : null}
      </div>
    </div>
  );
}

function MetricRow({
  metric,
}: {
  metric: HealthPillarResult["metrics"][number];
}) {
  return (
    <tr className="border-t border-[var(--px-border-subtle)]">
      <th scope="row" className="py-1.5 pr-3 text-left text-[12px] font-normal text-[var(--px-text)]">
        <span title={metric.help}>{metric.label}</span>
      </th>
      <td className="py-1.5 pr-3 text-right text-[12px] tabular-nums text-[var(--px-text)]">
        {metric.available ? formatHealthMetricValue(metric.value, metric.unit) : NDASH}
      </td>
      <td className="py-1.5 pr-3 text-right text-[12px] tabular-nums text-[var(--px-muted)]">
        {metric.score === null ? NDASH : Math.round(metric.score)}
      </td>
      <td className="py-1.5 text-right text-[11px] tabular-nums text-[var(--px-muted)]">
        {Math.round(metric.weightShare)} %
      </td>
    </tr>
  );
}

export function FinancialHealthSection({
  result,
  modelName,
  matchedNacePrefix,
}: {
  result: HealthScoreResult;
  modelName: string;
  /** The NACE rule that selected the model, or null when the fallback applied. */
  matchedNacePrefix: string | null;
}) {
  const axes: HealthRadarAxis[] = result.pillars.map((pillar) => ({
    key: pillar.key,
    label: pillar.label,
    score: pillar.score,
    weightShare: pillar.weightShare,
  }));

  const scoredPillars = result.pillars.filter((pillar) => pillar.score !== null);
  const strongest = [...scoredPillars].sort(
    (left, right) => (right.score as number) - (left.score as number),
  )[0];
  const weakest = [...scoredPillars].sort(
    (left, right) => (left.score as number) - (right.score as number),
  )[0];

  return (
    <div className="border-b border-[var(--px-border)] py-6">
      <div className="data-label mb-3.5 text-[11px] uppercase text-[var(--px-muted)]">
        Finansiell helse
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(260px,320px)_1fr]">
        {/* Score + radar */}
        <div className="rounded-2xl bg-[var(--px-panel)] px-5 pb-4 pt-5 text-white">
          <div className="flex items-baseline gap-2">
            <span className="text-[38px] font-semibold leading-none tabular-nums">
              {result.score}
            </span>
            <span className="text-[13px] text-white/55">/ 100</span>
          </div>
          <div className="mt-1.5 text-[12px] text-white/70">
            Karakter {result.grade} · {result.gradeLabel} · risiko {result.riskLabel.toLowerCase()}
          </div>

          <HealthRadar axes={axes} size={272} variant="dark" className="mx-auto mt-1" />

          <div className="mt-1 border-t border-white/10 pt-3 text-[10.5px] leading-relaxed text-white/55">
            Modell: {modelName}
            {matchedNacePrefix
              ? ` · valgt av bransjeregel NACE ${matchedNacePrefix}`
              : " · gjelder alle bransjer uten egen regel"}
            <br />
            Datadekning {result.coverage} % av modellens vekt.
          </div>
        </div>

        {/* Breakdown */}
        <div className="min-w-0">
          {result.overrideApplied ? (
            <p className="m-0 mb-4 rounded-xl border border-[var(--px-error-border)] bg-[var(--px-error-soft)] px-4 py-2.5 text-[12px] leading-relaxed text-[var(--px-error)]">
              Foretaket er registrert som{" "}
              {result.overrideApplied === "BANKRUPT" ? "konkurs" : "oppløst"}. Scoren er derfor satt
              ned til {result.score} fra {result.rawScore - result.coveragePenaltyPoints},
              uavhengig av tallene i siste regnskap.
            </p>
          ) : null}

          {result.coveragePenaltyPoints > 0 || result.thinData ? (
            <p className="m-0 mb-4 rounded-xl border border-[var(--px-warning-border)] bg-[var(--px-warning-soft)] px-4 py-2.5 text-[12px] leading-relaxed text-[var(--px-warning)]">
              Bare {result.coverage} % av modellens vekt har data bak seg.
              {result.coveragePenaltyPoints > 0
                ? ` Scoren er derfor trukket ned ${result.coveragePenaltyPoints} poeng, fra ${result.rawScore} til ${result.rawScore - result.coveragePenaltyPoints}: et tynt grunnlag skal ikke gi samme uttelling som et fullstendig.`
                : " Scoren bør leses som et grovt anslag."}
            </p>
          ) : null}

          {strongest && weakest && strongest.key !== weakest.key ? (
            <p className="m-0 mb-4 max-w-[80ch] text-[13px] leading-relaxed text-[var(--px-muted)]">
              Sterkest dimensjon er{" "}
              <span className="text-[var(--px-text)]">{strongest.label.toLowerCase()}</span> med{" "}
              {Math.round(strongest.score as number)} poeng; svakest er{" "}
              <span className="text-[var(--px-text)]">{weakest.label.toLowerCase()}</span> med{" "}
              {Math.round(weakest.score as number)} poeng.
            </p>
          ) : null}

          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {result.pillars.map((pillar) => (
              <PillarBar key={pillar.key} pillar={pillar} />
            ))}
          </div>

          <details className="mt-5 border-t border-[var(--px-border)] pt-4">
            <summary className="cursor-pointer text-[12px] text-[var(--px-accent)]">
              Vis nøkkeltallene bak hver dimensjon
            </summary>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              {result.pillars.map((pillar) => (
                <div key={pillar.key} className="min-w-0">
                  <div className="data-label text-[9.5px] text-[var(--px-muted)]">
                    {pillar.label}
                  </div>
                  <table className="mt-1.5 w-full border-collapse">
                    <thead>
                      <tr className="text-[9.5px] uppercase tracking-wider text-[var(--px-muted)]">
                        <th scope="col" className="pb-1 pr-3 text-left font-normal">
                          Nøkkeltall
                        </th>
                        <th scope="col" className="pb-1 pr-3 text-right font-normal">
                          Verdi
                        </th>
                        <th scope="col" className="pb-1 pr-3 text-right font-normal">
                          Poeng
                        </th>
                        <th scope="col" className="pb-1 text-right font-normal">
                          Vekt
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pillar.metrics.map((metric) => (
                        <MetricRow key={metric.key} metric={metric} />
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
            <p className="mt-4 max-w-[80ch] text-[11px] leading-relaxed text-[var(--px-muted)]">
              Poengene er beregnet fra tallene i siste registrerte regnskap og fra
              registeropplysningene. Dette er en åpen modell, ikke en kredittvurdering. Nøkkeltall
              markert med {NDASH} mangler grunnlag i dataene våre og teller ikke med.
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}
