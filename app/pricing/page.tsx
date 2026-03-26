import { Card } from "@/components/ui/card";
import { safeAuth } from "@/lib/auth";
import { isPremium } from "@/server/billing/subscription";

export default async function PricingPage() {
  const session = await safeAuth();
  const premium = isPremium(session?.user.subscriptionStatus, session?.user.subscriptionPlan);

  return (
    <main className="space-y-8 pb-10">
      <section className="grid gap-0 border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.78)] xl:grid-cols-[minmax(0,1.35fr),340px]">
        <div className="p-8">
          <div className="data-label inline-flex rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-3 py-1 text-[11px] font-semibold uppercase text-slate-600">
            Tilgang
          </div>
          <h1 className="editorial-display mt-5 max-w-4xl text-[3rem] leading-[0.98] text-slate-950 sm:text-[4rem]">
            Tilgangsnivåer for team som jobber systematisk med selskapsanalyse.
          </h1>
          <p className="mt-4 max-w-3xl text-[1.02rem] leading-8 text-slate-600">
            Velg arbeidsnivå etter hvor mye innsikt teamet trenger i research, vurdering og oppfølging
            av norske selskaper.
          </p>
        </div>

        <aside className="border-t border-[rgba(15,23,42,0.08)] bg-[#192536] p-8 text-white xl:border-l xl:border-t-0">
          <div className="data-label text-[11px] font-semibold uppercase text-white/60">Status</div>
          <div className="mt-4 text-[1.45rem] font-semibold leading-tight">
            {premium ? "Kontoen din har utvidet tilgang." : "Kontoen din har standard tilgang."}
          </div>
          <p className="mt-4 text-sm leading-7 text-white/76">
            Tilgang styrer hvor mye av produktets analyseflate som er synlig for brukeren i dag.
          </p>
        </aside>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.88)]">
          <p className="data-label text-[11px] font-semibold uppercase text-slate-500">Standard</p>
          <h2 className="mt-4 text-[2rem] font-semibold text-slate-950">God dekning for daglig research</h2>
          <ul className="mt-5 space-y-3 text-sm leading-7 text-slate-600">
            <li>Søk, filtrering og selskapsprofiler</li>
            <li>Oversikt over virksomhetsdata, regnskap og struktur</li>
            <li>Begrenset visning i enkelte analyseblokker</li>
          </ul>
        </Card>

        <Card className="border-[rgba(15,23,42,0.08)] bg-[#192536] text-white">
          <p className="data-label text-[11px] font-semibold uppercase text-white/60">Utvidet</p>
          <h2 className="mt-4 text-[2rem] font-semibold">Mer komplett arbeidsflate for dypere analyse</h2>
          <ul className="mt-5 space-y-3 text-sm leading-7 text-white/76">
            <li>Fullere innsyn i roller og struktur når data er tilgjengelig</li>
            <li>Mer komplett visning for analyse og oppfølging</li>
            <li>Klargjort for tilgangsstyring på tvers av produktet</li>
          </ul>
          <div className="mt-6 rounded-[0.9rem] border border-white/10 bg-white/5 p-4 text-sm text-white/82">
            {premium
              ? "Denne brukeren er markert med utvidet tilgang."
              : "Utvidet tilgang kan aktiveres for brukere som trenger mer komplett innsyn."}
          </div>
        </Card>
      </div>
    </main>
  );
}
