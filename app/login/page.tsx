import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <main className="grid gap-6 lg:grid-cols-2">
      <Card className="bg-gradient-to-br from-white to-sand">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ember">Innlogging</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Logg inn for mer ProjectX-tilgang</h1>
        <p className="mt-4 text-sm text-ink/70">
          Det finnes ingen seedede demo-brukere i dette repoet. Opprett en konto for lokal bruk av auth- og feature gating-flyten.
        </p>
        <div className="mt-8">
          <LoginForm mode="login" />
        </div>
      </Card>
      <Card>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-tide">Registrering</p>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight">Opprett konto</h2>
        <p className="mt-4 text-sm text-ink/70">
          Nye brukere får gratisplan. Premium er foreløpig enkel feature gating i produktet, ikke en ferdig kjøpsflyt.
        </p>
        <div className="mt-8">
          <LoginForm mode="register" />
        </div>
        <Link href="/pricing" className="mt-6 inline-flex text-sm font-semibold text-tide">
          Se tilgangsnivåer
        </Link>
      </Card>
    </main>
  );
}
