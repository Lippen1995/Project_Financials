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
    <main className="space-y-8 pb-10">
      <section className="grid gap-0 border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.78)] xl:grid-cols-[minmax(0,1.35fr),340px]">
        <div className="p-8">
          <div className="data-label inline-flex rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-3 py-1 text-[11px] font-semibold uppercase text-slate-600">
            Konto
          </div>
          <h1 className="editorial-display mt-5 max-w-4xl text-[3rem] leading-[0.98] text-slate-950 sm:text-[4rem]">
            Tilgang til skarp innsikt samlet i én arbeidsflate.
          </h1>
          <p className="mt-4 max-w-3xl text-[1.02rem] leading-8 text-slate-600">
            Her ser du hvilken tilgang brukeren har, når perioden løper ut og hvilke
            kontooplysninger som gjelder akkurat nå.
          </p>
        </div>

        <aside className="border-t border-[rgba(15,23,42,0.08)] bg-[#192536] p-8 text-white xl:border-l xl:border-t-0">
          <div className="data-label text-[11px] font-semibold uppercase text-white/60">
            Kontostatus
          </div>
          <div className="mt-4 text-[1.45rem] font-semibold leading-tight">
            {subscription?.status ? `Status: ${subscription.status}` : "Standard tilgang aktiv"}
          </div>
          <p className="mt-4 text-sm leading-7 text-white/76">
            Tilgangen bestemmer hvor mye av analyseflaten som er synlig for brukeren.
          </p>
        </aside>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.88)]">
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
            Brukerprofil
          </div>
          <h2 className="mt-4 text-[1.9rem] font-semibold text-slate-950">Kontoopplysninger</h2>
          <div className="mt-6 grid gap-4 text-sm text-slate-600 md:grid-cols-2">
            <div>
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Navn</div>
              <div className="mt-1 font-semibold text-slate-900">{session.user.name}</div>
            </div>
            <div>
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">E-post</div>
              <div className="mt-1 font-semibold text-slate-900">{session.user.email}</div>
            </div>
            <div>
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Plan</div>
              <div className="mt-1 font-semibold text-slate-900">{subscription?.plan ?? "Standard"}</div>
            </div>
            <div>
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Neste periode</div>
              <div className="mt-1 font-semibold text-slate-900">
                {formatDate(subscription?.currentPeriodEnd)}
              </div>
            </div>
          </div>
        </Card>

        <Card className="border-[rgba(15,23,42,0.08)] bg-[#F8FAFC]">
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
            Tilgang
          </div>
          <h2 className="mt-4 text-[1.9rem] font-semibold text-slate-950">Datagrunnlag du kan stole på</h2>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            Tilgangen styrer hvor mye av analyseflaten som er synlig, men innsikten bygger fortsatt
            på offisielle kilder og tydelige tomtilstander når data mangler.
          </p>
        </Card>
      </div>
    </main>
  );
}
