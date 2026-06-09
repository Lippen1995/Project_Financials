import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, repositoryMock } = vi.hoisted(() => ({
  prismaMock: {
    companyEvent: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    workspaceMember: {
      findFirst: vi.fn(),
    },
    companyEventFeedback: {
      findMany: vi.fn(),
    },
  },
  repositoryMock: {
    createCompanyEventFeedback: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));
vi.mock("@/server/news/company-event-repository", () => repositoryMock);

import {
  getCompanyEventFeedbackMetrics,
  labelForFeedback,
  labelForFeedbackAction,
  recordCompanyEventFeedback,
} from "@/server/news/company-event-feedback-service";

describe("company event feedback service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.companyEvent.findUnique.mockResolvedValue({
      id: "event-1",
      status: "ACTIVE",
      eventType: "mna",
      investorValueScore: 80,
      metadata: { existing: true },
    });
    prismaMock.workspaceMember.findFirst.mockResolvedValue({ id: "member-1" });
    repositoryMock.createCompanyEventFeedback.mockResolvedValue({ id: "feedback-1" });
  });

  it("maps feedback actions to coarse learning labels", () => {
    expect(labelForFeedbackAction("relevant")).toBe("RELEVANT");
    expect(labelForFeedbackAction("too_high_score")).toBe("WEAK_RELEVANT");
    expect(labelForFeedbackAction("wrong_company")).toBe("NOT_RELEVANT");
  });

  it("derives the learning label from graded relevance, not investor value", () => {
    expect(labelForFeedback("rated", { relevanceScore: 85, investorValueScore: 20 })).toBe("RELEVANT");
    expect(labelForFeedback("rated", { relevanceScore: 50, investorValueScore: 90 })).toBe("WEAK_RELEVANT");
    expect(labelForFeedback("rated", { relevanceScore: 10, investorValueScore: 90 })).toBe("NOT_RELEVANT");
  });

  it("persists validated feedback with action and corrected value", async () => {
    await recordCompanyEventFeedback({
      eventId: "event-1",
      userId: "user-1",
      workspaceId: "workspace-1",
      action: "corrected_event_type",
      correctedValue: { eventType: "regulatory_change" },
      notes: "Wrong classification",
      actorRole: "USER",
    });

    expect(repositoryMock.createCompanyEventFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        userId: "user-1",
        workspaceId: "workspace-1",
        label: "WEAK_RELEVANT",
        action: "corrected_event_type",
        correctedValue: { eventType: "regulatory_change" },
        notes: "Wrong classification",
      }),
    );
    expect(prismaMock.companyEvent.update).not.toHaveBeenCalled();
  });

  it("allows admin feedback to dismiss globally noisy events", async () => {
    await recordCompanyEventFeedback({
      eventId: "event-1",
      userId: "admin-1",
      action: "duplicate",
      actorRole: "ADMIN",
    });

    expect(prismaMock.companyEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: expect.objectContaining({
        status: "DUPLICATE",
        metadata: expect.objectContaining({
          existing: true,
          latestFeedbackAction: "duplicate",
        }),
      }),
    });
  });

  it("aggregates feedback metrics", async () => {
    prismaMock.companyEventFeedback.findMany.mockResolvedValue([
      { action: "relevant", label: "RELEVANT", reviewedAt: new Date("2026-06-02T10:00:00Z") },
      { action: "wrong_company", label: "NOT_RELEVANT", reviewedAt: new Date("2026-06-02T09:00:00Z") },
      { action: "corrected_event_type", label: "WEAK_RELEVANT", reviewedAt: new Date("2026-06-02T08:00:00Z") },
    ]);

    const metrics = await getCompanyEventFeedbackMetrics("event-1");

    expect(metrics).toEqual({
      totalFeedback: 3,
      byAction: {
        relevant: 1,
        wrong_company: 1,
        corrected_event_type: 1,
      },
      byLabel: {
        RELEVANT: 1,
        NOT_RELEVANT: 1,
        WEAK_RELEVANT: 1,
      },
      correctionCount: 1,
      negativeFeedbackCount: 1,
      lastReviewedAt: "2026-06-02T10:00:00.000Z",
    });
  });
});
