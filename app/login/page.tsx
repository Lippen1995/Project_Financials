import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <main className="grid gap-6 lg:grid-cols-2">
      <Card className="bg-gradient-to-br from-white to-sand">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ember">Innlogging</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Fa tilgang til premium innsikt</h1>
        <p className="mt-4 text-sm text-ink/70">Demo-brukere: free@projectx.local og premium@projectx.local, begge med passord projectx-demo.</p>
        <div className="mt-8"><LoginForm mode="login" /></div>
      </Card>
      <Card>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-tide">Registrering</p>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight">Opprett konto</h2>
        <p className="mt-4 text-sm text-ink/70">Nye brukere far gratisplan med begrenset historikk og paywall for premium-seksjoner.</p>
        <div className="mt-8"><LoginForm mode="register" /></div>
        <p className="mt-4 text-sm text-ink/55">Ved a registrere deg aksepterer du ProjectX sine vilkar for testbruk og lokal utvikling.</p>
        <Link href="/pricing" className="mt-6 inline-flex text-sm font-semibold text-tide">Se abonnement</Link>
      </Card>
    </main>
  );
}