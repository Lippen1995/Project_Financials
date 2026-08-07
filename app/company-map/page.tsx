import type { Metadata } from "next";
import Link from "next/link";

import { CompanyMapExplorer } from "@/components/company-map/company-map-explorer";

export const metadata: Metadata = {
  title: "Norwegian company map | Fjord Insight",
  description:
    "Explore Norwegian companies by business registered address and compare their latest published financial metrics.",
};

export default function CompanyMapPage() {
  return (
    <div className="min-h-screen bg-[var(--px-bg)] text-[var(--px-text)]">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-full bg-[var(--px-action)] px-4 py-3 text-[var(--px-surface)] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
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
              Company map
            </span>
            <Link
              href="/login"
              className="min-h-11 rounded-full border border-[var(--px-border)] px-4 py-3 text-sm font-semibold hover:bg-[var(--px-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)]"
            >
              Log in
            </Link>
          </nav>
        </div>
      </header>
      <CompanyMapExplorer />
    </div>
  );
}
