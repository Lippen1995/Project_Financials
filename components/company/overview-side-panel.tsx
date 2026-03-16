import { NormalizedCompany, NormalizedFinancialStatement } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getOverviewSummaryMetrics } from "@/lib/overview-chart";

export function OverviewSidePanel({
  company,
  statements,
}: {
  company: NormalizedCompany;
  statements: NormalizedFinancialStatement[];
}) {
  const metrics = getOverviewSummaryMetrics(company, statements);

  return (
    <div className="space-y-4">
      <div className="rounded-[1.5rem] border border-[#E7ECF1] bg-[linear-gradient(180deg,#FFFFFF_0%,#FBFCFD_100%)] p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[#101828]">Nøkkeltall</h3>
            <p className="mt-1 text-sm text-[#667085]">
              Siste tilgjengelige observasjoner fra verifiserte Brreg-regnskap.
            </p>
          </div>
          <div className="rounded-full border border-[#DCE4EB] bg-[#F8FAFC] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#667085]">
            Brreg
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-[1.1rem] border border-[#EDF2F6] bg-white px-4 py-3.5 shadow-[0_4px_10px_rgba(15,23,42,0.03)]"
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A94A6]">
                {metric.label}
              </div>
              <div
                className={cn(
                  "mt-2 text-lg font-semibold tabular-nums text-[#101828]",
                  metric.tone === "negative" && "text-[#8B3A2B]",
                  metric.tone === "positive" && "text-[#166534]",
                )}
              >
                {metric.value}
              </div>
              {metric.meta ? <div className="mt-1 text-xs text-[#667085]">{metric.meta}</div> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
