import { DistressOverviewKpis } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

function KpiCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[0.9rem] border border-[rgba(15,23,42,0.08)] bg-white p-4">
      <div className="data-label text-[11px] font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

export function DistressKpiGrid({ kpis }: { kpis: DistressOverviewKpis }) {
  const coverageLabel =
    kpis.financialsCoverageRate === null || kpis.financialsCoverageRate === undefined
      ? "Ikke tilgjengelig"
      : `${kpis.financialsCoverageRate.toFixed(1)} %`;

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <KpiCard label="Aktive distress-saker" value={formatNumber(kpis.totalActiveCases)} />
      <KpiCard label="Konkurser" value={formatNumber(kpis.bankruptcies)} />
      <KpiCard label="Likvidasjoner" value={formatNumber(kpis.liquidations)} />
      <KpiCard label="Rekonstruksjoner" value={formatNumber(kpis.reconstructions)} />
      <KpiCard label="Tvangsprosesser" value={formatNumber(kpis.forcedProcesses)} />
      <KpiCard label="Nye signaler 30 dager" value={formatNumber(kpis.recentAnnouncements30d)} />
      <KpiCard label="Regnskapsdekning" value={coverageLabel} />
    </section>
  );
}
