import { redirect } from "next/navigation";

import { AnalysisEditor } from "@/components/analysis/analysis-editor";
import { safeAuth } from "@/lib/auth";
import { getSessionWorkspaceContext } from "@/server/services/workspace-service";

export default async function NewAnalysisPage() {
  const session = await safeAuth();
  if (!session?.user?.id) redirect("/login");

  const workspace = await getSessionWorkspaceContext(session.user.id);
  if (!workspace.currentWorkspaceId || !workspace.currentWorkspaceName) {
    return (
      <main className="pb-16">
        <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
          <h1 className="editorial-display text-[38px] leading-[1.08] text-[var(--px-text)]">
            Ny analyse
          </h1>
          <p className="mt-3 text-sm text-[var(--px-muted)]">
            Du trenger et aktivt workspace før en analyse kan opprettes.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-8 pb-16">
      <header>
        <div className="data-label text-[11px] text-[var(--px-accent)]">Analytisk workspace</div>
        <h1 className="editorial-display mt-2 text-[38px] leading-[1.08] text-[var(--px-text)]">
          Opprett analyse
        </h1>
        <p className="mt-3 max-w-[68ch] text-sm text-[var(--px-muted)]">
          Definer formål og et versjonert registerunivers. Ingen selskaper eller tall konstrueres.
        </p>
      </header>
      <AnalysisEditor
        mode="create"
        workspace={{
          id: workspace.currentWorkspaceId,
          name: workspace.currentWorkspaceName,
        }}
      />
    </main>
  );
}
