import Link from "next/link";

import { DistressOverviewStatusRow } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

export function DistressStatusDistribution({
  workspaceId,
  rows,
}: {
  workspaceId: string;
  rows: DistressOverviewStatusRow[];
}) {
  return (
    <section className="space-y-4">
      <div>
        <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Livssyklus</div>
        <h2 className="mt-2 text-[1.7rem] font-semibold text-slate-950">Statusfordeling</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <Link
            key={row.status}
            href={`/workspaces/${workspaceId}/distress/search?status=${row.status}&view=ALL`}
            className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white p-4 hover:border-[rgba(15,23,42,0.18)]"
          >
            <div className="text-xs uppercase tracking-[0.08em] text-slate-500">{row.status}</div>
            <div className="mt-2 text-base font-semibold text-slate-900">{row.label}</div>
            <div className="mt-1 text-sm text-slate-600">{formatNumber(row.count)} profiler</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
