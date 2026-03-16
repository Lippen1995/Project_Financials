import { NormalizedFinancialStatement } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

function barHeight(value: number, maxValue: number) {
  return Math.max((value / maxValue) * 176, 18);
}

export function FinancialChart({
  statements,
  premium,
}: {
  statements: NormalizedFinancialStatement[];
  premium: boolean;
}) {
  const visibleStatements = (premium ? statements : statements.slice(0, 1)).slice().sort((left, right) => left.fiscalYear - right.fiscalYear);
  const maxValue = Math.max(
    ...visibleStatements.flatMap((statement) => [
      Math.abs(statement.revenue ?? 0),
      Math.abs(statement.operatingProfit ?? 0),
    ]),
    1,
  );

  if (visibleStatements.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-ink/15 bg-sand/55 p-6 text-sm text-ink/65">
        Historiske regnskapslinjer er ikke tilgjengelige fra den apne Brreg-kilden som er verifisert i ProjectX enda.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[1.5rem] bg-sand/80 p-4">
        <div className="flex h-72 items-end gap-4">
          {visibleStatements.map((statement) => (
            <div key={statement.fiscalYear} className="flex flex-1 flex-col items-center gap-3">
              <div className="flex h-56 w-full items-end justify-center gap-3">
                <div className="flex w-full max-w-16 flex-col items-center gap-2">
                  <div
                    className="w-full rounded-t-2xl bg-gradient-to-t from-tide to-[#2f7389]"
                    style={{ height: `${barHeight(Math.abs(statement.revenue ?? 0), maxValue)}px` }}
                  />
                  <span className="text-[11px] text-ink/60">Omsetning</span>
                </div>
                <div className="flex w-full max-w-16 flex-col items-center gap-2">
                  <div
                    className="w-full rounded-t-2xl bg-gradient-to-t from-ember to-[#f0a05f]"
                    style={{ height: `${barHeight(Math.abs(statement.operatingProfit ?? 0), maxValue)}px` }}
                  />
                  <span className="text-[11px] text-ink/60">EBIT</span>
                </div>
              </div>
              <div className="text-xs font-medium text-ink/70">{statement.fiscalYear}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {visibleStatements.map((statement) => (
          <div key={statement.fiscalYear} className="rounded-2xl border border-ink/10 bg-white px-4 py-3">
            <div className="text-sm font-semibold">{statement.fiscalYear}</div>
            <div className="mt-2 text-xs text-ink/60">Omsetning {formatCurrency(statement.revenue)}</div>
            <div className="text-xs text-ink/60">Driftsresultat (EBIT) {formatCurrency(statement.operatingProfit)}</div>
          </div>
        ))}
      </div>
      {!premium ? (
        <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Premium kreves for full historikk og alle nokkeltall.
        </div>
      ) : null}
    </div>
  );
}
