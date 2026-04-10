import { DistressOverviewTimelinePoint } from "@/lib/types";

export function DistressTimelineChart({ points }: { points: DistressOverviewTimelinePoint[] }) {
  const maxValue = points.reduce((max, point) => Math.max(max, point.total), 0);

  return (
    <section className="space-y-4">
      <div>
        <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Aktivitet</div>
        <h2 className="mt-2 text-[1.7rem] font-semibold text-slate-950">Månedlig signalvolum</h2>
      </div>

      <div className="grid gap-3 rounded-[1rem] border border-[rgba(15,23,42,0.08)] bg-white p-5">
        {points.map((point) => {
          const width = maxValue > 0 ? (point.total / maxValue) * 100 : 0;
          return (
            <div key={point.bucket} className="grid gap-2 sm:grid-cols-[120px,minmax(0,1fr),120px] sm:items-center">
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{point.bucket}</div>
              <div className="h-2.5 rounded-full bg-[rgba(15,23,42,0.08)]">
                <div className="h-full rounded-full bg-[#1f3a54]" style={{ width: `${width}%` }} />
              </div>
              <div className="text-sm text-slate-600">{point.total} hendelser</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
