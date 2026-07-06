import Link from "next/link";
import { redirect } from "next/navigation";

import { WatchlistQuickAdd } from "@/components/watchlist/watchlist-quick-add";
import { WatchlistEventFeed } from "@/components/watchlist/watchlist-event-feed";
import { safeAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type {
  WorkspaceIndustryWatchSummary,
  WorkspaceNotificationSummary,
  WorkspaceWatchGroupSummary,
  WorkspaceWatchIntensity,
  WorkspaceWatchSummary,
} from "@/lib/types";
import {
  archiveIndustryWatchAction,
  archiveWatchGroupAction,
  archiveWatchlistCompanyAction,
  createIndustryWatchAction,
  createWatchGroupAction,
  promoteGroupMemberAction,
  refreshWatchGroupAction,
  reopenIndustryWatchAction,
  reopenWatchGroupAction,
  reopenWatchlistCompanyAction,
  updateWatchlistIntensityAction,
} from "@/server/actions/workspace-collaboration-actions";
import { getWorkspaceWatchlistOverview } from "@/server/services/workspace-collaboration-service";

export const metadata = { title: "Watchlist" };

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktiv",
  DISSOLVED: "Avviklet",
  BANKRUPT: "Konkurs",
};

const INTENSITY_LABELS: Record<WorkspaceWatchIntensity, string> = {
  HIGH_ONLY: "Kun høy viktighet",
  BALANCED: "Balansert",
  BROAD: "Vis mer",
};

const NOTIFICATION_LABELS: Record<string, string> = {
  ANNOUNCEMENT_NEW: "Kunngjøring",
  FINANCIAL_STATEMENT_NEW: "Regnskap",
  COMPANY_STATUS_CHANGED: "Status",
  DISTRESS_MATCH: "Monitor",
  COMPANY_EVENT_NEW: "Hendelse",
};

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("nb-NO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function IntensityForm({
  targetType,
  targetId,
  intensity,
}: {
  targetType: "company" | "industry" | "group";
  targetId: string;
  intensity: WorkspaceWatchIntensity;
}) {
  return (
    <form action={updateWatchlistIntensityAction}>
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <select
        name="intensity"
        defaultValue={intensity}
        className="rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-1 text-xs font-semibold text-[var(--px-text)]"
        aria-label="Watch-intensitet"
      >
        {Object.entries(INTENSITY_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <button className="ml-2 text-xs font-semibold text-[var(--px-accent)]">Lagre</button>
    </form>
  );
}

function StatusBadge({ status }: { status: string }) {
  const active = status === "ACTIVE";
  return (
    <span
      className={
        active
          ? "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
          : "rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700"
      }
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function Notice({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const notice = typeof searchParams.notice === "string" ? searchParams.notice : null;
  const error = typeof searchParams.error === "string" ? searchParams.error : null;
  if (!notice && !error) return null;

  return (
    <div
      className={
        error
          ? "rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          : "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
      }
    >
      {error ?? notice}
    </div>
  );
}

function AddWatchlistPanel({
  workspaceId,
  watchedOrgNumbers,
}: {
  workspaceId: string;
  watchedOrgNumbers: string[];
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--px-text)]">Legg til selskap</h2>
            <p className="mt-1 text-xs text-[var(--px-muted)]">Individuelt fulgte selskaper ligger i egen tabell.</p>
          </div>
          <span className="material-symbols-outlined text-[20px] text-[var(--px-muted)]">apartment</span>
        </div>
        <WatchlistQuickAdd workspaceId={workspaceId} watchedOrgNumbers={watchedOrgNumbers} />
      </div>

      <form action={createIndustryWatchAction} className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--px-text)]">Legg til bransje</h2>
            <p className="mt-1 text-xs text-[var(--px-muted)]">Bruk næringskode eller prefiks fra SSB/Brreg.</p>
          </div>
          <span className="material-symbols-outlined text-[20px] text-[var(--px-muted)]">category</span>
        </div>
        <div className="grid gap-3">
          <input
            name="industryCodePrefix"
            placeholder="F.eks. 47 eller 47.11"
            className="rounded-xl border border-[var(--px-border)] bg-white px-3 py-2 text-sm text-[var(--px-text)] outline-none focus:border-[var(--px-accent)]"
          />
          <select
            name="intensity"
            defaultValue="BALANCED"
            className="rounded-xl border border-[var(--px-border)] bg-white px-3 py-2 text-sm text-[var(--px-text)]"
          >
            {Object.entries(INTENSITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button className="rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--px-action-hover)]">
            Legg til bransje
          </button>
        </div>
      </form>

      <form action={createWatchGroupAction} className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--px-text)]">Legg til bolk</h2>
            <p className="mt-1 text-xs text-[var(--px-muted)]">Samler Brreg-søket uten å følge hvert selskap enkeltvis.</p>
          </div>
          <span className="material-symbols-outlined text-[20px] text-[var(--px-muted)]">folder_open</span>
        </div>
        <div className="grid gap-3">
          <input
            name="name"
            placeholder="Navn på bolk"
            className="rounded-xl border border-[var(--px-border)] bg-white px-3 py-2 text-sm text-[var(--px-text)] outline-none focus:border-[var(--px-accent)]"
          />
          <input
            name="query"
            placeholder="Brreg-søk, f.eks. kjedenavn"
            className="rounded-xl border border-[var(--px-border)] bg-white px-3 py-2 text-sm text-[var(--px-text)] outline-none focus:border-[var(--px-accent)]"
          />
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
            <select
              name="intensity"
              defaultValue="BALANCED"
              className="rounded-xl border border-[var(--px-border)] bg-white px-3 py-2 text-sm text-[var(--px-text)]"
            >
              {Object.entries(INTENSITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              name="matchLimit"
              defaultValue="50"
              inputMode="numeric"
              className="rounded-xl border border-[var(--px-border)] bg-white px-3 py-2 text-sm text-[var(--px-text)] outline-none focus:border-[var(--px-accent)]"
              aria-label="Maks antall selskaper i bolk"
            />
          </div>
          <button className="rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--px-action-hover)]">
            Legg til bolk
          </button>
        </div>
      </form>
    </section>
  );
}

function CompanyWatchSection({ watches }: { watches: WorkspaceWatchSummary[] }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="data-label text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
          Selskaper ({watches.length})
        </h2>
      </div>
      {watches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] px-5 py-8 text-sm text-slate-500">
          Ingen individuelle selskaper er lagt til ennå.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--px-border)] bg-white">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="bg-[var(--px-action)]">
                <th className="data-label px-5 py-3 text-left text-[11px] font-semibold uppercase text-slate-200">Selskap</th>
                <th className="data-label px-5 py-3 text-left text-[11px] font-semibold uppercase text-slate-200">Bransje</th>
                <th className="data-label px-5 py-3 text-left text-[11px] font-semibold uppercase text-slate-200">Status</th>
                <th className="data-label px-5 py-3 text-left text-[11px] font-semibold uppercase text-slate-200">Intensitet</th>
                <th className="data-label px-5 py-3 text-left text-[11px] font-semibold uppercase text-slate-200">Fulgt siden</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {watches.map((watch) => (
                <tr key={watch.id} className="border-t border-[rgba(15,23,42,0.06)] hover:bg-[rgba(248,249,250,0.8)]">
                  <td className="px-5 py-3">
                    <Link href={`/companies/${watch.company.slug}`} className="font-medium text-slate-900 hover:text-[var(--px-accent)]">
                      {watch.company.name}
                    </Link>
                    <div className="text-xs text-slate-400">{watch.company.orgNumber}</div>
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    {watch.company.industryCode ? `${watch.company.industryCode.code} · ${watch.company.industryCode.title}` : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={watch.company.status} />
                  </td>
                  <td className="px-5 py-3">
                    <IntensityForm targetType="company" targetId={watch.id} intensity={watch.intensity} />
                  </td>
                  <td className="px-5 py-3 text-slate-500">{formatDate(watch.createdAt)}</td>
                  <td className="px-5 py-3 text-right">
                    <form action={archiveWatchlistCompanyAction}>
                      <input type="hidden" name="watchId" value={watch.id} />
                      <button className="text-xs text-slate-400 hover:text-slate-700">Arkiver</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function IndustryWatchSection({ watches }: { watches: WorkspaceIndustryWatchSummary[] }) {
  return (
    <section>
      <h2 className="data-label mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        Bransjer ({watches.length})
      </h2>
      {watches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] px-5 py-8 text-sm text-slate-500">
          Ingen bransjer følges ennå.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {watches.map((watch) => (
            <article key={watch.id} className="rounded-2xl border border-[var(--px-border)] bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="data-label text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                    Næringskode {watch.industryCodePrefix}
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-slate-900">
                    {watch.title ?? "Bransje uten verifisert SSB-tittel"}
                  </h3>
                </div>
                <IntensityForm targetType="industry" targetId={watch.id} intensity={watch.intensity} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-[var(--px-subtle)] p-3">
                  <div className="data-label text-[10px] uppercase text-slate-400">Selskaper lokalt</div>
                  <div className="mt-1 font-semibold text-slate-900">{watch.matchCount}</div>
                </div>
                <div className="rounded-xl bg-[var(--px-subtle)] p-3">
                  <div className="data-label text-[10px] uppercase text-slate-400">Nye hendelser</div>
                  <div className="mt-1 font-semibold text-slate-900">{watch.recentEventCount}</div>
                </div>
              </div>
              {watch.unsupportedReason ? (
                <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {watch.unsupportedReason}
                </p>
              ) : null}
              <form action={archiveIndustryWatchAction} className="mt-4 text-right">
                <input type="hidden" name="industryWatchId" value={watch.id} />
                <button className="text-xs text-slate-400 hover:text-slate-700">Arkiver</button>
              </form>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function GroupSection({ groups }: { groups: WorkspaceWatchGroupSummary[] }) {
  return (
    <section>
      <h2 className="data-label mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        Bolker ({groups.length})
      </h2>
      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] px-5 py-8 text-sm text-slate-500">
          Ingen bolker er lagt til ennå.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <details key={group.id} className="rounded-2xl border border-[var(--px-border)] bg-white p-5">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-900">{group.name}</h3>
                    <span className="rounded-full border border-[var(--px-border)] px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                      {group.memberCount} selskaper
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Brreg-søk: “{group.query}” · sist oppdatert {formatDateTime(group.refreshedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <IntensityForm targetType="group" targetId={group.id} intensity={group.intensity} />
                  <span className="material-symbols-outlined text-[20px] text-[var(--px-muted)]">expand_more</span>
                </div>
              </summary>

              {group.unsupportedReason ? (
                <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {group.unsupportedReason}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap justify-between gap-3 border-t border-[rgba(15,23,42,0.06)] pt-4">
                <div className="text-xs text-slate-500">{group.recentEventCount} relevante hendelser siste uke</div>
                <div className="flex gap-3">
                  <form action={refreshWatchGroupAction}>
                    <input type="hidden" name="groupId" value={group.id} />
                    <button className="text-xs font-semibold text-[var(--px-accent)]">Oppdater søk</button>
                  </form>
                  <form action={archiveWatchGroupAction}>
                    <input type="hidden" name="groupId" value={group.id} />
                    <button className="text-xs text-slate-400 hover:text-slate-700">Arkiver</button>
                  </form>
                </div>
              </div>

              <div className="mt-4 overflow-hidden border border-[rgba(15,23,42,0.08)]">
                <table className="w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="bg-[rgba(248,249,250,0.8)]">
                      <th className="data-label px-4 py-2 text-left text-[10px] font-semibold uppercase text-slate-400">Selskap i bolk</th>
                      <th className="data-label px-4 py-2 text-left text-[10px] font-semibold uppercase text-slate-400">Bransje</th>
                      <th className="data-label px-4 py-2 text-left text-[10px] font-semibold uppercase text-slate-400">Match</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {group.members.map((member) => (
                      <tr key={member.id} className="border-t border-[rgba(15,23,42,0.06)]">
                        <td className="px-4 py-2">
                          <Link href={`/companies/${member.company.slug}`} className="font-medium text-slate-900 hover:text-[var(--px-accent)]">
                            {member.company.name}
                          </Link>
                          <div className="text-xs text-slate-400">{member.company.orgNumber}</div>
                        </td>
                        <td className="px-4 py-2 text-slate-600">
                          {member.company.industryCode ? `${member.company.industryCode.code} · ${member.company.industryCode.title}` : "—"}
                        </td>
                        <td className="px-4 py-2 text-slate-500">{formatDate(member.matchedAt)}</td>
                        <td className="px-4 py-2 text-right">
                          {member.isIndividuallyWatched ? (
                            <span className="text-xs font-semibold text-emerald-600">Følges separat</span>
                          ) : (
                            <form action={promoteGroupMemberAction}>
                              <input type="hidden" name="memberId" value={member.id} />
                              <button className="text-xs font-semibold text-[var(--px-accent)]">Følg enkeltvis</button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function ChangeLog({ notifications }: { notifications: WorkspaceNotificationSummary[] }) {
  return (
    <section className="rounded-2xl border border-[var(--px-border)] bg-white p-5">
      <h2 className="data-label text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        Endringslogg
      </h2>
      {notifications.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Ingen registrerte endringer ennå.</p>
      ) : (
        <div className="mt-4 divide-y divide-[rgba(15,23,42,0.06)]">
          {notifications.map((notification) => (
            <article key={notification.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="data-label text-[10px] uppercase text-slate-400">
                    {NOTIFICATION_LABELS[notification.type] ?? notification.type}
                  </span>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{notification.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{notification.body}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-400">{formatDateTime(notification.createdAt)}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ArchivedSection({
  companies,
  industries,
  groups,
}: {
  companies: WorkspaceWatchSummary[];
  industries: WorkspaceIndustryWatchSummary[];
  groups: WorkspaceWatchGroupSummary[];
}) {
  const total = companies.length + industries.length + groups.length;
  if (total === 0) return null;

  return (
    <section>
      <h2 className="data-label mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        Arkiverte ({total})
      </h2>
      <div className="rounded-2xl border border-[var(--px-border)] bg-white p-5">
        <div className="grid gap-3">
          {companies.map((watch) => (
            <form key={watch.id} action={reopenWatchlistCompanyAction} className="flex items-center justify-between gap-4">
              <input type="hidden" name="watchId" value={watch.id} />
              <span className="text-sm text-slate-700">{watch.company.name}</span>
              <button className="text-xs font-semibold text-[var(--px-accent)]">Gjenåpne</button>
            </form>
          ))}
          {industries.map((watch) => (
            <form key={watch.id} action={reopenIndustryWatchAction} className="flex items-center justify-between gap-4">
              <input type="hidden" name="industryWatchId" value={watch.id} />
              <span className="text-sm text-slate-700">{watch.title ?? `Næringskode ${watch.industryCodePrefix}`}</span>
              <button className="text-xs font-semibold text-[var(--px-accent)]">Gjenåpne</button>
            </form>
          ))}
          {groups.map((group) => (
            <form key={group.id} action={reopenWatchGroupAction} className="flex items-center justify-between gap-4">
              <input type="hidden" name="groupId" value={group.id} />
              <span className="text-sm text-slate-700">{group.name}</span>
              <button className="text-xs font-semibold text-[var(--px-accent)]">Gjenåpne</button>
            </form>
          ))}
        </div>
      </div>
    </section>
  );
}

export default async function WatchlistPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await safeAuth();
  if (!session?.user?.id) redirect("/login");

  const params = await searchParams;
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

  const overview = await getWorkspaceWatchlistOverview(session.user.id, user.lastWorkspaceId);
  const activeTotal =
    overview.activeWatches.length + overview.activeIndustryWatches.length + overview.activeGroups.length;

  return (
    <div className="space-y-8">
      <Notice searchParams={params} />

      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="editorial-display text-[2.5rem] leading-tight text-slate-950">Watchlist</h1>
          <p className="mt-1 text-sm text-slate-500">
            {activeTotal} aktive overvåkninger · {overview.recentEvents.length} relevante hendelser
          </p>
        </div>
        <div className="grid min-w-[18rem] grid-cols-3 gap-3">
          <div className="rounded-2xl border border-[var(--px-border)] bg-white p-4">
            <div className="data-label text-[10px] uppercase text-slate-400">Siste døgn</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{overview.digest.newEventCount}</div>
          </div>
          <div className="rounded-2xl border border-[var(--px-border)] bg-white p-4">
            <div className="data-label text-[10px] uppercase text-slate-400">Ulest</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{overview.digest.unreadNotificationCount}</div>
          </div>
          <div className="rounded-2xl border border-[var(--px-border)] bg-white p-4">
            <div className="data-label text-[10px] uppercase text-slate-400">Endret</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{overview.digest.changedCompanyCount}</div>
          </div>
        </div>
      </div>

      <AddWatchlistPanel
        workspaceId={user.lastWorkspaceId}
        watchedOrgNumbers={overview.activeWatches.map((watch) => watch.company.orgNumber)}
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-8">
          <WatchlistEventFeed
            events={overview.recentEvents.map((event) => ({
              ...event,
              lastSeen: event.lastSeen.toISOString(),
            }))}
          />
          <CompanyWatchSection watches={overview.activeWatches} />
          <IndustryWatchSection watches={overview.activeIndustryWatches} />
          <GroupSection groups={overview.activeGroups} />
          <ArchivedSection
            companies={overview.archivedWatches}
            industries={overview.archivedIndustryWatches}
            groups={overview.archivedGroups}
          />
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-panel)] p-5 text-white">
            <h2 className="data-label text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-300">
              Daglig digest
            </h2>
            <p className="mt-3 text-sm text-slate-100">
              Siden {formatDateTime(overview.digest.since)} er det funnet {overview.digest.newEventCount} relevante
              hendelser og {overview.digest.changedCompanyCount} selskaper med registrerte endringer.
            </p>
            {overview.digest.topContexts.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {overview.digest.topContexts.map((context) => (
                  <span key={context.label} className="rounded-full border border-slate-500 px-2 py-1 text-xs text-slate-200">
                    {context.label}: {context.count}
                  </span>
                ))}
              </div>
            ) : null}
          </section>
          <ChangeLog notifications={overview.recentNotifications} />
        </div>
      </div>
    </div>
  );
}
