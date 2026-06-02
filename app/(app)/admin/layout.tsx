import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getFinancialReviewerOrNull } from "@/lib/admin-auth";
import { safeAuth } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await safeAuth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const reviewer = await getFinancialReviewerOrNull();
  if (!reviewer) {
    redirect("/dashboard");
  }

  const adminLinks = [
    { href: "/admin", label: "Oversikt" },
    { href: "/admin/filings", label: "Alle rapporter" },
    { href: "/admin/published-annual-reports", label: "Godkjente årsregnskaper" },
    { href: "/admin/annual-report-reviews", label: "Manuell kontroll" },
    ...(reviewer.appRole === "ADMIN"
      ? [{ href: "/admin/users", label: "Brukere og roller" }]
      : []),
    { href: "/admin/annual-report-unified-confidence", label: "Datakvalitet" },
    { href: "/admin/extraction-learning", label: "AI-modellen" },
    { href: "/admin/metric-mapping", label: "Regnskapsmapping" },
  ];

  return (
    <div>
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-widest text-slate-400">
        {adminLinks.map((link, index) => (
          <React.Fragment key={link.href}>
            {index > 0 ? <span>/</span> : null}
            <Link href={link.href as never} className="hover:text-slate-600">
              {link.label}
            </Link>
          </React.Fragment>
        ))}
      </nav>
      {children}
    </div>
  );
}
