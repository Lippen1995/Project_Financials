import { prisma } from "@/lib/prisma";
import { evaluateCompanyEventIntelligence } from "@/server/news/company-event-quality-evaluation";

type JsonObject = Record<string, unknown>;

export type CompanyEventReviewFilters = {
  search?: string;
  status?: string;
  exposureType?: string;
  eventType?: string;
  feedbackState?: "all" | "unreviewed" | "reviewed" | "negative";
  minInvestorValueScore?: number;
  limit?: number;
};

export type CompanyEventReviewItem = {
  id: string;
  title: string;
  summary: string | null;
  eventType: string;
  status: string;
  investorValueScore: number;
  confidenceScore: number;
  lastSeen: string;
  company: {
    id: string;
    name: string;
    orgNumber: string;
  };
  scoreExplanation: {
    topDrivers: string[];
    penalties: string[];
  } | null;
  evidence: Array<{
    documentId: string;
    title: string;
    url: string;
    sourceId: string;
    sourceName: string;
    publishedAt: string | null;
    reasons: string[];
    relevanceScore: number;
  }>;
  exposures: Array<{
    exposureType: string;
    exposureScore: number;
    confidenceScore: number;
    rationale: string | null;
    sourceCompanyName: string | null;
    reasons: string[];
  }>;
  latestFeedback: Array<{
    label: string;
    action: string;
    reviewedAt: string;
    notes: string | null;
    reviewerName: string | null;
  }>;
};

export type CompanyEventReviewDashboard = {
  filters: Required<CompanyEventReviewFilters>;
  totals: {
    matchingEvents: number;
    highValueUnreviewed: number;
    negativeReviewed: number;
    totalFeedback: number;
  };
  options: {
    exposureTypes: string[];
    eventTypes: string[];
    statuses: string[];
  };
  quality: Awaited<ReturnType<typeof evaluateCompanyEventIntelligence>>;
  items: CompanyEventReviewItem[];
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function normalizeFilters(filters: CompanyEventReviewFilters): Required<CompanyEventReviewFilters> {
  return {
    search: filters.search?.trim() ?? "",
    status: filters.status?.trim() ?? "ACTIVE",
    exposureType: filters.exposureType?.trim() ?? "",
    eventType: filters.eventType?.trim() ?? "",
    feedbackState: filters.feedbackState ?? "unreviewed",
    minInvestorValueScore: Math.min(Math.max(filters.minInvestorValueScore ?? 55, 0), 100),
    limit: Math.min(Math.max(filters.limit ?? 50, 1), 200),
  };
}

function buildWhere(filters: Required<CompanyEventReviewFilters>) {
  return {
    status: filters.status || undefined,
    eventType: filters.eventType || undefined,
    investorValueScore: { gte: filters.minInvestorValueScore },
    ...(filters.search
      ? {
          OR: [
            { title: { contains: filters.search, mode: "insensitive" as const } },
            { summary: { contains: filters.search, mode: "insensitive" as const } },
            { company: { name: { contains: filters.search, mode: "insensitive" as const } } },
            { company: { orgNumber: { contains: filters.search } } },
          ],
        }
      : {}),
    ...(filters.feedbackState === "unreviewed"
      ? { feedback: { none: {} } }
      : filters.feedbackState === "reviewed"
        ? { feedback: { some: {} } }
        : filters.feedbackState === "negative"
          ? { feedback: { some: { label: "NOT_RELEVANT" as const } } }
          : {}),
    ...(filters.exposureType
      ? {
          exposures: {
            some: {
              exposureType: filters.exposureType,
              exposureScore: { gte: 0.58 },
            },
          },
        }
      : {}),
  };
}

export async function getCompanyEventReviewDashboard(
  input: CompanyEventReviewFilters = {},
): Promise<CompanyEventReviewDashboard> {
  const filters = normalizeFilters(input);
  const where = buildWhere(filters);

  const [matchingEvents, highValueUnreviewed, negativeReviewed, totalFeedback, exposureTypes, eventTypes, statuses, quality, events] =
    await Promise.all([
      prisma.companyEvent.count({ where }),
      prisma.companyEvent.count({
        where: {
          status: "ACTIVE",
          investorValueScore: { gte: 70 },
          feedback: { none: {} },
        },
      }),
      prisma.companyEvent.count({
        where: {
          feedback: {
            some: {
              label: "NOT_RELEVANT",
            },
          },
        },
      }),
      prisma.companyEventFeedback.count(),
      prisma.companyEventExposure.findMany({
        distinct: ["exposureType"],
        select: { exposureType: true },
        orderBy: { exposureType: "asc" },
      }),
      prisma.companyEvent.findMany({
        distinct: ["eventType"],
        select: { eventType: true },
        orderBy: { eventType: "asc" },
      }),
      prisma.companyEvent.findMany({
        distinct: ["status"],
        select: { status: true },
        orderBy: { status: "asc" },
      }),
      evaluateCompanyEventIntelligence({ limit: 400 }),
      prisma.companyEvent.findMany({
        where,
        take: filters.limit,
        orderBy: [{ investorValueScore: "desc" }, { lastSeen: "desc" }],
        select: {
          id: true,
          title: true,
          summary: true,
          eventType: true,
          status: true,
          investorValueScore: true,
          confidenceScore: true,
          lastSeen: true,
          metadata: true,
          company: {
            select: {
              id: true,
              name: true,
              orgNumber: true,
            },
          },
          evidence: {
            take: 2,
            orderBy: { relevanceScore: "desc" },
            select: {
              documentId: true,
              relevanceScore: true,
              reasons: true,
              document: {
                select: {
                  title: true,
                  canonicalUrl: true,
                  publishedAt: true,
                  source: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
          exposures: {
            where: { exposureScore: { gte: 0.58 } },
            take: 3,
            orderBy: [{ exposureScore: "desc" }, { confidenceScore: "desc" }],
            select: {
              exposureType: true,
              exposureScore: true,
              confidenceScore: true,
              rationale: true,
              metadata: true,
              event: {
                select: {
                  company: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
          feedback: {
            take: 3,
            orderBy: { reviewedAt: "desc" },
            select: {
              label: true,
              action: true,
              reviewedAt: true,
              notes: true,
              user: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
    ]);

  return {
    filters,
    totals: {
      matchingEvents,
      highValueUnreviewed,
      negativeReviewed,
      totalFeedback,
    },
    options: {
      exposureTypes: exposureTypes.map((item) => item.exposureType),
      eventTypes: eventTypes.map((item) => item.eventType),
      statuses: statuses.map((item) => item.status),
    },
    quality,
    items: events.map((event) => {
      const metadata = asObject(event.metadata);
      const scoreExplanation = asObject(metadata.scoreExplanation);
      return {
        id: event.id,
        title: event.title,
        summary: event.summary,
        eventType: event.eventType,
        status: event.status,
        investorValueScore: event.investorValueScore,
        confidenceScore: event.confidenceScore,
        lastSeen: event.lastSeen.toISOString(),
        company: event.company,
        scoreExplanation:
          Object.keys(scoreExplanation).length > 0
            ? {
                topDrivers: stringArray(scoreExplanation.topDrivers),
                penalties: stringArray(scoreExplanation.penalties),
              }
            : null,
        evidence: event.evidence.map((evidence) => ({
          documentId: evidence.documentId,
          title: evidence.document.title,
          url: evidence.document.canonicalUrl,
          sourceId: evidence.document.source.id,
          sourceName: evidence.document.source.name,
          publishedAt: iso(evidence.document.publishedAt),
          reasons: evidence.reasons,
          relevanceScore: evidence.relevanceScore,
        })),
        exposures: event.exposures.map((exposure) => ({
          exposureType: exposure.exposureType,
          exposureScore: exposure.exposureScore,
          confidenceScore: exposure.confidenceScore,
          rationale: exposure.rationale,
          sourceCompanyName: exposure.event.company.name,
          reasons: stringArray(asObject(exposure.metadata).reasons),
        })),
        latestFeedback: event.feedback.map((feedback) => ({
          label: feedback.label,
          action: feedback.action,
          reviewedAt: feedback.reviewedAt.toISOString(),
          notes: feedback.notes,
          reviewerName: feedback.user.name ?? feedback.user.email ?? null,
        })),
      };
    }),
  };
}
