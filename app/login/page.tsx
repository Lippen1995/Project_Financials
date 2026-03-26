import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <main className="grid gap-6 pb-10 lg:grid-cols-[minmax(0,1.1fr),minmax(0,0.9fr)]">
      <section className="grid gap-0 border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.78)]">
        <div className="p-8">
          <div className="data-label inline-flex rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-3 py-1 text-[11px] font-semibold uppercase text-slate-600">
            Tilgang til ProjectX
          </div>
          <h1 className="editorial-display mt-5 max-w-3xl text-[3rem] leading-[0.98] text-slate-950 sm:text-[4rem]">
            Logg inn for å fortsette arbeidet i ProjectX.
          </h1>
          <p className="mt-4 max-w-2xl text-[1.02rem] leading-8 text-slate-600">
            Få tilgang til selskapsprofiler, analyseflater og kontoinnstillinger i ett samlet arbeidsmiljø.
          </p>
        </div>
        <div className="border-t border-[rgba(15,23,42,0.08)] p-8">
          <LoginForm mode="login" />
        </div>
      </section>

      <Card className="border-[rgba(15,23,42,0.08)] bg-[#192536] text-white">
        <p className="data-label text-[11px] font-semibold uppercase text-white/60">Ny bruker</p>
        <h2 className="mt-4 text-[2rem] font-semibold">Opprett konto for team og individuell bruk</h2>
        <p className="mt-4 text-sm leading-7 text-white/76">
          Nye brukere får tilgang til produktets standardnivå og kan senere utvides ved behov.
        </p>
        <div className="mt-8 rounded-[0.95rem] border border-white/10 bg-white/5 p-6">
          <LoginForm mode="register" />
        </div>
        <Link
          href="/pricing"
          className="mt-6 inline-flex text-sm font-semibold text-white underline underline-offset-4"
        >
          Se tilgangsnivåer
        </Link>
      </Card>
    </main>
  );
}
