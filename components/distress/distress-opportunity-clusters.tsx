import { DistressOpportunityCluster } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

export function DistressOpportunityClusters({ clusters }: { clusters: DistressOpportunityCluster[] }) {
  return (
    <section className="space-y-4">
      <div>
        <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Mulighetsspor</div>
        <h2 className="mt-2 text-[1.7rem] font-semibold text-slate-950">Startpunkter for analyse</h2>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {clusters.map((cluster) => (
          <a
            key={cluster.key}
            href={cluster.href}
            className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white p-4 hover:border-[rgba(15,23,42,0.18)]"
          >
            <div className="text-sm font-semibold text-slate-900">{cluster.title}</div>
            <div className="mt-1 text-sm leading-6 text-slate-600">{cluster.description}</div>
            <div className="mt-3 text-xs uppercase tracking-[0.08em] text-slate-500">{formatNumber(cluster.count)} treff</div>
          </a>
        ))}
      </div>
    </section>
  );
}
