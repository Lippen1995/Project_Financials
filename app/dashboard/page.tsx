import Link from "next/link";
import { redirect } from "next/navigation";

import { Card } from "@/components/ui/card";
import { safeAuth } from "@/lib/auth";
import { CurrentWorkspaceSummary, WorkspaceSummary } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { getUserSubscription } from "@/server/billing/subscription";
import {
  acceptWorkspaceInvitationAction,
  archiveWorkspaceAction,
  createTeamWorkspaceAction,
  declineWorkspaceInvitationAction,
  inviteWorkspaceMemberAction,
  removeWorkspaceMemberAction,
  reopenWorkspaceAction,
  switchWorkspaceAction,
} from "@/server/actions/workspace-actions";
import { getDashboardWorkspaceHome } from "@/server/services/workspace-service";

function getWorkspaceTypeLabel(type: WorkspaceSummary["type"]) {
  return type === "PERSONAL" ? "Personlig" : "Team";
}

function getRoleLabel(role: CurrentWorkspaceSummary["role"]) {
  if (role === "OWNER") {
    return "Eier";
  }

  if (role === "ADMIN") {
    return "Administrator";
  }

  return "Medlem";
}

function getWorkspaceStatusLabel(status: WorkspaceSummary["status"]) {
  return status === "ACTIVE" ? "Aktiv" : "Arkivert";
}

function FlashMessage({
  message,
  tone,
}: {
  message?: string | null;
  tone: "success" | "error";
}) {
  if (!message) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-[1rem] border px-5 py-4 text-sm",
        tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-rose-200 bg-rose-50 text-rose-800",
      )}
    >
      {message}
    </div>
  );
}

function WorkspaceBadge({
  label,
  accent = "default",
}: {
  label: string;
  accent?: "default" | "dark" | "muted";
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]",
        accent === "dark"
          ? "border border-white/10 bg-white/10 text-white"
          : accent === "muted"
            ? "border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.9)] text-slate-500"
            : "border border-[rgba(15,23,42,0.1)] bg-white text-slate-600",
      )}
    >
      {label}
    </span>
  );
}

function WorkspaceOverviewCard({ workspace }: { workspace: WorkspaceSummary }) {
  const action =
    workspace.status === "ACTIVE" ? archiveWorkspaceAction : reopenWorkspaceAction;

  return (
    <Card
      className={cn(
        "p-5",
        workspace.status === "ARCHIVED" ? "bg-[rgba(248,249,250,0.78)]" : "bg-[rgba(255,255,255,0.9)]",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            <WorkspaceBadge label={getWorkspaceTypeLabel(workspace.type)} />
            <WorkspaceBadge label={getWorkspaceStatusLabel(workspace.status)} accent="muted" />
          </div>
          <div className="mt-3 text-lg font-semibold text-slate-950">{workspace.name}</div>
          <div className="mt-1 text-sm text-slate-500">
            {getRoleLabel(workspace.role)} · {workspace.memberCount} medlemmer
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <form action={switchWorkspaceAction}>
            <input type="hidden" name="workspaceId" value={workspace.id} />
            <button
              type="submit"
              className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-[rgba(15,23,42,0.2)] hover:text-slate-950"
            >
              Åpne
            </button>
          </form>

          <Link
            href={`/workspaces/${workspace.id}/distress`}
            className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-[rgba(15,23,42,0.2)] hover:text-slate-950"
          >
            Distress
          </Link>

          {workspace.type === "TEAM" && (workspace.role === "OWNER" || workspace.role === "ADMIN") ? (
            <form action={action}>
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <button
                type="submit"
                className="rounded-full border border-[rgba(15,23,42,0.1)] bg-[rgba(248,249,250,0.92)] px-4 py-2 text-sm font-semibold text-slate-700 hover:border-[rgba(15,23,42,0.18)] hover:text-slate-950"
              >
                {workspace.status === "ACTIVE" ? "Arkiver" : "Gjenåpne"}
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[0.9rem] border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">DD-rom</div>
          <div className="mt-2 text-xl font-semibold text-slate-950">{workspace.activeDdRoomCount}</div>
          <div className="mt-1 text-xs text-slate-500">{workspace.archivedDdRoomCount} inaktive</div>
        </div>
        <div className="rounded-[0.9rem] border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Abonnementer</div>
          <div className="mt-2 text-xl font-semibold text-slate-950">{workspace.activeWatchCount}</div>
          <div className="mt-1 text-xs text-slate-500">{workspace.archivedWatchCount} inaktive</div>
        </div>
        <div className="rounded-[0.9rem] border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Uleste varsler</div>
          <div className="mt-2 text-xl font-semibold text-slate-950">{workspace.unreadNotificationCount}</div>
          <div className="mt-1 text-xs text-slate-500">Samlet oversikt for aktiv arbeidsflate</div>
        </div>
      </div>
    </Card>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await safeAuth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await searchParams;
  const requestedWorkspaceId = typeof params.workspace === "string" ? params.workspace : null;
  const notice = typeof params.notice === "string" ? params.notice : null;
  const error = typeof params.error === "string" ? params.error : null;

  const [subscription, workspaceHome] = await Promise.all([
    getUserSubscription(session.user.id),
    getDashboardWorkspaceHome(session.user.id, requestedWorkspaceId),
  ]);

  const { currentWorkspace, workspaces, incomingInvitations } = workspaceHome;

  return (
    <main className="space-y-8 pb-10">
      <section className="grid gap-0 border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.78)] xl:grid-cols-[minmax(0,1.35fr),360px]">
        <div className="p-8">
          <div className="flex flex-wrap items-center gap-2">
            <WorkspaceBadge label={getWorkspaceTypeLabel(currentWorkspace.type)} />
            <WorkspaceBadge label={getWorkspaceStatusLabel(currentWorkspace.status)} accent="muted" />
            <WorkspaceBadge label={getRoleLabel(currentWorkspace.role)} accent="muted" />
          </div>
          <h1 className="editorial-display mt-5 max-w-4xl text-[3rem] leading-[0.98] text-slate-950 sm:text-[4rem]">
            {currentWorkspace.name}
          </h1>
          <p className="mt-4 max-w-3xl text-[1.02rem] leading-8 text-slate-600">
            Dashboardet samler team, tilgang og invitasjoner i én arbeidsflate, slik at det er
            enkelt å holde oversikt over hvem som jobber med hva.
          </p>
        </div>

        <aside className="border-t border-[rgba(15,23,42,0.08)] bg-[#192536] p-8 text-white xl:border-l xl:border-t-0">
          <div className="data-label text-[11px] font-semibold uppercase text-white/60">Konto og tilgang</div>
          <div className="mt-4 text-[1.45rem] font-semibold leading-tight">
            {subscription?.status ? `Status: ${subscription.status}` : "Standard tilgang aktiv"}
          </div>
          <p className="mt-4 text-sm leading-7 text-white/76">
            Plan: {subscription?.plan ?? "Standard"} · neste periode {formatDate(subscription?.currentPeriodEnd)}
          </p>
          <div className="mt-5 rounded-[1rem] border border-white/10 bg-white/10 p-4 text-sm leading-6 text-white/82">
            Aktiv arbeidsflate styrer hvilke medlemmer, invitasjoner og oppgaver du arbeider med.
          </div>
        </aside>
      </section>

      <FlashMessage message={notice} tone="success" />
      <FlashMessage message={error} tone="error" />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr),360px]">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(15,23,42,0.08)] pb-4">
              <div>
                <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                  Arbeidsflater
                </div>
                <h2 className="mt-2 text-[1.7rem] font-semibold text-slate-950">Bytt arbeidsflate</h2>
              </div>
              <div className="text-sm text-slate-500">{workspaces.length} tilgjengelige arbeidsflater</div>
            </div>
            <div className="mt-6 grid gap-4">
              {workspaces.map((workspace) => (
                <WorkspaceOverviewCard key={workspace.id} workspace={workspace} />
              ))}
            </div>
          </Card>

          <Card>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr),320px]">
              <div>
                <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                  Medlemmer
                </div>
                <h2 className="mt-2 text-[1.7rem] font-semibold text-slate-950">Team og tilgang</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Medlemmer får tilgang til kommende DD-rom, abonnementer og varsler i denne
                  arbeidsflaten.
                </p>

                <div className="mt-6 grid gap-3">
                  {currentWorkspace.members.map((member) => (
                    <div
                      key={member.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.78)] p-4"
                    >
                      <div>
                        <div className="font-semibold text-slate-950">
                          {member.name ?? member.email}
                          {member.isCurrentUser ? " (deg)" : ""}
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          {member.email} · {getRoleLabel(member.role)} · med siden{" "}
                          {formatDate(member.joinedAt)}
                        </div>
                      </div>

                      {currentWorkspace.capabilities.canRemoveMembers && !member.isCurrentUser ? (
                        <form action={removeWorkspaceMemberAction}>
                          <input type="hidden" name="workspaceId" value={currentWorkspace.id} />
                          <input type="hidden" name="memberUserId" value={member.userId} />
                          <button
                            type="submit"
                            className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-[rgba(15,23,42,0.18)] hover:text-slate-950"
                          >
                            Fjern
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4 rounded-[1rem] border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] p-5">
                <div>
                  <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                    Inviter nytt medlem
                  </div>
                  <h3 className="mt-2 text-xl font-semibold text-slate-950">Legg til team</h3>
                </div>

                {currentWorkspace.capabilities.canInviteMembers ? (
                  <form action={inviteWorkspaceMemberAction} className="space-y-3">
                    <input type="hidden" name="workspaceId" value={currentWorkspace.id} />
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">E-post</label>
                      <input
                        name="email"
                        type="email"
                        required
                        className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">Rolle</label>
                      <select
                        name="role"
                        defaultValue="MEMBER"
                        className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]"
                      >
                        <option value="MEMBER">Medlem</option>
                        <option value="ADMIN">Administrator</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      className="w-full rounded-full bg-[#162233] px-5 py-3 text-sm font-semibold text-white hover:bg-[#223246]"
                    >
                      Send invitasjon
                    </button>
                  </form>
                ) : (
                  <div className="rounded-[0.95rem] border border-dashed border-[rgba(15,23,42,0.14)] bg-white p-4 text-sm leading-6 text-slate-600">
                    {currentWorkspace.type === "PERSONAL"
                      ? "Personlige arbeidsflater støtter ikke flere medlemmer. Opprett en teamarbeidsflate for samarbeid."
                      : "Bare eiere og administratorer kan invitere nye medlemmer."}
                  </div>
                )}

                <div className="border-t border-[rgba(15,23,42,0.08)] pt-4">
                  <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                    Teamarbeidsflate
                  </div>
                  <form action={createTeamWorkspaceAction} className="mt-3 space-y-3">
                    <input
                      name="name"
                      placeholder="F.eks. DD-team Nordics"
                      required
                      className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]"
                    />
                    <button
                      type="submit"
                      className="w-full rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:border-[rgba(15,23,42,0.2)]"
                    >
                      Opprett nytt team
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-[rgba(255,255,255,0.92)]">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
              Mottatte invitasjoner
            </div>
            <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Ventende invitasjoner</h2>
            <div className="mt-5 space-y-3">
              {incomingInvitations.length === 0 ? (
                <div className="rounded-[0.95rem] border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-5 text-sm leading-6 text-slate-600">
                  Du har ingen ventende invitasjoner akkurat nå.
                </div>
              ) : (
                incomingInvitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.76)] p-4"
                  >
                    <div className="font-semibold text-slate-950">
                      {invitation.invitedByName ?? invitation.email}
                    </div>
                    <div className="mt-1 text-sm leading-6 text-slate-600">
                      Invitert av {invitation.invitedByName ?? invitation.invitedByEmail} · rolle{" "}
                      {getRoleLabel(invitation.role)} · utløper {formatDate(invitation.expiresAt)}
                    </div>
                    <div className="mt-4 flex gap-2">
                      {invitation.status === "PENDING" ? (
                        <>
                          <form action={acceptWorkspaceInvitationAction}>
                            <input type="hidden" name="invitationId" value={invitation.id} />
                            <button
                              type="submit"
                              className="rounded-full bg-[#162233] px-4 py-2 text-sm font-semibold text-white hover:bg-[#223246]"
                            >
                              Aksepter
                            </button>
                          </form>
                          <form action={declineWorkspaceInvitationAction}>
                            <input type="hidden" name="invitationId" value={invitation.id} />
                            <button
                              type="submit"
                              className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-[rgba(15,23,42,0.18)] hover:text-slate-950"
                            >
                              Avslå
                            </button>
                          </form>
                        </>
                      ) : (
                        <WorkspaceBadge label="Utløpt" accent="muted" />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="bg-[#F8FAFC]">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
              Aktiv arbeidsflate
            </div>
            <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Oversikt akkurat nå</h2>
            <div className="mt-5 grid gap-3">
              <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white p-4">
                <div className="data-label text-[11px] font-semibold uppercase text-slate-500">DD-rom</div>
                <div className="mt-2 text-[1.5rem] font-semibold text-slate-950">
                  {currentWorkspace.activeDdRoomCount}
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Viser aktive rom og tilgjengelig kapasitet i denne arbeidsflaten.
                </p>
              </div>

              <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white p-4">
                <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                  Abonnementer
                </div>
                <div className="mt-2 text-[1.5rem] font-semibold text-slate-950">
                  {currentWorkspace.activeWatchCount}
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Gir rask oversikt over aktive og arkiverte abonnementer per arbeidsflate.
                </p>
              </div>

              <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white p-4">
                <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Varsler</div>
                <div className="mt-2 text-[1.5rem] font-semibold text-slate-950">
                  {currentWorkspace.unreadNotificationCount}
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Fremhever uleste signaler som fortsatt krever oppfølging.
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
              Sendte invitasjoner
            </div>
            <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Historikk for aktiv arbeidsflate</h2>
            <div className="mt-5 space-y-3">
              {currentWorkspace.invitations.length === 0 ? (
                <div className="rounded-[0.95rem] border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-5 text-sm leading-6 text-slate-600">
                  Ingen invitasjoner er sendt fra denne arbeidsflaten ennå.
                </div>
              ) : (
                currentWorkspace.invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.76)] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="font-semibold text-slate-950">{invitation.email}</div>
                      <WorkspaceBadge label={invitation.status} accent="muted" />
                    </div>
                    <div className="mt-1 text-sm leading-6 text-slate-600">
                      Rolle {getRoleLabel(invitation.role)} · sendt {formatDate(invitation.createdAt)} ·
                      utløper {formatDate(invitation.expiresAt)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </section>
    </main>
  );
}
