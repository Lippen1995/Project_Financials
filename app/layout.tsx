import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";

import { AuthSessionProvider } from "@/components/providers/session-provider";
import { safeAuth } from "@/lib/auth";
import { logoutAction } from "@/server/actions/auth-actions";

import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const serif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-serif",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "ProjectX",
  description: "Skarp innsikt for kritiske forretningsbeslutninger.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await safeAuth();

  return (
    <html lang="nb">
      <body className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
        <AuthSessionProvider>
          <div className="mx-auto min-h-screen max-w-[1480px] px-4 py-5 sm:px-6 lg:px-10">
            <header className="mb-8 border-b border-[rgba(15,23,42,0.08)] pb-5">
              <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
                <div className="grid gap-2">
                  <Link href="/" className="text-[1.85rem] font-semibold tracking-[-0.03em] text-[#162233]">
                    ProjectX
                  </Link>
                  <p className="max-w-2xl text-sm leading-6 text-slate-500">
                    Skarp innsikt for kritiske forretningsbeslutninger.
                  </p>
                </div>

                <nav className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
                  <Link href="/search" className="rounded-full px-3 py-2 hover:bg-white hover:text-slate-950">
                    Søk
                  </Link>
                  <Link
                    href="/market/distress"
                    className="rounded-full px-3 py-2 hover:bg-white hover:text-slate-950"
                  >
                    Distress
                  </Link>
                  <Link
                    href="/market/oil-gas"
                    className="rounded-full px-3 py-2 hover:bg-white hover:text-slate-950"
                  >
                    Olje &amp; gass
                  </Link>
                  <Link href="/pricing" className="rounded-full px-3 py-2 hover:bg-white hover:text-slate-950">
                    Tilgang
                  </Link>
                  {session?.user ? (
                    <>
                      <Link href="/dashboard" className="rounded-full px-3 py-2 hover:bg-white hover:text-slate-950">
                        Konto
                      </Link>
                      <form action={logoutAction}>
                        <button
                          type="submit"
                          className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2 text-slate-700 hover:border-[rgba(15,23,42,0.18)] hover:text-slate-950"
                        >
                          Logg ut
                        </button>
                      </form>
                    </>
                  ) : (
                    <Link
                      href="/login"
                      className="rounded-full bg-[#162233] px-4 py-2 text-white hover:bg-[#223246]"
                    >
                      Logg inn
                    </Link>
                  )}
                </nav>
              </div>
            </header>
            {children}
          </div>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
