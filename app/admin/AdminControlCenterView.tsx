"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type {
  AdminAttentionItem,
  AdminControlCenterModel,
  AdminControlCenterStatus,
  AdminFlowHelpSection,
  AdminFlowNode,
  AdminGlossaryItem,
  AdminLegendItem,
  AdminSummaryCard,
  AdminVisualTone,
} from "@/server/services/admin-control-center-service";

type AdminControlCenterViewProps = {
  model: AdminControlCenterModel;
  currentUserRole: string;
};

function toneClasses(tone: AdminVisualTone) {
  switch (tone) {
    case "GREEN":
      return "border-green-200 bg-green-50 text-green-700";
    case "YELLOW":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "RED":
      return "border-red-200 bg-red-50 text-red-700";
    case "PURPLE":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "BLUE":
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function statusLabel(status: AdminControlCenterStatus) {
  switch (status) {
    case "HEALTHY":
      return "Alt ser bra ut";
    case "WARNING":
      return "Trenger oppmerksomhet";
    case "FAILING":
      return "Feil oppdaget";
    case "BLOCKED":
      return "Blokkert";
    case "NOT_STARTED":
      return "Ikke startet";
    case "UNKNOWN":
    default:
      return "Ukjent";
  }
}

function attentionTone(severity: AdminAttentionItem["severity"]): AdminVisualTone {
  switch (severity) {
    case "HIGH":
      return "RED";
    case "MEDIUM":
      return "YELLOW";
    case "LOW":
      return "PURPLE";
    case "INFO":
    default:
      return "BLUE";
  }
}

function findHelpSection(
  node: AdminFlowNode,
  title: string,
): AdminFlowHelpSection | undefined {
  return node.helpSections?.find((section) => section.title === title);
}

function buildStepExample(node: AdminFlowNode) {
  const examples: Record<string, string> = {
    "report-received":
      "Eksempel: En årsrapport kommer inn med riktig organisasjonsnummer og riktig regnskapsår, og kan derfor spores videre i flyten.",
    "artifact-linking":
      "Eksempel: Systemet finner riktig PDF for samme selskap og år, og kobler den til tidligere mellomresultater uten å bruke usikker fallback.",
    "pdf-quality":
      "Eksempel: En digital PDF med tydelig tekstlag og lesbare tabeller får grønn status og kan behandles videre automatisk.",
    "parser-choice":
      "Eksempel: En enkel digital rapport sendes til en direkte lesemetode, mens en vanskelig skannet rapport krever mer forsiktig behandling.",
    "extract-values":
      "Eksempel: Systemet finner driftsinntekter, årsresultat og balansetall i riktig seksjon og gjør dem om til strukturert data.",
    "compare-results":
      "Eksempel: Legacy og unified finner de samme hovedtallene, slik at saken kan vurderes som stabil i shadow-sammenligningen.",
    "quality-gate":
      "Eksempel: En rapport med gode hovedtall og uten store avvik får pass i kvalitetssjekken og trenger ikke ekstra kontroll.",
    "manual-review-decision":
      "Eksempel: Hvis systemet er usikkert på enhetsskala eller mangler sentrale linjer, sendes rapporten til manuell kontroll før videre bruk.",
    "manual-review":
      "Eksempel: Reviewer åpner PDF-en, sammenligner de viktigste linjene mot systemets forslag og registrerer en tydelig beslutning.",
    "store-approved":
      "Eksempel: Godkjente tall lagres med sporbarhet tilbake til rapport, dokument og review-beslutning.",
    "available-in-product":
      "Eksempel: Etter godkjenning kan tallene vises på selskapssiden og brukes i søk og analyser uten at brukeren ser rå PDF-data.",
  };

  return (
    examples[node.key] ??
    "Eksempel: En sak med tydelig grunnlag i dette steget kan gå trygt videre til neste kontroll uten å bruke oppdiktede data."
  );
}

function getFlowStats(nodes: AdminFlowNode[]) {
  return nodes.reduce(
    (acc, node) => {
      if (node.status === "HEALTHY") {
        acc.healthy += 1;
      } else if (
        node.status === "WARNING" ||
        node.status === "FAILING" ||
        node.status === "BLOCKED"
      ) {
        acc.attention += 1;
      } else {
        acc.unknown += 1;
      }
      return acc;
    },
    { healthy: 0, attention: 0, unknown: 0 },
  );
}

function StatusBadge({
  status,
  tone,
}: {
  status: AdminControlCenterStatus;
  tone: AdminVisualTone;
}) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClasses(tone)}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function MetaChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: AdminVisualTone;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium ${toneClasses(tone)}`}
    >
      <span className="uppercase tracking-widest text-[10px] opacity-70">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function SummaryCard({ card }: { card: AdminSummaryCard }) {
  const content = (
    <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-widest text-slate-400">
            {card.title}
          </div>
          <div className="mt-3 text-2xl font-semibold tracking-tight text-[#162233]">
            {card.value}
          </div>
        </div>
        <StatusBadge status={card.status} tone={card.tone} />
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-500">{card.detail}</p>
    </div>
  );

  if (!card.href) {
    return content;
  }

  return <Link href={card.href as never}>{content}</Link>;
}

function AttentionRow({ item }: { item: AdminAttentionItem }) {
  const tone = attentionTone(item.severity);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)] lg:flex-row lg:items-start lg:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClasses(tone)}`}
          >
            {item.severity}
          </span>
          <div className="text-sm font-semibold text-[#162233]">{item.title}</div>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
      </div>
      {item.href ? (
        <Link
          href={item.href as never}
          className="rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Åpne
        </Link>
      ) : null}
    </div>
  );
}

function InfoCard({
  title,
  body,
  tone = "BLUE",
}: {
  title: string;
  body: string;
  tone?: AdminVisualTone;
}) {
  return (
    <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.03)]">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-2.5 w-2.5 rounded-full ${tone === "GREEN" ? "bg-green-500" : tone === "YELLOW" ? "bg-amber-500" : tone === "RED" ? "bg-red-500" : tone === "PURPLE" ? "bg-violet-500" : "bg-slate-400"}`}
        />
        <div className="text-xs font-medium uppercase tracking-widest text-slate-400">
          {title}
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>
    </div>
  );
}

function StepPill({ stepNumber }: { stepNumber: number }) {
  return (
    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#162233] text-sm font-semibold text-white shadow-[0_10px_20px_rgba(22,34,51,0.16)]">
      {stepNumber}
    </span>
  );
}

function SidebarStepButton({
  node,
  active,
  onSelect,
}: {
  node: AdminFlowNode;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border p-4 text-left transition ${
        active
          ? "border-[#162233] bg-[#eef3f8] shadow-[0_10px_20px_rgba(22,34,51,0.08)]"
          : "border-[rgba(15,23,42,0.08)] bg-white hover:border-[rgba(22,34,51,0.18)] hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <StepPill stepNumber={node.stepNumber} />
          <div>
            <div className="text-sm font-semibold text-[#162233]">{node.title}</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">{node.metric}</div>
          </div>
        </div>
        <StatusBadge status={node.status} tone={node.tone} />
      </div>
    </button>
  );
}

function CompactFlowStep({
  node,
  active,
  onSelect,
}: {
  node: AdminFlowNode;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-2xl border px-3 py-3 text-left transition ${
        active
          ? "border-[#162233] bg-[#162233] text-white"
          : "border-[rgba(15,23,42,0.08)] bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      <div className="text-[11px] font-medium uppercase tracking-widest opacity-75">
        Steg {String(node.stepNumber).padStart(2, "0")}
      </div>
      <div className="mt-2 text-sm font-semibold">{node.title}</div>
    </button>
  );
}

function GlossaryCard({ item }: { item: AdminGlossaryItem }) {
  return (
    <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.03)]">
      <div className="text-sm font-semibold text-[#162233]">{item.term}</div>
      <p className="mt-2 text-sm leading-6 text-slate-500">{item.definition}</p>
    </div>
  );
}

function LegendCard({ item }: { item: AdminLegendItem }) {
  return (
    <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.03)]">
      <span
        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClasses(item.tone)}`}
      >
        {item.colorLabel}
      </span>
      <p className="mt-3 text-sm leading-6 text-slate-500">{item.description}</p>
    </div>
  );
}

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-5">
      <h2 className="text-2xl font-semibold tracking-tight text-[#162233]">{title}</h2>
      {subtitle ? (
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">{subtitle}</p>
      ) : null}
    </div>
  );
}

export default function AdminControlCenterView({
  model,
  currentUserRole,
}: AdminControlCenterViewProps) {
  const [query, setQuery] = useState("");
  const [selectedStepKey, setSelectedStepKey] = useState(model.mainFlow.nodes[0]?.key ?? "");

  const filteredMainFlowNodes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return model.mainFlow.nodes;
    }

    return model.mainFlow.nodes.filter((node) => {
      const searchableText = [
        node.title,
        node.subtitle,
        node.metric,
        node.typicalStatus,
        ...(node.helpSections?.map((section) => `${section.title} ${section.body}`) ?? []),
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedQuery);
    });
  }, [model.mainFlow.nodes, query]);

  useEffect(() => {
    if (!filteredMainFlowNodes.some((node) => node.key === selectedStepKey)) {
      setSelectedStepKey(filteredMainFlowNodes[0]?.key ?? model.mainFlow.nodes[0]?.key ?? "");
    }
  }, [filteredMainFlowNodes, model.mainFlow.nodes, selectedStepKey]);

  const selectedNode =
    filteredMainFlowNodes.find((node) => node.key === selectedStepKey) ??
    model.mainFlow.nodes.find((node) => node.key === selectedStepKey) ??
    model.mainFlow.nodes[0];

  const selectedNodeIndex = model.mainFlow.nodes.findIndex(
    (node) => node.key === selectedNode?.key,
  );
  const nextNode =
    selectedNodeIndex >= 0 && selectedNodeIndex < model.mainFlow.nodes.length - 1
      ? model.mainFlow.nodes[selectedNodeIndex + 1]
      : null;

  const mainFlowStats = getFlowStats(model.mainFlow.nodes);
  const publishSafetyCard = model.summaryCards.find((card) => card.key === "publish-safety");
  const latestShadowBatchCard = model.summaryCards.find(
    (card) => card.key === "latest-shadow-batch",
  );
  const goLiveStatusCard = model.summaryCards.find((card) => card.key === "go-live-status");
  const reviewQueueCard = model.summaryCards.find((card) => card.key === "review-queue");
  const failedCard = model.summaryCards.find((card) => card.key === "failed");
  const latestShadowBatchHeaderValue = latestShadowBatchCard?.detail?.startsWith("Sist lagret ")
    ? latestShadowBatchCard.detail.replace("Sist lagret ", "").replace(/\.$/, "")
    : latestShadowBatchCard?.value ?? "Ukjent";

  const visibleSummaryCards: AdminSummaryCard[] = [
    reviewQueueCard,
    failedCard,
    latestShadowBatchCard,
    goLiveStatusCard,
    publishSafetyCard,
    {
      key: "unified-mode",
      title: "Unified mode",
      value: "Unified shadow-only",
      detail:
        "Unified-resultater brukes kun til shadow, evaluering og sammenligning i denne første admin-versjonen.",
      status: "HEALTHY",
      tone: "GREEN",
    },
  ].filter(Boolean) as AdminSummaryCard[];

  const roadmapStatusItems = [
    {
      label: "PR71–PR75",
      status: "Done",
      tone: "GREEN" as const,
      detail: "Go-live shadow batch foundation finnes i repoet.",
    },
    {
      label: "PR76",
      status: "Current",
      tone: "PURPLE" as const,
      detail: "Admin review visibility og operatørflyt bygges ut nå.",
    },
    {
      label: "PR77–PR79",
      status: "Pending",
      tone: "BLUE" as const,
      detail: "Kalibrering, feiltyper og største extraction-feil følger etter review-runden.",
    },
    {
      label: "PR80–PR87",
      status: "Pending",
      tone: "BLUE" as const,
      detail: "Readiness, canary, feature flag, publish gate og gradvis utrulling gjenstår.",
    },
  ];

  const exampleText = selectedNode ? buildStepExample(selectedNode) : "Ukjent";
  const whatHappens = selectedNode ? findHelpSection(selectedNode, "Hva skjer her?")?.body : "";
  const whyImportant = selectedNode
    ? findHelpSection(selectedNode, "Hvorfor er dette viktig?")?.body
    : "";
  const whatCanGoWrong = selectedNode
    ? findHelpSection(selectedNode, "Hva kan gå galt?")?.body
    : "";
  const whatAdminDoes = selectedNode
    ? findHelpSection(selectedNode, "Hva gjør admin?")?.body
    : "";

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white p-6 shadow-[0_22px_60px_rgba(15,23,42,0.06)] md:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#162233]">
              {model.title}
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-500">
              {model.subtitle}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <MetaChip
                label="Publish mode"
                value={publishSafetyCard?.value ?? "Legacy-only publish"}
                tone={publishSafetyCard?.tone ?? "GREEN"}
              />
              <MetaChip label="Unified mode" value="Shadow-only" tone="GREEN" />
              <MetaChip label="Rolle" value={currentUserRole} tone="BLUE" />
              <MetaChip
                label="Latest shadow batch"
                value={latestShadowBatchHeaderValue}
                tone={latestShadowBatchCard?.tone ?? "BLUE"}
              />
            </div>
          </div>

          <div className="w-full max-w-md rounded-2xl border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] p-4">
            <label
              htmlFor="admin-control-center-search"
              className="text-xs font-medium uppercase tracking-widest text-slate-400"
            >
              Prosessøk
            </label>
            <input
              id="admin-control-center-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Søk i prosess, selskap eller rapport..."
              className="mt-3 w-full rounded-2xl border border-[rgba(15,23,42,0.12)] bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[rgba(22,34,51,0.34)]"
            />
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Søket filtrerer prosessstegene på denne siden. Det kjører ingen batchjobber og
              endrer ingen data.
            </p>
          </div>
        </div>
      </section>

      <section>
        <SectionHeading
          title="Oversikt"
          subtitle="Kun reelle eller eksplisitt ukjente statusverdier vises her."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleSummaryCards.map((card) => (
            <SummaryCard key={card.key} card={card} />
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
        <SectionHeading
          title="Prosessstatus"
          subtitle="Prosesskartet under bruker tilgjengelige statusdata for å vise hvor flyten virker stabil og hvor oppfølging trengs."
        />
        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <InfoCard
                title="Stabile steg"
                body={`${mainFlowStats.healthy} steg har kjent grønn status akkurat nå.`}
                tone="GREEN"
              />
              <InfoCard
                title="Steg som krever oppfølging"
                body={`${mainFlowStats.attention} steg har warning, fail eller blokkering.`}
                tone="YELLOW"
              />
              <InfoCard
                title="Ukjente steg"
                body={`${mainFlowStats.unknown} steg mangler nok data til en trygg vurdering.`}
                tone="BLUE"
              />
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-500">
              {mainFlowStats.healthy === 0 &&
              mainFlowStats.attention === 0 &&
              mainFlowStats.unknown === model.mainFlow.nodes.length
                ? "Prosesskart aktivt — status beregnes når datakilder er tilgjengelige."
                : "Bruk prosessnavigatoren under for å se hva hvert steg betyr, hva som kan gå galt og hvor du bør klikke videre."}
            </p>
          </div>

          <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] p-4">
            <div className="text-xs font-medium uppercase tracking-widest text-slate-400">
              Roadmap-status
            </div>
            <div className="mt-3 grid gap-3">
              {roadmapStatusItems.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[#162233]">{item.label}</div>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClasses(item.tone)}`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section>
        <SectionHeading
          title={model.attentionTitle}
          subtitle="Start her når du vil vite hva som bør prioriteres først."
        />
        {model.attentionItems.length === 0 ? (
          <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-6 text-sm text-slate-500 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            {model.attentionEmptyState}
          </div>
        ) : (
          <div className="space-y-3">
            {model.attentionItems.map((item) => (
              <AttentionRow key={item.key} item={item} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeading
          title={model.mainFlow.title}
          subtitle={model.mainFlow.subtitle}
        />

        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
          <aside className="space-y-3 xl:sticky xl:top-24 xl:self-start">
            <div className="rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
              <div className="text-xs font-medium uppercase tracking-widest text-slate-400">
                Prosessnavigator
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Velg et steg for å få en enkel forklaring på hva som skjer, hva som kan gå galt
                og hvor du bør klikke videre.
              </p>
            </div>

            <div className="space-y-3">
              {filteredMainFlowNodes.map((node) => (
                <SidebarStepButton
                  key={node.key}
                  node={node}
                  active={node.key === selectedNode?.key}
                  onSelect={() => setSelectedStepKey(node.key)}
                />
              ))}
            </div>

            {filteredMainFlowNodes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[rgba(15,23,42,0.12)] bg-white p-4 text-sm text-slate-500">
                Ingen prosesssteg matcher søket ditt ennå.
              </div>
            ) : null}
          </aside>

          <div className="space-y-6">
            <div className="rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)] md:p-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex gap-4">
                  <StepPill stepNumber={selectedNode?.stepNumber ?? 0} />
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                      Steg {String(selectedNode?.stepNumber ?? 0).padStart(2, "0")}
                    </div>
                    <h3 className="mt-2 text-3xl font-semibold tracking-tight text-[#162233]">
                      {selectedNode?.title}
                    </h3>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">
                      {selectedNode?.subtitle}
                    </p>
                  </div>
                </div>
                {selectedNode ? (
                  <StatusBadge status={selectedNode.status} tone={selectedNode.tone} />
                ) : null}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <InfoCard title="Mål" body={selectedNode?.subtitle ?? "Ukjent"} tone="BLUE" />
                <InfoCard title="Eksempel" body={exampleText} tone="PURPLE" />
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <InfoCard title="Hva skjer her?" body={whatHappens ?? "Ukjent"} tone="BLUE" />
                <InfoCard
                  title="Hvorfor er dette viktig?"
                  body={whyImportant ?? "Ukjent"}
                  tone="GREEN"
                />
                <InfoCard
                  title="Hva kan gå galt?"
                  body={whatCanGoWrong ?? "Ukjent"}
                  tone="RED"
                />
                <InfoCard
                  title="Hva gjør admin?"
                  body={whatAdminDoes ?? "Ukjent"}
                  tone="YELLOW"
                />
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] p-5">
                  <div className="text-xs font-medium uppercase tracking-widest text-slate-400">
                    Typisk status
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {selectedNode?.typicalStatus ?? "Ukjent"}
                  </p>
                  {selectedNode?.legacyNote || selectedNode?.unifiedNote ? (
                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                      {selectedNode.legacyNote ? (
                        <InfoCard title="Legacy" body={selectedNode.legacyNote} tone="GREEN" />
                      ) : null}
                      {selectedNode.unifiedNote ? (
                        <InfoCard title="Unified" body={selectedNode.unifiedNote} tone="PURPLE" />
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-5">
                  <div className="text-xs font-medium uppercase tracking-widest text-slate-400">
                    Neste klikk
                  </div>
                  <div className="mt-3 text-sm font-semibold text-[#162233]">
                    {selectedNode?.href ? "Relevant admin-side finnes" : "Ingen egen side ennå"}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {selectedNode?.href
                      ? "Åpne den relevante admin-siden hvis du trenger å gå dypere inn i en konkret sak eller status."
                      : selectedNode?.unavailableLabel ?? "Planlagt"}
                  </p>
                  <div className="mt-4">
                    {selectedNode?.href ? (
                      <Link
                        href={selectedNode.href as never}
                        className="inline-flex rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {selectedNode.linkLabel ?? "Åpne"}
                      </Link>
                    ) : (
                      <span className="inline-flex rounded-full border border-[rgba(15,23,42,0.08)] bg-slate-50 px-4 py-2 text-sm font-medium text-slate-400">
                        {selectedNode?.unavailableLabel ?? "Planlagt"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {selectedNode?.decisionPaths?.length ? (
                <div className="mt-6 rounded-2xl border border-dashed border-[rgba(15,23,42,0.16)] bg-[#f9f9f7] p-5">
                  <div className="text-xs font-medium uppercase tracking-widest text-slate-400">
                    Beslutningspunkt
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {selectedNode.decisionPaths.map((path) => (
                      <div
                        key={`${selectedNode.key}-${path.label}`}
                        className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-4"
                      >
                        <div className="text-sm font-semibold text-[#162233]">{path.label}</div>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          {path.description}
                        </p>
                        <div className="mt-3 text-xs font-medium uppercase tracking-widest text-slate-400">
                          Går til steg {path.targetStep}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-500">
                    Manuell kontroll er et sikkerhetsnett. Den brukes når systemet trenger
                    menneskelig bekreftelse, ikke fordi rapporten nødvendigvis er mislykket.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <div className="text-xs font-medium uppercase tracking-widest text-slate-400">
                Hele hovedflyten
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {model.mainFlow.nodes.map((node) => (
                  <CompactFlowStep
                    key={node.key}
                    node={node}
                    active={node.key === selectedNode?.key}
                    onSelect={() => setSelectedStepKey(node.key)}
                  />
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <div className="rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white p-5 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <div className="text-xs font-medium uppercase tracking-widest text-slate-400">
                Gjeldende steg
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-lg font-semibold text-[#162233]">
                  {selectedNode?.title ?? "Ukjent"}
                </div>
                {selectedNode ? (
                  <StatusBadge status={selectedNode.status} tone={selectedNode.tone} />
                ) : null}
              </div>
              <div className="mt-4 space-y-3">
                <InfoCard
                  title="Statussignal"
                  body={selectedNode?.metric ?? "Ukjent"}
                  tone={selectedNode?.tone ?? "BLUE"}
                />
                <InfoCard
                  title="Sist oppdatert"
                  body={model.generatedAt.replace("T", " ").slice(0, 16)}
                  tone="BLUE"
                />
              </div>
            </div>

            <div className="rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white p-5 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <div className="text-xs font-medium uppercase tracking-widest text-slate-400">
                Relevant admin-lenke
              </div>
              {selectedNode?.href ? (
                <div className="mt-4 space-y-3">
                  <div className="text-sm font-semibold text-[#162233]">{selectedNode.href}</div>
                  <p className="text-sm leading-6 text-slate-500">
                    Åpne denne siden hvis du trenger saksdetaljer eller dypere diagnostikk for
                    dette steget.
                  </p>
                  <Link
                    href={selectedNode.href as never}
                    className="inline-flex rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {selectedNode.linkLabel ?? "Åpne"}
                  </Link>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-500">
                  {selectedNode?.unavailableLabel ?? "Ingen egen side ennå"}
                </p>
              )}
            </div>

            <div className="rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white p-5 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <div className="text-xs font-medium uppercase tracking-widest text-slate-400">
                Neste steg
              </div>
              {nextNode ? (
                <div className="mt-4 space-y-3">
                  <div className="text-sm font-semibold text-[#162233]">{nextNode.title}</div>
                  <p className="text-sm leading-6 text-slate-500">{nextNode.subtitle}</p>
                  <button
                    type="button"
                    onClick={() => setSelectedStepKey(nextNode.key)}
                    className="inline-flex rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Gå til neste steg
                  </button>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-500">
                  Dette er siste steg i hovedflyten.
                </p>
              )}
            </div>

            <div className="rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white p-5 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <div className="text-xs font-medium uppercase tracking-widest text-slate-400">
                Kilde- og dokumentkontekst
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-500">
                Ingen konkret rapport valgt. Åpne en sak fra review-køen for dokumentdetaljer.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
        <SectionHeading
          title={model.goLiveFlow.title}
          subtitle={model.goLiveFlow.subtitle}
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {model.goLiveFlow.nodes.map((node) => (
            <div
              key={node.key}
              className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-widest text-slate-400">
                    Steg {String(node.stepNumber).padStart(2, "0")}
                  </div>
                  <div className="mt-2 text-lg font-semibold text-[#162233]">{node.title}</div>
                </div>
                <StatusBadge status={node.status} tone={node.tone} />
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-500">{node.subtitle}</p>
              <div className="mt-4 text-xs font-medium uppercase tracking-widest text-slate-400">
                {node.metric}
              </div>
              <div className="mt-4">
                {node.href ? (
                  <Link
                    href={node.href as never}
                    className="inline-flex rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {node.linkLabel ?? "Åpne"}
                  </Link>
                ) : (
                  <span className="inline-flex rounded-full border border-[rgba(15,23,42,0.08)] bg-slate-50 px-4 py-2 text-sm font-medium text-slate-400">
                    {node.unavailableLabel ?? "Planlagt"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
          <SectionHeading
            title={model.onboardingTitle}
            subtitle="Kort innføring for nye ansatte eller reviewere som skal forstå flyten raskt."
          />
          <ol className="space-y-3">
            {model.onboardingItems.map((item) => (
              <li key={item.stepNumber} className="flex gap-3">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#162233] text-xs font-semibold text-white">
                  {item.stepNumber}
                </span>
                <span className="text-sm leading-6 text-slate-600">{item.text}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
          <SectionHeading
            title="Statusforklaring"
            subtitle="Bruk denne fargeforklaringen når du leser hovedflyten og go-live-roadmapet."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {model.legendItems.map((item) => (
              <LegendCard key={item.colorLabel} item={item} />
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
        <SectionHeading
          title={model.glossaryTitle}
          subtitle="En enkel ordliste for begreper som går igjen i årsrapportbehandlingen."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {model.glossaryItems.map((item) => (
            <GlossaryCard key={item.term} item={item} />
          ))}
        </div>
      </section>

      {model.diagnostics.length > 0 ? (
        <section className="rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
          <SectionHeading
            title="Datamerknader"
            subtitle="Disse meldingene forklarer hvorfor enkelte tall eller statuser kan være ukjente."
          />
          <ul className="space-y-2 text-sm leading-6 text-slate-500">
            {model.diagnostics.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
