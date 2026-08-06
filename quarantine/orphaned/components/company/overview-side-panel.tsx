import { getOverviewSummaryMetrics } from "@/lib/overview-chart";
import {
  DataAvailability,
  NormalizedCompany,
  NormalizedFinancialStatement,
} from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

export function OverviewSidePanel({
  company,
  statements,
  activeYear,
  healthScore,
  investigationNotes,
  financialsAvailability,
  rolesAvailability,
}: {
  company: NormalizedCompany;
  statements: NormalizedFinancialStatement[];
  activeYear: number | null;
  healthScore: number;
  investigationNotes: string[];
  financialsAvailability: DataAvailability;
  rolesAvailability: DataAvailability;
}) {
  const summary = getOverviewSummaryMetrics(company, statements, activeYear);
  const indicators = [
    summary.primaryMetrics[2],
    summary.secondaryMetrics[0],
    summary.secondaryMetrics[2],
  ];

  return (
    <aside className="min-w-0 self-start overflow-hidden rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] lg:sticky lg:top-[8.75rem]">
      <div className="border-b border-[var(--px-border)] px-5 py-4">
        <div className="data-label text-[11px] font-semibold uppercase text-[var(--px-text)]">
          Beslutningsstøtte
        </div>
      </div>

      <div className="border-b border-[var(--px-border)] p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-[var(--px-text)]">Finansiell helse</div>
            <div className="data-label mt-2 text-[10px] font-semibold uppercase text-[var(--px-muted)]">
              Siste år: {summary.activeYearLabel}
            </div>
            <div className="mt-3 flex items-end gap-1">
              <span className="text-4xl font-semibold tabular-nums text-emerald-700">
                {healthScore}
              </span>
              <span className="pb-1 text-sm text-[var(--px-muted)]">/ 100</span>
            </div>
          </div>
          <div className="relative h-16 w-16 rounded-full border-[6px] border-[var(--px-accent-soft)]">
            <div className="absolute inset-1 flex items-center justify-center rounded-full border-2 border-[var(--px-accent)] text-[var(--px-accent)]">
              <span className="material-symbols-outlined" aria-hidden="true">
                favorite
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-1" aria-label={`Finansiell helse ${healthScore} av 100`}>
          {Array.from({ length: 10 }, (_, index) => (
            <span
              key={index}
              className={cn(
                "h-1 flex-1 rounded-full",
                index < Math.round(healthScore / 10)
                  ? "bg-emerald-600"
                  : "bg-[var(--px-border)]",
              )}
            />
          ))}
        </div>
      </div>

      <div className="border-b border-[var(--px-border)] p-5">
        <div className="text-sm font-semibold text-[var(--px-text)]">Risiko og observasjoner</div>
        <div className="mt-4 space-y-3">
          {investigationNotes.map((note, index) => (
            <div key={note} className="flex gap-3 text-sm leading-5 text-[var(--px-muted)]">
              <span
                className={cn(
                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                  index === 0 ? "bg-rose-500" : index === 1 ? "bg-amber-500" : "bg-slate-400",
                )}
                aria-hidden="true"
              />
              <span>{note}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-b border-[var(--px-border)] p-5">
        <div className="text-sm font-semibold text-[var(--px-text)]">Datatilgjengelighet</div>
        <div className="mt-4 space-y-3 text-sm">
          <AvailabilityRow label="Regnskapstall" available={financialsAvailability.available} />
          <AvailabilityRow label="Rolledata" available={rolesAvailability.available} />
        </div>
      </div>

      <div className="p-5">
        <div className="text-sm font-semibold text-[var(--px-text)]">Nøkkelindikatorer</div>
        <div className="mt-4 space-y-4">
          {indicators.map((metric) => (
            <div key={metric.label} className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-[var(--px-muted)]">{metric.label}</div>
                {metric.meta ? (
                  <div className="mt-1 text-[11px] text-[var(--px-muted)]">{metric.meta}</div>
                ) : null}
              </div>
              <div
                className={cn(
                  "text-right text-sm font-semibold tabular-nums text-[var(--px-text)]",
                  metric.tone === "negative" && "text-rose-700",
                  metric.tone === "positive" && "text-emerald-700",
                )}
              >
                {metric.value}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 border-t border-[var(--px-border)] pt-4">
          <div className="text-sm font-semibold text-[var(--px-text)]">Kilde og sporbarhet</div>
          <div className="mt-3 flex items-start justify-between gap-4 text-xs">
            <span className="text-[var(--px-muted)]">Kildesystem</span>
            <span className="text-right font-semibold text-[var(--px-text)]">
              {company.sourceSystem}
            </span>
          </div>
          <div className="mt-2 flex items-start justify-between gap-4 text-xs">
            <span className="text-[var(--px-muted)]">Hentet</span>
            <span className="text-right font-semibold text-[var(--px-text)]">
              {formatDate(company.fetchedAt)}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function AvailabilityRow({ label, available }: { label: string; available: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[var(--px-muted)]">{label}</span>
      <span className={cn("font-semibold", available ? "text-emerald-700" : "text-slate-500")}>
        {available ? "Tilgjengelig" : "Ikke bekreftet"}
      </span>
    </div>
  );
}
