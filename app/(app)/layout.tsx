import React from "react";

import { AdminNotificationBell } from "@/components/admin-notification-bell";
import { AppTopNavigation } from "@/components/navigation/app-top-navigation";
import { getFinancialReviewerOrNull } from "@/lib/admin-auth";
import { safeAuth } from "@/lib/auth";
import { buildGlobalNavItems } from "@/lib/navigation";
import {
  countUnreadAdminNotificationsForActor,
  listAdminNotificationsForActor,
} from "@/server/services/admin-notification-service";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await safeAuth();
  const primaryNavItems = buildGlobalNavItems(session?.user);

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
      <AppTopNavigation
        logoHref="/"
        navItems={primaryNavItems}
        viewer={session?.user ?? null}
        adminNotification={
          reviewer ? (
            <AdminNotificationBell
              notifications={adminNotifications}
              unreadCount={unreadAdminCount}
            />
          ) : undefined
        }
      />

      <div className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-10">{children}</div>
    </>
  );
}
