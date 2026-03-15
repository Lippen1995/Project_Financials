import type { Metadata } from "next";
import Link from "next/link";

import { auth } from "@/lib/auth";
import { AuthSessionProvider } from "@/components/providers/session-provider";
import { logoutAction } from "@/server/actions/auth-actions";

import "./globals.css";

export const metadata: Metadata = {
  title: "ProjectX",
  description: "ProjectX gir selskapsinformasjon, sok og innsikt for norske B2B-team.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html lang="nb">
      <body>
        <AuthSessionProvider>
          <div className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <header className="mb-8 flex flex-col gap-4 rounded-[2rem] border border-white/60 bg-white/80 px-6 py-5 shadow-panel backdrop-blur md:flex-row md:items-center md:justify-between">
              <div>
                <Link href="/" className="text-2xl font-semibold tracking-tight text-tide">
                  ProjectX
                </Link>
                <p className="text-sm text-ink/60">
                  Selskapsinnsikt med kildeprioritet, historikk og paywall.
                </p>
              </div>
              <nav className="flex flex-wrap items-center gap-3 text-sm font-medium text-ink/70">
                <Link href="/search" className="hover:text-tide">Sok</Link>
                <Link href="/pricing" className="hover:text-tide">Priser</Link>
                {session?.user ? (
                  <>
                    <Link href="/dashboard" className="hover:text-tide">Konto</Link>
                    <form action={logoutAction}>
                      <button type="submit" className="rounded-full border border-ink/10 px-4 py-2 hover:border-tide hover:text-tide">
                        Logg ut
                      </button>
                    </form>
                  </>
                ) : (
                  <Link href="/login" className="rounded-full bg-tide px-4 py-2 text-white hover:bg-tide/90">
                    Logg inn
                  </Link>
                )}
              </nav>
            </header>
            {children}
          </div>
        </AuthSessionProvider>
      </body>
    </html>
  );
}