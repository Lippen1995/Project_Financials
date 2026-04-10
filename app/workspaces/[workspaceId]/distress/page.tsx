import { redirect } from "next/navigation";

import { DistressKpiGrid } from "@/components/distress/distress-kpi-grid";
import { DistressOpportunityClusters } from "@/components/distress/distress-opportunity-clusters";
import { DistressOverviewHero } from "@/components/distress/distress-overview-hero";
import { DistressRecentAnnouncements } from "@/components/distress/distress-recent-announcements";
import { DistressSectorOverview } from "@/components/distress/distress-sector-overview";
import { DistressStatusDistribution } from "@/components/distress/distress-status-distribution";
import { DistressTimelineChart } from "@/components/distress/distress-timeline-chart";
import { safeAuth } from "@/lib/auth";
import { getDistressOverviewForWorkspace } from "@/server/services/distress-analysis-service";
import { getDashboardWorkspaceHome } from "@/server/services/workspace-service";

export default async function DistressWorkspaceLandingPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { workspaceId } = await params;
  const [workspaceHome, overview] = await Promise.all([
    getDashboardWorkspaceHome(session.user.id, workspaceId),
    getDistressOverviewForWorkspace(session.user.id, workspaceId),
  ]);

  return (
    <main className="space-y-8 pb-10">
      <DistressOverviewHero workspaceId={workspaceId} workspaceName={workspaceHome.currentWorkspace.name} />
      <DistressKpiGrid kpis={overview.kpis} />

      <section className="grid gap-6 xl:grid-cols-2">
        <DistressStatusDistribution workspaceId={workspaceId} rows={overview.statusDistribution} />
        <DistressTimelineChart points={overview.timeline} />
      </section>

      <DistressSectorOverview workspaceId={workspaceId} sectors={overview.sectors} />

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Definisjon</div>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Regnskapsdekning teller profiler med <em>FINANCIALS_AVAILABLE</em> eller <em>FINANCIALS_PARTIAL</em>.
          </p>
        </div>
        <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Tidslinjegrunnlag</div>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Månedsgrafen er basert på siste registrerte kunngjøringsdato per distress-profil.
          </p>
        </div>
      </section>

      <DistressOpportunityClusters clusters={overview.opportunities} />
      <DistressRecentAnnouncements workspaceId={workspaceId} items={overview.recentAnnouncements} />
    </main>
  );
}
