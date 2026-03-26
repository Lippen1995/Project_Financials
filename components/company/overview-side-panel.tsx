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
    <aside className="border border-[rgba(15,23,42,0.08)] bg-white">
      <div className="border-b border-[rgba(15,23,42,0.08)] bg-[#162233] px-5 py-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[1.05rem] font-semibold">Analytisk sammendrag</h3>
            <p className="mt-1 text-sm leading-6 text-white/72">
              Kompakt lesning av nøkkelsignalene for valgt år i oversikten.
            </p>
          </div>
          <div className="data-label rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase text-white/78">
            {summary.activeYearLabel}
          </div>
        </div>
      </div>

      <div className="grid gap-0">
        {summary.primaryMetrics.map((metric) => (
          <div
            key={metric.label}
            className="border-b border-[rgba(15,23,42,0.08)] px-5 py-5 last:border-b-0"
          >
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
              {metric.label}
            </div>
            <div
              className={cn(
                "mt-3 text-[2rem] font-semibold leading-none tabular-nums text-slate-950",
                metric.tone === "negative" && "text-[#8B3A2B]",
                metric.tone === "positive" && "text-[#205840]",
              )}
            >
              {metric.value}
            </div>
            {metric.meta ? <div className="mt-2 text-sm text-slate-500">{metric.meta}</div> : null}
          </div>
        ))}
      </div>

      <div className="border-t border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] px-5 py-5">
        <div className="grid gap-4">
          {summary.secondaryMetrics.map((metric) => (
            <div
              key={metric.label}
              className="border-b border-[rgba(15,23,42,0.08)] pb-4 last:border-b-0 last:pb-0"
            >
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                {metric.label}
              </div>
              <div className="mt-1 text-base font-semibold tabular-nums text-slate-900">
                {metric.value}
              </div>
              {metric.meta ? <div className="mt-1 text-xs text-slate-500">{metric.meta}</div> : null}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
