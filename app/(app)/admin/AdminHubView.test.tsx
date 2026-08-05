import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AdminHubView from "@/app/(app)/admin/AdminHubView";
import type { AdminHubModel } from "@/server/services/admin-hub-service";

const model: AdminHubModel = {
  title: "Kontrollsenter",
  subtitle: "Dekning, oppdatering og feil i den strukturerte regnskapshentingen.",
  generatedAt: "2026-08-05T18:00:00.000Z",
  metrics: [
    {
      key: "financial-coverage",
      title: "Regnskapsdekning",
      value: "68,6 %",
      detail: "7 422 av 10 817 virksomheter har minst ett offisielt regnskapsår.",
    },
    {
      key: "never-fetched",
      title: "Aldri hentet",
      value: "10 663",
      detail: "Virksomheter uten hentetilstand.",
    },
    {
      key: "due-for-refresh",
      title: "Klar for oppdatering",
      value: "154",
      detail: "154 hentetilstander finnes totalt.",
    },
    {
      key: "fetch-errors",
      title: "Kildefeil",
      value: "2",
      detail: "2 hentetilstander har minst ett registrert feilforsøk.",
    },
  ],
  coverage: [
    {
      key: "companies",
      label: "Virksomheter i basen",
      count: 10817,
      detail: "Selskaper vi har normalisert fra Brreg.",
      tone: "neutral",
    },
    {
      key: "with-financials",
      label: "Har offisielt regnskap",
      count: 7422,
      detail: "Siste registrerte regnskapsår er 2025.",
      tone: "success",
    },
    {
      key: "errors",
      label: "Kildefeil",
      count: 2,
      detail: "Siste henting mot Brreg feilet.",
      tone: "error",
    },
  ],
  coverageTotals: {
    companies: 10817,
    withFinancials: 7422,
    coveragePercent: 68.6,
    neverFetched: 10663,
  },
  actionItems: [
    {
      key: "fetch-errors",
      title: "Kildefeil mot Brreg",
      value: 2,
      detail: "Virksomheter der siste henting mot Brreg feilet.",
      urgent: true,
    },
    {
      key: "never-fetched",
      title: "Aldri hentet",
      value: 10663,
      detail: "Virksomheter i basen som aldri har vært gjennom regnskapshenting.",
      urgent: false,
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
      title: "Data og dekning",
      items: [
        {
          key: "metric-mapping",
          title: "Regnskapsmapping",
          eyebrow: "Data",
          description: "Koble kildelabels til standardiserte regnskapsnøkler.",
          href: "/admin/metric-mapping",
          actionLabel: "Åpne mapping",
          available: true,
        },
        {
          key: "ingestion-coverage",
          title: "Dekningsrapport",
          eyebrow: "Rapport",
          description: "Kjøres i dag som skript.",
          available: false,
          restrictionLabel: "Kjøres som skript",
        },
      ],
    },
    {
      title: "System og tilgang",
      items: [
        {
          key: "ai-economics",
          title: "AI-økonomi",
          eyebrow: "Njord",
          description: "Styr AI-budsjett og kvoter.",
          href: "/admin/ai-economics",
          actionLabel: "Åpne AI-økonomi",
          available: true,
        },
        {
          key: "users",
          title: "Brukere og roller",
          eyebrow: "Tilgang",
          description: "12 brukere · 2 admins · 3 reviewere.",
          href: "/admin/users",
          actionLabel: "Administrer brukere",
          available: true,
        },
      ],
    },
  ],
  humanSteps: [
    {
      key: "metric-mapping",
      title: "Regnskapsmapping",
      description: "Koble kildelabels fra Brreg til standardiserte regnskapsnøkler.",
      href: "/admin/metric-mapping",
      actionLabel: "Åpne mapping",
    },
  ],
  recentActivity: [
    {
      key: "latest-available-fetch",
      title: "Siste vellykkede henting",
      description: "Nordic AS · 2025",
      timestamp: "05.08.2026, 18:00:00",
      href: "/companies/nordic-as",
    },
  ],
};

describe("AdminHubView", () => {
  it("renders coverage, metrics, navigation and human review sections", () => {
    const html = renderToStaticMarkup(<AdminHubView model={model} canManageAiEconomics />);

    expect(html).toContain("Kontrollsenter");
    expect(html).toContain("Regnskapshenting fra Brreg");
    expect(html).toContain("Regnskapsdekning");
    expect(html).toContain("Brukere og roller");
    expect(html).toContain("Regnskapsmapping");
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

  it("renders unavailable navigation items without a link", () => {
    const html = renderToStaticMarkup(<AdminHubView model={model} canManageAiEconomics />);

    expect(html).toContain("Kjøres som skript");
    expect(html).not.toContain('href="/admin/ingestion-coverage"');
  });

  it("does not link to retired OCR admin surfaces", () => {
    const html = renderToStaticMarkup(<AdminHubView model={model} canManageAiEconomics />);

    for (const retired of [
      "/admin/annual-report-reviews",
      "/admin/published-annual-reports",
      "/admin/filings",
      "/admin/extraction-learning",
      "/admin/annual-report-unified-confidence",
      "/admin/pdf-decision-analytics",
      "/admin/pdf-parser-remediation",
      "/admin/pdf-model-candidates",
    ]) {
      expect(html).not.toContain(retired);
    }
  });
});
