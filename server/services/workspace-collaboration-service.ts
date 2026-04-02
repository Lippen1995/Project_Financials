import {
  CompanyStatus,
  WorkspaceMonitorStatus,
  WorkspaceNotificationType,
  WorkspaceStatus,
  WorkspaceType,
  WorkspaceWatchStatus,
} from "@prisma/client";

import {
  WorkspaceMonitorSummary,
  WorkspaceNotificationSummary,
  WorkspaceWatchSummary,
} from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { BrregAnnouncementsProvider } from "@/integrations/brreg/brreg-announcements-provider";
import { BrregCompanyProvider } from "@/integrations/brreg/brreg-company-provider";
import { BrregFinancialsProvider } from "@/integrations/brreg/brreg-financials-provider";
import {
  upsertCompanySnapshot,
  upsertFinancialStatementsSnapshot,
} from "@/server/persistence/company-repository";
import { getCompanyProfile } from "@/server/services/company-service";
import { getUserWorkspaceCapabilities } from "@/server/services/workspace-service";

const announcementsProvider = new BrregAnnouncementsProvider();
const companyProvider = new BrregCompanyProvider();
const financialsProvider = new BrregFinancialsProvider();

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
      watchAnnouncements: input.watchAnnouncements ?? true,
      watchFinancialStatements: input.watchFinancialStatements ?? true,
      watchStatusChanges: input.watchStatusChanges ?? true,
    },
    create: {
      workspaceId,
      companyId: company.id,
      status: WorkspaceWatchStatus.ACTIVE,
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
  const response = await announcementsProvider.getAnnouncements(watch.company.orgNumber);
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
  const financials = await financialsProvider.getFinancialStatements(watch.company.orgNumber);
  await upsertFinancialStatementsSnapshot(watch.company.orgNumber, financials.statements);

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
      body: `Regnskap for ${fiscalYear} er nå tilgjengelig i ProjectX.`,
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
  const latestCompany = await companyProvider.getCompany(watch.company.orgNumber);
  if (!latestCompany) {
    return 0;
  }

  await upsertCompanySnapshot(latestCompany);

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

  for (const monitor of monitors) {
    createdNotifications += await syncMonitorMatches(monitor);
  }

  return {
    watchCount: watches.length,
    monitorCount: monitors.length,
    createdNotifications,
  };
}
