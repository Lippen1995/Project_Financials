/**
 * Admin Notification Service
 *
 * Manages notifications targeted at platform administrators and financial reviewers.
 * These appear in the global bell icon in the app header and link to the relevant
 * admin page (e.g. "a new calibration proposal is waiting for your approval").
 *
 * Design notes for reviewers:
 *  - Notifications are scoped by role (ADMIN, FINANCIAL_REVIEWER) so the system
 *    can address "everyone with the admin role" without picking specific users.
 *  - dedupeKey is the safety net against duplicate notifications when a producing
 *    job runs more than once. Pick a stable identifier (e.g. "calibration:v8") and
 *    the same event will only ever create one notification.
 *  - Notifications have three states: UNREAD (default), READ (user opened it), and
 *    DISMISSED (user explicitly hid it). Dismissed notifications stay in the DB for
 *    audit but never appear in the bell.
 */
import {
  type AdminNotification,
  AdminNotificationStatus,
  type AdminNotificationType,
  type AppRole,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type AdminNotificationSummary = {
  id: string;
  type: AdminNotificationType;
  recipientRole: AppRole;
  recipientUserId: string | null;
  title: string;
  body: string;
  linkPath: string;
  status: AdminNotificationStatus;
  metadata: unknown;
  createdAt: Date;
  readAt: Date | null;
  dismissedAt: Date | null;
};

function toSummary(record: AdminNotification): AdminNotificationSummary {
  return {
    id: record.id,
    type: record.type,
    recipientRole: record.recipientRole,
    recipientUserId: record.recipientUserId,
    title: record.title,
    body: record.body,
    linkPath: record.linkPath,
    status: record.status,
    metadata: record.metadata,
    createdAt: record.createdAt,
    readAt: record.readAt,
    dismissedAt: record.dismissedAt,
  };
}

export type CreateAdminNotificationInput = {
  type: AdminNotificationType;
  recipientRole: AppRole;
  recipientUserId?: string | null;
  title: string;
  body: string;
  linkPath: string;
  dedupeKey: string;
  metadata?: Prisma.InputJsonValue | null;
};

/**
 * Creates an admin notification if one with the same dedupeKey does not exist.
 * Returns the resulting record (whether newly created or pre-existing).
 *
 * Idempotent by design — calling this twice with the same dedupeKey is safe.
 */
export async function createAdminNotificationIfMissing(
  input: CreateAdminNotificationInput,
): Promise<AdminNotificationSummary> {
  const record = await prisma.adminNotification.upsert({
    where: { dedupeKey: input.dedupeKey },
    update: {},
    create: {
      type: input.type,
      recipientRole: input.recipientRole,
      recipientUserId: input.recipientUserId ?? null,
      title: input.title,
      body: input.body,
      linkPath: input.linkPath,
      dedupeKey: input.dedupeKey,
      metadata: input.metadata ?? Prisma.JsonNull,
    },
  });
  return toSummary(record);
}

export type ListAdminNotificationsInput = {
  /** The role of the actor (ADMIN or FINANCIAL_REVIEWER). Filters notifications they can see. */
  actorRole: AppRole;
  /** The actor's user id. Notifications addressed to a specific user are filtered by this. */
  actorUserId: string;
  /** When false (default), dismissed notifications are excluded. */
  includeDismissed?: boolean;
  /** Maximum results to return. Defaults to 50. */
  limit?: number;
};

/**
 * Returns admin notifications visible to the given actor:
 *  - all notifications targeted at the actor's role with no specific user
 *  - notifications addressed specifically to this user
 *
 * Ordered: unread first, then most recent.
 */
export async function listAdminNotificationsForActor(
  input: ListAdminNotificationsInput,
): Promise<AdminNotificationSummary[]> {
  const records = await prisma.adminNotification.findMany({
    where: {
      OR: [
        { recipientRole: input.actorRole, recipientUserId: null },
        { recipientUserId: input.actorUserId },
      ],
      ...(input.includeDismissed
        ? {}
        : { status: { in: [AdminNotificationStatus.UNREAD, AdminNotificationStatus.READ] } }),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: input.limit ?? 50,
  });
  return records.map(toSummary);
}

export async function countUnreadAdminNotificationsForActor(
  input: Pick<ListAdminNotificationsInput, "actorRole" | "actorUserId">,
): Promise<number> {
  return prisma.adminNotification.count({
    where: {
      status: AdminNotificationStatus.UNREAD,
      OR: [
        { recipientRole: input.actorRole, recipientUserId: null },
        { recipientUserId: input.actorUserId },
      ],
    },
  });
}

export async function markAdminNotificationRead(notificationId: string): Promise<void> {
  await prisma.adminNotification.updateMany({
    where: { id: notificationId, status: AdminNotificationStatus.UNREAD },
    data: { status: AdminNotificationStatus.READ, readAt: new Date() },
  });
}

export async function dismissAdminNotification(notificationId: string): Promise<void> {
  await prisma.adminNotification.update({
    where: { id: notificationId },
    data: { status: AdminNotificationStatus.DISMISSED, dismissedAt: new Date() },
  });
}

export async function markAllAdminNotificationsReadForActor(
  input: Pick<ListAdminNotificationsInput, "actorRole" | "actorUserId">,
): Promise<number> {
  const result = await prisma.adminNotification.updateMany({
    where: {
      status: AdminNotificationStatus.UNREAD,
      OR: [
        { recipientRole: input.actorRole, recipientUserId: null },
        { recipientUserId: input.actorUserId },
      ],
    },
    data: { status: AdminNotificationStatus.READ, readAt: new Date() },
  });
  return result.count;
}
