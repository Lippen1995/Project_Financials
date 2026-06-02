import { prisma } from "@/lib/prisma";

export const COMPANY_EVENT_ALERT_ENGINE_VERSION = "company-event-alert-v1";

export type CompanyEventAlertWatch = {
  id: string;
  workspaceId: string;
  companyId: string;
  createdAt: Date;
  company: {
    name: string;
  };
};

export type SyncCompanyEventAlertOptions = {
  minInvestorValueScore?: number;
  minExposureScore?: number;
  limitPerWatch?: number;
};

function notificationBody(event: { title: string; eventType: string }, exposure: { exposureType: string; rationale: string | null }) {
  if (exposure.rationale) {
    return `${event.title} · ${exposure.rationale}`;
  }

  return `${event.title} · ${exposure.exposureType.replaceAll("_", " ")}`;
}

export async function syncCompanyEventNotificationsForWatches(
  watches: CompanyEventAlertWatch[],
  options: SyncCompanyEventAlertOptions = {},
) {
  const minInvestorValueScore = options.minInvestorValueScore ?? 55;
  const minExposureScore = options.minExposureScore ?? 0.7;
  const limitPerWatch = Math.min(Math.max(options.limitPerWatch ?? 25, 1), 100);
  let createdNotifications = 0;

  for (const watch of watches) {
    const exposures = await prisma.companyEventExposure.findMany({
      where: {
        companyId: watch.companyId,
        exposureScore: { gte: minExposureScore },
        event: {
          status: "ACTIVE",
          investorValueScore: { gte: minInvestorValueScore },
          lastSeen: { gt: watch.createdAt },
        },
      },
      include: {
        event: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [{ exposureScore: "desc" }, { event: { lastSeen: "desc" } }],
      take: limitPerWatch,
    });

    for (const exposure of exposures) {
      const dedupeKey = `watch:${watch.id}:company-event:${exposure.eventId}:${exposure.exposureType}`;
      const existing = await prisma.workspaceNotification.findUnique({
        where: { dedupeKey },
        select: { id: true },
      });
      if (existing) {
        continue;
      }

      await prisma.workspaceNotification.create({
        data: {
          workspaceId: watch.workspaceId,
          type: "COMPANY_EVENT_NEW" as never,
          dedupeKey,
          title: `${watch.company.name}: ny investorrelevant hendelse`,
          body: notificationBody(exposure.event, exposure),
          watchId: watch.id,
          companyId: watch.companyId,
          metadata: {
            engineVersion: COMPANY_EVENT_ALERT_ENGINE_VERSION,
            eventId: exposure.eventId,
            sourceCompanyId: exposure.event.companyId,
            sourceCompanyName: exposure.event.company.name,
            eventType: exposure.event.eventType,
            eventTitle: exposure.event.title,
            investorValueScore: exposure.event.investorValueScore,
            exposureType: exposure.exposureType,
            exposureScore: exposure.exposureScore,
            exposureConfidence: exposure.confidenceScore,
            exposureRationale: exposure.rationale,
          },
        },
      });
      createdNotifications += 1;
    }
  }

  return {
    watchesEvaluated: watches.length,
    createdNotifications,
  };
}
