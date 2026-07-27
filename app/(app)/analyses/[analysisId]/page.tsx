import { notFound, redirect } from "next/navigation";

import { AnalysisDetailView } from "@/components/analysis/analysis-detail";
import { safeAuth } from "@/lib/auth";
import { analysisReadService } from "@/server/analysis/analysis-read-service";

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ analysisId: string }>;
}) {
  const session = await safeAuth();
  if (!session?.user?.id) redirect("/login");

  const { analysisId } = await params;
  const analysis = await analysisReadService.get(session.user.id, analysisId);
  if (!analysis) notFound();

  return <AnalysisDetailView analysis={analysis} />;
}
