import React from "react";
import { redirect } from "next/navigation";

import { AdminSubNav, type AdminSubNavGroup } from "@/app/(app)/admin/AdminSubNav";
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

  const isAdmin = reviewer.appRole === "ADMIN";

  // Only surfaces that actually exist belong here. The OCR-era admin routes
  // (filings, published-annual-reports, annual-report-reviews,
  // annual-report-unified-confidence, extraction-learning) were removed with
  // the Brreg-only pivot; linking to them produced 404s.
  const navGroups: AdminSubNavGroup[] = [
    {
      label: "Drift",
      items: [{ key: "overview", label: "Oversikt", href: "/admin" }],
    },
    {
      label: "Data",
      items: [
        { key: "mapping", label: "Regnskapsmapping", href: "/admin/metric-mapping" },
        { key: "events", label: "Selskapshendelser", href: "/admin/company-events" },
      ],
    },
    ...(isAdmin
      ? [
          {
            label: "System",
            items: [
              {
                key: "shareholders",
                label: "Aksjonærregister",
                href: "/admin/shareholder-register",
              },
              { key: "users", label: "Brukere og roller", href: "/admin/users" },
              { key: "ai-economics", label: "AI-økonomi", href: "/admin/ai-economics" },
              { key: "health", label: "Finansiell helse", href: "/admin/health-score" },
            ],
          },
        ]
      : []),
  ];

  // The app shell pads its content area by 24px; cancel that at the top so the
  // rail sits flush under the sticky header instead of floating on a strip of
  // page background.
  return (
    <div className="-mt-6">
      <AdminSubNav groups={navGroups} />
      {children}
    </div>
  );
}
