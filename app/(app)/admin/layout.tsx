import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { safeAuth } from "@/lib/auth";
import { getFinancialReviewerOrNull } from "@/lib/admin-auth";

const ADMIN_LINKS = [
  { href: "/admin", label: "Admin" },
  { href: "/admin/annual-report-reviews", label: "Manuell kontroll" },
  { href: "/admin/annual-report-unified-confidence", label: "Unified kontroll" },
  { href: "/admin/pdf-decision-analytics", label: "PDF-vurdering" },
  { href: "/admin/pdf-parser-remediation", label: "Feil og forbedringer" },
];

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

  return (
    <div>
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-widest text-slate-400">
        {ADMIN_LINKS.map((link, index) => (
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
