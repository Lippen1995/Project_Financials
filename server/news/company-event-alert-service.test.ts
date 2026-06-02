import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    companyEventExposure: {
      findMany: vi.fn(),
    },
    workspaceNotification: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { syncCompanyEventNotificationsForWatches } from "@/server/news/company-event-alert-service";

const watch = {
  id: "watch-1",
  workspaceId: "workspace-1",
  companyId: "akerbp",
  createdAt: new Date("2026-05-01T00:00:00Z"),
  company: {
    name: "Aker BP ASA",
  },
};

describe("company event alert service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.workspaceNotification.findUnique.mockResolvedValue(null);
    prismaMock.workspaceNotification.create.mockResolvedValue({ id: "notification-1" });
  });

  it("creates workspace notifications for high-value watched company events", async () => {
    prismaMock.companyEventExposure.findMany.mockResolvedValue([
      {
        eventId: "event-1",
        companyId: "akerbp",
        exposureType: "petroleum",
        exposureScore: 0.74,
        confidenceScore: 0.76,
        rationale: "Petroleumsrelatert read-across.",
        event: {
          companyId: "eqnr",
          eventType: "production_update",
          title: "Oil and gas discovery in the Norwegian Sea",
          investorValueScore: 72,
          company: {
            id: "eqnr",
            name: "Equinor ASA",
          },
        },
      },
    ]);

    const result = await syncCompanyEventNotificationsForWatches([watch]);

    expect(result).toEqual({ watchesEvaluated: 1, createdNotifications: 1 });
    expect(prismaMock.workspaceNotification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        type: "COMPANY_EVENT_NEW",
        dedupeKey: "watch:watch-1:company-event:event-1:petroleum",
        title: "Aker BP ASA: ny investorrelevant hendelse",
        companyId: "akerbp",
        metadata: expect.objectContaining({
          eventId: "event-1",
          sourceCompanyName: "Equinor ASA",
          exposureType: "petroleum",
          exposureScore: 0.74,
        }),
      }),
    });
  });

  it("does not create duplicate notifications", async () => {
    prismaMock.companyEventExposure.findMany.mockResolvedValue([
      {
        eventId: "event-1",
        exposureType: "direct",
        exposureScore: 0.96,
        confidenceScore: 0.94,
        rationale: "Direkte eksponering.",
        event: {
          companyId: "akerbp",
          eventType: "buyback",
          title: "Aker BP ASA: buy-back",
          investorValueScore: 60,
          company: {
            id: "akerbp",
            name: "Aker BP ASA",
          },
        },
      },
    ]);
    prismaMock.workspaceNotification.findUnique.mockResolvedValue({ id: "existing" });

    const result = await syncCompanyEventNotificationsForWatches([watch]);

    expect(result.createdNotifications).toBe(0);
    expect(prismaMock.workspaceNotification.create).not.toHaveBeenCalled();
  });

  it("uses conservative default thresholds in the exposure query", async () => {
    prismaMock.companyEventExposure.findMany.mockResolvedValue([]);

    await syncCompanyEventNotificationsForWatches([watch]);

    expect(prismaMock.companyEventExposure.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          exposureScore: { gte: 0.7 },
          event: expect.objectContaining({
            investorValueScore: { gte: 55 },
            lastSeen: { gt: watch.createdAt },
          }),
        }),
        take: 25,
      }),
    );
  });
});
