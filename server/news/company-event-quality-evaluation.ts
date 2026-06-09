import { prisma } from "@/lib/prisma";
import { COMPANY_EVENT_EVAL_SET } from "@/server/news/company-event-eval-set";

export type CompanyEventQualityEvaluation = {
  generatedAt: string;
  totals: {
    sourceDocuments: number;
    companyEvents: number;
    feedback: number;
  };
  scoreStats: {
    averageInvestorValueScore: number;
    highValueEvents: number;
    lowSignalEvents: number;
  };
  eventsByType: Record<string, number>;
  eventsBySource: Record<string, number>;
  eventsBySourceType: Record<string, number>;
  eventsBySourceTier: Record<string, number>;
  exposuresByType: Record<string, number>;
  feedbackByAction: Record<string, number>;
  feedbackByLabel: Record<string, number>;
  feedbackCalibration: {
    ratedEvents: number;
    meanAbsoluteValueError: number | null;
    overvaluedBy20OrMore: number;
    undervaluedBy20OrMore: number;
    exposureReviews: number;
    exposurePrecisionAt70: number | null;
  };
  falsePositiveCandidates: {
    lowEntityConfidenceHighScore: Array<{ eventId: string; title: string; investorValueScore: number; entityConfidence: number | null }>;
    highScoreWeakEvidence: Array<{ eventId: string; title: string; investorValueScore: number; evidenceCount: number }>;
    commonNameMatches: Array<{ eventId: string; title: string; investorValueScore: number; reasons: string[] }>;
  };
  staleNoisySourceCandidates: Array<{ sourceId: string; documentCount: number; eventCount: number; eventRate: number }>;
  companiesWithManyLowValueEvents: Array<{ companyId: string; companyName: string; lowValueEvents: number }>;
  curatedGoldSet: {
    totalCases: number;
    matchedCases: number;
    passedCases: number;
    passRate: number | null;
    failures: Array<{
      id: string;
      expectedLabel: "RELEVANT" | "NOT_RELEVANT";
      actualScore: number | null;
      title: string | null;
      companyName: string | null;
      sourceId: string;
    }>;
  };
};

function increment(target: Record<string, number>, key: string | null | undefined) {
  const safeKey = key?.trim() || "unknown";
  target[safeKey] = (target[safeKey] ?? 0) + 1;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function nestedNumber(value: unknown, path: string[]) {
  let cursor = value;
  for (const part of path) {
    cursor = asObject(cursor)[part];
  }
  return typeof cursor === "number" && Number.isFinite(cursor) ? cursor : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

const TRUSTED_STRUCTURED_SOURCE_TYPES = new Set([
  "newsweb",
  "brreg",
  "financials",
  "internal",
]);

export async function evaluateCompanyEventIntelligence(options: { limit?: number } = {}): Promise<CompanyEventQualityEvaluation> {
  const limit = Math.min(Math.max(options.limit ?? 1000, 1), 5000);
  const [sourceDocuments, events, feedback, exposureFeedback, exposures, curatedGoldSetMatches] = await Promise.all([
    prisma.sourceDocument.findMany({
      select: {
        id: true,
        sourceId: true,
        source: {
          select: {
            id: true,
            sourceType: true,
            metadata: true,
          },
        },
      },
      take: limit,
    }),
    prisma.companyEvent.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        companyId: true,
        eventType: true,
        title: true,
        investorValueScore: true,
        confidenceScore: true,
        metadata: true,
        company: {
          select: {
            name: true,
          },
        },
        evidence: {
          select: {
            reasons: true,
            relevanceScore: true,
            document: {
              select: {
                sourceId: true,
                source: {
                  select: {
                    sourceType: true,
                    metadata: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { lastSeen: "desc" },
      take: limit,
    }),
    prisma.companyEventFeedback.findMany({
      select: {
        action: true,
        label: true,
        previousValue: true,
        correctedValue: true,
      },
      take: limit,
    }),
    prisma.companyEventExposureFeedback.findMany({
      select: {
        label: true,
        relevanceScore: true,
        previousValue: true,
      },
      take: limit,
    }),
    prisma.companyEventExposure.findMany({
      where: {
        active: true,
        event: {
          status: "ACTIVE",
        },
      },
      select: {
        exposureType: true,
      },
      take: limit,
    }),
    Promise.all(
      COMPANY_EVENT_EVAL_SET.map((item) =>
        prisma.companyEvent.findFirst({
          where: {
            status: "ACTIVE",
            company: {
              orgNumber: item.companyOrgNumber,
            },
            evidence: {
              some: {
                document: {
                  sourceId: item.sourceId,
                  canonicalUrl: item.canonicalUrl,
                },
              },
            },
          },
          orderBy: [{ investorValueScore: "desc" }, { lastSeen: "desc" }],
          select: {
            id: true,
            title: true,
            investorValueScore: true,
            company: {
              select: {
                name: true,
              },
            },
          },
        }),
      ),
    ),
  ]);

  const eventsByType: Record<string, number> = {};
  const eventsBySource: Record<string, number> = {};
  const eventsBySourceType: Record<string, number> = {};
  const eventsBySourceTier: Record<string, number> = {};
  const exposuresByType: Record<string, number> = {};
  const feedbackByAction: Record<string, number> = {};
  const feedbackByLabel: Record<string, number> = {};
  const documentCountBySource: Record<string, number> = {};
  const eventCountBySource: Record<string, number> = {};
  const lowValueByCompany = new Map<string, { companyId: string; companyName: string; lowValueEvents: number }>();

  for (const document of sourceDocuments) {
    increment(documentCountBySource, document.sourceId);
  }

  for (const event of events) {
    increment(eventsByType, event.eventType);
    if (event.investorValueScore < 35) {
      const existing = lowValueByCompany.get(event.companyId) ?? {
        companyId: event.companyId,
        companyName: event.company.name,
        lowValueEvents: 0,
      };
      existing.lowValueEvents += 1;
      lowValueByCompany.set(event.companyId, existing);
    }

    for (const evidence of event.evidence) {
      increment(eventsBySource, evidence.document.sourceId);
      increment(eventsBySourceType, evidence.document.source.sourceType);
      const tier = asObject(evidence.document.source.metadata).tier;
      increment(eventsBySourceTier, typeof tier === "string" ? tier : null);
      eventCountBySource[evidence.document.sourceId] = (eventCountBySource[evidence.document.sourceId] ?? 0) + 1;
    }
  }

  for (const exposure of exposures) {
    increment(exposuresByType, exposure.exposureType);
  }

  for (const item of feedback) {
    increment(feedbackByAction, item.action);
    increment(feedbackByLabel, item.label);
  }

  const ratedDeltas = feedback.flatMap((item) => {
    if (item.action !== "rated") return [];
    const previous = nestedNumber(item.previousValue, ["investorValueScore"]);
    const corrected = nestedNumber(item.correctedValue, ["investorValueScore"]);
    return previous === null || corrected === null ? [] : [corrected - previous];
  });
  const highExposureReviews = exposureFeedback.filter(
    (item) => (nestedNumber(item.previousValue, ["exposureScore"]) ?? 0) >= 0.7,
  );

  const lowEntityConfidenceHighScore = events
    .map((event) => ({
      eventId: event.id,
      title: event.title,
      investorValueScore: event.investorValueScore,
      entityConfidence: nestedNumber(event.metadata, ["scoreComponents", "entityConfidence"]),
    }))
    .filter((event) => event.investorValueScore >= 70 && (event.entityConfidence ?? 1) < 0.6)
    .slice(0, 50);

  const highScoreWeakEvidence = events
    .filter(
      (event) =>
        event.investorValueScore >= 70 &&
        event.evidence.length <= 1 &&
        event.confidenceScore < 0.7 &&
        !event.evidence.some((evidence) =>
          TRUSTED_STRUCTURED_SOURCE_TYPES.has(evidence.document.source.sourceType),
        ),
    )
    .map((event) => ({
      eventId: event.id,
      title: event.title,
      investorValueScore: event.investorValueScore,
      evidenceCount: event.evidence.length,
    }))
    .slice(0, 50);

  const commonNameMatches = events
    .map((event) => ({
      event,
      reasons: event.evidence.flatMap((evidence) => stringArray(evidence.reasons)),
    }))
    .filter(({ event, reasons }) => event.investorValueScore >= 55 && reasons.some((reason) => reason.includes("common") || reason.includes("ambiguous")))
    .map(({ event, reasons }) => ({
      eventId: event.id,
      title: event.title,
      investorValueScore: event.investorValueScore,
      reasons,
    }))
    .slice(0, 50);

  const staleNoisySourceCandidates = Object.entries(documentCountBySource)
    .map(([sourceId, documentCount]) => {
      const eventCount = eventCountBySource[sourceId] ?? 0;
      return {
        sourceId,
        documentCount,
        eventCount,
        eventRate: documentCount === 0 ? 0 : Math.round((eventCount / documentCount) * 1000) / 1000,
      };
    })
    .filter((source) => source.documentCount >= 10 && source.eventRate < 0.05)
    .sort((a, b) => b.documentCount - a.documentCount)
    .slice(0, 25);

  const curatedGoldSetEvaluations = COMPANY_EVENT_EVAL_SET.map((item, index) => {
    const match = curatedGoldSetMatches[index];
    const actualScore = match?.investorValueScore ?? null;
    const passed =
      item.expectedLabel === "RELEVANT"
        ? actualScore !== null && actualScore >= (item.expectedMinScore ?? 45)
        : actualScore === null || actualScore <= (item.expectedMaxScore ?? 25);

    return {
      id: item.id,
      expectedLabel: item.expectedLabel,
      matched: Boolean(match) || item.expectedLabel === "NOT_RELEVANT",
      passed,
      actualScore,
      title: match?.title ?? null,
      companyName: match?.company.name ?? null,
      sourceId: item.sourceId,
    };
  });

  const matchedGoldSetCases = curatedGoldSetEvaluations.filter((item) => item.matched);
  const passedGoldSetCases = curatedGoldSetEvaluations.filter((item) => item.passed);

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      sourceDocuments: sourceDocuments.length,
      companyEvents: events.length,
      feedback: feedback.length,
    },
    scoreStats: {
      averageInvestorValueScore: average(events.map((event) => event.investorValueScore)),
      highValueEvents: events.filter((event) => event.investorValueScore >= 75).length,
      lowSignalEvents: events.filter((event) => event.investorValueScore < 35).length,
    },
    eventsByType,
    eventsBySource,
    eventsBySourceType,
    eventsBySourceTier,
    exposuresByType,
    feedbackByAction,
    feedbackByLabel,
    feedbackCalibration: {
      ratedEvents: ratedDeltas.length,
      meanAbsoluteValueError:
        ratedDeltas.length === 0
          ? null
          : average(ratedDeltas.map((delta) => Math.abs(delta))),
      overvaluedBy20OrMore: ratedDeltas.filter((delta) => delta <= -20).length,
      undervaluedBy20OrMore: ratedDeltas.filter((delta) => delta >= 20).length,
      exposureReviews: exposureFeedback.length,
      exposurePrecisionAt70:
        highExposureReviews.length === 0
          ? null
          : Math.round(
              (highExposureReviews.filter((item) => item.relevanceScore >= 70).length /
                highExposureReviews.length) *
                1000,
            ) / 1000,
    },
    falsePositiveCandidates: {
      lowEntityConfidenceHighScore,
      highScoreWeakEvidence,
      commonNameMatches,
    },
    staleNoisySourceCandidates,
    companiesWithManyLowValueEvents: [...lowValueByCompany.values()]
      .filter((company) => company.lowValueEvents >= 5)
      .sort((a, b) => b.lowValueEvents - a.lowValueEvents)
      .slice(0, 25),
    curatedGoldSet: {
      totalCases: COMPANY_EVENT_EVAL_SET.length,
      matchedCases: matchedGoldSetCases.length,
      passedCases: passedGoldSetCases.length,
      passRate:
        COMPANY_EVENT_EVAL_SET.length === 0
          ? null
          : Math.round((passedGoldSetCases.length / COMPANY_EVENT_EVAL_SET.length) * 1000) / 1000,
      failures: curatedGoldSetEvaluations
        .filter((item) => !item.passed)
        .map((item) => ({
          id: item.id,
          expectedLabel: item.expectedLabel,
          actualScore: item.actualScore,
          title: item.title,
          companyName: item.companyName,
          sourceId: item.sourceId,
        })),
    },
  };
}
