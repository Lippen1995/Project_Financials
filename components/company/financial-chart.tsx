import { formatCurrency } from "@/lib/utils";
import { NormalizedFinancialStatement } from "@/lib/types";

export function FinancialChart({ statements, premium }: { statements: NormalizedFinancialStatement[]; premium: boolean }) {
  const visibleStatements = premium ? statements : statements.slice(0, 1);
  const maxValue = Math.max(...visibleStatements.map((item) => item.revenue ?? 0), 1);

  return (
    <div className="space-y-5">
      <div className="flex h-56 items-end gap-4 rounded-[1.5rem] bg-sand/80 p-4">
        {visibleStatements.slice().reverse().map((statement) => (
          <div key={statement.fiscalYear} className="flex flex-1 flex-col items-center justify-end gap-3">
            <div className="w-full rounded-t-2xl bg-gradient-to-t from-tide to-ember" style={{ height: `${Math.max(((statement.revenue ?? 0) / maxValue) * 180, 18)}px` }} />
            <div className="text-xs text-ink/65">{statement.fiscalYear}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {visibleStatements.map((statement) => (
          <div key={statement.fiscalYear} className="rounded-2xl border border-ink/10 bg-white px-4 py-3">
            <div className="text-sm font-semibold">{statement.fiscalYear}</div>
            <div className="mt-2 text-xs text-ink/60">Omsetning {formatCurrency(statement.revenue)}</div>
            <div className="text-xs text-ink/60">Driftsresultat {formatCurrency(statement.operatingProfit)}</div>
          </div>
        ))}
      </div>
      {!premium ? <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Premium kreves for full historikk og alle nokkeltall.</div> : null}
    </div>
  );
}