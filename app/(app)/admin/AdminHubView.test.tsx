import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AdminHubView from "@/app/(app)/admin/AdminHubView";
import type { AdminHubModel } from "@/server/services/admin-hub-service";

const model: AdminHubModel = {
  title: "Adminhub",
  subtitle: "Oversikt over rapportflyt, manuell kontroll, publisering og adminoppgaver.",
  generatedAt: "2026-05-21T18:00:00.000Z",
  metrics: [
    { key: "uploaded", title: "Opplastede rapportfiler", value: "12", detail: "Siste batch i dag." },
    { key: "manual", title: "Til manuell kontroll nå", value: "3", detail: "9 beslutninger totalt." },
    { key: "auto", title: "Publisert uten manuell korrigering", value: "7", detail: "4 helautomatiske og 3 vurderte uten endring." },
    { key: "corrected", title: "Publisert etter manuell korrigering", value: "2", detail: "Krever oppfølging." },
    { key: "failed", title: "Feilet eller stoppet", value: "1", detail: "Stoppet i behandling." },
  ],
  pipeline: [
    {
      status: "MANUAL_REVIEW",
      label: "Til manuell kontroll",
      count: 3,
      href: "/admin/annual-report-reviews",
      tone: "warning",
    },
    {
      status: "FAILED",
      label: "Feilet",
      count: 1,
      href: "/admin/annual-report-reviews?status=failed",
      tone: "error",
    },
    {
      status: "PROCESSING",
      label: "Under behandling",
      count: 2,
      href: "/admin/annual-report-reviews?status=processing",
      tone: "active",
    },
    {
      status: "PUBLISHED",
      label: "Publisert",
      count: 7,
      href: "/admin/published-annual-reports",
      tone: "success",
    },
  ],
  userStats: {
    total: 12,
    admins: 2,
    reviewers: 3,
    regularUsers: 7,
  },
  navigationSections: [
    {
      title: "Daglig drift",
      items: [
        {
          key: "overview",
          title: "Oversikt",
          description: "Start her.",
          href: "/admin",
          available: true,
        },
        {
          key: "users",
          title: "Brukere og roller",
          description: "Administrer globale roller.",
          href: "/admin/users",
          available: true,
        },
        {
          key: "app-statistics",
          title: "App-statistikk",
          description: "Kommer senere.",
          available: false,
          restrictionLabel: "Ikke tilgjengelig ennå",
        },
      ],
    },
  ],
  humanSteps: [
    {
      key: "review",
      title: "Manuell kontroll av rapporter",
      description: "Åpne kontrollkøen.",
      href: "/admin/annual-report-reviews",
      actionLabel: "Åpne kontrollkøen",
    },
  ],
  recentActivity: [
    {
      key: "publication",
      title: "Siste publisering",
      description: "Nordic AS · 2024",
      timestamp: "21.05.2026, 18:00:00",
      href: "/admin/published-annual-reports",
    },
  ],
};

describe("AdminHubView", () => {
  it("renders the admin hub metrics, navigation and human review section", () => {
    const html = renderToStaticMarkup(
      <AdminHubView model={model} canManageAiEconomics />,
    );

    expect(html).toContain("Adminhub");
    expect(html).toContain("Opplastede rapportfiler");
    expect(html).toContain("Brukere og roller");
    expect(html).toContain("AI-modellen");
    expect(html).toContain("Kostnader og inntekter");
    expect(html).toContain("/admin/ai-economics");
    expect(html).toContain("Krever tiltak");
    expect(html).toContain("Siste aktivitet");
  });

  it("hides AI economics controls from financial reviewers", () => {
    const html = renderToStaticMarkup(
      <AdminHubView model={model} canManageAiEconomics={false} />,
    );

    expect(html).not.toContain("/admin/ai-economics");
  });
});
