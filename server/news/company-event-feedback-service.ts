import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { createCompanyEventFeedback } from "@/server/news/company-event-repository";

export const COMPANY_EVENT_FEEDBACK_ACTIONS = [
  "rated",
  "relevant",
  "not_relevant",
  "wrong_company",
  "wrong_event_type",
  "duplicate",
  "too_high_score",
  "too_low_score",
  "important_for_watchlist",
  "dismissed",
  "corrected_event_type",
  "corrected_direction",
  "corrected_score_bucket",
] as const;

export type CompanyEventFeedbackAction = (typeof COMPANY_EVENT_FEEDBACK_ACTIONS)[number];

export type RecordCompanyEventFeedbackInput = {
  eventId: string;
  userId: string;
  workspaceId?: string | null;
  action: CompanyEventFeedbackAction;
  previousValue?: unknown;
  correctedValue?: unknown;
  notes?: string | null;
  actorRole?: "USER" | "ADMIN" | "FINANCIAL_REVIEWER";
};

export type CompanyEventFeedbackMetrics = {
  totalFeedback: number;
  byAction: Record<string, number>;
  byLabel: Record<string, number>;
  correctionCount: number;
  negativeFeedbackCount: number;
  lastReviewedAt: string | null;
};

export async function recordCompanyEventExposureFeedback(input: {
  exposureId: string;
  userId: string;
  relevanceScore: number;
  investorValueScore: number;
  notes?: string | null;
  issueTags?: string[];
}) {
  const exposure = await prisma.companyEventExposure.findUnique({
    where: { id: input.exposureId },
    select: {
      id: true,
      exposureType: true,
      exposureScore: true,
      confidenceScore: true,
      metadata: true,
    },
  });
  if (!exposure) throw new Error("Company event exposure not found.");

  const relevanceScore = Math.min(100, Math.max(0, input.relevanceScore));
  const investorValueScore = Math.min(100, Math.max(0, input.investorValueScore));
  const label =
    relevanceScore >= 70
      ? "RELEVANT"
      : relevanceScore >= 30
        ? "WEAK_RELEVANT"
        : "NOT_RELEVANT";

  return prisma.companyEventExposureFeedback.create({
    data: {
      exposureId: exposure.id,
      userId: input.userId,
      relevanceScore,
      investorValueScore,
      label,
      previousValue: json({
        exposureType: exposure.exposureType,
        exposureScore: exposure.exposureScore,
        confidenceScore: exposure.confidenceScore,
      }),
      correctedValue: json({
        relevanceScore,
        investorValueScore,
        issueTags: input.issueTags ?? [],
        reviewerMethod: "admin-exposure-review-v1",
      }),
      notes: input.notes?.trim() || null,
    },
  });
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function isCompanyEventFeedbackAction(value: unknown): value is CompanyEventFeedbackAction {
  return typeof value === "string" && COMPANY_EVENT_FEEDBACK_ACTIONS.includes(value as CompanyEventFeedbackAction);
}

export function labelForFeedbackAction(action: CompanyEventFeedbackAction) {
  if (["relevant", "important_for_watchlist", "too_low_score"].includes(action)) {
    return "RELEVANT" as const;
  }

  if (["too_high_score", "corrected_event_type", "corrected_direction", "corrected_score_bucket"].includes(action)) {
    return "WEAK_RELEVANT" as const;
  }

  return "NOT_RELEVANT" as const;
}

function numericRating(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rating = (value as Record<string, unknown>)[key];
  return typeof rating === "number" && Number.isFinite(rating)
    ? Math.min(100, Math.max(0, rating))
    : null;
}

export function labelForFeedback(
  action: CompanyEventFeedbackAction,
  correctedValue?: unknown,
) {
  if (action !== "rated") return labelForFeedbackAction(action);

  const relevanceScore = numericRating(correctedValue, "relevanceScore");
  if (relevanceScore === null) return "WEAK_RELEVANT" as const;
  if (relevanceScore >= 70) return "RELEVANT" as const;
  if (relevanceScore >= 30) return "WEAK_RELEVANT" as const;
  return "NOT_RELEVANT" as const;
}

function canMutateEventStatus(actorRole: RecordCompanyEventFeedbackInput["actorRole"]) {
  return actorRole === "ADMIN" || actorRole === "FINANCIAL_REVIEWER";
}

function statusForAction(action: CompanyEventFeedbackAction) {
  if (action === "duplicate") return "DUPLICATE";
  if (action === "dismissed" || action === "wrong_company" || action === "wrong_event_type") return "DISMISSED";
  return null;
}

export async function recordCompanyEventFeedback(input: RecordCompanyEventFeedbackInput) {
  const event = await prisma.companyEvent.findUnique({
    where: { id: input.eventId },
    select: {
      id: true,
      status: true,
      eventType: true,
      investorValueScore: true,
      metadata: true,
    },
  });

  if (!event) {
    throw new Error("Company event not found.");
  }

  if (input.workspaceId) {
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: input.workspaceId,
        userId: input.userId,
      },
      select: { id: true },
    });
    if (!membership) {
      throw new Error("User is not a member of the selected workspace.");
    }
  }

  const feedback = await createCompanyEventFeedback({
    eventId: input.eventId,
    userId: input.userId,
    workspaceId: input.workspaceId,
    label: labelForFeedback(input.action, input.correctedValue),
    action: input.action,
    previousValue: input.previousValue === undefined ? null : json(input.previousValue),
    correctedValue: input.correctedValue === undefined ? null : json(input.correctedValue),
    notes: input.notes?.trim() || null,
  });

  const nextStatus = statusForAction(input.action);
  if (nextStatus && canMutateEventStatus(input.actorRole)) {
    await prisma.companyEvent.update({
      where: { id: input.eventId },
      data: {
        status: nextStatus,
        metadata: json({
          ...(event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
            ? (event.metadata as Record<string, unknown>)
            : {}),
          latestFeedbackAction: input.action,
          latestFeedbackAt: new Date().toISOString(),
        }),
      },
    });
  }

  return feedback;
}

export async function getCompanyEventFeedbackMetrics(eventId?: string): Promise<CompanyEventFeedbackMetrics> {
  const feedback = await prisma.companyEventFeedback.findMany({
    where: eventId ? { eventId } : undefined,
    select: {
      action: true,
      label: true,
      reviewedAt: true,
    },
    orderBy: { reviewedAt: "desc" },
  });

  const byAction: Record<string, number> = {};
  const byLabel: Record<string, number> = {};
  for (const item of feedback) {
    byAction[item.action] = (byAction[item.action] ?? 0) + 1;
    byLabel[item.label] = (byLabel[item.label] ?? 0) + 1;
  }

  return {
    totalFeedback: feedback.length,
    byAction,
    byLabel,
    correctionCount: feedback.filter((item) => item.action.startsWith("corrected_")).length,
    negativeFeedbackCount: feedback.filter((item) => item.label === "NOT_RELEVANT").length,
    lastReviewedAt: feedback[0]?.reviewedAt.toISOString() ?? null,
  };
}
