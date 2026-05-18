"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnnualReportRefreshButton } from "@/app/(app)/admin/AnnualReportRefreshButton";

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
  refreshAffectedCount: number;
};

type PipelineMode = "Legacy" | "Unified" | "Shadow";

// ─── Tone helpers ────────────────────────────────────────────────────────────

function toneBadge(tone: AdminVisualTone) {
  switch (tone) {
    case "GREEN":
      return "bg-[#e8f5e9] border-[#a5d6a7] text-[#2e7d32]";
    case "YELLOW":
      return "bg-[#fff9c4] border-[#fbc02d] text-[#f57f17]";
    case "RED":
      return "bg-red-50 border-red-200 text-red-700";
    case "PURPLE":
      return "bg-[#f3e5f5] border-[#ce93d8] text-[#7b1fa2]";
    default:
      return "bg-slate-100 border-slate-200 text-slate-500";
  }
}

function toneDot(tone: AdminVisualTone) {
  switch (tone) {
    case "GREEN":
      return "bg-[#4caf50]";
    case "YELLOW":
      return "bg-[#fbc02d]";
    case "RED":
      return "bg-red-600";
    case "PURPLE":
      return "bg-violet-500";
    default:
      return "bg-slate-400";
  }
}

function statusLabel(status: AdminControlCenterStatus): string {
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
    default:
      return "Ukjent";
  }
}

function actorLabel(actor: AdminFlowNode["actor"]) {
  switch (actor) {
    case "human":
      return "Krever menneske";
    case "decision":
      return "Beslutning";
    default:
      return "Automatisk";
  }
}

function actorBadgeClass(actor: AdminFlowNode["actor"]) {
  switch (actor) {
    case "human":
      return "bg-amber-50 border-amber-200 text-amber-700";
    case "decision":
      return "bg-blue-50 border-blue-200 text-blue-700";
    default:
      return "bg-slate-50 border-slate-200 text-slate-500";
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
    default:
      return "BLUE";
  }
}

function severityLabel(severity: AdminAttentionItem["severity"]): string {
  switch (severity) {
    case "HIGH":
      return "KRITISK FEIL";
    case "MEDIUM":
      return "REVIEW KREVES";
    case "LOW":
      return "MANUELL SJEKK";
    default:
      return "INFO";
  }
}

function findHelpSection(
  node: AdminFlowNode,
  title: string,
): AdminFlowHelpSection | undefined {
  return node.helpSections?.find((s) => s.title === title);
}

function buildStepExample(node: AdminFlowNode): string {
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
      "Eksempel: Hvis systemet er usikkert på enhetsskala eller mangler sentrale linjer, sendes rapporten til manuell kontroll.",
    "manual-review":
      "Eksempel: Reviewer åpner PDF-en, sammenligner de viktigste linjene mot systemets forslag og registrerer en beslutning.",
    "store-approved":
      "Eksempel: Godkjente tall lagres med sporbarhet tilbake til rapport, dokument og review-beslutning.",
    "available-in-product":
      "Eksempel: Etter godkjenning kan tallene vises på selskapssiden og brukes i søk og analyser.",
  };
  return (
    examples[node.key] ??
    "Eksempel: En sak med tydelig grunnlag i dette steget kan gå trygt videre til neste kontroll."
  );
}

function getFlowStats(nodes: AdminFlowNode[]) {
  return nodes.reduce(
    (acc, node) => {
      if (node.status === "HEALTHY") acc.healthy += 1;
      else if (["WARNING", "FAILING", "BLOCKED"].includes(node.status)) acc.attention += 1;
      else acc.unknown += 1;
      return acc;
    },
    { healthy: 0, attention: 0, unknown: 0 },
  );
}

// ─── Small components ─────────────────────────────────────────────────────────

function StatusBadge({
  status,
  tone,
}: {
  status: AdminControlCenterStatus;
  tone: AdminVisualTone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${toneBadge(tone)}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${toneDot(tone)}`} />
      {statusLabel(status)}
    </span>
  );
}

function InfoBlock({
  title,
  body,
  tone = "BLUE",
}: {
  title: string;
  body: string;
  tone?: AdminVisualTone;
}) {
  return (
    <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white/60 p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${toneDot(tone)}`} />
        <span className="data-label text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </span>
      </div>
      <p className="text-sm leading-6 text-slate-600">{body}</p>
    </div>
  );
}

function StepCircle({
  node,
  isActive,
  onClick,
}: {
  node: AdminFlowNode;
  isActive: boolean;
  onClick: () => void;
}) {
  const isCompleted = node.status === "HEALTHY";
  const isError = node.status === "FAILING" || node.status === "BLOCKED";

  let circleClass =
    "bg-slate-200 border-2 border-slate-300 text-slate-500"; // pending
  if (isActive)
    circleClass =
      "bg-white border-2 border-[var(--px-accent)] text-[var(--px-accent)] font-bold shadow-[0_0_0_4px_rgba(0,102,138,0.15)]";
  else if (isCompleted)
    circleClass = "bg-[var(--px-accent)] border-2 border-[var(--px-accent)] text-white";
  else if (isError)
    circleClass = "bg-red-50 border-2 border-red-300 text-red-600";

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center text-center"
    >
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full font-mono text-xs transition-all ${circleClass}`}
      >
        {String(node.stepNumber).padStart(2, "0")}
      </div>
      <h4
        className={`data-label mt-3 text-[11px] font-semibold ${isActive ? "text-[var(--px-accent)]" : "text-slate-700"}`}
      >
        {node.title}
      </h4>
      <span
        className={`mt-0.5 font-mono text-[10px] ${
          isCompleted
            ? "text-[var(--px-accent)]"
            : isActive
              ? "animate-pulse text-[var(--px-accent)]"
              : isError
                ? "text-red-500"
                : "text-slate-400"
        }`}
      >
        {isCompleted ? "UTFØRT" : isActive ? "AKTIV" : isError ? "FEIL" : "VENTER"}
      </span>
      {isActive ? (
        <div className="mt-1.5 rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-400">
          Valgt
        </div>
      ) : null}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminControlCenterView({
  model,
  currentUserRole,
  refreshAffectedCount,
}: AdminControlCenterViewProps) {
  const [mode, setMode] = useState<PipelineMode>("Unified");
  const [selectedStepKey, setSelectedStepKey] = useState(
    model.mainFlow.nodes[0]?.key ?? "",
  );
  const [query, setQuery] = useState("");

  const filteredNodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return model.mainFlow.nodes;
    return model.mainFlow.nodes.filter((n) =>
      [n.title, n.subtitle, n.metric, ...(n.helpSections?.map((s) => s.body) ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [model.mainFlow.nodes, query]);

  useEffect(() => {
    if (!filteredNodes.some((n) => n.key === selectedStepKey)) {
      setSelectedStepKey(filteredNodes[0]?.key ?? model.mainFlow.nodes[0]?.key ?? "");
    }
  }, [filteredNodes, model.mainFlow.nodes, selectedStepKey]);

  const selectedNode =
    filteredNodes.find((n) => n.key === selectedStepKey) ??
    model.mainFlow.nodes.find((n) => n.key === selectedStepKey) ??
    model.mainFlow.nodes[0];

  // Summary card lookups
  const reviewQueueCard = model.summaryCards.find((c) => c.key === "review-queue");
  const failedCard = model.summaryCards.find((c) => c.key === "failed");
  const latestShadowBatchCard = model.summaryCards.find(
    (c) => c.key === "latest-shadow-batch",
  );
  const highSeverityCount = model.attentionItems.filter(
    (i) => i.severity === "HIGH",
  ).length;
  const mainFlowStats = getFlowStats(model.mainFlow.nodes);

  // Pipeline split: first 4 primary, rest secondary
  const primaryNodes = model.mainFlow.nodes.slice(0, 4);
  const secondaryNodes = model.mainFlow.nodes.slice(4);

  // Selected step context
  const exampleText = selectedNode ? buildStepExample(selectedNode) : "";
  const whatHappens = selectedNode
    ? findHelpSection(selectedNode, "Hva skjer her?")?.body
    : "";
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
    <div className="space-y-16 pb-16">
      {/* ── Section 1: Header ───────────────────────────────────────────────── */}
      <section className="flex flex-col gap-6 border-b border-[rgba(15,23,42,0.1)] pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="data-label text-[11px] font-semibold uppercase tracking-widest text-[var(--px-accent)]">
            Admin
          </p>
          <h1 className="editorial-display mt-2 text-[2.5rem] leading-tight text-slate-950">
            Adminoversikt
          </h1>
          <p className="mt-2 max-w-2xl text-base leading-7 text-slate-500">{model.subtitle}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-4">
          {/* Mode toggle */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            {(["Legacy", "Unified", "Shadow"] as PipelineMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-lg px-4 py-2 data-label text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  mode === m
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {/* Role chip */}
          <span className="data-label rounded border border-[rgba(15,23,42,0.1)] bg-white px-3 py-1 text-[10px] text-slate-500">
            {currentUserRole}
          </span>
        </div>
      </section>

      <section className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="data-label text-[11px] font-semibold uppercase tracking-widest text-[var(--px-accent)]">
              Viktigste arbeidsflate
            </p>
            <h2 className="mt-2 text-[1.5rem] font-semibold text-slate-950">
              Manuell kontroll av årsrapporter
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Her sammenligner du original årsrapport med forslagene fra systemet,
              gjør eventuelle korrigeringer og kan starte en ny behandling hvis
              grunnlaget virker feil.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <Link
              href={"/admin/annual-report-reviews" as never}
              className="rounded-full bg-[var(--px-action)] px-5 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-[var(--px-action-hover)]"
            >
              Åpne manuell kontroll
            </Link>
            <AnnualReportRefreshButton
              scope="affected"
              label={`Refresh berørte saker${refreshAffectedCount > 0 ? ` (${refreshAffectedCount})` : ""}`}
              pendingLabel="Starter refresh..."
              helperText="Brukes når saker står fast, eller når unified fortsatt mangler verdier på eksisterende dokumenter."
              className="rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-5 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
            />
          </div>
        </div>
      </section>

      {/* ── Section 2: Data-strip status cards ──────────────────────────────── */}
      <section className="grid grid-cols-1 divide-y divide-[rgba(15,23,42,0.1)] border-y border-[rgba(15,23,42,0.1)] md:grid-cols-3 md:divide-x md:divide-y-0">
        {/* Review queue */}
        <div className="py-8 pl-0 pr-0 md:pr-8">
          <span className="data-label text-[11px] font-semibold uppercase tracking-widest text-[var(--px-accent)]">
            Manuell kontroll
          </span>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="editorial-display text-[3rem] leading-none text-slate-950">
              {reviewQueueCard?.value ?? "—"}
            </span>
            <span className="font-mono text-sm text-slate-400">
              {reviewQueueCard?.detail ?? ""}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Rapporter som venter på manuell kontroll.
          </p>
        </div>

        {/* Critical errors */}
        <div className="py-8 md:px-8">
          <span className="data-label text-[11px] font-semibold uppercase tracking-widest text-red-600">
            Kritiske feil
          </span>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="editorial-display text-[3rem] leading-none text-red-600">
              {String(highSeverityCount).padStart(2, "0")}
            </span>
            <span className="font-mono text-sm text-red-400">High Severity</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {failedCard?.detail ?? "Saker som krever umiddelbar intervensjon."}
          </p>
        </div>

        {/* Shadow batch */}
        <div className="py-8 pl-0 md:pl-8 md:pr-0">
          <span className="data-label text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Siste shadow-kjøring
          </span>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="editorial-display text-[3rem] leading-none text-slate-950">
              {latestShadowBatchCard?.value ?? "—"}
            </span>
            <span className="font-mono text-sm text-slate-400">Siste batch</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {latestShadowBatchCard?.detail ?? ""}
          </p>
        </div>
      </section>

      {/* ── Section 3: Pipeline ─────────────────────────────────────────────── */}
      <section className="space-y-10">
        <div className="flex items-center gap-4">
          <h2 className="text-[1.5rem] font-semibold text-slate-950">
            {model.mainFlow.title}
          </h2>
          <div className="h-px flex-1 bg-[rgba(15,23,42,0.1)]" />
          <span className="data-label text-[11px] text-slate-400">Hovedflyt</span>
        </div>

        {/* Pipeline stats row */}
        <div className="flex flex-wrap gap-6 text-sm text-slate-500">
          <span>
            <strong className="text-slate-950">{mainFlowStats.healthy}</strong> stabile steg
          </span>
          <span>
            <strong className="text-amber-600">{mainFlowStats.attention}</strong> krever oppfølging
          </span>
          <span>
            <strong className="text-slate-400">{mainFlowStats.unknown}</strong> ukjente
          </span>
        </div>

        {/* Primary circles with connector */}
        <div className="relative py-6">
          <div className="absolute left-0 right-0 top-[2.5rem] hidden h-[2px] bg-[rgba(15,23,42,0.1)] lg:block" />
          <div className="relative z-10 grid grid-cols-2 gap-y-10 lg:grid-cols-4">
            {primaryNodes.map((node) => (
              <StepCircle
                key={node.key}
                node={node}
                isActive={node.key === selectedStepKey}
                onClick={() => setSelectedStepKey(node.key)}
              />
            ))}
          </div>

          {/* Secondary steps */}
          {secondaryNodes.length > 0 ? (
            <div className="mt-12 grid grid-cols-3 gap-2 opacity-50 md:grid-cols-6 lg:grid-cols-7">
              {secondaryNodes.map((node) => (
                <button
                  key={node.key}
                  type="button"
                  onClick={() => setSelectedStepKey(node.key)}
                  className={`border-t-2 pt-3 text-left transition-opacity hover:opacity-100 ${
                    node.status === "FAILING" || node.status === "BLOCKED"
                      ? "border-red-300"
                      : node.key === selectedStepKey
                        ? "border-[var(--px-accent)]"
                        : "border-[rgba(15,23,42,0.1)]"
                  }`}
                >
                  <p
                    className={`data-label text-[9px] ${node.status === "FAILING" ? "text-red-600" : "text-slate-400"}`}
                  >
                    STEG {String(node.stepNumber).padStart(2, "0")}
                  </p>
                  <p
                    className={`mt-0.5 text-[11px] font-semibold ${node.status === "FAILING" ? "text-red-600" : "text-slate-700"}`}
                  >
                    {node.title}
                  </p>
                  {node.actor && node.actor !== "system" ? (
                    <span
                      className={`mt-1 inline-flex rounded border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${actorBadgeClass(node.actor)}`}
                    >
                      {actorLabel(node.actor)}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Step detail panel */}
        {selectedNode ? (
          <div className="overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white shadow-lg">
            <div className="flex flex-col lg:flex-row">
              {/* Left: main detail */}
              <div className="flex-1 space-y-8 bg-white p-8 lg:p-10">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--px-panel)] font-mono text-lg text-white shadow-sm">
                        {selectedNode.stepNumber}
                      </div>
                      <span className="data-label text-[11px] uppercase tracking-widest text-slate-400">
                        STEG {String(selectedNode.stepNumber).padStart(2, "0")}
                      </span>
                    </div>
                    <h3 className="editorial-display text-[2.25rem] leading-tight text-slate-950">
                      {selectedNode.title}
                    </h3>
                    <p className="max-w-2xl text-base leading-7 text-slate-500">
                      {selectedNode.subtitle}
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-3 sm:items-end">
                    <StatusBadge status={selectedNode.status} tone={selectedNode.tone} />
                    <div
                      className={`inline-flex items-center rounded border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${actorBadgeClass(selectedNode.actor)}`}
                    >
                      {actorLabel(selectedNode.actor)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <InfoBlock title="Mål" body={selectedNode.subtitle ?? ""} tone="BLUE" />
                  <InfoBlock title="Eksempel" body={exampleText} tone="BLUE" />
                  {whatHappens ? (
                    <InfoBlock title="Hva skjer her?" body={whatHappens} tone="BLUE" />
                  ) : null}
                  {whyImportant ? (
                    <InfoBlock
                      title="Hvorfor er dette viktig?"
                      body={whyImportant}
                      tone="GREEN"
                    />
                  ) : null}
                  {whatCanGoWrong ? (
                    <InfoBlock title="Hva kan gå galt?" body={whatCanGoWrong} tone="RED" />
                  ) : null}
                  {whatAdminDoes ? (
                    <InfoBlock title="Hva gjør admin?" body={whatAdminDoes} tone="YELLOW" />
                  ) : null}
                </div>

                {selectedNode.typicalStatus ? (
                  <div className="border-l-4 border-[var(--px-accent)] bg-[rgba(0,102,138,0.05)] p-5">
                    <h4 className="data-label mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--px-accent)]">
                      Typisk Status
                    </h4>
                    <p className="text-sm leading-6 text-slate-600">
                      {selectedNode.typicalStatus}
                    </p>
                  </div>
                ) : null}

                {selectedNode.decisionPaths?.length ? (
                  <div className="rounded-xl border border-dashed border-[rgba(15,23,42,0.14)] bg-slate-50 p-5">
                    <p className="data-label mb-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                      Beslutningspunkt
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      {selectedNode.decisionPaths.map((path) => (
                        <div
                          key={`${selectedNode.key}-${path.label}`}
                          className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4"
                        >
                          <div className="text-sm font-semibold text-slate-900">{path.label}</div>
                          <p className="mt-1.5 text-sm leading-6 text-slate-500">
                            {path.description}
                          </p>
                          <div className="mt-3 data-label text-[10px] uppercase tracking-widest text-slate-400">
                            → Steg {path.targetStep}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Right sidebar */}
              <div className="w-full space-y-7 border-t border-[rgba(15,23,42,0.08)] bg-slate-50 p-8 lg:w-72 lg:border-l lg:border-t-0">
                <div>
                  <h4 className="data-label mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    Gjeldende Steg
                  </h4>
                  <p className="mb-2 text-[1.05rem] font-semibold text-slate-950">
                    {selectedNode.title}
                  </p>
                  <StatusBadge status={selectedNode.status} tone={selectedNode.tone} />
                  <div
                    className={`mt-3 inline-flex items-center rounded border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${actorBadgeClass(selectedNode.actor)}`}
                  >
                    {actorLabel(selectedNode.actor)}
                  </div>
                </div>

                <div className="border-t border-[rgba(15,23,42,0.08)] pt-6">
                  <h4 className="data-label mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    <span className={`h-1.5 w-1.5 rounded-full ${toneDot(selectedNode.tone)}`} />
                    Statussignal
                  </h4>
                  <p className="font-mono text-[11px] leading-relaxed text-slate-500">
                    {selectedNode.metric}
                  </p>
                </div>

                <div className="border-t border-[rgba(15,23,42,0.08)] pt-6">
                  <h4 className="data-label mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    Sist Oppdatert
                  </h4>
                  <p className="font-mono text-[12px] text-slate-500">
                    {model.generatedAt.replace("T", " ").slice(0, 16)}
                  </p>
                </div>

                <div className="border-t border-[rgba(15,23,42,0.08)] pt-6 space-y-3">
                  <h4 className="data-label text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    Åpne steg
                  </h4>
                  {selectedNode.href ? (
                    <>
                      <p className="text-[12px] leading-5 text-slate-500">
                        Åpne arbeidsflaten for dette steget hvis du vil kontrollere dokumentet, se detaljer eller starte ny behandling.
                      </p>
                      <Link
                        href={selectedNode.href as never}
                        className="block w-full rounded-lg border border-[rgba(15,23,42,0.12)] py-2 text-center data-label text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                      >
                        {selectedNode.linkLabel ?? "Åpne steg"}
                      </Link>
                    </>
                  ) : (
                    <p className="text-[12px] text-slate-400">
                      {selectedNode.unavailableLabel ?? "Ingen egen side ennå"}
                    </p>
                  )}
                </div>

                <div className="border-t border-[rgba(15,23,42,0.08)] pt-6">
                  <p className="text-[12px] text-slate-400">
                    Dette er ett steg i hovedflyten. Velg et annet steg over for å se mer.
                  </p>
                </div>
              </div>
            </div>

            {/* Full flow strip */}
            <div className="border-t border-[rgba(15,23,42,0.08)] bg-slate-50 px-8 py-5">
              <p className="data-label mb-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Hele flyten
              </p>
              <div className="flex flex-wrap gap-2">
                {model.mainFlow.nodes.map((node) => (
                  <button
                    key={node.key}
                    type="button"
                    onClick={() => setSelectedStepKey(node.key)}
                    className={`rounded border px-3 py-2 data-label text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                      node.key === selectedStepKey
                        ? "border-[var(--px-accent)] bg-[var(--px-accent)] text-white"
                        : "border-[rgba(15,23,42,0.1)] bg-white text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {String(node.stepNumber).padStart(2, "0")} {node.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* ── Section 4: Attention table ──────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="flex items-end justify-between border-b border-slate-950 pb-4">
          <h2 className="text-[1.5rem] font-semibold text-slate-950">{model.attentionTitle}</h2>
          <span className="data-label text-[11px] text-[var(--px-accent)]">
            {model.attentionItems.length} åpne saker
          </span>
        </div>

        {model.attentionItems.length === 0 ? (
          <p className="py-6 text-sm text-slate-500">{model.attentionEmptyState}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  {["Entitet / Referanse", "Problemstilling", "Status", "Handling"].map(
                    (h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-4 data-label text-[11px] font-semibold uppercase tracking-wider text-slate-950 ${i === 3 ? "text-right" : "text-left"}`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(15,23,42,0.08)]">
                {model.attentionItems.map((item) => {
                  const tone = attentionTone(item.severity);
                  return (
                    <tr
                      key={item.key}
                      className="transition-colors hover:bg-slate-50"
                    >
                      <td className="px-4 py-5">
                        <div className="text-sm font-semibold text-slate-950">{item.title}</div>
                        <div className="mt-0.5 font-mono text-xs text-slate-400">{item.key}</div>
                      </td>
                      <td className="max-w-xs px-4 py-5 text-sm leading-6 text-slate-500">
                        {item.description}
                      </td>
                      <td className="px-4 py-5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded border px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${toneBadge(tone)}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${toneDot(tone)}`} />
                          {severityLabel(item.severity)}
                        </span>
                      </td>
                      <td className="px-4 py-5 text-right">
                        {item.href ? (
                          <Link
                            href={item.href as never}
                            className={`rounded-lg px-4 py-2 data-label text-[11px] font-semibold transition-colors ${
                              item.severity === "HIGH"
                                ? "bg-slate-950 text-white hover:bg-slate-800"
                                : "border border-[rgba(15,23,42,0.12)] text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            {item.severity === "HIGH" ? "Løs nå" : "Inspiser"}
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Documentation modules ───────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Onboarding */}
        <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-8 shadow-sm">
          <h3 className="text-[1.5rem] font-semibold text-slate-950 mb-2">
            {model.onboardingTitle}
          </h3>
          <p className="mb-8 text-sm leading-6 text-slate-500">
            Kort innføring for nye ansatte eller reviewere som skal forstå flyten raskt.
          </p>
          <div className="space-y-5">
            {model.onboardingItems.map((item) => (
              <div key={item.stepNumber} className="flex gap-4">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--px-panel)] font-mono text-[12px] text-white">
                  {item.stepNumber}
                </span>
                <p className="text-sm leading-6 text-slate-700">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-8 shadow-sm">
          <h3 className="text-[1.5rem] font-semibold text-slate-950 mb-2">Statusforklaring</h3>
          <p className="mb-8 text-sm leading-6 text-slate-500">
            Bruk denne fargeforklaringen når du leser hovedflyten.
          </p>
          <div className="space-y-3">
            {model.legendItems.map((item) => (
              <div
                key={item.colorLabel}
                className="flex items-start gap-4 border-b border-[rgba(15,23,42,0.06)] py-2 last:border-0"
              >
                <span
                  className={`inline-block w-14 shrink-0 rounded border px-2 py-0.5 text-center data-label text-[9px] ${toneBadge(item.tone)}`}
                >
                  {item.colorLabel}
                </span>
                <p className="text-[13px] leading-5 text-slate-500">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Glossary ────────────────────────────────────────────────────────── */}
      <section className="space-y-8 rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-8 shadow-sm lg:p-12">
        <div>
          <h3 className="text-[1.5rem] font-semibold text-slate-950 mb-2">
            {model.glossaryTitle}
          </h3>
          <p className="text-sm text-slate-500">
            En enkel ordliste for begreper som går igjen i årsrapportbehandlingen.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
          {model.glossaryItems.map((item) => (
            <div key={item.term} className="space-y-2">
              <h4 className="border-b border-[rgba(0,102,138,0.2)] pb-2 font-semibold text-slate-950">
                {item.term}
              </h4>
              <p className="text-[13px] leading-relaxed text-slate-500">{item.definition}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Diagnostics ─────────────────────────────────────────────────────── */}
      {model.diagnostics.length > 0 ? (
        <section className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-6">
          <h3 className="data-label mb-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Datamerknader
          </h3>
          <ul className="space-y-2 text-sm leading-6 text-slate-400">
            {model.diagnostics.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
