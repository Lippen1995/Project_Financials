import { describe, expect, it, vi, beforeEach } from "vitest";

const { prismaMock, store } = vi.hoisted(() => {
  type StoredRecord = {
    id: string;
    type: string;
    recipientRole: "ADMIN" | "FINANCIAL_REVIEWER" | "USER";
    recipientUserId: string | null;
    title: string;
    body: string;
    linkPath: string;
    dedupeKey: string;
    status: "UNREAD" | "READ" | "DISMISSED";
    metadata: unknown;
    createdAt: Date;
    readAt: Date | null;
    dismissedAt: Date | null;
  };
  const records: StoredRecord[] = [];

  const prismaMock = {
    adminNotification: {
      upsert: vi.fn(async (args: { where: { dedupeKey: string }; create: Partial<StoredRecord> }) => {
        const existing = records.find((r) => r.dedupeKey === args.where.dedupeKey);
        if (existing) return existing;
        const fresh: StoredRecord = {
          id: `notif-${records.length + 1}`,
          type: args.create.type ?? "CALIBRATION_PROPOSED",
          recipientRole: args.create.recipientRole ?? "ADMIN",
          recipientUserId: args.create.recipientUserId ?? null,
          title: args.create.title ?? "",
          body: args.create.body ?? "",
          linkPath: args.create.linkPath ?? "/",
          dedupeKey: args.create.dedupeKey ?? args.where.dedupeKey,
          status: "UNREAD",
          metadata: args.create.metadata ?? null,
          createdAt: new Date(),
          readAt: null,
          dismissedAt: null,
        };
        records.push(fresh);
        return fresh;
      }),
      findMany: vi.fn(async (args: { where: Record<string, unknown>; take?: number }) => {
        const matches = records.filter((r) => {
          const where = args.where as { OR: Array<Record<string, unknown>>; status?: { in: string[] } };
          const orMatches = where.OR.some((clause) => {
            if ("recipientRole" in clause && "recipientUserId" in clause) {
              return r.recipientRole === clause.recipientRole && r.recipientUserId === clause.recipientUserId;
            }
            if ("recipientUserId" in clause) {
              return r.recipientUserId === clause.recipientUserId;
            }
            return false;
          });
          const statusMatches = where.status?.in
            ? where.status.in.includes(r.status)
            : true;
          return orMatches && statusMatches;
        });
        return matches.slice(0, args.take ?? matches.length);
      }),
      count: vi.fn(async () =>
        records.filter((r) => r.status === "UNREAD").length,
      ),
      updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let updated = 0;
        for (const r of records) {
          if (
            (args.where.status === undefined || r.status === args.where.status) &&
            (args.where.id === undefined || r.id === args.where.id)
          ) {
            if (args.data.status) r.status = args.data.status as StoredRecord["status"];
            if (args.data.readAt) r.readAt = args.data.readAt as Date;
            updated++;
          }
        }
        return { count: updated };
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = records.find((rec) => rec.id === args.where.id);
        if (!r) throw new Error("not found");
        if (args.data.status) r.status = args.data.status as StoredRecord["status"];
        if (args.data.dismissedAt) r.dismissedAt = args.data.dismissedAt as Date;
        return r;
      }),
    },
  };

  return { prismaMock, store: records };
});

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import {
  countUnreadAdminNotificationsForActor,
  createAdminNotificationIfMissing,
  dismissAdminNotification,
  listAdminNotificationsForActor,
  markAdminNotificationRead,
  markAllAdminNotificationsReadForActor,
} from "@/server/services/admin-notification-service";

describe("admin-notification-service", () => {
  beforeEach(() => {
    store.length = 0;
    prismaMock.adminNotification.upsert.mockClear();
    prismaMock.adminNotification.findMany.mockClear();
    prismaMock.adminNotification.count.mockClear();
    prismaMock.adminNotification.updateMany.mockClear();
    prismaMock.adminNotification.update.mockClear();
  });

  it("creates a notification when dedupeKey is fresh", async () => {
    const created = await createAdminNotificationIfMissing({
      type: "CALIBRATION_PROPOSED",
      recipientRole: "ADMIN",
      title: "Ny kalibrering",
      body: "v8 venter på godkjenning",
      linkPath: "/admin/extraction-learning?proposal=v8",
      dedupeKey: "calibration:v8",
    });

    expect(created.status).toBe("UNREAD");
    expect(store).toHaveLength(1);
  });

  it("returns the existing record when dedupeKey collides — no duplicates", async () => {
    await createAdminNotificationIfMissing({
      type: "CALIBRATION_PROPOSED",
      recipientRole: "ADMIN",
      title: "Ny kalibrering",
      body: "v8 venter",
      linkPath: "/admin/extraction-learning",
      dedupeKey: "calibration:v8",
    });
    await createAdminNotificationIfMissing({
      type: "CALIBRATION_PROPOSED",
      recipientRole: "ADMIN",
      title: "Ny kalibrering (igjen)",
      body: "v8 venter fortsatt",
      linkPath: "/admin/extraction-learning",
      dedupeKey: "calibration:v8",
    });

    expect(store).toHaveLength(1);
  });

  it("lists role-scoped and user-scoped notifications for an admin", async () => {
    await createAdminNotificationIfMissing({
      type: "CALIBRATION_PROPOSED",
      recipientRole: "ADMIN",
      title: "Til alle admins",
      body: "",
      linkPath: "/admin",
      dedupeKey: "shared:1",
    });
    await createAdminNotificationIfMissing({
      type: "TRAINING_MILESTONE",
      recipientRole: "ADMIN",
      recipientUserId: "user-1",
      title: "Personlig",
      body: "",
      linkPath: "/admin",
      dedupeKey: "personal:1",
    });

    const visible = await listAdminNotificationsForActor({
      actorRole: "ADMIN",
      actorUserId: "user-1",
    });
    expect(visible).toHaveLength(2);
  });

  it("excludes dismissed notifications by default", async () => {
    await createAdminNotificationIfMissing({
      type: "CALIBRATION_PROPOSED",
      recipientRole: "ADMIN",
      title: "Test",
      body: "",
      linkPath: "/admin",
      dedupeKey: "dedupe-1",
    });
    const created = store[0]!;

    await dismissAdminNotification(created.id);

    const visible = await listAdminNotificationsForActor({
      actorRole: "ADMIN",
      actorUserId: "user-1",
    });
    expect(visible).toHaveLength(0);
  });

  it("only counts UNREAD notifications", async () => {
    await createAdminNotificationIfMissing({
      type: "CALIBRATION_PROPOSED",
      recipientRole: "ADMIN",
      title: "Ulest 1",
      body: "",
      linkPath: "/admin",
      dedupeKey: "u1",
    });
    await createAdminNotificationIfMissing({
      type: "CALIBRATION_PROPOSED",
      recipientRole: "ADMIN",
      title: "Ulest 2",
      body: "",
      linkPath: "/admin",
      dedupeKey: "u2",
    });
    await markAdminNotificationRead(store[0]!.id);

    const count = await countUnreadAdminNotificationsForActor({
      actorRole: "ADMIN",
      actorUserId: "user-1",
    });
    expect(count).toBe(1);
  });

  it("marks all unread notifications as read for an actor", async () => {
    await createAdminNotificationIfMissing({
      type: "CALIBRATION_PROPOSED",
      recipientRole: "ADMIN",
      title: "A",
      body: "",
      linkPath: "/admin",
      dedupeKey: "a",
    });
    await createAdminNotificationIfMissing({
      type: "PATTERN_DETECTED",
      recipientRole: "ADMIN",
      title: "B",
      body: "",
      linkPath: "/admin",
      dedupeKey: "b",
    });

    const updated = await markAllAdminNotificationsReadForActor({
      actorRole: "ADMIN",
      actorUserId: "user-1",
    });
    expect(updated).toBe(2);
    expect(store.every((r) => r.status === "READ")).toBe(true);
  });
});
