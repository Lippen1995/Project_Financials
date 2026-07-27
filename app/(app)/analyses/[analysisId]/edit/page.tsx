import { notFound, redirect } from "next/navigation";

import { AnalysisEditor } from "@/components/analysis/analysis-editor";
import { safeAuth } from "@/lib/auth";
import { analysisReadService } from "@/server/analysis/analysis-read-service";

export default async function EditAnalysisPage({
  params,
}: {
  params: Promise<{ analysisId: string }>;
}) {
  const session = await safeAuth();
  if (!session?.user?.id) redirect("/login");

  const { analysisId } = await params;
  const analysis = await analysisReadService.get(session.user.id, analysisId);
  if (!analysis) notFound();

  return (
    <main className="flex flex-col gap-8 pb-16">
      <header>
        <div className="data-label text-[11px] text-[var(--px-accent)]">Analyse v{analysis.version}</div>
        <h1 className="editorial-display mt-2 text-[38px] leading-[1.08] text-[var(--px-text)]">
          Rediger analyse
        </h1>
        <p className="mt-3 max-w-[68ch] text-sm text-[var(--px-muted)]">
          Endringer lagres med versjonskontroll. En nyere lagring må lastes på nytt før du kan overskrive den.
        </p>
      </header>
      <AnalysisEditor
        mode="edit"
        workspace={{ id: analysis.workspaceId, name: analysis.workspaceName }}
        analysis={analysis}
      />
    </main>
  );
}
