import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AdminControlCenterView from "@/app/(app)/admin/AdminControlCenterView";
import type { AdminControlCenterModel } from "@/server/services/admin-control-center-service";

const model: AdminControlCenterModel = {
  title: "Admin Control Center",
  subtitle:
    "Kontrollrom for Ã¥rsrapportflyt, manuell review og trygg utrulling av ny ekstraksjonsmotor.",
  generatedAt: "2026-05-10T12:00:00.000Z",
  summaryCards: [
    {
      key: "review-queue",
      title: "Rapporter i review-kÃ¸",
      value: "2",
      detail: "2 rapporter trenger manuell kontroll.",
      status: "WARNING",
      tone: "PURPLE",
      href: "/admin/annual-report-reviews",
    },
    {
      key: "failed",
      title: "Rapporter med feil",
      value: "1",
      detail: "1 rapport stoppet med feil.",
      status: "FAILING",
      tone: "RED",
    },
    {
      key: "latest-shadow-batch",
      title: "Siste shadow batch",
      value: "WARN",
      detail: "Sist lagret 2026-05-10 12:00.",
      status: "WARNING",
      tone: "PURPLE",
    },
    {
      key: "go-live-status",
      title: "Go-live status",
      value: "Under testing",
      detail: "Bygger pÃ¥ siste shadow batch.",
      status: "WARNING",
      tone: "PURPLE",
    },
    {
      key: "readiness-report",
      title: "Readiness report",
      value: "CONDITIONAL_GO",
      detail: "Blokkere: 1. Report: output/benchmarks/annual-report-go-no-go-readiness/latest.md",
      status: "WARNING",
      tone: "YELLOW",
    },
    {
      key: "publish-safety",
      title: "Publish safety mode",
      value: "Legacy-only publish",
      detail: "Legacy er fortsatt trygg publiseringskilde.",
      status: "HEALTHY",
      tone: "GREEN",
    },
  ],
  attentionTitle: "Hva trenger oppmerksomhet nÃ¥?",
  attentionItems: [],
  attentionEmptyState: "Ingen Ã¥pne problemer funnet basert pÃ¥ tilgjengelige data.",
  mainFlow: {
    title: "Fra Ã¥rsrapport til tall i databasen",
    subtitle:
      "Denne flyten viser hvordan systemet mottar en Ã¥rsrapport, leser innholdet, kontrollerer kvaliteten og lagrer godkjente tall i databasen.",
    nodes: [
      {
        key: "step-1",
        stepNumber: 1,
        title: "Rapport mottas",
        subtitle: "Systemet finner eller mottar en ny Ã¥rsrapport som skal behandles.",
        status: "HEALTHY",
        tone: "GREEN",
        metric: "1 rapport mottatt",
        typicalStatus: "GrÃ¸nn hvis rapporten er registrert.",
        helpSections: [
          { title: "Hva skjer her?", body: "En Ã¥rsrapport registreres i systemet." },
          { title: "Hvorfor er dette viktig?", body: "Dette er startpunktet for hele prosessen." },
          { title: "Hva kan gÃ¥ galt?", body: "Rapporten kan vÃ¦re koblet til feil selskap eller Ã¥r." },
          { title: "Hva gjÃ¸r admin?", body: "Sjekk at rapporten gjelder riktig selskap og riktig Ã¥r." },
        ],
      },
      {
        key: "step-8",
        stepNumber: 8,
        title: "MÃ¥ rapporten kontrolleres manuelt?",
        subtitle:
          "Systemet avgjÃ¸r om et menneske mÃ¥ kontrollere rapporten fÃ¸r tallene kan brukes.",
        status: "WARNING",
        tone: "YELLOW",
        metric: "1 rapport krever vurdering",
        typicalStatus: "Gul hvis mange saker krever review.",
        helpSections: [
          { title: "Hva skjer her?", body: "Dette er et beslutningspunkt." },
          { title: "Hvorfor er dette viktig?", body: "Manuell kontroll er sikkerhetsnettet." },
          { title: "Hva kan gÃ¥ galt?", body: "For mange rapporter kan havne i manuell kontroll." },
          { title: "Hva gjÃ¸r admin?", body: "Ã…pne review-kÃ¸en og behandle saken der." },
        ],
        decisionPaths: [
          {
            label: "Nei, kvaliteten er god nok",
            description: "Rapporten kan gÃ¥ videre til lagring.",
            targetStep: 10,
          },
          {
            label: "Ja, systemet er usikkert",
            description: "Rapporten gÃ¥r til manuell kontroll.",
            targetStep: 9,
          },
        ],
      },
      {
        key: "step-9",
        stepNumber: 9,
        title: "Manuell kontroll",
        subtitle: "En admin eller reviewer kontrollerer rapporter der systemet er usikkert.",
        status: "WARNING",
        tone: "PURPLE",
        metric: "2 i kÃ¸",
        typicalStatus: "Gul hvis mange saker venter.",
        helpSections: [
          { title: "Hva skjer her?", body: "Reviewer ser pÃ¥ originalrapporten og systemets forslag." },
          { title: "Hvorfor er dette viktig?", body: "Dette hindrer feil i databasen." },
          { title: "Hva kan gÃ¥ galt?", body: "Reviewer kan mangle nok dokumentasjon." },
          { title: "Hva gjÃ¸r admin?", body: "Kontroller de viktigste tallene mot PDF-en." },
        ],
        href: "/admin/annual-report-reviews",
      },
    ],
  },
  goLiveFlow: {
    title: "Veien mot go-live for ny ekstraksjonsmotor",
    subtitle:
      "Denne flyten viser hvordan vi tester, kontrollerer og gradvis ruller ut den nye ekstraksjonslÃ¸sningen pÃ¥ en trygg mÃ¥te.",
    nodes: [
      {
        key: "go-1",
        stepNumber: 1,
        title: "Bygg representativt testsett",
        subtitle:
          "Velg rapporter som dekker de viktigste typene Ã¥rsrapporter systemet mÃ¥ hÃ¥ndtere.",
        status: "UNKNOWN",
        tone: "BLUE",
        metric: "Ingen data funnet",
      },
      {
        key: "go-3",
        stepNumber: 3,
        title: "GjennomfÃ¸r manuell kontroll",
        subtitle: "Mennesker kontrollerer usikre eller avvikende resultater.",
        status: "WARNING",
        tone: "PURPLE",
        metric: "Ã…pne reviewsaker finnes",
        href: "/admin/annual-report-reviews",
      },
    ],
  },
  onboardingTitle: "Slik bruker du admin-siden",
  onboardingItems: [
    {
      stepNumber: 1,
      text: 'Start med flyten "Fra Ã¥rsrapport til tall i databasen".',
    },
  ],
  glossaryTitle: "Begreper",
  glossaryItems: [
    {
      term: "Legacy",
      definition: "Dagens etablerte ekstraksjonslÃ¸sning.",
    },
  ],
  legendTitle: "Statuslegend",
  legendItems: [
    {
      colorLabel: "GrÃ¸nn",
      tone: "GREEN",
      description: "Alt ser normalt ut.",
    },
  ],
  diagnostics: [],
};

describe("AdminControlCenterView", () => {
  it("renders the cockpit structure and operator-facing sections", () => {
    const html = renderToStaticMarkup(
      <AdminControlCenterView model={model} currentUserRole="ADMIN" />,
    );

    expect(html).toContain("Admin Control Center");
    expect(html).toContain("Prosessnavigator");
    expect(html).toContain("SÃ¸k i prosess, selskap eller rapport...");
    expect(html).toContain("Hva trenger oppmerksomhet nÃ¥?");
    expect(html).toContain("Fra Ã¥rsrapport til tall i databasen");
    expect(html).toContain("Veien mot go-live for ny ekstraksjonsmotor");
    expect(html).toContain("Readiness report");
    expect(html).toContain("Slik bruker du admin-siden");
    expect(html).toContain("Begreper");
    expect(html).toContain("Statusforklaring");
    expect(html).toContain("Ingen Ã¥pne problemer funnet basert pÃ¥ tilgjengelige data.");
  });

  it("renders the manual-review decision messaging for the selected step", () => {
    const decisionFirstModel: AdminControlCenterModel = {
      ...model,
      mainFlow: {
        ...model.mainFlow,
        nodes: [model.mainFlow.nodes[1], model.mainFlow.nodes[0], model.mainFlow.nodes[2]],
      },
    };
    const html = renderToStaticMarkup(
      <AdminControlCenterView model={decisionFirstModel} currentUserRole="ADMIN" />,
    );

    expect(html).toContain("MÃ¥ rapporten kontrolleres manuelt?");
    expect(html).toContain("Beslutningspunkt");
    expect(html).toContain("Nei, kvaliteten er god nok");
    expect(html).toContain("Ja, systemet er usikkert");
    expect(html).toContain("Manuell kontroll er et sikkerhetsnett.");
  });
});

