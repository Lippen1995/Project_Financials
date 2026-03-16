import { NormalizedFinancialStatement } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

type ChartPoint = {
  fiscalYear: number;
  totalOperatingRevenue: number | null;
  operatingProfit: number | null;
};

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getChartPoint(statement: NormalizedFinancialStatement): ChartPoint {
  const payload = (statement.rawPayload ?? {}) as Record<string, any>;

  return {
    fiscalYear: statement.fiscalYear,
    totalOperatingRevenue:
      toNumber(payload.resultatregnskapResultat?.driftsresultat?.driftsinntekter?.sumDriftsinntekter) ??
      statement.revenue ??
      null,
    operatingProfit:
      toNumber(payload.resultatregnskapResultat?.driftsresultat?.driftsresultat) ??
      statement.operatingProfit ??
      null,
  };
}

function barHeight(value: number, maxValue: number) {
  return Math.max((Math.abs(value) / maxValue) * 152, 6);
}

function visibleHistory(statements: NormalizedFinancialStatement[]) {
  const points = statements
    .slice()
    .sort((left, right) => left.fiscalYear - right.fiscalYear)
    .map((statement) => getChartPoint(statement))
    .filter((point) => point.totalOperatingRevenue !== null || point.operatingProfit !== null);

  if (points.length <= 10) {
    return points;
  }

  return points.slice(-10);
}

export function FinancialChart({
  statements,
}: {
  statements: NormalizedFinancialStatement[];
  premium: boolean;
}) {
  const chartPoints = visibleHistory(statements);
  const maxValue = Math.max(
    ...chartPoints.flatMap((point) => [
      Math.abs(point.totalOperatingRevenue ?? 0),
      Math.abs(point.operatingProfit ?? 0),
    ]),
    1,
  );

  if (chartPoints.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-ink/15 bg-sand/55 p-6 text-sm text-ink/65">
        Historiske regnskapslinjer er ikke tilgjengelige fra den apne Brreg-kilden som er verifisert i ProjectX enda.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-4 rounded-full border border-ink/10 bg-white px-4 py-2 text-xs font-medium text-ink/65">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-tide" />
            Omsetning
          </span>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-ember" />
            Driftsresultat (EBIT)
          </span>
        </div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink/45">
          {chartPoints[0].fiscalYear} - {chartPoints[chartPoints.length - 1].fiscalYear}
        </p>
      </div>

      <div className="rounded-[1.5rem] bg-sand/80 p-4">
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-ink/15" />
          <div className="flex h-[22rem] items-stretch gap-3">
            {chartPoints.map((point) => (
              <div key={point.fiscalYear} className="flex flex-1 flex-col items-center justify-end gap-3">
                <div className="grid h-[19rem] w-full grid-rows-[1fr_auto_1fr] gap-3">
                  <div className="flex items-end justify-center gap-3">
                    <div className="flex w-full max-w-16 items-end">
                      {point.totalOperatingRevenue !== null ? (
                        <div
                          className="w-full rounded-t-2xl bg-gradient-to-t from-tide to-[#2f7389]"
                          style={{ height: `${barHeight(point.totalOperatingRevenue, maxValue)}px` }}
                        />
                      ) : (
                        <div className="w-full text-center text-xs text-ink/30">-</div>
                      )}
                    </div>
                    <div className="flex w-full max-w-16 items-end">
                      {point.operatingProfit !== null && point.operatingProfit >= 0 ? (
                        <div
                          className="w-full rounded-t-2xl bg-gradient-to-t from-ember to-[#f0a05f]"
                          style={{ height: `${barHeight(point.operatingProfit, maxValue)}px` }}
                        />
                      ) : (
                        <div className="w-full" />
                      )}
                    </div>
                  </div>

                  <div className="border-t border-ink/10" />

                  <div className="flex items-start justify-center gap-3">
                    <div className="flex w-full max-w-16 items-start">
                      <div className="w-full" />
                    </div>
                    <div className="flex w-full max-w-16 items-start">
                      {point.operatingProfit !== null && point.operatingProfit < 0 ? (
                        <div
                          className="w-full rounded-b-2xl bg-gradient-to-b from-ember to-[#f0a05f]"
                          style={{ height: `${barHeight(point.operatingProfit, maxValue)}px` }}
                        />
                      ) : (
                        <div className="w-full" />
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-xs font-medium text-ink/70">{point.fiscalYear}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {chartPoints.map((point) => (
          <div key={point.fiscalYear} className="rounded-2xl border border-ink/10 bg-white px-4 py-3">
            <div className="text-sm font-semibold">{point.fiscalYear}</div>
            <div className="mt-2 text-xs text-ink/60">
              Omsetning {formatCurrency(point.totalOperatingRevenue)}
            </div>
            <div className="text-xs text-ink/60">
              Driftsresultat (EBIT) {formatCurrency(point.operatingProfit)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
