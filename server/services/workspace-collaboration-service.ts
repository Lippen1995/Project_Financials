import {
  CompanyStatus,
  WorkspaceWatchIntensity,
  WorkspaceMonitorStatus,
  WorkspaceNotificationType,
  WorkspaceStatus,
  WorkspaceType,
  WorkspaceWatchStatus,
} from "@prisma/client";

import {
  WorkspaceMonitorSummary,
  WorkspaceNotificationSummary,
  WorkspaceWatchGroupSummary,
  WorkspaceWatchIntensity as WorkspaceWatchIntensityValue,
  WorkspaceWatchlistEventSummary,
  WorkspaceWatchlistOverview,
  WorkspaceIndustryWatchSummary,
  WorkspaceWatchSummary,
} from "@/lib/types";
import env from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { SsbClassificationRepository } from "@/server/registry/ssb-classification-repository";
import { syncCompanyEventNotificationsForWatches } from "@/server/news/company-event-alert-service";
import { getPublicCompanyFinancials } from "@/server/services/public-financials-service";
import { getCompanyAnnouncements, getCompanyProfile, searchCompanies } from "@/server/services/company-service";
import { getUserWorkspaceCapabilities } from "@/server/services/workspace-service";

const industryCodeProvider = new SsbClassificationRepository();

const RECENT_ACTIVITY_DAYS = 7;
const DIGEST_LOOKBACK_HOURS = 24;

const INTENSITY_THRESHOLDS: Record<WorkspaceWatchIntensityValue, { minInvestorValueScore: number; minExposureScore: number }> = {
  HIGH_ONLY: { minInvestorValueScore: 65, minExposureScore: 0.78 },
  BALANCED: { minInvestorValueScore: 45, minExposureScore: 0.65 },
  BROAD: { minInvestorValueScore: 30, minExposureScore: 0.5 },
};

function toCompanySummary(company: {
  id: string;
  orgNumber: string;
  slug: string;
  name: string;
  legalForm: string | null;
  status: CompanyStatus;
  industryCode: { code: string; title: string } | null;
}) {
  return {
    id: company.id,
    orgNumber: company.orgNumber,
    slug: company.slug,
    name: company.name,
    legalForm: company.legalForm,
    status: company.status,
    industryCode: company.industryCode
      ? {
          code: company.industryCode.code,
          title: company.industryCode.title,
        }
      : null,
  };
}

async function requireWorkspaceAccess(actorUserId: string, workspaceId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: actorUserId,
      },
    },
    include: {
      workspace: true,
    },
  });

  if (!membership) {
    throw new Error("Du har ikke tilgang til dette workspace-et.");
  }

  return membership;
}

function ensureActiveWorkspace(workspace: { status: WorkspaceStatus }) {
  if (workspace.status !== WorkspaceStatus.ACTIVE) {
    throw new Error("Denne handlingen krever et aktivt workspace.");
  }
}

async function resolveCompanyReference(companyReference: string) {
  const profile = await getCompanyProfile(companyReference.trim());
  if (!profile) {
    throw new Error("Fant ikke selskapet du prøver å abonnere på.");
  }

  const company = await prisma.company.findUnique({
    where: {
      orgNumber: profile.company.orgNumber,
    },
    include: {
      industryCode: {
        select: {
          code: true,
          title: true,
        },
      },
    },
  });

  if (!company) {
    throw new Error("Selskapet kunne ikke lagres lokalt.");
  }

  return company;
}

function toWatchSummary(watch: {
  id: string;
  workspaceId: string;
  status: WorkspaceWatchStatus;
  intensity: WorkspaceWatchIntensity;
  watchAnnouncements: boolean;
  watchFinancialStatements: boolean;
  watchStatusChanges: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  company: {
    id: string;
    orgNumber: string;
    slug: string;
    name: string;
    legalForm: string | null;
    status: CompanyStatus;
    industryCode: { code: string; title: string } | null;
  };
}): WorkspaceWatchSummary {
  return {
    id: watch.id,
    workspaceId: watch.workspaceId,
    status: watch.status,
    intensity: watch.intensity,
    watchAnnouncements: watch.watchAnnouncements,
    watchFinancialStatements: watch.watchFinancialStatements,
    watchStatusChanges: watch.watchStatusChanges,
    archivedAt: watch.archivedAt,
    createdAt: watch.createdAt,
    updatedAt: watch.updatedAt,
    company: toCompanySummary(watch.company),
  };
}

function toNotificationSummary(notification: {
  id: string;
  workspaceId: string;
  type: WorkspaceNotificationType;
  title: string;
  body: string;
  metadata: unknown;
  createdAt: Date;
  readAt: Date | null;
  company: {
    id: string;
    orgNumber: string;
    slug: string;
    name: string;
    legalForm: string | null;
    status: CompanyStatus;
    industryCode: { code: string; title: string } | null;
  } | null;
  watch: {
    id: string;
    status: WorkspaceWatchStatus;
  } | null;
}): WorkspaceNotificationSummary {
  return {
    id: notification.id,
    workspaceId: notification.workspaceId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    metadata: notification.metadata,
    createdAt: notification.createdAt,
    readAt: notification.readAt,
    company: notification.company ? toCompanySummary(notification.company) : null,
    watch: notification.watch,
  };
}

async function queryMonitorMatches(monitor: {
  id: string;
  industryCodePrefix: string | null;
  minEmployees: number | null;
  maxEmployees: number | null;
  minRevenue: number | null;
  maxRevenue: number | null;
  companyStatus: CompanyStatus | null;
  minimumDaysInStatus: number | null;
}) {
  const minimumStatusObservedAt =
    monitor.minimumDaysInStatus && monitor.minimumDaysInStatus > 0
      ? new Date(Date.now() - monitor.minimumDaysInStatus * 24 * 60 * 60 * 1000)
      : null;

  return prisma.company.findMany({
    where: {
      status: monitor.companyStatus ?? undefined,
      employeeCount: {
        gte: monitor.minEmployees ?? undefined,
        lte: monitor.maxEmployees ?? undefined,
      },
      revenue: {
        gte: monitor.minRevenue ?? undefined,
        lte: monitor.maxRevenue ?? undefined,
      },
      industryCode: monitor.industryCodePrefix
        ? {
            code: {
              startsWith: monitor.industryCodePrefix,
            },
          }
        : undefined,
      statusObservedAt: minimumStatusObservedAt
        ? {
            lte: minimumStatusObservedAt,
          }
        : undefined,
    },
    include: {
      industryCode: {
        select: {
          code: true,
          title: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    take: 20,
  });
}

function toMonitorSummary(
  monitor: {
    id: string;
    workspaceId: string;
    name: string;
    status: WorkspaceMonitorStatus;
    industryCodePrefix: string | null;
    minEmployees: number | null;
    maxEmployees: number | null;
    minRevenue: number | null;
    maxRevenue: number | null;
    companyStatus: CompanyStatus | null;
    minimumDaysInStatus: number | null;
    unsupportedReason: string | null;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
  matches: Awaited<ReturnType<typeof queryMonitorMatches>>,
): WorkspaceMonitorSummary {
  return {
    id: monitor.id,
    workspaceId: monitor.workspaceId,
    name: monitor.name,
    status: monitor.status,
    industryCodePrefix: monitor.industryCodePrefix,
    minEmployees: monitor.minEmployees,
    maxEmployees: monitor.maxEmployees,
    minRevenue: monitor.minRevenue,
    maxRevenue: monitor.maxRevenue,
    companyStatus: monitor.companyStatus,
    minimumDaysInStatus: monitor.minimumDaysInStatus,
    unsupportedReason: monitor.unsupportedReason,
    archivedAt: monitor.archivedAt,
    createdAt: monitor.createdAt,
    updatedAt: monitor.updatedAt,
    matchCount: matches.length,
    matches: matches.map((company) => ({
      company: toCompanySummary(company),
      matchedAt: company.updatedAt,
      statusObservedAt: company.statusObservedAt,
    })),
  };
}

function normalizeIndustryPrefix(value: string) {
  return value.trim().replace(",", ".").replace(/\s+/g, "");
}

async function resolveIndustryTitle(prefix: string) {
  const cached = await prisma.industryCode.findUnique({
    where: { code: prefix },
    select: { title: true },
  });
  if (cached?.title) {
    return { title: cached.title, unsupportedReason: null };
  }

  try {
    const fromSsb = await industryCodeProvider.getIndustryCode(prefix);
    if (fromSsb?.title) {
      return { title: fromSsb.title, unsupportedReason: null };
    }
  } catch {
    // The watch can still be useful as a code-prefix watch even if SSB lookup is temporarily unavailable.
  }

  return {
    title: null,
    unsupportedReason: "SSB-beskrivelse er ikke funnet ennå. Overvåkningen bruker kodeprefikset.",
  };
}

async function getIndustryWatchStats(prefix: string) {
  const recentThreshold = new Date(Date.now() - RECENT_ACTIVITY_DAYS * 24 * 60 * 60 * 1000);
  const [matchCount, recentEventCount] = await Promise.all([
    prisma.company.count({
      where: {
        industryCode: {
          code: {
            startsWith: prefix,
          },
        },
      },
    }),
    prisma.companyEvent.count({
      where: {
        status: "ACTIVE",
        lastSeen: { gte: recentThreshold },
        company: {
          industryCode: {
            code: {
              startsWith: prefix,
            },
          },
        },
      },
    }),
  ]);

  return { matchCount, recentEventCount };
}

async function toIndustryWatchSummary(watch: {
  id: string;
  workspaceId: string;
  industryCodePrefix: string;
  title: string | null;
  status: WorkspaceWatchStatus;
  intensity: WorkspaceWatchIntensity;
  unsupportedReason: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Promise<WorkspaceIndustryWatchSummary> {
  const stats = await getIndustryWatchStats(watch.industryCodePrefix);
  return {
    id: watch.id,
    workspaceId: watch.workspaceId,
    industryCodePrefix: watch.industryCodePrefix,
    title: watch.title,
    status: watch.status,
    intensity: watch.intensity,
    unsupportedReason: watch.unsupportedReason,
    matchCount: stats.matchCount,
    recentEventCount: stats.recentEventCount,
    archivedAt: watch.archivedAt,
    createdAt: watch.createdAt,
    updatedAt: watch.updatedAt,
  };
}

function toGroupSummary(input: {
  group: {
    id: string;
    workspaceId: string;
    name: string;
    query: string;
    status: WorkspaceWatchStatus;
    intensity: WorkspaceWatchIntensity;
    matchLimit: number;
    unsupportedReason: string | null;
    archivedAt: Date | null;
    refreshedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    members: Array<{
      id: string;
      matchedAt: Date;
      company: {
        id: string;
        orgNumber: string;
        slug: string;
        name: string;
        legalForm: string | null;
        status: CompanyStatus;
        industryCode: { code: string; title: string } | null;
      };
    }>;
  };
  watchedCompanyIds: Set<string>;
  recentEventCount: number;
}): WorkspaceWatchGroupSummary {
  return {
    id: input.group.id,
    workspaceId: input.group.workspaceId,
    name: input.group.name,
    query: input.group.query,
    status: input.group.status,
    intensity: input.group.intensity,
    matchLimit: input.group.matchLimit,
    unsupportedReason: input.group.unsupportedReason,
    memberCount: input.group.members.length,
    recentEventCount: input.recentEventCount,
    archivedAt: input.group.archivedAt,
    refreshedAt: input.group.refreshedAt,
    createdAt: input.group.createdAt,
    updatedAt: input.group.updatedAt,
    members: input.group.members.map((member) => ({
      id: member.id,
      matchedAt: member.matchedAt,
      company: toCompanySummary(member.company),
      isIndividuallyWatched: input.watchedCompanyIds.has(member.company.id),
    })),
  };
}

function normalizeTitleForDedupe(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function intensityThreshold(intensity: WorkspaceWatchIntensityValue) {
  return INTENSITY_THRESHOLDS[intensity] ?? INTENSITY_THRESHOLDS.BALANCED;
}

function eventContextType(eventType: string, exposureType: string) {
  if (["macro_news", "interest_rate", "commodity_price_exposure"].includes(eventType)) return "Makro";
  if (exposureType === "regulatory" || eventType.startsWith("regulatory")) return "Regulatorisk";
  if (["sector", "petroleum", "commodity", "value_chain", "peer"].includes(exposureType)) return "Bransje";
  return "Direkte";
}

async function countRecentGroupEvents(companyIds: string[]) {
  if (companyIds.length === 0) return 0;
  const recentThreshold = new Date(Date.now() - RECENT_ACTIVITY_DAYS * 24 * 60 * 60 * 1000);
  return prisma.companyEventExposure.count({
    where: {
      companyId: { in: companyIds },
      active: true,
      event: {
        status: "ACTIVE",
        lastSeen: { gte: recentThreshold },
      },
    },
  });
}

async function buildWatchlistEventFeed(input: {
  watches: WorkspaceWatchSummary[];
  industryWatches: WorkspaceIndustryWatchSummary[];
  groups: WorkspaceWatchGroupSummary[];
}): Promise<WorkspaceWatchlistEventSummary[]> {
  const eventById = new Map<string, WorkspaceWatchlistEventSummary>();
  const seenStories = new Set<string>();
  const companyContexts = new Map<
    string,
    Array<{ label: string; intensity: WorkspaceWatchIntensityValue; kind: "company" | "group" }>
  >();

  for (const watch of input.watches) {
    if (watch.status !== "ACTIVE") continue;
    companyContexts.set(watch.company.id, [
      ...(companyContexts.get(watch.company.id) ?? []),
      { label: watch.company.name, intensity: watch.intensity, kind: "company" },
    ]);
  }

  for (const group of input.groups) {
    if (group.status !== "ACTIVE") continue;
    for (const member of group.members) {
      companyContexts.set(member.company.id, [
        ...(companyContexts.get(member.company.id) ?? []),
        { label: group.name, intensity: group.intensity, kind: "group" },
      ]);
    }
  }

  const targetCompanyIds = [...companyContexts.keys()];
  if (targetCompanyIds.length > 0) {
    const exposures = await prisma.companyEventExposure.findMany({
      where: {
        companyId: { in: targetCompanyIds },
        active: true,
        event: {
          status: "ACTIVE",
        },
      },
      include: {
        company: {
          include: {
            industryCode: {
              select: {
                code: true,
                title: true,
              },
            },
          },
        },
        event: {
          include: {
            evidence: {
              include: {
                document: true,
              },
              orderBy: { relevanceScore: "desc" },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ event: { lastSeen: "desc" } }, { exposureScore: "desc" }],
      take: 120,
    });

    for (const exposure of exposures) {
      const contexts = companyContexts.get(exposure.companyId) ?? [];
      const passesThreshold = contexts.some((context) => {
        const threshold = intensityThreshold(context.intensity);
        return (
          exposure.event.investorValueScore >= threshold.minInvestorValueScore &&
          exposure.exposureScore >= threshold.minExposureScore
        );
      });
      if (!passesThreshold) continue;

      const storyKey = exposure.event.storyKey ?? normalizeTitleForDedupe(exposure.event.title);
      if (seenStories.has(storyKey)) continue;
      seenStories.add(storyKey);

      eventById.set(exposure.eventId, {
        id: `${exposure.eventId}:${exposure.companyId}:${exposure.exposureType}`,
        eventId: exposure.eventId,
        title: exposure.event.title,
        summary: exposure.event.summary,
        eventType: exposure.event.eventType,
        lastSeen: exposure.event.lastSeen,
        investorValueScore: exposure.event.investorValueScore,
        confidenceScore: exposure.event.confidenceScore,
        exposureType: exposure.exposureType,
        exposureScore: exposure.exposureScore,
        company: toCompanySummary(exposure.company),
        contexts: Array.from(new Set([
          eventContextType(exposure.event.eventType, exposure.exposureType),
          ...contexts.map((context) => context.label),
        ])).slice(0, 4),
        watchTypes: Array.from(new Set(contexts.map((context) => context.kind))),
        href: exposure.event.evidence[0]?.document.canonicalUrl ?? null,
      });
    }
  }

  for (const industryWatch of input.industryWatches.filter((watch) => watch.status === "ACTIVE")) {
    const threshold = intensityThreshold(industryWatch.intensity);
    const events = await prisma.companyEvent.findMany({
      where: {
        status: "ACTIVE",
        investorValueScore: { gte: threshold.minInvestorValueScore },
        company: {
          industryCode: {
            code: {
              startsWith: industryWatch.industryCodePrefix,
            },
          },
        },
      },
      include: {
        company: {
          include: {
            industryCode: {
              select: {
                code: true,
                title: true,
              },
            },
          },
        },
        evidence: {
          include: {
            document: true,
          },
          orderBy: { relevanceScore: "desc" },
          take: 1,
        },
      },
      orderBy: [{ lastSeen: "desc" }],
      take: 40,
    });

    for (const event of events) {
      const storyKey = event.storyKey ?? normalizeTitleForDedupe(event.title);
      if (seenStories.has(storyKey)) continue;
      seenStories.add(storyKey);
      eventById.set(event.id, {
        id: `${event.id}:industry:${industryWatch.id}`,
        eventId: event.id,
        title: event.title,
        summary: event.summary,
        eventType: event.eventType,
        lastSeen: event.lastSeen,
        investorValueScore: event.investorValueScore,
        confidenceScore: event.confidenceScore,
        exposureType: "industry",
        exposureScore: 0.72,
        company: toCompanySummary(event.company),
        contexts: Array.from(new Set([
          eventContextType(event.eventType, "industry"),
          industryWatch.title ?? `Næringskode ${industryWatch.industryCodePrefix}`,
        ])).slice(0, 4),
        watchTypes: ["industry"],
        href: event.evidence[0]?.document.canonicalUrl ?? null,
      });
    }
  }

  return [...eventById.values()]
    .sort((left, right) => {
      const scoreDiff =
        right.investorValueScore * 0.7 +
        right.exposureScore * 30 -
        (left.investorValueScore * 0.7 + left.exposureScore * 30);
      if (scoreDiff !== 0) return scoreDiff;
      return right.lastSeen.getTime() - left.lastSeen.getTime();
    })
    .slice(0, 30);
}

function buildDigest(input: {
  events: WorkspaceWatchlistEventSummary[];
  notifications: WorkspaceNotificationSummary[];
}): WorkspaceWatchlistOverview["digest"] {
  const since = new Date(Date.now() - DIGEST_LOOKBACK_HOURS * 60 * 60 * 1000);
  const newEvents = input.events.filter((event) => event.lastSeen >= since);
  const recentNotifications = input.notifications.filter((notification) => notification.createdAt >= since);
  const changedCompanyIds = new Set(
    recentNotifications
      .filter((notification) =>
        ["ANNOUNCEMENT_NEW", "FINANCIAL_STATEMENT_NEW", "COMPANY_STATUS_CHANGED", "COMPANY_EVENT_NEW"].includes(
          notification.type,
        ),
      )
      .map((notification) => notification.company?.id)
      .filter((value): value is string => Boolean(value)),
  );
  const contextCounts = new Map<string, number>();
  for (const event of newEvents) {
    const label = event.contexts[0] ?? "Watchlist";
    contextCounts.set(label, (contextCounts.get(label) ?? 0) + 1);
  }

  return {
    since,
    newEventCount: newEvents.length,
    unreadNotificationCount: input.notifications.filter((notification) => !notification.readAt).length,
    changedCompanyCount: changedCompanyIds.size,
    topContexts: [...contextCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 4),
  };
}

export async function listWorkspaceWatches(actorUserId: string, workspaceId: string) {
  await requireWorkspaceAccess(actorUserId, workspaceId);

  const watches = await prisma.workspaceWatch.findMany({
    where: {
      workspaceId,
    },
    include: {
      company: {
        include: {
          industryCode: {
            select: {
              code: true,
              title: true,
            },
          },
        },
      },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  return watches.map(toWatchSummary);
}

export async function getWorkspaceWatchlistOverview(
  actorUserId: string,
  workspaceId: string,
): Promise<WorkspaceWatchlistOverview> {
  await requireWorkspaceAccess(actorUserId, workspaceId);

  const [watches, industryWatchRows, groupRows, notifications] = await Promise.all([
    listWorkspaceWatches(actorUserId, workspaceId),
    prisma.workspaceIndustryWatch.findMany({
      where: { workspaceId },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    }),
    prisma.workspaceWatchGroup.findMany({
      where: { workspaceId },
      include: {
        members: {
          include: {
            company: {
              include: {
                industryCode: {
                  select: {
                    code: true,
                    title: true,
                  },
                },
              },
            },
          },
          orderBy: [{ matchedAt: "desc" }],
          take: 200,
        },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    }),
    listWorkspaceNotifications(actorUserId, workspaceId),
  ]);

  const watchedCompanyIds = new Set(
    watches.filter((watch) => watch.status === "ACTIVE").map((watch) => watch.company.id),
  );
  const industryWatches = await Promise.all(industryWatchRows.map(toIndustryWatchSummary));
  const groups = await Promise.all(
    groupRows.map(async (group) =>
      toGroupSummary({
        group,
        watchedCompanyIds,
        recentEventCount: await countRecentGroupEvents(group.members.map((member) => member.companyId)),
      }),
    ),
  );
  const activeWatches = watches.filter((watch) => watch.status === "ACTIVE");
  const activeIndustryWatches = industryWatches.filter((watch) => watch.status === "ACTIVE");
  const activeGroups = groups.filter((group) => group.status === "ACTIVE");
  const recentEvents = await buildWatchlistEventFeed({
    watches: activeWatches,
    industryWatches: activeIndustryWatches,
    groups: activeGroups,
  });

  return {
    activeWatches,
    archivedWatches: watches.filter((watch) => watch.status !== "ACTIVE"),
    activeIndustryWatches,
    archivedIndustryWatches: industryWatches.filter((watch) => watch.status !== "ACTIVE"),
    activeGroups,
    archivedGroups: groups.filter((group) => group.status !== "ACTIVE"),
    recentEvents,
    recentNotifications: notifications.slice(0, 12),
    digest: buildDigest({ events: recentEvents, notifications }),
  };
}

export async function listWorkspaceNotifications(actorUserId: string, workspaceId: string) {
  await requireWorkspaceAccess(actorUserId, workspaceId);

  const notifications = await prisma.workspaceNotification.findMany({
    where: {
      workspaceId,
    },
    include: {
      company: {
        include: {
          industryCode: {
            select: {
              code: true,
              title: true,
            },
          },
        },
      },
      watch: {
        select: {
          id: true,
          status: true,
        },
      },
    },
    orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
    take: 60,
  });

  return notifications.map(toNotificationSummary);
}

export async function listWorkspaceMonitors(actorUserId: string, workspaceId: string) {
  await requireWorkspaceAccess(actorUserId, workspaceId);

  const monitors = await prisma.workspaceMonitor.findMany({
    where: {
      workspaceId,
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  const summaries = await Promise.all(
    monitors.map(async (monitor) => {
      const matches = monitor.status === WorkspaceMonitorStatus.ACTIVE ? await queryMonitorMatches(monitor) : [];
      return toMonitorSummary(monitor, matches);
    }),
  );

  return summaries;
}

export async function createWorkspaceWatch(
  actorUserId: string,
  workspaceId: string,
  input: {
    companyReference: string;
    intensity?: WorkspaceWatchIntensity | null;
    watchAnnouncements?: boolean | null;
    watchFinancialStatements?: boolean | null;
    watchStatusChanges?: boolean | null;
  },
) {
  const membership = await requireWorkspaceAccess(actorUserId, workspaceId);
  ensureActiveWorkspace(membership.workspace);
  const capabilities = await getUserWorkspaceCapabilities(
    actorUserId,
    membership.role,
    membership.workspace.status,
    membership.workspace.type,
  );
  if (!capabilities.canManageWatches) {
    throw new Error("Workspace-abonnementer krever utvidet tilgang.");
  }

  const company = await resolveCompanyReference(input.companyReference);

  return prisma.workspaceWatch.upsert({
    where: {
      workspaceId_companyId: {
        workspaceId,
        companyId: company.id,
      },
    },
    update: {
      status: WorkspaceWatchStatus.ACTIVE,
      archivedAt: null,
      intensity: input.intensity ?? WorkspaceWatchIntensity.BALANCED,
      watchAnnouncements: input.watchAnnouncements ?? true,
      watchFinancialStatements: input.watchFinancialStatements ?? true,
      watchStatusChanges: input.watchStatusChanges ?? true,
    },
    create: {
      workspaceId,
      companyId: company.id,
      status: WorkspaceWatchStatus.ACTIVE,
      intensity: input.intensity ?? WorkspaceWatchIntensity.BALANCED,
      watchAnnouncements: input.watchAnnouncements ?? true,
      watchFinancialStatements: input.watchFinancialStatements ?? true,
      watchStatusChanges: input.watchStatusChanges ?? true,
    },
    select: {
      id: true,
    },
  });
}

export async function updateWorkspaceWatchStatus(
  actorUserId: string,
  watchId: string,
  status: WorkspaceWatchStatus,
) {
  const watch = await prisma.workspaceWatch.findUnique({
    where: { id: watchId },
    select: {
      id: true,
      workspaceId: true,
    },
  });

  if (!watch) {
    throw new Error("Abonnementet finnes ikke.");
  }

  const membership = await requireWorkspaceAccess(actorUserId, watch.workspaceId);
  const capabilities = await getUserWorkspaceCapabilities(
    actorUserId,
    membership.role,
    membership.workspace.status,
    membership.workspace.type,
  );
  if (!capabilities.canManageWatches) {
    throw new Error("Workspace-abonnementer krever utvidet tilgang.");
  }
  if (status === WorkspaceWatchStatus.ACTIVE) {
    ensureActiveWorkspace(membership.workspace);
  }

  await prisma.workspaceWatch.update({
    where: {
      id: watchId,
    },
    data: {
      status,
      archivedAt: status === WorkspaceWatchStatus.ARCHIVED ? new Date() : null,
    },
  });

  return watch.workspaceId;
}

export async function createWorkspaceIndustryWatch(
  actorUserId: string,
  workspaceId: string,
  input: {
    industryCodePrefix: string;
    intensity?: WorkspaceWatchIntensity | null;
  },
) {
  const membership = await requireWorkspaceAccess(actorUserId, workspaceId);
  ensureActiveWorkspace(membership.workspace);
  const capabilities = await getUserWorkspaceCapabilities(
    actorUserId,
    membership.role,
    membership.workspace.status,
    membership.workspace.type,
  );
  if (!capabilities.canManageWatches) {
    throw new Error("Watchlist krever tilgang til workspace-overvåkning.");
  }

  const industryCodePrefix = normalizeIndustryPrefix(input.industryCodePrefix);
  if (!/^\d{2}(\.\d{1,3})?$/.test(industryCodePrefix)) {
    throw new Error("Bruk en gyldig næringskode eller kodeprefiks, for eksempel 47 eller 47.11.");
  }

  const resolved = await resolveIndustryTitle(industryCodePrefix);
  return prisma.workspaceIndustryWatch.upsert({
    where: {
      workspaceId_industryCodePrefix: {
        workspaceId,
        industryCodePrefix,
      },
    },
    update: {
      status: WorkspaceWatchStatus.ACTIVE,
      archivedAt: null,
      intensity: input.intensity ?? WorkspaceWatchIntensity.BALANCED,
      title: resolved.title,
      unsupportedReason: resolved.unsupportedReason,
    },
    create: {
      workspaceId,
      industryCodePrefix,
      title: resolved.title,
      unsupportedReason: resolved.unsupportedReason,
      intensity: input.intensity ?? WorkspaceWatchIntensity.BALANCED,
      status: WorkspaceWatchStatus.ACTIVE,
    },
    select: {
      id: true,
    },
  });
}

export async function updateWorkspaceIndustryWatchStatus(
  actorUserId: string,
  industryWatchId: string,
  status: WorkspaceWatchStatus,
) {
  const industryWatch = await prisma.workspaceIndustryWatch.findUnique({
    where: { id: industryWatchId },
    select: { id: true, workspaceId: true },
  });
  if (!industryWatch) {
    throw new Error("Bransjeovervåkningen finnes ikke.");
  }

  const membership = await requireWorkspaceAccess(actorUserId, industryWatch.workspaceId);
  const capabilities = await getUserWorkspaceCapabilities(
    actorUserId,
    membership.role,
    membership.workspace.status,
    membership.workspace.type,
  );
  if (!capabilities.canManageWatches) {
    throw new Error("Watchlist krever tilgang til workspace-overvåkning.");
  }
  if (status === WorkspaceWatchStatus.ACTIVE) {
    ensureActiveWorkspace(membership.workspace);
  }

  await prisma.workspaceIndustryWatch.update({
    where: { id: industryWatchId },
    data: {
      status,
      archivedAt: status === WorkspaceWatchStatus.ARCHIVED ? new Date() : null,
    },
  });

  return industryWatch.workspaceId;
}

async function resolveGroupCompanies(query: string, matchLimit: number) {
  const searchResult = await searchCompanies({
    query,
    status: CompanyStatus.ACTIVE,
    size: matchLimit,
  });
  const orgNumbers = searchResult.results
    .map((result) => result.company.orgNumber)
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, matchLimit);

  if (orgNumbers.length === 0) {
    return [];
  }

  return prisma.company.findMany({
    where: {
      orgNumber: {
        in: orgNumbers,
      },
    },
    select: {
      id: true,
    },
  });
}

export async function createWorkspaceWatchGroup(
  actorUserId: string,
  workspaceId: string,
  input: {
    name: string;
    query: string;
    intensity?: WorkspaceWatchIntensity | null;
    matchLimit?: number | null;
  },
) {
  const membership = await requireWorkspaceAccess(actorUserId, workspaceId);
  ensureActiveWorkspace(membership.workspace);
  const capabilities = await getUserWorkspaceCapabilities(
    actorUserId,
    membership.role,
    membership.workspace.status,
    membership.workspace.type,
  );
  if (!capabilities.canManageWatches) {
    throw new Error("Watchlist krever tilgang til workspace-overvåkning.");
  }

  const name = input.name.trim();
  const query = input.query.trim();
  const matchLimit = Math.min(Math.max(input.matchLimit ?? 50, 1), 100);
  if (name.length < 2) {
    throw new Error("Bolk-navn må være minst to tegn.");
  }
  if (query.length < 2) {
    throw new Error("Søket for bolken må være minst to tegn.");
  }

  const companies = await resolveGroupCompanies(query, matchLimit);
  const unsupportedReason =
    companies.length === 0
      ? "Ingen selskaper matchet Brreg-søket akkurat nå. Bolken er tom til søket gir treff."
      : null;

  const group = await prisma.workspaceWatchGroup.create({
    data: {
      workspaceId,
      name,
      query,
      matchLimit,
      intensity: input.intensity ?? WorkspaceWatchIntensity.BALANCED,
      status: WorkspaceWatchStatus.ACTIVE,
      unsupportedReason,
      refreshedAt: new Date(),
      members: {
        createMany: {
          data: companies.map((company) => ({ companyId: company.id })),
          skipDuplicates: true,
        },
      },
    },
    select: {
      id: true,
    },
  });

  return group;
}

export async function refreshWorkspaceWatchGroup(actorUserId: string, groupId: string) {
  const group = await prisma.workspaceWatchGroup.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      workspaceId: true,
      query: true,
      matchLimit: true,
    },
  });
  if (!group) {
    throw new Error("Bolken finnes ikke.");
  }

  const membership = await requireWorkspaceAccess(actorUserId, group.workspaceId);
  ensureActiveWorkspace(membership.workspace);
  const capabilities = await getUserWorkspaceCapabilities(
    actorUserId,
    membership.role,
    membership.workspace.status,
    membership.workspace.type,
  );
  if (!capabilities.canManageWatches) {
    throw new Error("Watchlist krever tilgang til workspace-overvåkning.");
  }

  const companies = await resolveGroupCompanies(group.query, group.matchLimit);
  await prisma.$transaction([
    prisma.workspaceWatchGroupMember.deleteMany({ where: { groupId: group.id } }),
    prisma.workspaceWatchGroup.update({
      where: { id: group.id },
      data: {
        unsupportedReason:
          companies.length === 0
            ? "Ingen selskaper matchet Brreg-søket akkurat nå. Bolken er tom til søket gir treff."
            : null,
        refreshedAt: new Date(),
        members: {
          createMany: {
            data: companies.map((company) => ({ companyId: company.id })),
            skipDuplicates: true,
          },
        },
      },
    }),
  ]);

  return group.workspaceId;
}

export async function updateWorkspaceWatchGroupStatus(
  actorUserId: string,
  groupId: string,
  status: WorkspaceWatchStatus,
) {
  const group = await prisma.workspaceWatchGroup.findUnique({
    where: { id: groupId },
    select: { id: true, workspaceId: true },
  });
  if (!group) {
    throw new Error("Bolken finnes ikke.");
  }

  const membership = await requireWorkspaceAccess(actorUserId, group.workspaceId);
  const capabilities = await getUserWorkspaceCapabilities(
    actorUserId,
    membership.role,
    membership.workspace.status,
    membership.workspace.type,
  );
  if (!capabilities.canManageWatches) {
    throw new Error("Watchlist krever tilgang til workspace-overvåkning.");
  }
  if (status === WorkspaceWatchStatus.ACTIVE) {
    ensureActiveWorkspace(membership.workspace);
  }

  await prisma.workspaceWatchGroup.update({
    where: { id: groupId },
    data: {
      status,
      archivedAt: status === WorkspaceWatchStatus.ARCHIVED ? new Date() : null,
    },
  });

  return group.workspaceId;
}

export async function promoteWorkspaceWatchGroupMember(
  actorUserId: string,
  memberId: string,
) {
  const member = await prisma.workspaceWatchGroupMember.findUnique({
    where: { id: memberId },
    include: {
      group: {
        select: {
          workspaceId: true,
        },
      },
      company: {
        select: {
          orgNumber: true,
        },
      },
    },
  });
  if (!member) {
    throw new Error("Selskapet finnes ikke i bolken.");
  }

  await createWorkspaceWatch(actorUserId, member.group.workspaceId, {
    companyReference: member.company.orgNumber,
  });

  return member.group.workspaceId;
}

export async function updateWorkspaceWatchlistItemIntensity(
  actorUserId: string,
  input: {
    targetType: "company" | "industry" | "group";
    targetId: string;
    intensity: WorkspaceWatchIntensity;
  },
) {
  if (input.targetType === "company") {
    const watch = await prisma.workspaceWatch.findUnique({
      where: { id: input.targetId },
      select: { workspaceId: true },
    });
    if (!watch) throw new Error("Watch finnes ikke.");
    const membership = await requireWorkspaceAccess(actorUserId, watch.workspaceId);
    const capabilities = await getUserWorkspaceCapabilities(
      actorUserId,
      membership.role,
      membership.workspace.status,
      membership.workspace.type,
    );
    if (!capabilities.canManageWatches) {
      throw new Error("Watchlist krever tilgang til workspace-overvåkning.");
    }
    await prisma.workspaceWatch.update({
      where: { id: input.targetId },
      data: { intensity: input.intensity },
    });
    return watch.workspaceId;
  }

  if (input.targetType === "industry") {
    const watch = await prisma.workspaceIndustryWatch.findUnique({
      where: { id: input.targetId },
      select: { workspaceId: true },
    });
    if (!watch) throw new Error("Bransjeovervåkningen finnes ikke.");
    const membership = await requireWorkspaceAccess(actorUserId, watch.workspaceId);
    const capabilities = await getUserWorkspaceCapabilities(
      actorUserId,
      membership.role,
      membership.workspace.status,
      membership.workspace.type,
    );
    if (!capabilities.canManageWatches) {
      throw new Error("Watchlist krever tilgang til workspace-overvåkning.");
    }
    await prisma.workspaceIndustryWatch.update({
      where: { id: input.targetId },
      data: { intensity: input.intensity },
    });
    return watch.workspaceId;
  }

  const group = await prisma.workspaceWatchGroup.findUnique({
    where: { id: input.targetId },
    select: { workspaceId: true },
  });
  if (!group) throw new Error("Bolken finnes ikke.");
  const membership = await requireWorkspaceAccess(actorUserId, group.workspaceId);
  const capabilities = await getUserWorkspaceCapabilities(
    actorUserId,
    membership.role,
    membership.workspace.status,
    membership.workspace.type,
  );
  if (!capabilities.canManageWatches) {
    throw new Error("Watchlist krever tilgang til workspace-overvåkning.");
  }
  await prisma.workspaceWatchGroup.update({
    where: { id: input.targetId },
    data: { intensity: input.intensity },
  });
  return group.workspaceId;
}

export async function createWorkspaceMonitor(
  actorUserId: string,
  workspaceId: string,
  input: {
    name: string;
    industryCodePrefix?: string | null;
    minEmployees?: number | null;
    maxEmployees?: number | null;
    minRevenue?: number | null;
    maxRevenue?: number | null;
    companyStatus?: CompanyStatus | null;
    minimumDaysInStatus?: number | null;
  },
) {
  const membership = await requireWorkspaceAccess(actorUserId, workspaceId);
  ensureActiveWorkspace(membership.workspace);
  const capabilities = await getUserWorkspaceCapabilities(
    actorUserId,
    membership.role,
    membership.workspace.status,
    membership.workspace.type,
  );
  if (!capabilities.canManageMonitors) {
    throw new Error("Distress-monitorer krever utvidet tilgang.");
  }

  const trimmedName = input.name.trim();
  if (trimmedName.length < 2) {
    throw new Error("Monitor-navn må være minst to tegn.");
  }

  return prisma.workspaceMonitor.create({
    data: {
      workspaceId,
      name: trimmedName,
      status: WorkspaceMonitorStatus.ACTIVE,
      industryCodePrefix: input.industryCodePrefix?.trim() || null,
      minEmployees: input.minEmployees ?? null,
      maxEmployees: input.maxEmployees ?? null,
      minRevenue: input.minRevenue ?? null,
      maxRevenue: input.maxRevenue ?? null,
      companyStatus: input.companyStatus ?? null,
      minimumDaysInStatus: input.minimumDaysInStatus ?? null,
    },
    select: {
      id: true,
    },
  });
}

export async function updateWorkspaceMonitorStatus(
  actorUserId: string,
  monitorId: string,
  status: WorkspaceMonitorStatus,
) {
  const monitor = await prisma.workspaceMonitor.findUnique({
    where: { id: monitorId },
    select: {
      id: true,
      workspaceId: true,
    },
  });

  if (!monitor) {
    throw new Error("Monitoren finnes ikke.");
  }

  const membership = await requireWorkspaceAccess(actorUserId, monitor.workspaceId);
  const capabilities = await getUserWorkspaceCapabilities(
    actorUserId,
    membership.role,
    membership.workspace.status,
    membership.workspace.type,
  );
  if (!capabilities.canManageMonitors) {
    throw new Error("Distress-monitorer krever utvidet tilgang.");
  }
  if (status === WorkspaceMonitorStatus.ACTIVE) {
    ensureActiveWorkspace(membership.workspace);
  }

  await prisma.workspaceMonitor.update({
    where: { id: monitorId },
    data: {
      status,
      archivedAt: status === WorkspaceMonitorStatus.ARCHIVED ? new Date() : null,
    },
  });

  return monitor.workspaceId;
}

export async function markWorkspaceNotificationRead(actorUserId: string, notificationId: string) {
  const notification = await prisma.workspaceNotification.findUnique({
    where: { id: notificationId },
    select: {
      id: true,
      workspaceId: true,
    },
  });

  if (!notification) {
    throw new Error("Varslet finnes ikke.");
  }

  const membership = await requireWorkspaceAccess(actorUserId, notification.workspaceId);
  const capabilities = await getUserWorkspaceCapabilities(
    actorUserId,
    membership.role,
    membership.workspace.status,
    membership.workspace.type,
  );
  if (!capabilities.canManageNotifications) {
    throw new Error("Workspace-inbox krever utvidet tilgang.");
  }

  await prisma.workspaceNotification.update({
    where: { id: notificationId },
    data: {
      readAt: new Date(),
    },
  });

  return notification.workspaceId;
}

export async function markAllWorkspaceNotificationsRead(actorUserId: string, workspaceId: string) {
  const membership = await requireWorkspaceAccess(actorUserId, workspaceId);
  const capabilities = await getUserWorkspaceCapabilities(
    actorUserId,
    membership.role,
    membership.workspace.status,
    membership.workspace.type,
  );
  if (!capabilities.canManageNotifications) {
    throw new Error("Workspace-inbox krever utvidet tilgang.");
  }

  await prisma.workspaceNotification.updateMany({
    where: {
      workspaceId,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });
}

async function createNotificationIfMissing(input: {
  workspaceId: string;
  type: WorkspaceNotificationType;
  dedupeKey: string;
  title: string;
  body: string;
  watchId?: string | null;
  companyId?: string | null;
  metadata?: unknown;
}) {
  await prisma.workspaceNotification.upsert({
    where: {
      dedupeKey: input.dedupeKey,
    },
    update: {},
    create: {
      workspaceId: input.workspaceId,
      type: input.type,
      dedupeKey: input.dedupeKey,
      title: input.title,
      body: input.body,
      watchId: input.watchId ?? null,
      companyId: input.companyId ?? null,
      metadata: (input.metadata ?? null) as never,
    },
  });
}

async function syncWatchAnnouncements(watch: {
  id: string;
  workspaceId: string;
  companyId: string;
  company: { orgNumber: string; name: string };
  createdAt: Date;
  lastAnnouncementPublishedAt: Date | null;
}) {
  const response = await getCompanyAnnouncements(watch.company.orgNumber);
  const baseline = watch.lastAnnouncementPublishedAt ?? watch.createdAt;
  let newestPublishedAt = watch.lastAnnouncementPublishedAt;
  let createdCount = 0;

  for (const announcement of response.announcements) {
    const publishedAt = announcement.publishedAt ?? announcement.fetchedAt;
    if (publishedAt <= baseline) {
      if (!newestPublishedAt || publishedAt > newestPublishedAt) {
        newestPublishedAt = publishedAt;
      }
      continue;
    }

    await createNotificationIfMissing({
      workspaceId: watch.workspaceId,
      type: "ANNOUNCEMENT_NEW",
      dedupeKey: `watch:${watch.id}:announcement:${announcement.sourceId}`,
      title: `${watch.company.name}: ny kunngjøring`,
      body: announcement.title,
      watchId: watch.id,
      companyId: watch.companyId,
      metadata: {
        announcementId: announcement.id,
        announcementSourceId: announcement.sourceId,
        publishedAt,
      },
    });
    createdCount += 1;

    if (!newestPublishedAt || publishedAt > newestPublishedAt) {
      newestPublishedAt = publishedAt;
    }
  }

  await prisma.workspaceWatch.update({
    where: { id: watch.id },
    data: {
      lastAnnouncementPublishedAt: newestPublishedAt ?? baseline,
    },
  });

  return createdCount;
}

async function syncWatchFinancials(watch: {
  id: string;
  workspaceId: string;
  companyId: string;
  company: { orgNumber: string; name: string };
  lastFinancialStatementYear: number | null;
}) {
  // Reads the database and enqueues an ingestion when a company has no
  // financials yet. This previously called syncCompanyAnnualReportFinancials,
  // which ran Brreg PDF discovery, download and OCR extraction inside the
  // request — reachable by any authenticated user via
  // POST /api/workspaces/[workspaceId]/sync. A watch only needs to know which
  // fiscal years exist, so a read is sufficient; a newly queued company simply
  // reports its new year on a later sync.
  const financials = await getPublicCompanyFinancials(watch.company.orgNumber);

  // Watch state is not dataset-versioned yet. Until that F8 migration lands,
  // never persist demo years or emit notifications derived from FI-SIM.
  if (financials.datasetMode !== "reported") {
    return 0;
  }

  const fiscalYears = financials.statements.map((statement) => statement.fiscalYear);
  const latestYear = fiscalYears.length ? Math.max(...fiscalYears) : null;

  if (latestYear === null) {
    return 0;
  }

  if (watch.lastFinancialStatementYear === null) {
    await prisma.workspaceWatch.update({
      where: { id: watch.id },
      data: {
        lastFinancialStatementYear: latestYear,
      },
    });
    return 0;
  }

  const yearsToNotify = fiscalYears.filter((year) => year > watch.lastFinancialStatementYear!);
  for (const fiscalYear of yearsToNotify.sort((left, right) => left - right)) {
    await createNotificationIfMissing({
      workspaceId: watch.workspaceId,
      type: "FINANCIAL_STATEMENT_NEW",
      dedupeKey: `watch:${watch.id}:financial:${fiscalYear}`,
      title: `${watch.company.name}: nytt regnskap tilgjengelig`,
      body: `Regnskap for ${fiscalYear} er nå tilgjengelig i Fjord Insight.`,
      watchId: watch.id,
      companyId: watch.companyId,
      metadata: {
        fiscalYear,
      },
    });
  }

  await prisma.workspaceWatch.update({
    where: { id: watch.id },
    data: {
      lastFinancialStatementYear: latestYear,
    },
  });

  return yearsToNotify.length;
}

async function syncWatchStatus(watch: {
  id: string;
  workspaceId: string;
  companyId: string;
  company: { orgNumber: string; name: string };
  lastObservedCompanyStatus: CompanyStatus | null;
}) {
  const profile = await getCompanyProfile(watch.company.orgNumber, {
    rolesMode: "none",
    financialsMode: "none",
  });
  if (!profile) {
    return 0;
  }

  const latestCompany = profile.company;

  const nextStatus = latestCompany.status as CompanyStatus;
  const previousStatus = watch.lastObservedCompanyStatus;

  if (previousStatus === null) {
    await prisma.workspaceWatch.update({
      where: { id: watch.id },
      data: {
        lastObservedCompanyStatus: nextStatus,
      },
    });
    return 0;
  }

  if (previousStatus !== nextStatus) {
    await createNotificationIfMissing({
      workspaceId: watch.workspaceId,
      type: "COMPANY_STATUS_CHANGED",
      dedupeKey: `watch:${watch.id}:status:${previousStatus}:${nextStatus}:${latestCompany.fetchedAt.toISOString()}`,
      title: `${watch.company.name}: statusendring`,
      body: `Status er endret fra ${previousStatus} til ${nextStatus}.`,
      watchId: watch.id,
      companyId: watch.companyId,
      metadata: {
        previousStatus,
        nextStatus,
      },
    });
  }

  await prisma.workspaceWatch.update({
    where: { id: watch.id },
    data: {
      lastObservedCompanyStatus: nextStatus,
    },
  });

  return previousStatus !== nextStatus ? 1 : 0;
}

async function syncMonitorMatches(monitor: {
  id: string;
  workspaceId: string;
  name: string;
  status: WorkspaceMonitorStatus;
  industryCodePrefix: string | null;
  minEmployees: number | null;
  maxEmployees: number | null;
  minRevenue: number | null;
  maxRevenue: number | null;
  companyStatus: CompanyStatus | null;
  minimumDaysInStatus: number | null;
}) {
  if (monitor.status !== WorkspaceMonitorStatus.ACTIVE) {
    return 0;
  }

  const matches = await queryMonitorMatches(monitor);
  for (const company of matches) {
    await createNotificationIfMissing({
      workspaceId: monitor.workspaceId,
      type: "DISTRESS_MATCH",
      dedupeKey: `monitor:${monitor.id}:company:${company.id}:status:${company.status}`,
      title: `${monitor.name}: ny match`,
      body: `${company.name} matcher monitoren med status ${company.status}.`,
      companyId: company.id,
      metadata: {
        monitorId: monitor.id,
        companyStatus: company.status,
        statusObservedAt: company.statusObservedAt,
      },
    });
  }

  await prisma.workspaceMonitor.update({
    where: { id: monitor.id },
    data: {
      lastEvaluatedAt: new Date(),
    },
  });

  return matches.length;
}

export async function syncWorkspaceNotifications(actorUserId: string, workspaceId: string) {
  const membership = await requireWorkspaceAccess(actorUserId, workspaceId);
  ensureActiveWorkspace(membership.workspace);
  const capabilities = await getUserWorkspaceCapabilities(
    actorUserId,
    membership.role,
    membership.workspace.status,
    membership.workspace.type,
  );
  if (
    !capabilities.canManageWatches &&
    !capabilities.canManageMonitors &&
    !capabilities.canManageNotifications
  ) {
    throw new Error("Automatisk workspace-sync krever utvidet tilgang.");
  }

  const [watches, monitors] = await Promise.all([
    prisma.workspaceWatch.findMany({
      where: {
        workspaceId,
        status: WorkspaceWatchStatus.ACTIVE,
      },
      include: {
        company: {
          select: {
            orgNumber: true,
            name: true,
          },
        },
      },
    }),
    prisma.workspaceMonitor.findMany({
      where: {
        workspaceId,
        status: WorkspaceMonitorStatus.ACTIVE,
      },
    }),
  ]);

  let createdNotifications = 0;

  for (const watch of watches) {
    if (watch.watchAnnouncements) {
      createdNotifications += await syncWatchAnnouncements(watch);
    }
    if (watch.watchFinancialStatements) {
      createdNotifications += await syncWatchFinancials(watch);
    }
    if (watch.watchStatusChanges) {
      createdNotifications += await syncWatchStatus(watch);
    }
  }

  if (env.newsIntelligenceAlertsEnabled) {
    const eventNotificationResult = await syncCompanyEventNotificationsForWatches(watches);
    createdNotifications += eventNotificationResult.createdNotifications;
  }

  for (const monitor of monitors) {
    createdNotifications += await syncMonitorMatches(monitor);
  }

  return {
    watchCount: watches.length,
    monitorCount: monitors.length,
    createdNotifications,
  };
}
