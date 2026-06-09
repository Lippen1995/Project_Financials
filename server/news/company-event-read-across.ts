import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  COMPANY_EVENT_EXPOSURE_ENGINE_VERSION,
  CompanyExposureCompanyContext,
  CompanyExposureEventContext,
  CompanyExposureRuleResult,
  INDIRECT_TRANSFERABLE_EVENT_TYPES,
  scoreCompanyEventExposures,
} from "@/server/news/company-exposure-rules";
import { upsertCompanyEventExposure } from "@/server/news/company-event-repository";

const DEFAULT_READ_ACROSS_THRESHOLD = 0.7;
const DEFAULT_MAX_COMPANIES = 1000;
const DEFAULT_MAX_EXPOSURES_PER_EVENT = 8;

type CreateDirectExposureInput = {
  eventId: string;
  companyId: string;
  exposureScore?: number;
  confidenceScore?: number;
  rationale?: string;
  metadata?: Record<string, unknown>;
};

export type PersistReadAcrossExposureInput = {
  event: CompanyExposureEventContext;
  companies: CompanyExposureCompanyContext[];
  threshold?: number;
  maxExposures?: number;
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function createDirectCompanyEventExposure(input: CreateDirectExposureInput) {
  return upsertCompanyEventExposure({
    eventId: input.eventId,
    companyId: input.companyId,
    exposureType: "direct",
    exposureScore: input.exposureScore ?? 0.96,
    confidenceScore: input.confidenceScore ?? 0.94,
    rationale: input.rationale ?? "Direkte eksponering: hendelsen er knyttet til selskapet selv.",
    metadata: json({
      engineVersion: COMPANY_EVENT_EXPOSURE_ENGINE_VERSION,
      reasons: ["direct_company_event"],
      exposureLevel: "direct",
      feedPolicy: "standard",
      ...(input.metadata ?? {}),
    }),
  });
}

export async function persistReadAcrossExposures(input: PersistReadAcrossExposureInput) {
  const results: Array<CompanyExposureRuleResult & { companyId: string }> = [];

  for (const company of input.companies) {
    const exposures = scoreCompanyEventExposures(input.event, company, {
      threshold: input.threshold,
      includeDirect: false,
    });

    for (const exposure of exposures) {
      results.push({ ...exposure, companyId: company.companyId });
    }
  }

  const selected = results
    .sort((a, b) => b.exposureScore - a.exposureScore)
    .slice(0, input.maxExposures ?? 50);

  for (const exposure of selected) {
    await upsertCompanyEventExposure({
      eventId: input.event.eventId,
      companyId: exposure.companyId,
      exposureType: exposure.exposureType,
      exposureScore: exposure.exposureScore,
      confidenceScore: exposure.confidenceScore,
      rationale: exposure.rationale,
      metadata: json({
        engineVersion: COMPANY_EVENT_EXPOSURE_ENGINE_VERSION,
        reasons: exposure.reasons,
        matchedSignals: exposure.matchedSignals,
        exposureLevel: exposure.exposureLevel,
        feedPolicy: exposure.feedPolicy,
        sourceCompanyId: input.event.sourceCompanyId,
        sourceIndustryCode: input.event.sourceCompanyIndustryCode,
        sourceId: input.event.sourceId,
        sourceType: input.event.sourceType,
      }),
    });
  }

  return {
    candidatesEvaluated: input.companies.length,
    exposuresCreated: selected.length,
    exposures: selected,
  };
}

type EventForReadAcross = Prisma.CompanyEventGetPayload<{
  include: {
    company: {
      include: {
        industryCode: true;
      };
    };
    evidence: {
      include: {
        document: {
          include: {
            source: true;
          };
        };
      };
    };
  };
}>;

function sourceSectorTagsFromMetadata(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }

  const value = (metadata as Record<string, unknown>).sectorTags;
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function eventContextFromDbEvent(event: EventForReadAcross): CompanyExposureEventContext {
  const primaryEvidence = event.evidence[0];
  const source = primaryEvidence?.document.source;

  return {
    eventId: event.id,
    sourceCompanyId: event.companyId,
    eventType: event.eventType,
    title: event.title,
    summary: event.summary,
    sourceId: source?.id ?? null,
    sourceType: source?.sourceType ?? null,
    sourceQualityScore: source?.qualityScore ?? null,
    sourceSectorTags: sourceSectorTagsFromMetadata(source?.metadata),
    sourceCompanyIndustryCode: event.company.industryCode?.code ?? null,
    sourceCompanyIndustryTitle: event.company.industryCode?.title ?? null,
    sourceCompanyOrgNumber: event.company.orgNumber,
    metadata: event.metadata,
  };
}

type CompanyForExposure = Prisma.CompanyGetPayload<{
  include: {
    industryCode: true;
    exposureGraphEdges: {
      include: {
        node: true;
      };
    };
    petroleumExposureSnapshot: {
      select: {
        operatorFieldCount: true;
        licenceCount: true;
        operatedProductionOe: true;
        attributableProductionOe: true;
        remainingReservesOe: true;
      };
    };
  };
}>;

function companyContextFromDbCompany(company: CompanyForExposure): CompanyExposureCompanyContext {
  const petroleumExposure = company.petroleumExposureSnapshot;

  return {
    companyId: company.id,
    name: company.name,
    industryCode: company.industryCode?.code ?? null,
    industryTitle: company.industryCode?.title ?? null,
    description: company.description,
    revenue: company.revenue,
    employeeCount: company.employeeCount,
    hasPetroleumExposure: Boolean(petroleumExposure),
    petroleumExposure: petroleumExposure
      ? {
          operatorFieldCount: petroleumExposure.operatorFieldCount,
          licenceCount: petroleumExposure.licenceCount,
          operatedProductionOe: petroleumExposure.operatedProductionOe,
          attributableProductionOe: petroleumExposure.attributableProductionOe,
          remainingReservesOe: petroleumExposure.remainingReservesOe,
        }
      : null,
    exposureGraphEdges: (company.exposureGraphEdges ?? []).map((edge) => ({
      relationType: edge.relationType,
      weight: edge.weight,
      confidenceScore: edge.confidenceScore,
      rationale: edge.rationale,
      node: {
        nodeType: edge.node.nodeType,
        key: edge.node.key,
        label: edge.node.label,
      },
    })),
  };
}

export async function createReadAcrossExposuresForRecentEvents(options: {
  limit?: number;
  threshold?: number;
  maxCompanies?: number;
  maxExposuresPerEvent?: number;
} = {}) {
  const pruned = await prisma.companyEventExposure.updateMany({
    where: {
      exposureType: { not: "direct" },
      active: true,
      event: {
        eventType: { notIn: [...INDIRECT_TRANSFERABLE_EVENT_TYPES] },
      },
    },
    data: { active: false },
  });

  const events = await prisma.companyEvent.findMany({
    where: { status: "ACTIVE" },
    include: {
      company: {
        include: {
          industryCode: true,
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
        orderBy: { relevanceScore: "desc" },
        take: 1,
      },
    },
    orderBy: [{ lastSeen: "desc" }, { investorValueScore: "desc" }],
    take: options.limit ?? 50,
  });

  const companies = await prisma.company.findMany({
    include: {
      industryCode: true,
      exposureGraphEdges: {
        where: { active: true },
        include: {
          node: true,
        },
      },
      petroleumExposureSnapshot: {
        select: {
          operatorFieldCount: true,
          licenceCount: true,
          operatedProductionOe: true,
          attributableProductionOe: true,
          remainingReservesOe: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: options.maxCompanies ?? DEFAULT_MAX_COMPANIES,
  });
  const companyContexts = companies.map(companyContextFromDbCompany);

  let eventsProcessed = 0;
  let exposuresCreated = 0;
  let staleExposuresRemoved = 0;

  for (const event of events) {
    eventsProcessed += 1;
    const stale = await prisma.companyEventExposure.updateMany({
      where: {
        eventId: event.id,
        exposureType: { not: "direct" },
        active: true,
      },
      data: { active: false },
    });
    staleExposuresRemoved += stale.count;
    await createDirectCompanyEventExposure({
      eventId: event.id,
      companyId: event.companyId,
      exposureScore: Math.max(0.9, event.confidenceScore),
      confidenceScore: Math.max(0.86, event.confidenceScore),
      metadata: {
        source: "recent_event_backfill",
      },
    });

    const indirectCompanies = companyContexts.filter((company) => company.companyId !== event.companyId);
    const result = await persistReadAcrossExposures({
      event: eventContextFromDbEvent(event),
      companies: indirectCompanies,
      threshold: options.threshold ?? DEFAULT_READ_ACROSS_THRESHOLD,
      maxExposures: options.maxExposuresPerEvent ?? DEFAULT_MAX_EXPOSURES_PER_EVENT,
    });
    exposuresCreated += result.exposuresCreated + 1;
  }

  return {
    eventsProcessed,
    companiesEvaluated: companyContexts.length,
    exposuresCreated,
    exposuresRemoved: pruned.count + staleExposuresRemoved,
  };
}
