import Link from "next/link";
import { redirect } from "next/navigation";

import { AnalysisList } from "@/components/analysis/analysis-list";
import { safeAuth } from "@/lib/auth";
import { analysisReadService } from "@/server/analysis/analysis-read-service";

export default async function AnalysesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await safeAuth();
  if (!session?.user?.id) redirect("/login");

  const params = await searchParams;
  const includeArchived = params.arkivert === "true";
  const analyses = await analysisReadService.list(session.user.id, { includeArchived });

  return (
    <main className="flex flex-col gap-8 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="data-label text-[11px] text-[var(--px-accent)]">Analytisk workspace</div>
          <h1 className="editorial-display mt-2 text-[38px] leading-[1.08] text-[var(--px-text)]">
            Analyser
          </h1>
          <p className="mt-3 max-w-[68ch] text-sm text-[var(--px-muted)]">
            Gjenoppta dokumenterte screeninger, sourcingløp og konkurrentanalyser med lagrede
            kriterier, arbeidslister og kildegrunnlag.
          </p>
        </div>
        <Link
          href={(includeArchived ? "/analyses" : "/analyses?arkivert=true") as never}
          className="rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-2 text-sm font-semibold text-[var(--px-text)] hover:bg-[var(--px-subtle)]"
        >
          {includeArchived ? "Skjul arkiverte" : "Vis arkiverte"}
        </Link>
      </header>

      <AnalysisList analyses={analyses} />
    </main>
  );
}
