import Link from "next/link";
import { redirect } from "next/navigation";

import { safeAuth } from "@/lib/auth";
import { buildGlobalNavItems } from "@/lib/navigation";

const moduleCopy: Record<
  string,
  {
    eyebrow: string;
    title: string;
    description: string;
    cta: string;
  }
> = {
  "/search": {
    eyebrow: "Live now",
    title: "Company search",
    description:
      "Search real Norwegian companies from Bronnoysundregistrene with filters and a structured result list.",
    cta: "Open search",
  },
  "/watchlist": {
    eyebrow: "Live now",
    title: "Watchlist",
    description:
      "Track companies you want to monitor and return to them from a dedicated workspace.",
    cta: "Open watchlist",
  },
  "/market/distress": {
    eyebrow: "Live now",
    title: "Distress",
    description:
      "Open the distress workflow as it exists today, backed by real status and announcement data.",
    cta: "Open distress",
  },
  "/market/oil-gas": {
    eyebrow: "Live now",
    title: "Oil and gas",
    description:
      "Use the market module for petroleum data, map layers and company links already present in the product.",
    cta: "Open oil and gas",
  },
  "/pricing": {
    eyebrow: "Product",
    title: "Access",
    description:
      "See the current access model and how feature gating is intended to work in the MVP.",
    cta: "Open access",
  },
  "/admin": {
    eyebrow: "Admin",
    title: "Control center",
    description:
      "Open the admin surface for review, parser quality and controlled rollout of the financial pipeline.",
    cta: "Open admin",
  },
};

const productStatus = [
  {
    title: "Search is active",
    description:
      "The hero search below sends you directly into the real company search flow, not a mock view.",
  },
  {
    title: "Company profiles use real sources",
    description:
      "Profiles, roles and available financial data come from normalized internal data layers, not hardcoded demo content.",
  },
  {
    title: "Not everything is live yet",
    description:
      "Sections that cannot yet be driven by real data should stay empty, clearly labeled or hidden instead of showing synthetic examples.",
  },
];

export default async function DashboardPage() {
  const session = await safeAuth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const firstName = session.user.name?.split(" ")[0] ?? session.user.email ?? "there";
  const navItems = buildGlobalNavItems(session.user).filter((item) => item.href !== "/dashboard");

  return (
    <main className="space-y-10 pb-10">
      <section className="grid gap-0 border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.78)] xl:grid-cols-[minmax(0,1.45fr),360px]">
        <div className="p-8 sm:p-10">
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
            Workspace
          </div>
          <p className="mt-4 text-sm uppercase tracking-[0.18em] text-[var(--px-accent)]">
            Hi {firstName}, what do you want to analyze today?
          </p>
          <h1 className="editorial-display mt-5 max-w-4xl text-[3rem] leading-[0.98] text-slate-950 sm:text-[4rem]">
            Fjord Insight Explorer
          </h1>
          <p className="mt-4 max-w-3xl text-[1.02rem] leading-8 text-slate-600">
            Start with a real company search. This page prioritizes workflows that are actually
            implemented and backed by real public data.
          </p>

          <form
            action="/search"
            method="GET"
            className="mt-8 flex flex-col gap-3 border-b border-[rgba(15,23,42,0.18)] pb-3 sm:flex-row sm:items-center"
          >
            <label htmlFor="dashboard-search" className="sr-only">
              Search for a company
            </label>
            <span className="material-symbols-outlined text-slate-500">search</span>
            <input
              id="dashboard-search"
              name="query"
              type="text"
              placeholder="Search company, org no or industry"
              className="min-h-12 flex-1 bg-transparent text-[1.05rem] text-slate-950 outline-none placeholder:text-slate-400"
            />
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--px-accent)] hover:bg-slate-50"
            >
              Open search
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </button>
          </form>

          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Search runs on real company data from Bronnoysundregistrene
          </p>
        </div>

        <aside className="border-t border-[rgba(15,23,42,0.08)] bg-[var(--px-panel)] p-8 text-white xl:border-l xl:border-t-0">
          <div className="data-label text-[11px] font-semibold uppercase text-white/60">
            Status
          </div>
          <div className="mt-4 text-[1.45rem] font-semibold leading-tight">
            This dashboard only shows surfaces we can stand behind.
          </div>
          <p className="mt-4 text-sm leading-7 text-white/80">
            The old demo content has been removed here. Use search as your entry point, then move
            into modules that already run on real data or honest limitations.
          </p>
        </aside>
      </section>

      <section className="space-y-5">
        <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
            Available now
          </div>
          <h2 className="mt-2 text-[1.8rem] font-semibold text-slate-950">
            Real entry points into the product
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {navItems.map((item) => {
            const copy = moduleCopy[item.href] ?? {
              eyebrow: "Module",
              title: item.label,
              description: "Open this part of the product.",
              cta: "Open",
            };

            return (
              <Link
                key={item.href}
                href={item.href as never}
                className="group rounded-[1.1rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.88)] p-5 shadow-[0_8px_20px_rgba(15,23,42,0.03)] transition-colors hover:border-[rgba(15,23,42,0.16)] hover:bg-white"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                      {copy.eyebrow}
                    </div>
                    <h3 className="mt-3 text-[1.35rem] font-semibold text-slate-950">
                      {copy.title}
                    </h3>
                  </div>
                  <span className="material-symbols-outlined text-slate-400 group-hover:text-[var(--px-accent)]">
                    {item.icon}
                  </span>
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-600">{copy.description}</p>
                <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--px-accent)]">
                  <span>{copy.cta}</span>
                  <span className="material-symbols-outlined text-base">arrow_forward</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {productStatus.map((item) => (
          <div
            key={item.title}
            className="rounded-[1.1rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.82)] p-5"
          >
            <div className="text-[1.1rem] font-semibold text-slate-950">{item.title}</div>
            <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
