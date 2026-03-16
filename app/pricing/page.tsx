import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { isPremium } from "@/server/billing/subscription";

export default async function PricingPage() {
  const session = await auth();
  const premium = isPremium(session?.user.subscriptionStatus, session?.user.subscriptionPlan);

  return (
    <main className="space-y-6">
      <section className="rounded-[1.75rem] border border-white/70 bg-white/80 p-6 shadow-panel">
        <h1 className="text-4xl font-semibold tracking-tight">Tilgangsnivåer</h1>
        <p className="mt-3 max-w-2xl text-sm text-ink/70">
          ProjectX skiller mellom offentlig visning, innlogget visning og premium-gating. Dette MVP-et har ikke en ferdig betalingsflyt, men det har abonnementstilstand og feature gating i koden.
        </p>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ink/50">Free</p>
          <h2 className="mt-4 text-3xl font-semibold">Standard tilgang</h2>
          <ul className="mt-4 space-y-3 text-sm text-ink/70">
            <li>Åpne virksomhetsdata fra Brreg</li>
            <li>Søk, filter og selskapsprofiler</li>
            <li>Begrenset visning av roller i produktet</li>
          </ul>
        </Card>
        <Card className="bg-ink text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/60">Premium</p>
          <h2 className="mt-4 text-3xl font-semibold">Feature gating aktiv</h2>
          <ul className="mt-4 space-y-3 text-sm text-white/75">
            <li>Full rollevisning når kilden inneholder data</li>
            <li>Klargjort abonnementstilstand i auth-laget</li>
            <li>Betalingsflyt er ikke lansert i MVP-et</li>
          </ul>
          <div className="mt-6 rounded-2xl bg-white/10 p-4 text-sm text-white/80">
            {premium
              ? "Din bruker er markert som premium."
              : "Premium kan gates i applikasjonen, men kjøpsflyt er ikke eksponert i denne iterasjonen."}
          </div>
        </Card>
      </div>
    </main>
  );
}
