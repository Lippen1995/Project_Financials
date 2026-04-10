import Link from "next/link";

import { DistressOverviewSectorRow } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

export function DistressSectorOverview({
  workspaceId,
  sectors,
}: {
  workspaceId: string;
  sectors: DistressOverviewSectorRow[];
}) {
  return (
    <section className="space-y-4">
      <div>
        <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Bransjebilde</div>
        <h2 className="mt-2 text-[1.7rem] font-semibold text-slate-950">Sektorer i distress</h2>
      </div>

      <div className="overflow-x-auto border border-[rgba(15,23,42,0.08)] bg-white">
        <table className="min-w-[880px] divide-y divide-[rgba(15,23,42,0.08)] text-sm">
          <thead className="bg-[rgba(248,249,250,0.72)]">
            <tr className="text-left text-slate-600">
              <th className="px-4 py-3">Sektor</th>
              <th className="px-4 py-3">Selskaper</th>
              <th className="px-4 py-3">Andel</th>
              <th className="px-4 py-3">Snitt dager</th>
              <th className="px-4 py-3">Med regnskap</th>
              <th className="px-4 py-3">Nye signaler 30d</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(15,23,42,0.06)]">
            {sectors.map((sector) => (
              <tr key={sector.sectorCode}>
                <td className="px-4 py-3">
                  <Link
                    href={`/workspaces/${workspaceId}/distress/search?sectorCode=${sector.sectorCode}&view=ALL`}
                    className="font-semibold text-[#162233] hover:text-[#31495f]"
                  >
                    {sector.sectorCode} {sector.sectorLabel}
                  </Link>
                </td>
                <td className="px-4 py-3">{formatNumber(sector.companyCount)}</td>
                <td className="px-4 py-3">{(sector.shareOfUniverse * 100).toFixed(1)} %</td>
                <td className="px-4 py-3">
                  {sector.avgDaysInStatus === null || sector.avgDaysInStatus === undefined
                    ? "-"
                    : formatNumber(Math.round(sector.avgDaysInStatus))}
                </td>
                <td className="px-4 py-3">{formatNumber(sector.withFinancialsCount)}</td>
                <td className="px-4 py-3">{formatNumber(sector.latestAnnouncementCount30d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
