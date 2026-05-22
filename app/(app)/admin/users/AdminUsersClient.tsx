"use client";

import { useState, useTransition } from "react";
import { type AppRole } from "@prisma/client";
import { useRouter } from "next/navigation";

import type {
  AdminUsersPageModel,
  AdminUserRow,
} from "@/server/services/admin-user-management-service";

type AdminUsersClientProps = {
  model: AdminUsersPageModel;
};

type RoleChangeDraft = {
  userId: string;
  name: string | null;
  email: string;
  currentRole: AppRole;
  currentRoleLabel: string;
  nextRole: AppRole;
  nextRoleLabel: string;
};

function buildInitialRoleMap(rows: AdminUserRow[]) {
  return rows.reduce<Record<string, AppRole>>((acc, row) => {
    acc[row.id] = row.appRole;
    return acc;
  }, {});
}

export default function AdminUsersClient({ model }: AdminUsersClientProps) {
  const router = useRouter();
  const [draftRoles, setDraftRoles] = useState<Record<string, AppRole>>(
    buildInitialRoleMap(model.rows),
  );
  const [dialogDraft, setDialogDraft] = useState<RoleChangeDraft | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const openDialog = (row: AdminUserRow) => {
    const nextRole = draftRoles[row.id] ?? row.appRole;
    if (nextRole === row.appRole) {
      return;
    }

    const nextRoleLabel =
      model.roleOptions.find((option) => option.value === nextRole)?.label ?? nextRole;

    setDialogDraft({
      userId: row.id,
      name: row.name,
      email: row.email,
      currentRole: row.appRole,
      currentRoleLabel: row.roleLabel,
      nextRole,
      nextRoleLabel,
    });
  };

  const submitRoleChange = () => {
    if (!dialogDraft) {
      return;
    }

    startTransition(async () => {
      setFeedback(null);

      const response = await fetch(`/api/admin/users/${dialogDraft.userId}/role`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nextRole: dialogDraft.nextRole,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setFeedback({
          tone: "error",
          text: payload?.error ?? "Kunne ikke endre rollen akkurat nå.",
        });
        return;
      }

      setDialogDraft(null);
      setFeedback({
        tone: "success",
        text: "Rollen ble oppdatert.",
      });
      router.refresh();
    });
  };

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
        <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
          Brukere og roller
        </p>
        <h1 className="editorial-display mt-3 text-[2.25rem] leading-tight text-[var(--px-text)]">
          Brukere og roller
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--px-muted)]">
          Finn brukere, se global rolle, og endre tilgang når det er nødvendig. Denne
          siden styrer globale app-roller, ikke roller inne i workspaces.
        </p>
      </section>

      {feedback ? (
        <section
          className={`rounded-2xl border p-4 text-sm ${
            feedback.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {feedback.text}
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        {model.stats.map((stat) => (
          <div
            key={stat.role}
            className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6"
          >
            <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-muted)]">
              {stat.label}
            </p>
            <p className="editorial-display mt-3 text-[2rem] leading-none text-[var(--px-text)]">
              {stat.count.toLocaleString("nb-NO")}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
        <form method="GET" className="flex flex-wrap gap-3">
          <input
            type="text"
            name="query"
            defaultValue={model.query}
            placeholder="Søk på navn eller e-post"
            className="min-w-[280px] rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-3 text-sm text-[var(--px-text)] outline-none focus:border-[var(--px-accent)]"
          />
          <select
            name="role"
            defaultValue={model.roleFilter}
            className="rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-3 text-sm text-[var(--px-text)] outline-none focus:border-[var(--px-accent)]"
          >
            <option value="ALL">Alle roller</option>
            {model.roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-full bg-[var(--px-action)] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--px-action-hover)]"
          >
            Filtrer
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)]">
        {model.rows.length === 0 ? (
          <div className="p-8 text-sm leading-6 text-[var(--px-muted)]">
            Ingen brukere matcher filtrene dine.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse">
              <thead className="bg-[var(--px-subtle)]">
                <tr>
                  {[
                    "Navn",
                    "E-post",
                    "Rolle",
                    "Opprettet",
                    "E-poststatus",
                    "Abonnement",
                    "Sist valgte workspace",
                    "Handling",
                  ].map((label, index) => (
                    <th
                      key={label}
                      className={`px-4 py-4 text-left data-label text-[11px] uppercase tracking-widest text-[var(--px-text)] ${
                        index === 7 ? "text-right" : ""
                      }`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {model.rows.map((row) => {
                  const selectedRole = draftRoles[row.id] ?? row.appRole;
                  const isSelfDowngradeAttempt =
                    row.isCurrentUser && row.appRole === "ADMIN" && selectedRole !== "ADMIN";
                  const canSubmit = selectedRole !== row.appRole && !isSelfDowngradeAttempt;

                  return (
                    <tr key={row.id} className="border-t border-[var(--px-border)]">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-[var(--px-text)]">
                          {row.name ?? "Uten navn"}
                        </div>
                        {row.isCurrentUser ? (
                          <div className="mt-1 text-xs text-[var(--px-muted)]">Du</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-sm text-[var(--px-muted)]">{row.email}</td>
                      <td className="px-4 py-4">
                        <select
                          value={selectedRole}
                          onChange={(event) =>
                            setDraftRoles((current) => ({
                              ...current,
                              [row.id]: event.target.value as AppRole,
                            }))
                          }
                          className="rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2 text-sm text-[var(--px-text)] outline-none focus:border-[var(--px-accent)]"
                        >
                          {model.roleOptions.map((option) => {
                            const isDisabled =
                              row.isCurrentUser &&
                              row.appRole === "ADMIN" &&
                              option.value !== "ADMIN";

                            return (
                              <option
                                key={option.value}
                                value={option.value}
                                disabled={isDisabled}
                              >
                                {option.label}
                              </option>
                            );
                          })}
                        </select>
                      </td>
                      <td className="px-4 py-4 text-sm text-[var(--px-muted)]">{row.createdAt}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                            row.emailVerified
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          {row.emailVerified ? "Bekreftet" : "Ikke bekreftet"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-[var(--px-muted)]">
                        {row.subscriptionLabel}
                      </td>
                      <td className="px-4 py-4 text-sm text-[var(--px-muted)]">
                        {row.lastWorkspaceLabel}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openDialog(row)}
                          disabled={!canSubmit || isPending}
                          className="rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--px-action-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Endre rolle
                        </button>
                        {isSelfDowngradeAttempt ? (
                          <p className="mt-2 text-xs text-rose-700">
                            Du kan ikke fjerne din egen adminrolle her.
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
        <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
          Siste rolleendringer
        </p>
        <div className="mt-5 space-y-3">
          {model.recentChanges.length === 0 ? (
            <p className="text-sm text-[var(--px-muted)]">Ingen rolleendringer registrert ennå.</p>
          ) : (
            model.recentChanges.map((change) => (
              <div
                key={change.id}
                className="rounded-xl border border-[var(--px-border)] bg-[var(--px-subtle)] p-4"
              >
                <p className="text-sm leading-6 text-[var(--px-text)]">
                  <span className="font-semibold">{change.actorName}</span> endret{" "}
                  <span className="font-semibold">{change.targetName}</span> fra{" "}
                  <span className="font-semibold">{change.fromRoleLabel}</span> til{" "}
                  <span className="font-semibold">{change.toRoleLabel}</span>.
                </p>
                <p className="mt-1 text-xs text-[var(--px-muted)]">{change.createdAt}</p>
              </div>
            ))
          )}
        </div>
      </section>

      {dialogDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-8">
          <div className="w-full max-w-xl rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6 shadow-xl">
            <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
              Bekreft rolleendring
            </p>
            <h2 className="mt-3 text-[1.5rem] font-semibold text-[var(--px-text)]">
              Er du sikker på at du vil endre denne rollen?
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--px-muted)]">
              Tilgangen endres umiddelbart når du bekrefter. Kontroller at bruker, nåværende
              rolle og ny rolle stemmer før du går videre.
            </p>

            <div className="mt-5 rounded-xl border border-[var(--px-border)] bg-[var(--px-subtle)] p-5">
              <div className="space-y-2 text-sm text-[var(--px-text)]">
                <p>
                  <span className="font-semibold">Bruker:</span>{" "}
                  {dialogDraft.name ?? "Uten navn"}
                </p>
                <p>
                  <span className="font-semibold">E-post:</span> {dialogDraft.email}
                </p>
                <p>
                  <span className="font-semibold">Nåværende rolle:</span>{" "}
                  {dialogDraft.currentRoleLabel}
                </p>
                <p>
                  <span className="font-semibold">Ny rolle:</span> {dialogDraft.nextRoleLabel}
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDialogDraft(null)}
                className="rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-2 text-sm font-medium text-[var(--px-text)] transition-colors hover:bg-[var(--px-subtle)]"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={submitRoleChange}
                disabled={isPending}
                className="rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--px-action-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "Oppdaterer..." : "Bekreft rolleendring"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
