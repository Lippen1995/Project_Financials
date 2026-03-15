import Link from "next/link";

import { SearchForm } from "@/components/search/search-form";
import { Card } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <Card className="overflow-hidden bg-gradient-to-br from-white to-sand">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ember">ProjectX MVP</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-ink sm:text-5xl">Sok, analyser og monitorer norske selskaper med tydelig kildegrunnlag.</h1>
          <p className="mt-4 max-w-2xl text-base text-ink/70">ProjectX kombinerer Bronnoysundregistrene, SSB-kodeverk og en premium paywall i en moderne B2B-opplevelse for oppslag og innsikt.</p>
          <div className="mt-8 max-w-2xl"><SearchForm /></div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/search" className="rounded-full bg-tide px-5 py-3 text-sm font-semibold text-white">Utforsk selskaper</Link>
            <Link href="/pricing" className="rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold text-ink">Se premium</Link>
          </div>
        </Card>
        <div className="grid gap-4">
          <Card className="bg-ink text-white">
            <p className="text-sm text-white/70">Kildeprioritet</p>
            <p className="mt-3 text-2xl font-semibold">Brreg som source of truth</p>
            <p className="mt-3 text-sm text-white/70">Provider-lag stotter live oppslag mot Bronnoysundregistrene og fallback til seed-data.</p>
          </Card>
          <Card>
            <p className="text-sm text-ink/60">Gratis vs premium</p>
            <p className="mt-3 text-2xl font-semibold">Feature gating pa profilniva</p>
            <p className="mt-3 text-sm text-ink/70">Gratisbrukere ser basisdata, premium apner full historikk, regnskap og dypere innsikt.</p>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {["Globalt sok og filtrering", "Profiler med roller og regnskap", "Auth, abonnement og paywall"].map((item) => (
          <Card key={item} className="p-5"><p className="text-lg font-semibold">{item}</p></Card>
        ))}
      </section>
    </main>
  );
}