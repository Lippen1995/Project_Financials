import { redirect } from "next/navigation";

import { Card } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const subscription = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
  });

  return (
    <main className="space-y-6">
      <Card>
        <h1 className="text-3xl font-semibold tracking-tight">Min konto</h1>
        <div className="mt-5 grid gap-3 text-sm text-ink/70 md:grid-cols-2">
          <p>Navn: {session.user.name}</p>
          <p>E-post: {session.user.email}</p>
          <p>Plan: {subscription?.plan ?? "free"}</p>
          <p>Status: {subscription?.status ?? "FREE"}</p>
          <p>Neste periode: {formatDate(subscription?.currentPeriodEnd)}</p>
        </div>
      </Card>
      <Card className="bg-gradient-to-br from-sand to-white">
        <h2 className="text-2xl font-semibold">Hva som er ekte i MVP-et</h2>
        <p className="mt-3 max-w-2xl text-sm text-ink/70">
          Virksomhetsdata kommer fra Brønnøysundregistrene. Næringskodebeskrivelser kommer fra SSB. Når åpne data ikke finnes for en seksjon, viser ProjectX tom tilstand i stedet for syntetisk innhold.
        </p>
      </Card>
    </main>
  );
}
