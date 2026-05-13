import { notFound, redirect } from "next/navigation";

import { DistressCompanyOverview } from "@/components/distress/distress-company-overview";
import { safeAuth } from "@/lib/auth";
import { getDistressCompanyDetailForWorkspace } from "@/server/services/distress-analysis-service";

export default async function DistressCompanyPage({
  params,
}: {
  params: Promise<{ workspaceId: string; slug: string }>;
}) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { workspaceId, slug } = await params;
  const detail = await getDistressCompanyDetailForWorkspace(session.user.id, workspaceId, slug);

  if (!detail) {
    notFound();
  }

  return <DistressCompanyOverview workspaceId={workspaceId} detail={detail} />;
}
