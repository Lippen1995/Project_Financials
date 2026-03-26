import { NormalizedCompany, NormalizedFinancialStatement } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getOverviewSummaryMetrics } from "@/lib/overview-chart";

export function OverviewSidePanel({
  company,
  statements,
  activeYear,
}: {
  company: NormalizedCompany;
  statements: NormalizedFinancialStatement[];
  activeYear: number | null;
}) {
  const summary = getOverviewSummaryMetrics(company, statements, activeYear);

  return (
    <div className="border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.9)] p-5">
      <div className="flex items-start justify-between gap-3 border-b border-[rgba(15,23,42,0.08)] pb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-950">Analytisk sammendrag</h3>
          <p className="mt-1 text-sm text-slate-500">Utvalgte signaler for aktivt år i oversikten.</p>
        </div>
        <div className="data-label rounded-full border border-[rgba(15,23,42,0.1)] bg-[rgba(49,73,95,0.05)] px-3 py-1 text-[11px] font-semibold uppercase text-slate-600">
          {summary.activeYearLabel}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {summary.primaryMetrics.map((metric) => (
          <div
            key={metric.label}
            className="border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.72)] px-4 py-4"
          >
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">{metric.label}</div>
            <div
              className={cn(
                "mt-2 text-[1.4rem] font-semibold leading-none tabular-nums text-slate-950",
                metric.tone === "negative" && "text-[#8b3a2b]",
                metric.tone === "positive" && "text-[#205840]",
              )}
            >
              {metric.value}
            </div>
            {metric.meta ? <div className="mt-2 text-xs text-slate-500">{metric.meta}</div> : null}
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-[rgba(15,23,42,0.08)] pt-4">
        <div className="space-y-4">
          {summary.secondaryMetrics.map((metric) => (
            <div key={metric.label}>
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">{metric.label}</div>
              <div className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{metric.value}</div>
              {metric.meta ? <div className="mt-1 text-xs text-slate-500">{metric.meta}</div> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
