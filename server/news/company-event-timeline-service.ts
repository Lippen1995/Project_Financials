import { prisma } from "@/lib/prisma";

export type CompanyEventTimelineItem = {
  id: string;
  eventId: string;
  title: string;
  summary: string | null;
  eventType: string;
  eventDate: string | null;
  lastSeen: string;
  status: string;
  investorValueScore: number;
  confidenceScore: number;
  noveltyScore: number;
  severityScore: number;
  exposure: {
    type: string;
    score: number;
    confidence: number;
    rationale: string | null;
    reasons: string[];
    sourceCompanyId: string;
    sourceCompanyName: string | null;
  };
  evidence: Array<{
    documentId: string;
    title: string;
    url: string;
    sourceId: string;
    sourceName: string;
    publishedAt: string | null;
    relevanceScore: number;
    reasons: string[];
  }>;
  engineVersion: string;
};

export type CompanyEventTimelineResult = {
  data: CompanyEventTimelineItem[];
  meta: {
    limit: number;
    minInvestorValueScore: number;
    minExposureScore: number;
  };
};

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

type EvidencePayload = {
  documentId: string;
  title: string;
  url: string;
  sourceId: string;
  sourceName: string;
  publishedAt: string | null;
  relevanceScore: number;
  reasons: string[];
};

function mapEvidence(evidence: Array<{
  documentId: string;
  relevanceScore: number;
  reasons: string[];
  document: {
    title: string;
    canonicalUrl: string;
    publishedAt: Date | null;
    source: {
      id: string;
      name: string;
    };
  };
}>): EvidencePayload[] {
  return evidence.map((entry) => ({
    documentId: entry.documentId,
    title: entry.document.title,
    url: entry.document.canonicalUrl,
    sourceId: entry.document.source.id,
    sourceName: entry.document.source.name,
    publishedAt: iso(entry.document.publishedAt),
    relevanceScore: entry.relevanceScore,
    reasons: entry.reasons,
  }));
}

function exposureReasons(metadata: unknown) {
  return stringArray(asObject(metadata).reasons);
}

function timelineId(eventId: string, exposureType: string) {
  return `${eventId}:${exposureType}`;
}

type TimelineEvent = {
  id: string;
  companyId: string;
  eventType: string;
  title: string;
  summary: string | null;
  eventDate: Date | null;
  lastSeen: Date;
  status: string;
  investorValueScore: number;
  confidenceScore: number;
  noveltyScore: number;
  severityScore: number;
  engineVersion: string;
  company: {
    id: string;
    name: string;
  };
  evidence: Parameters<typeof mapEvidence>[0];
};

function mapTimelineItem(input: {
  event: TimelineEvent;
  exposureType: string;
  exposureScore: number;
  exposureConfidence: number;
  rationale: string | null;
  exposureMetadata?: unknown;
  targetCompanyId: string;
}): CompanyEventTimelineItem {
  return {
    id: timelineId(input.event.id, input.exposureType),
    eventId: input.event.id,
    title: input.event.title,
    summary: input.event.summary,
    eventType: input.event.eventType,
    eventDate: iso(input.event.eventDate),
    lastSeen: input.event.lastSeen.toISOString(),
    status: input.event.status,
    investorValueScore: input.event.investorValueScore,
    confidenceScore: input.event.confidenceScore,
    noveltyScore: input.event.noveltyScore,
    severityScore: input.event.severityScore,
    exposure: {
      type: input.exposureType,
      score: input.exposureScore,
      confidence: input.exposureConfidence,
      rationale: input.rationale,
      reasons: exposureReasons(input.exposureMetadata),
      sourceCompanyId: input.event.companyId,
      sourceCompanyName: input.event.company.name,
    },
    evidence: mapEvidence(input.event.evidence),
    engineVersion: input.event.engineVersion,
  };
}

export async function getCompanyEventTimeline(
  companyId: string,
  options: {
    limit?: number;
    minInvestorValueScore?: number;
    minExposureScore?: number;
  } = {},
): Promise<CompanyEventTimelineResult> {
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
  const minInvestorValueScore = options.minInvestorValueScore ?? 0;
  const minExposureScore = options.minExposureScore ?? 0.58;

  const include = {
    company: {
      select: {
        id: true,
        name: true,
      },
    },
    evidence: {
      include: {
        document: {
          include: {
            source: true,
          },
        },
      },
      orderBy: { relevanceScore: "desc" as const },
      take: 3,
    },
  };

  const [directEvents, exposureRows] = await Promise.all([
    prisma.companyEvent.findMany({
      where: {
        companyId,
        status: "ACTIVE",
        investorValueScore: { gte: minInvestorValueScore },
      },
      include,
      orderBy: [{ investorValueScore: "desc" }, { lastSeen: "desc" }],
      take: limit,
    }),
    prisma.companyEventExposure.findMany({
      where: {
        companyId,
        exposureScore: { gte: minExposureScore },
        event: {
          status: "ACTIVE",
          investorValueScore: { gte: minInvestorValueScore },
        },
      },
      include: {
        event: {
          include,
        },
      },
      orderBy: [{ exposureScore: "desc" }, { event: { lastSeen: "desc" } }],
      take: limit,
    }),
  ]);

  const items = new Map<string, CompanyEventTimelineItem>();

  for (const event of directEvents) {
    const existingDirectExposure = exposureRows.find(
      (row) => row.eventId === event.id && row.exposureType === "direct",
    );
    items.set(timelineId(event.id, "direct"), mapTimelineItem({
      event,
      exposureType: "direct",
      exposureScore: existingDirectExposure?.exposureScore ?? 0.96,
      exposureConfidence: existingDirectExposure?.confidenceScore ?? Math.max(event.confidenceScore, 0.86),
      rationale: existingDirectExposure?.rationale ?? "Direkte eksponering: hendelsen er knyttet til selskapet selv.",
      exposureMetadata: existingDirectExposure?.metadata ?? { reasons: ["direct_company_event"] },
      targetCompanyId: companyId,
    }));
  }

  for (const exposure of exposureRows) {
    const item = mapTimelineItem({
      event: exposure.event,
      exposureType: exposure.exposureType,
      exposureScore: exposure.exposureScore,
      exposureConfidence: exposure.confidenceScore,
      rationale: exposure.rationale,
      exposureMetadata: exposure.metadata,
      targetCompanyId: companyId,
    });
    items.set(item.id, item);
  }

  const data = [...items.values()]
    .sort((a, b) => {
      const scoreDiff =
        b.exposure.score * 0.45 +
        b.investorValueScore * 0.005 -
        (a.exposure.score * 0.45 + a.investorValueScore * 0.005);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
    })
    .slice(0, limit);

  return {
    data,
    meta: {
      limit,
      minInvestorValueScore,
      minExposureScore,
    },
  };
}
