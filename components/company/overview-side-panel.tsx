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
    <div className="rounded-[1.5rem] border border-[#E7ECF1] bg-[linear-gradient(180deg,#FFFFFF_0%,#FBFCFD_100%)] p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[#101828]">Nøkkeltall</h3>
          <p className="mt-1 text-sm text-[#667085]">
            Utvalgte observasjoner for aktivt år i grafen.
          </p>
        </div>
        <div className="rounded-full border border-[#DCE4EB] bg-[#F8FAFC] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#667085]">
          {summary.activeYearLabel}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {summary.primaryMetrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-[1.15rem] border border-[#E9EEF4] bg-white px-4 py-4 shadow-[0_4px_10px_rgba(15,23,42,0.03)]"
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#98A2B3]">
              {metric.label}
            </div>
            <div
              className={cn(
                "mt-2 text-[1.45rem] font-semibold leading-none tabular-nums text-[#101828]",
                metric.tone === "negative" && "text-[#8B3A2B]",
                metric.tone === "positive" && "text-[#166534]",
              )}
            >
              {metric.value}
            </div>
            {metric.meta ? <div className="mt-2 text-xs text-[#667085]">{metric.meta}</div> : null}
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-[1.1rem] border border-[#EEF2F6] bg-[#FCFDFD] px-4 py-4">
        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
          {summary.secondaryMetrics.map((metric) => (
            <div key={metric.label}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#98A2B3]">
                {metric.label}
              </div>
              <div className="mt-1 text-sm font-semibold tabular-nums text-[#101828]">{metric.value}</div>
              {metric.meta ? <div className="mt-1 text-xs text-[#667085]">{metric.meta}</div> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
