import { formatScore, getHealthColor } from "@/lib/distress-presentation";
import { DistressModuleKpis } from "@/lib/types";

function Kpi({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="border-l border-[var(--px-border-subtle)] pl-6">
      <div className="data-label text-[10px] text-[var(--px-muted)]">{label}</div>
      <div className="mt-2 text-[27px] font-semibold tracking-[-0.02em] tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="mt-1 text-[11.5px] text-[var(--px-muted)]">{sub}</div>
    </div>
  );
}

export function DistressModuleKpiStrip({ kpis }: { kpis: DistressModuleKpis }) {
  return (
    <div className="grid grid-cols-2 gap-8 border-y border-[var(--px-border-subtle)] py-6 lg:grid-cols-4">
      <Kpi
        label="Nye konkursåpninger"
        value={kpis.newBankruptcies30d.toLocaleString("nb-NO")}
        sub="Siste 30 dager"
        color="var(--px-error)"
      />
      <Kpi
        label="Under rekonstruksjon"
        value={kpis.underRestructuring.toLocaleString("nb-NO")}
        sub="Åpnet rekonstruksjonsforhandling"
        color="var(--px-warning)"
      />
      <Kpi
        label="Selskaper med verdier"
        value={kpis.withRealizableAssets.toLocaleString("nb-NO")}
        sub="Balanseførte eiendeler over 100 mill"
        color="var(--px-accent)"
      />
      <Kpi
        label="Snitt finansiell helse"
        value={formatScore(kpis.avgHealthScore)}
        sub={`${kpis.scoredCount.toLocaleString("nb-NO")} av ${kpis.universeCount.toLocaleString("nb-NO")} med regnskap å score på`}
        color={getHealthColor(kpis.avgHealthScore)}
      />
    </div>
  );
}
