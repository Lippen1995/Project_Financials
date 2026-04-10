import Link from "next/link";

export function DistressOverviewHero({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  return (
    <section className="grid gap-0 border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.78)] xl:grid-cols-[minmax(0,1.45fr),360px]">
      <div className="p-8">
        <div className="data-label inline-flex rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-3 py-1 text-[11px] font-semibold uppercase text-slate-600">
          Distress workspace
        </div>
        <h1 className="editorial-display mt-5 max-w-5xl text-[3rem] leading-[0.98] text-slate-950 sm:text-[4rem]">
          Distress-intelligens for {workspaceName}.
        </h1>
        <p className="mt-4 max-w-3xl text-[1.02rem] leading-8 text-slate-600">
          Start med en strukturert oversikt over status, sektorer og ferske signaler før du går videre til
          full screening.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/workspaces/${workspaceId}/distress/search`}
            className="rounded-full bg-[#162233] px-4 py-2 text-sm font-semibold text-white hover:bg-[#223246]"
          >
            Start screening
          </Link>
          <Link
            href="/dashboard"
            className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-[rgba(15,23,42,0.18)] hover:text-slate-950"
          >
            Til dashboard
          </Link>
        </div>
      </div>

      <aside className="border-t border-[rgba(15,23,42,0.08)] bg-[#192536] p-8 text-white xl:border-l xl:border-t-0">
        <div className="data-label text-[11px] font-semibold uppercase text-white/60">Arbeidsflyt</div>
        <div className="mt-4 text-[1.45rem] font-semibold leading-tight">Oversikt først, filtrering deretter</div>
        <p className="mt-4 text-sm leading-7 text-white/76">
          Denne inngangen samler hovedbildet og peker deg videre til målrettede søk med ferdige filterspor.
        </p>
      </aside>
    </section>
  );
}
