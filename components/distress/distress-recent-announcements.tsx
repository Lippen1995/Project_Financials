import Link from "next/link";

import { DistressOverviewRecentAnnouncement } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export function DistressRecentAnnouncements({
  workspaceId,
  items,
}: {
  workspaceId: string;
  items: DistressOverviewRecentAnnouncement[];
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Siste kunngjøringer</div>
          <h2 className="mt-2 text-[1.7rem] font-semibold text-slate-950">Ferske distress-signaler</h2>
        </div>
        <Link
          href={`/workspaces/${workspaceId}/distress/search?sort=lastAnnouncementPublishedAt_desc&view=ALL`}
          className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-[rgba(15,23,42,0.18)] hover:text-slate-950"
        >
          Åpne screener
        </Link>
      </div>

      <div className="grid gap-3">
        {items.map((item) => (
          <div key={`${item.orgNumber}-${item.publishedAt?.toISOString() ?? item.status}`} className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/workspaces/${workspaceId}/distress/companies/${item.orgNumber}`}
                className="text-base font-semibold text-[#162233] hover:text-[#31495f]"
              >
                {item.companyName}
              </Link>
              <div className="text-xs uppercase tracking-[0.08em] text-slate-500">{item.statusLabel}</div>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{item.title ?? "Ingen tittel registrert."}</p>
            <div className="mt-2 text-xs text-slate-500">Publisert: {formatDate(item.publishedAt)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
