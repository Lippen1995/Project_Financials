import React from "react";

import { AdminNotificationBell } from "@/components/admin-notification-bell";
import { AppTopNavigation } from "@/components/navigation/app-top-navigation";
import type { AppViewer } from "@/lib/account-menu";
import { getFinancialReviewerOrNull } from "@/lib/admin-auth";
import { buildGlobalNavItems } from "@/lib/navigation";
import {
  countUnreadAdminNotificationsForActor,
  listAdminNotificationsForActor,
} from "@/server/services/admin-notification-service";

export async function buildAppSessionTopNavigation(viewer: AppViewer | null) {
  const primaryNavItems = buildGlobalNavItems(viewer);
  const reviewer = viewer ? await getFinancialReviewerOrNull() : null;
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
    <AppTopNavigation
      logoHref="/"
      navItems={primaryNavItems}
      viewer={viewer}
      adminNotification={
        reviewer ? (
          <AdminNotificationBell
            notifications={adminNotifications}
            unreadCount={unreadAdminCount}
          />
        ) : undefined
      }
    />
  );
}
