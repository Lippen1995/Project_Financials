import Link from "next/link";
import { redirect } from "next/navigation";

import { safeAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listWorkspaceWatches } from "@/server/services/workspace-collaboration-service";
import { archiveWorkspaceWatchAction, reopenWorkspaceWatchAction } from "@/server/actions/workspace-collaboration-actions";

export const metadata = { title: "Watchlist" };

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktiv",
  DISSOLVED: "Avviklet",
  BANKRUPT: "Konkurs",
};

export default async function WatchlistPage() {
  const session = await safeAuth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { lastWorkspaceId: true },
  });

  if (!user?.lastWorkspaceId) {
    return (
      <div className="py-16 text-center text-sm text-slate-500">
        <p className="font-medium text-slate-700">Ingen workspace funnet</p>
        <p className="mt-1">Opprett eller bli invitert til et workspace for å bruke watchlist.</p>
      </div>
    );
  }

  const watches = await listWorkspaceWatches(session.user.id, user.lastWorkspaceId);
  const active = watches.filter((w) => w.status === "ACTIVE");
  const archived = watches.filter((w) => w.status !== "ACTIVE");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="editorial-display text-[2.5rem] leading-tight text-slate-950">Watchlist</h1>
          <p className="mt-1 text-sm text-slate-500">
            {active.length} aktive · {archived.length} arkiverte
          </p>
        </div>
        <Link
          href="/search"
          className="rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--px-action-hover)]"
        >
          + Legg til selskap
        </Link>
      </div>

      {active.length === 0 && archived.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] py-16 text-center text-sm text-slate-500">
          <span className="material-symbols-outlined mb-3 block text-[2rem] text-slate-300">star</span>
          <p className="font-medium text-slate-700">Ingen selskaper i watchlist ennå</p>
          <p className="mt-1">Gå til et selskap og klikk stjerne-ikonet for å følge det.</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section>
              <div className="data-label mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                Aktive ({active.length})
              </div>
              <div className="overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white">
                <table className="w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="bg-[var(--px-action)]">
                      <th className="data-label px-5 py-3 text-left text-[11px] font-semibold uppercase text-slate-200">
                        Selskap
                      </th>
                      <th className="data-label px-5 py-3 text-left text-[11px] font-semibold uppercase text-slate-200">
                        Bransje
                      </th>
                      <th className="data-label px-5 py-3 text-left text-[11px] font-semibold uppercase text-slate-200">
                        Status
                      </th>
                      <th className="data-label px-5 py-3 text-left text-[11px] font-semibold uppercase text-slate-200">
                        Fulgt siden
                      </th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {active.map((watch) => (
                      <tr
                        key={watch.id}
                        className="border-t border-[rgba(15,23,42,0.06)] hover:bg-[rgba(248,249,250,0.8)]"
                      >
                        <td className="px-5 py-3">
                          <Link
                            href={`/companies/${watch.company.slug}`}
                            className="font-medium text-slate-900 hover:text-[var(--px-accent)]"
                          >
                            {watch.company.name}
                          </Link>
                          <div className="text-xs text-slate-400">{watch.company.orgNumber}</div>
                        </td>
                        <td className="px-5 py-3 text-slate-600">
                          {watch.company.industryCode
                            ? `${watch.company.industryCode.code} · ${watch.company.industryCode.title}`
                            : "—"}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={
                              watch.company.status === "ACTIVE"
                                ? "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
                                : "rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700"
                            }
                          >
                            {STATUS_LABELS[watch.company.status] ?? watch.company.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-slate-500">
                          {new Date(watch.createdAt).toLocaleDateString("nb-NO", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <form action={archiveWorkspaceWatchAction}>
                            <input type="hidden" name="watchId" value={watch.id} />
                            <input type="hidden" name="workspaceId" value={watch.workspaceId} />
                            <button
                              type="submit"
                              className="text-xs text-slate-400 hover:text-slate-700"
                            >
                              Arkiver
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {archived.length > 0 && (
            <section>
              <div className="data-label mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                Arkiverte ({archived.length})
              </div>
              <div className="overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white">
                <table className="w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="bg-[rgba(248,249,250,0.8)]">
                      <th className="data-label px-5 py-3 text-left text-[11px] font-semibold uppercase text-slate-400">
                        Selskap
                      </th>
                      <th className="data-label px-5 py-3 text-left text-[11px] font-semibold uppercase text-slate-400">
                        Arkivert
                      </th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {archived.map((watch) => (
                      <tr
                        key={watch.id}
                        className="border-t border-[rgba(15,23,42,0.06)] opacity-60 hover:opacity-100"
                      >
                        <td className="px-5 py-3">
                          <Link
                            href={`/companies/${watch.company.slug}`}
                            className="font-medium text-slate-700 hover:text-[var(--px-accent)]"
                          >
                            {watch.company.name}
                          </Link>
                          <div className="text-xs text-slate-400">{watch.company.orgNumber}</div>
                        </td>
                        <td className="px-5 py-3 text-slate-500">
                          {watch.archivedAt
                            ? new Date(watch.archivedAt).toLocaleDateString("nb-NO", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <form action={reopenWorkspaceWatchAction}>
                            <input type="hidden" name="watchId" value={watch.id} />
                            <input type="hidden" name="workspaceId" value={watch.workspaceId} />
                            <button
                              type="submit"
                              className="text-xs text-slate-400 hover:text-slate-700"
                            >
                              Gjenåpne
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
