import Link from "next/link";
import { redirect } from "next/navigation";

import { RelevantInsightsSection } from "@/components/dashboard/relevant-insights-section";
import { safeAuth } from "@/lib/auth";
import { getDashboardRelevantInsights } from "@/server/news/dashboard-insights-service";

export default async function DashboardPage() {
  const session = await safeAuth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const firstName = session.user.name?.split(" ")[0] ?? session.user.email ?? "der";
  const relevantInsights = await getDashboardRelevantInsights(session.user.id, 8);

  return (
    <div className="min-h-screen pt-0">
      <section className="max-w-4xl mx-auto pb-20 px-4 text-center pt-12">
        <p className="text-secondary font-label-caps tracking-widest text-sm mb-4">
          Hi {firstName}, what should we analyse today?
        </p>
        <h2 className="font-display-lg text-display-lg text-primary mb-8">
          Fjord Insight Explorer
        </h2>

        <form action="/search" method="GET">
          <div className="relative flex items-center border-b-2 border-outline-variant focus-within:border-secondary transition-colors mb-4">
            <span className="material-symbols-outlined text-on-surface-variant mr-3 text-xl">
              search
            </span>
            <input
              type="text"
              name="query"
              placeholder="Søk på selskap, org.nr, bransje..."
              className="flex-1 bg-transparent py-3 text-primary placeholder:text-on-surface-variant outline-none font-body-lg text-body-lg"
            />
            <button type="submit" className="flex items-center gap-2 ml-3">
              <span className="font-label-caps text-xs text-secondary border border-secondary px-2 py-0.5 rounded tracking-widest">
                AI PROMPT
              </span>
              <span className="material-symbols-outlined text-secondary text-xl">
                arrow_forward
              </span>
            </button>
          </div>
        </form>

        <p className="font-label-caps text-outline-variant tracking-widest text-xs">
          AI-POWERED SEARCH OPERATING ON REAL-TIME BRONNOYSUND DATA
        </p>
      </section>

      <section className="max-w-container-max mx-auto px-margin-lg pb-16">
        <p className="font-label-caps text-outline-variant tracking-widest text-xs mb-6">
          Hva andre i din industri søker på
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { tag: "TRENDING SØK", title: "Kvartalsrapporter: Energi", icon: "trending_up" },
            { tag: "ESG ANALYSE", title: "ESG-ratinger: Offshore", icon: "eco" },
            { tag: "AKTUELL BEDRIFT", title: "Vår Energi ASA", icon: "business" },
            { tag: "M&A OVERVÅKNING", title: "Fusjonsrykter: Maritim", icon: "merge" },
          ].map((card) => (
            <button
              key={card.tag}
              type="button"
              className="text-left border border-outline-variant bg-surface-container-low hover:border-secondary transition-colors p-5 group"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-secondary text-base">
                  {card.icon}
                </span>
                <span className="font-label-caps text-xs text-secondary tracking-widest">
                  {card.tag}
                </span>
              </div>
              <p className="font-headline-sm text-headline-sm text-primary group-hover:text-secondary transition-colors">
                {card.title}
              </p>
            </button>
          ))}
        </div>
      </section>

      <RelevantInsightsSection items={relevantInsights} />

      <section className="max-w-container-max mx-auto px-margin-lg pb-16">
        <div className="border-b border-primary pb-3 mb-8 flex items-center justify-between">
          <h3 className="font-headline-md text-headline-md text-primary tracking-wide uppercase">
            New Registrations
          </h3>
          <div className="flex items-center gap-2">
            {["ALL", "LISTED", "UNLISTED"].map((filter, i) => (
              <button
                key={filter}
                type="button"
                className={`font-label-caps text-xs tracking-widest px-3 py-1 border transition-colors ${
                  i === 0
                    ? "border-primary text-primary bg-transparent"
                    : "border-outline-variant text-outline-variant hover:border-primary hover:text-primary"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-outline-variant">
              {["COMPANY NAME", "ORG NR", "LOCATION", "CAPITAL", "ACTION"].map((col) => (
                <th
                  key={col}
                  className="font-label-caps text-xs text-outline-variant tracking-widest text-left py-3 pr-4 last:pr-0"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              {
                name: "Nordic Hydrogen Logistics AS",
                org: "982 441 329",
                location: "Trondheim",
                capital: "5.000.000 NOK",
              },
              {
                name: "Lofoten Fisheries Holding",
                org: "913 884 002",
                location: "Svolvaer",
                capital: "12.500.000 NOK",
              },
              {
                name: "Nordic Frontier Venture I",
                org: "921 556 718",
                location: "Oslo",
                capital: "50.000.000 NOK",
              },
            ].map((row) => (
              <tr
                key={row.org}
                className="border-b border-outline-variant hover:bg-surface-container-low transition-colors"
              >
                <td className="font-body-md text-body-md text-primary py-4 pr-4">{row.name}</td>
                <td className="font-data-mono text-data-mono text-on-surface-variant py-4 pr-4">
                  {row.org}
                </td>
                <td className="font-body-md text-body-md text-on-surface-variant py-4 pr-4">
                  {row.location}
                </td>
                <td className="font-data-mono text-data-mono text-on-surface-variant py-4 pr-4">
                  {row.capital}
                </td>
                <td className="py-4">
                  <button
                    type="button"
                    className="font-label-caps text-xs text-secondary tracking-widest hover:underline"
                  >
                    ANALYSER
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="max-w-container-max mx-auto px-margin-lg pb-16">
        <div className="border-b border-primary pb-3 mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-headline-md text-headline-md text-primary tracking-wide uppercase">
              Distressed Assets
            </h3>
            <span className="font-label-caps text-xs tracking-widest px-2 py-0.5 bg-error text-on-error rounded">
              ALERT ACTIVE
            </span>
          </div>
          <span className="font-label-caps text-xs text-outline-variant tracking-widest">
            KONKURSER &amp; AVVIKLINGER
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            {[
              {
                name: "Bergen Infrastructure Group AS",
                org: "944 321 008",
                status: "KONKURSAPNING",
                date: "12.10.2023",
                isAvvikling: false,
              },
              {
                name: "Nordic Marine Services NV",
                org: "911 552 331",
                status: "KONKURSAPNING",
                date: "11.10.2023",
                isAvvikling: false,
              },
            ].map((item) => (
              <div
                key={item.org}
                className="border border-outline-variant p-5 hover:border-error transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-headline-sm text-headline-sm text-primary mb-1">
                      {item.name}
                    </p>
                    <p className="font-data-mono text-data-mono text-outline-variant text-xs">
                      {item.org}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`font-label-caps text-xs tracking-widest mb-1 ${
                        item.isAvvikling ? "text-secondary" : "text-error"
                      }`}
                    >
                      {item.status}
                    </p>
                    <p className="font-label-caps text-xs text-outline-variant tracking-widest">
                      {item.date}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            {[
              {
                name: "Viken Eiendomsutvikling",
                org: "932 887 441",
                status: "AVVIKLING",
                date: "12.10.2023",
                isAvvikling: true,
              },
              {
                name: "Stavanger Tech Sol",
                org: "887 554 112",
                status: "KONKURSAPNING",
                date: "10.10.2023",
                isAvvikling: false,
              },
            ].map((item) => (
              <div
                key={item.org}
                className="border border-outline-variant p-5 hover:border-error transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-headline-sm text-headline-sm text-primary mb-1">
                      {item.name}
                    </p>
                    <p className="font-data-mono text-data-mono text-outline-variant text-xs">
                      {item.org}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`font-label-caps text-xs tracking-widest mb-1 ${
                        item.isAvvikling ? "text-secondary" : "text-error"
                      }`}
                    >
                      {item.status}
                    </p>
                    <p className="font-label-caps text-xs text-outline-variant tracking-widest">
                      {item.date}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-outline-variant bg-surface py-8">
        <div className="max-w-container-max mx-auto px-margin-lg flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="font-label-caps text-xs text-outline-variant tracking-widest">
              SYSTEM STATUS: NOMINAL
            </span>
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            <span className="font-label-caps text-xs text-outline-variant tracking-widest">
              LAST DATA REFRESH: 14:32:01 CET
            </span>
          </div>
          <div className="flex items-center gap-6">
            {["PRIVACY POLICY", "API DOCUMENTATION", "SUPPORT NODE 04"].map((label) => (
              <span
                key={label}
                className="font-label-caps text-xs text-outline-variant tracking-widest"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
