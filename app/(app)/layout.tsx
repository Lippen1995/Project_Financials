import Link from "next/link";

import { AdminNotificationBell } from "@/components/admin-notification-bell";
import { safeAuth } from "@/lib/auth";
import { buildGlobalNavItems } from "@/lib/navigation";
import { logoutAction } from "@/server/actions/auth-actions";
import { getFinancialReviewerOrNull } from "@/lib/admin-auth";
import {
  countUnreadAdminNotificationsForActor,
  listAdminNotificationsForActor,
} from "@/server/services/admin-notification-service";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await safeAuth();
  const primaryNavItems = buildGlobalNavItems(session?.user);

  // Only fetch admin-scope notifications for users with admin/reviewer privileges.
  // Regular users never see this bell.
  const reviewer = session?.user ? await getFinancialReviewerOrNull() : null;
  const [adminNotifications, unreadAdminCount] = reviewer
    ? await Promise.all([
        listAdminNotificationsForActor({
          actorRole: reviewer.appRole,
          actorUserId: reviewer.id,
          limit: 25,
        }),
        countUnreadAdminNotificationsForActor({
          actorRole: reviewer.appRole,
          actorUserId: reviewer.id,
        }),
      ])
    : [[], 0];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[var(--px-border-subtle)] bg-[rgba(248,249,255,0.92)] backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between px-4 sm:px-6 lg:px-10">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex flex-col -space-y-0.5">
              <span className="text-[1.1rem] font-semibold tracking-[-0.03em] text-[var(--px-text)]">
                Fjord Insight
              </span>
              <span className="data-label text-[9px] text-[var(--px-muted)] opacity-70">
                Enterprise
              </span>
            </Link>

            <nav className="flex items-center gap-1">
              {primaryNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href as never}
                  className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-[var(--px-muted)] transition-colors hover:bg-[var(--px-subtle)] hover:text-[var(--px-text)]"
                >
                  <span className="material-symbols-outlined">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-1">
            {session?.user ? (
              <>
                {reviewer ? (
                  <AdminNotificationBell
                    notifications={adminNotifications}
                    unreadCount={unreadAdminCount}
                  />
                ) : null}
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-[var(--px-muted)] transition-colors hover:bg-[var(--px-subtle)] hover:text-[var(--px-text)]"
                >
                  <span className="material-symbols-outlined">account_circle</span>
                  <span>Konto</span>
                </Link>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-[var(--px-muted)] transition-colors hover:bg-[var(--px-subtle)] hover:text-[var(--px-text)]"
                  >
                    <span className="material-symbols-outlined">logout</span>
                    <span>Logg ut</span>
                  </button>
                </form>
                <div className="ml-3 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--px-accent)] text-xs font-bold text-white">
                  {session.user.name?.charAt(0).toUpperCase() ??
                    session.user.email?.charAt(0).toUpperCase() ??
                    "?"}
                </div>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--px-action-hover)]"
              >
                Logg inn
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-10">
        {children}
      </div>
    </>
  );
}

