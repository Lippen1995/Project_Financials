import { redirect } from "next/navigation";

import {
  WatchlistView,
  type WatchlistAlert,
  type WatchlistCompany,
  type WatchlistDdRoom,
  type WatchlistNews,
} from "@/components/watchlist/watchlist-view";
import { safeAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { watchlistFinancialsService } from "@/server/services/watchlist-financials-service";
import { getWorkspaceWatchlistOverview } from "@/server/services/workspace-collaboration-service";

export const metadata = { title: "Overvåkning" };

const EVENT_TYPE_LABELS: Record<string, string> = {
  financial_result: "Resultat",
  annual_report: "Årsrapport",
  financial_statement: "Regnskap",
  contract_award: "Kontrakt",
  contract_loss: "Kontrakttap",
  regulatory_change: "Regulering",
  regulatory_approval: "Godkjenning",
  ownership_change: "Eierendring",
  ceo_change: "Lederskifte",
  cfo_change: "Finansdirektør",
  board_change: "Styre",
  sector_news: "Sektor",
  macro_news: "Makro",
  commodity_price_exposure: "Råvare",
};

function eventCategory(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType] ?? eventType.replaceAll("_", " ");
}

export default async function WatchlistPage() {
  const session = await safeAuth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { lastWorkspaceId: true },
  });

  if (!user?.lastWorkspaceId) {
    return (
      <div className="py-16 text-center text-sm text-slate-500">
        <p className="font-medium text-slate-700">Ingen arbeidsflate funnet</p>
        <p className="mt-1">Opprett eller bli invitert til en arbeidsflate for å bruke overvåkningslisten.</p>
      </div>
    );
  }

  const workspaceId = user.lastWorkspaceId;
  const overview = await getWorkspaceWatchlistOverview(session.user.id, workspaceId);

  const companyIds = overview.activeWatches.map((watch) => watch.company.id);

  const [companyRecords, financialSnapshot, ddRoomRecords] = await Promise.all([
    companyIds.length
      ? prisma.company.findMany({
          where: { id: { in: companyIds } },
          select: { id: true, foundedAt: true, employeeCount: true, website: true },
        })
      : Promise.resolve([]),
    watchlistFinancialsService.load(companyIds),
    prisma.ddRoom.findMany({
      where: { workspaceId },
      include: {
        primaryCompany: { select: { orgNumber: true, slug: true, name: true } },
      },
      orderBy: [{ status: "asc" }, { lastActivityAt: "desc" }],
    }),
  ]);

  const companyExtras = new Map(companyRecords.map((c) => [c.id, c]));

  const companies: WatchlistCompany[] = overview.activeWatches.map((watch) => {
    const extras = companyExtras.get(watch.company.id);
    const industryCode = watch.company.industryCode;
    return {
      watchId: watch.id,
      orgNumber: watch.company.orgNumber,
      slug: watch.company.slug,
      name: watch.company.name,
      status: watch.company.status,
      legalForm: watch.company.legalForm ?? null,
      industry: industryCode
        ? `${industryCode.code}${industryCode.title ? ` · ${industryCode.title}` : ""}`
        : null,
      watchedSince: watch.createdAt.toISOString(),
      foundedAt: extras?.foundedAt ? extras.foundedAt.toISOString() : null,
      employeeCount: extras?.employeeCount ?? null,
      website: extras?.website ?? null,
      statements: financialSnapshot.statementsByCompany[watch.company.id] ?? [],
    };
  });

  const news: WatchlistNews[] = overview.recentEvents.map((event) => ({
    id: event.id,
    title: event.title,
    summary: event.summary ?? null,
    company: event.company.name,
    orgNumber: event.company.orgNumber,
    category: eventCategory(event.eventType),
    url: event.href || `/companies/${event.company.slug}`,
    external: Boolean(event.href),
    date: event.lastSeen.toISOString(),
  }));

  const alerts: WatchlistAlert[] = overview.recentNotifications.map((notification) => ({
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    companyName: notification.company?.name ?? null,
    orgNumber: notification.company?.orgNumber ?? null,
    createdAt: notification.createdAt.toISOString(),
  }));

  const ddRooms: WatchlistDdRoom[] = ddRoomRecords.map((room) => ({
    id: room.id,
    name: room.name,
    companyName: room.primaryCompany.name,
    orgNumber: room.primaryCompany.orgNumber,
    slug: room.primaryCompany.slug,
    description: room.description ?? null,
    status: room.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
    createdAt: room.createdAt.toISOString(),
    lastActivityAt: room.lastActivityAt.toISOString(),
  }));

  return (
    <WatchlistView
      workspaceId={workspaceId}
      companies={companies}
      news={news}
      alerts={alerts}
      ddRooms={ddRooms}
      financialDatasetMode={financialSnapshot.datasetMode}
      financialDatasetVersion={financialSnapshot.financialDatasetVersion}
    />
  );
}
