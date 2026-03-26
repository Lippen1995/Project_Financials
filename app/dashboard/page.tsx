import { redirect } from "next/navigation";

import { Card } from "@/components/ui/card";
import { safeAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await safeAuth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const subscription = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
  });

  return (
    <main className="space-y-6 pb-10">
      <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.88)]">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Min konto</h1>
        <div className="mt-5 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
          <p>Navn: {session.user.name}</p>
          <p>E-post: {session.user.email}</p>
          <p>Plan: {subscription?.plan ?? "free"}</p>
          <p>Status: {subscription?.status ?? "FREE"}</p>
          <p>Neste periode: {formatDate(subscription?.currentPeriodEnd)}</p>
        </div>
      </Card>

      <Card className="border-[rgba(15,23,42,0.08)] bg-[#192536] text-white">
        <h2 className="text-2xl font-semibold">Kontostatus og tilgang</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/76">
          Her ser du hvilken tilgang kontoen har i dag, og når neste periode utløper dersom kontoen er satt opp med abonnement.
        </p>
      </Card>
    </main>
  );
}
