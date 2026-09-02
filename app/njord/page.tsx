import type { Metadata } from "next";
import Link from "next/link";

import { buildAppSessionTopNavigation } from "@/components/navigation/app-session-top-navigation";
import { NjordIntroPage } from "@/components/njord/njord-intro-page";
import { safeAuth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Bli kjent med Njord | Fjord Insight",
  description:
    "Njord er den digitale analytikeren i Fjord Insight. Se hvordan han arbeider på tvers av offentlige registre, hvorfor hvert svar viser grunnlaget sitt — og hvor navnet kommer fra.",
};

/**
 * Introsiden ligger utenfor `(app)`-gruppen fordi seksjonene går i full bredde: den mørke
 * panelbakgrunnen skal nå helt ut i kanten, ikke stoppe ved innholdsbeholderen.
 */
function PublicNjordNavigation() {
  return (
    <header className="border-b border-[var(--px-border)] bg-[var(--px-surface)]">
      <div className="mx-auto flex min-h-16 max-w-[1480px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)]"
        >
          Fjord Insight
        </Link>
        <nav aria-label="Public navigation" className="flex items-center gap-4">
          <span aria-current="page" className="text-sm font-semibold text-[var(--px-accent)]">
            Njord
          </span>
          <Link
            href="/login"
            className="min-h-11 rounded-full border border-[var(--px-border)] px-4 py-3 text-sm font-semibold hover:bg-[var(--px-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)]"
          >
            Logg inn
          </Link>
        </nav>
      </div>
    </header>
  );
}

export default async function NjordPage() {
  const session = await safeAuth();
  const topNavigation = session?.user
    ? await buildAppSessionTopNavigation(session.user)
    : null;

  return (
    <div className="min-h-screen bg-[var(--px-bg)] text-[var(--px-text)]">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-full bg-[var(--px-action)] px-4 py-3 text-[var(--px-surface)] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Hopp til hovedinnhold
      </a>
      {topNavigation ?? <PublicNjordNavigation />}
      <main id="main-content">
        <NjordIntroPage />
      </main>
    </div>
  );
}
