import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";

import { AuthSessionProvider } from "@/components/providers/session-provider";
import { safeAuth } from "@/lib/auth";
import { buildGlobalNavItems } from "@/lib/navigation";
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
  const primaryNavItems = buildGlobalNavItems(session?.user);

  return (
    <html lang="nb">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
        <AuthSessionProvider>
          <header className="sticky top-0 z-40 border-b border-[var(--px-border-subtle)] bg-[rgba(248,249,255,0.92)] backdrop-blur-sm">
            <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between px-4 sm:px-6 lg:px-10">
              <div className="flex items-center gap-8">
                <Link href="/" className="flex flex-col -space-y-0.5">
                  <span className="text-[1.1rem] font-semibold tracking-[-0.03em] text-[var(--px-text)]">
                    ProjectX
                  </span>
                  <span className="data-label text-[9px] text-[var(--px-muted)] opacity-70">
                    Enterprise
                  </span>
                </Link>

                <nav className="flex items-center gap-1">
                  {primaryNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href as never}
                      className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-[var(--px-muted)] transition-colors hover:bg-[var(--px-subtle)] hover:text-[var(--px-text)]"
                    >
                      <span className="material-symbols-outlined">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </nav>
              </div>

              <div className="flex items-center gap-1">
                {session?.user ? (
                  <>
                    <Link
                      href="/dashboard"
                      className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-[var(--px-muted)] transition-colors hover:bg-[var(--px-subtle)] hover:text-[var(--px-text)]"
                    >
                      <span className="material-symbols-outlined">account_circle</span>
                      <span>Konto</span>
                    </Link>
                    <form action={logoutAction}>
                      <button
                        type="submit"
                        className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-[var(--px-muted)] transition-colors hover:bg-[var(--px-subtle)] hover:text-[var(--px-text)]"
                      >
                        <span className="material-symbols-outlined">logout</span>
                        <span>Logg ut</span>
                      </button>
                    </form>
                    <div className="ml-3 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--px-accent)] text-xs font-bold text-white">
                      {session.user.name?.charAt(0).toUpperCase() ?? session.user.email?.charAt(0).toUpperCase() ?? "?"}
                    </div>
                  </>
                ) : (
                  <Link
                    href="/login"
                    className="rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--px-action-hover)]"
                  >
                    Logg inn
                  </Link>
                )}
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-10">
            {children}
          </div>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
