import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { isPremium } from "@/server/billing/subscription";

export default async function PricingPage() {
  const session = await auth();
  const premium = isPremium(session?.user.subscriptionStatus, session?.user.subscriptionPlan);

  return (
    <main className="space-y-6">
      <section className="rounded-[1.75rem] border border-white/70 bg-white/80 p-6 shadow-panel">
        <h1 className="text-4xl font-semibold tracking-tight">Priser</h1>
        <p className="mt-3 max-w-2xl text-sm text-ink/70">ProjectX har en enkel abonnementsmodell med gratis tilgang til basisoppslag og premium for dypere innsikt, historikk og flere roller.</p>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ink/50">Free</p>
          <h2 className="mt-4 text-3xl font-semibold">0 kr</h2>
          <ul className="mt-4 space-y-3 text-sm text-ink/70">
            <li>Basisinformasjon om selskaper</li>
            <li>Begrenset historikk og nokkeltall</li>
            <li>Smakebit pa roller og styre</li>
          </ul>
        </Card>
        <Card className="bg-ink text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/60">Premium</p>
          <h2 className="mt-4 text-3xl font-semibold">Kontakt salg / Stripe-ready</h2>
          <ul className="mt-4 space-y-3 text-sm text-white/75">
            <li>Full historikk i regnskapstabeller og grafer</li>
            <li>Alle registrerte roller og styreinformasjon</li>
            <li>Klar for Stripe Checkout nar nokler legges inn</li>
          </ul>
          <div className="mt-6 rounded-2xl bg-white/10 p-4 text-sm text-white/80">
            {premium ? "Du har allerede premiumtilgang i denne demoen." : "Stripe-klient er kapslet inn i billing-laget. Uten nokler brukes mock subscription state."}
          </div>
        </Card>
      </div>
    </main>
  );
}