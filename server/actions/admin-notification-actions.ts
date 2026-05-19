"use server";

import { revalidatePath } from "next/cache";

import { getFinancialReviewerOrNull } from "@/lib/admin-auth";
import {
  dismissAdminNotification,
  markAdminNotificationRead,
  markAllAdminNotificationsReadForActor,
} from "@/server/services/admin-notification-service";

/**
 * Marks a single admin notification as read. Silently ignores notifications the
 * actor is not allowed to see — the service-layer query already scopes by role.
 */
export async function markAdminNotificationReadAction(notificationId: string): Promise<void> {
  const reviewer = await getFinancialReviewerOrNull();
  if (!reviewer) {
    return;
  }

  await markAdminNotificationRead(notificationId);
  revalidatePath("/", "layout");
}

export async function dismissAdminNotificationAction(notificationId: string): Promise<void> {
  const reviewer = await getFinancialReviewerOrNull();
  if (!reviewer) {
    return;
  }

  await dismissAdminNotification(notificationId);
  revalidatePath("/", "layout");
}

export async function markAllAdminNotificationsReadAction(): Promise<void> {
  const reviewer = await getFinancialReviewerOrNull();
  if (!reviewer) {
    return;
  }

  await markAllAdminNotificationsReadForActor({
    actorRole: reviewer.appRole,
    actorUserId: reviewer.id,
  });
  revalidatePath("/", "layout");
}
