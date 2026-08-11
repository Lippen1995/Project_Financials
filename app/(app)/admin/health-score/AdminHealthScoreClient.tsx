"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { CurveEditor } from "./CurveEditor";
import { HealthScorePreview } from "./HealthScorePreview";
import {
  coverageShortfall,
  healthMetricsByKey,
  type HealthMissingDataPolicy,
  type HealthPillarConfig,
  type HealthScoreConfig,
  type HealthStatusTone,
} from "@/lib/health-score";
import type { HealthScoreModelInput } from "@/server/health-score/domain";
import type {
  AdminHealthScoreDashboard,
  AdminHealthScoreModel,
} from "@/server/services/admin-health-score-service";

/**
 * Editor for the financial-health scoring models.
 *
 * The whole model is edited as one draft and saved in one request, so a
 * half-applied change never reaches a company page. The preview beside the form
 * runs the same engine the company page runs, against the draft rather than the
 * saved row — what you see is what saving will produce.
 */

const TONE_OPTIONS: { value: HealthStatusTone; label: string }[] = [
  { value: "success", label: "Grønn" },
  { value: "warning", label: "Gul" },
  { value: "error", label: "Rød" },
  { value: "neutral", label: "Nøytral" },
];

const MISSING_DATA_LABELS: Record<HealthMissingDataPolicy, string> = {
  renormalize: "Fordel vekten på nøkkeltallene som har data (anbefalt)",
  zero: "Regn manglende nøkkeltall som 0 poeng",
  neutral: "Regn manglende nøkkeltall som 50 poeng",
};

const REQUIREMENT_LABELS: Record<string, string> = {
  headline: "Hovedtall",
  lineItems: "Regnskapslinjer",
  register: "Registerdata",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktiv",
  BANKRUPT: "Konkurs",
  DISSOLVED: "Oppløst",
};

function toInput(model: AdminHealthScoreModel): HealthScoreModelInput {
  return {
    key: model.key,
    name: model.name,
    description: model.description,
    active: model.active,
    isFallback: model.isFallback,
    config: model.config,
    industryRules: model.industryRules,
  };
}

/** Weights are relative, so the editor shows what each one is actually worth. */
function shareOf(weight: number, total: number): string {
  if (total <= 0) return "0 %";
  return `${Math.round((weight / total) * 100)} %`;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
      {children}
    </span>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-900 focus:border-[var(--px-action)] focus:outline-none";

/* ── Dimension editor ─────────────────────────────────────────────────────── */

function PillarEditor({
  pillar,
  pillarWeightTotal,
  description,
  onChange,
}: {
  pillar: HealthPillarConfig;
  pillarWeightTotal: number;
  description: string;
  onChange: (pillar: HealthPillarConfig) => void;
}) {
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const enabledMetricWeight = pillar.metrics
    .filter((metric) => metric.enabled)
    .reduce((sum, metric) => sum + metric.weight, 0);

  const patchMetric = (key: string, patch: Partial<HealthScoreConfig["pillars"][number]["metrics"][number]>) => {
    onChange({
      ...pillar,
      metrics: pillar.metrics.map((metric) =>
        metric.key === key ? { ...metric, ...patch } : metric,
      ),
    });
  };

  return (
    <div
      className={`rounded-xl border p-4 ${pillar.enabled ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={pillar.enabled}
              onChange={(event) => onChange({ ...pillar, enabled: event.target.checked })}
            />
            <span className="text-[14px] font-semibold text-slate-900">
              {healthPillarLabel(pillar.key)}
            </span>
          </label>
          <p className="mt-1 max-w-[62ch] text-[12px] leading-relaxed text-slate-500">
            {description}
          </p>
        </div>

        <label className="flex shrink-0 items-center gap-2 text-[12px] text-slate-600">
          Vekt
          <input
            type="number"
            min={0}
            step="any"
            value={pillar.weight}
            disabled={!pillar.enabled}
            onChange={(event) => onChange({ ...pillar, weight: Number(event.target.value) })}
            className="w-20 rounded-md border border-slate-200 px-2 py-1 tabular-nums disabled:opacity-40"
          />
          <span className="w-12 tabular-nums text-slate-500">
            {pillar.enabled ? shareOf(pillar.weight, pillarWeightTotal) : "–"}
          </span>
        </label>
      </div>

      {pillar.enabled ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          {pillar.metrics.map((metric) => {
            const definition = healthMetricsByKey.get(metric.key);
            if (!definition) return null;
            const isOpen = expanded === metric.key;

            return (
              <div key={metric.key} className="border-b border-slate-100 py-2 last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex min-w-0 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={metric.enabled}
                      onChange={(event) => patchMetric(metric.key, { enabled: event.target.checked })}
                    />
                    <span className="truncate text-[13px] text-slate-800">{definition.label}</span>
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-slate-500">
                      {REQUIREMENT_LABELS[definition.requires] ?? definition.requires}
                    </span>
                  </label>

                  <div className="flex shrink-0 items-center gap-2 text-[12px] text-slate-600">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={metric.weight}
                      disabled={!metric.enabled}
                      aria-label={`Vekt for ${definition.label}`}
                      onChange={(event) =>
                        patchMetric(metric.key, { weight: Number(event.target.value) })
                      }
                      className="w-20 rounded-md border border-slate-200 px-2 py-1 tabular-nums disabled:opacity-40"
                    />
                    <span className="w-12 tabular-nums text-slate-500">
                      {metric.enabled ? shareOf(metric.weight, enabledMetricWeight) : "–"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : metric.key)}
                      className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:border-slate-400"
                      aria-expanded={isOpen}
                    >
                      {isOpen ? "Skjul kurve" : "Kurve"}
                    </button>
                  </div>
                </div>

                {isOpen ? (
                  <div className="mt-2 rounded-lg bg-slate-50 p-3">
                    <p className="mb-2 max-w-[80ch] text-[11.5px] leading-relaxed text-slate-600">
                      {definition.help}
                    </p>
                    <CurveEditor
                      curve={metric.curve}
                      unit={definition.unit}
                      onChange={(curve) => patchMetric(metric.key, { curve })}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const PILLAR_LABELS: Record<string, string> = {
  LONNSOMHET: "Lønnsomhet",
  SOLIDITET: "Soliditet",
  LIKVIDITET: "Likviditet",
  VEKST: "Vekst",
  DRIFT: "Drift",
  STABILITET: "Stabilitet",
};

function healthPillarLabel(key: string): string {
  return PILLAR_LABELS[key] ?? key;
}

/* ── Main client ──────────────────────────────────────────────────────────── */

export default function AdminHealthScoreClient({
  dashboard,
  starter,
}: {
  dashboard: AdminHealthScoreDashboard;
  starter: HealthScoreModelInput;
}) {
  const router = useRouter();
  // Read straight off props: `router.refresh()` re-renders the server page after a
  // save, and state seeded from props would pin the list to its first render.
  const models = dashboard.models;
  const [selectedId, setSelectedId] = React.useState<string | null>(
    dashboard.models[0]?.id ?? null,
  );
  const [draft, setDraft] = React.useState<HealthScoreModelInput>(
    dashboard.models[0] ? toInput(dashboard.models[0]) : starter,
  );
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const selectedModel = models.find((model) => model.id === selectedId) ?? null;
  // Derived from the resolved model rather than the id, so a selection left
  // pointing at a deleted model recovers into "create" instead of saving to a
  // dead id.
  const isNew = selectedModel === null;

  const pillarWeightTotal = draft.config.pillars
    .filter((pillar) => pillar.enabled)
    .reduce((sum, pillar) => sum + pillar.weight, 0);

  const selectModel = (model: AdminHealthScoreModel | null) => {
    setMessage(null);
    setError(null);
    if (model) {
      setSelectedId(model.id);
      setDraft(toInput(model));
    } else {
      setSelectedId(null);
      setDraft({
        ...starter,
        key: "",
        name: "",
        description: null,
        isFallback: models.length === 0,
        industryRules: [],
      });
    }
  };

  const duplicate = () => {
    setMessage(null);
    setError(null);
    setSelectedId(null);
    setDraft({
      ...draft,
      key: `${draft.key}-kopi`.slice(0, 64),
      name: `${draft.name} (kopi)`,
      isFallback: false,
      industryRules: [],
    });
  };

  const patchConfig = (patch: Partial<HealthScoreConfig>) => {
    setDraft((current) => ({ ...current, config: { ...current.config, ...patch } }));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(
        isNew ? "/api/admin/health-score/models" : `/api/admin/health-score/models/${selectedId}`,
        {
          method: isNew ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const issues = body?.issues?.formErrors as string[] | undefined;
        const fieldIssues = body?.issues?.fieldErrors as Record<string, string[]> | undefined;
        const detail =
          issues?.[0] ??
          (fieldIssues ? Object.values(fieldIssues).flat()[0] : undefined) ??
          body?.error;
        setError(detail ?? "Kunne ikke lagre modellen.");
        return;
      }
      // A freshly created model has to become the selection, or the form stays in
      // "new" mode and the next save would create a duplicate.
      if (isNew && body?.model?.id) setSelectedId(body.model.id as string);
      setMessage("Modellen er lagret. Selskapssidene bruker den nye vektingen umiddelbart.");
      router.refresh();
    } catch {
      setError("Kunne ikke nå serveren.");
    } finally {
      setSaving(false);
    }
  };

  const promote = async () => {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/health-score/models/${selectedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "promote-fallback" }),
      });
      if (!response.ok) {
        setError("Kunne ikke gjøre modellen til standard.");
        return;
      }
      setMessage("Modellen er nå standardmodell for alle bransjer uten egen regel.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/health-score/models/${selectedId}`, {
        method: "DELETE",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error ?? "Kunne ikke slette modellen.");
        return;
      }
      setSelectedId(null);
      setMessage("Modellen er slettet.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <header>
        <h1 className="m-0 text-[26px] font-semibold tracking-[-0.01em] text-slate-950">
          Finansiell helse — scoremodeller
        </h1>
        <p className="mt-2 max-w-[86ch] text-[13.5px] leading-relaxed text-slate-600">
          Her bestemmer du hva helsescoren på selskapssidene faktisk måler: hvilke nøkkeltall som
          teller, hva hvert av dem er verdt, hvordan en rå verdi blir til poeng, og hvor grensene
          for karakter og risiko går. Endringer slår inn på selskapssidene med én gang de er lagret,
          og hver endring logges med hvem som gjorde den.
        </p>
      </header>

      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[240px_1fr]">
        {/* Model list */}
        <aside className="space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Modeller
          </div>
          {models.length === 0 ? (
            <p className="text-[12px] leading-relaxed text-slate-500">
              Ingen modeller er lagret ennå. Skjemaet er forhåndsutfylt med den innebygde
              standardmodellen — lagre den for å ta den i bruk.
            </p>
          ) : null}
          {models.map((model) => (
            <button
              key={model.id}
              type="button"
              onClick={() => selectModel(model)}
              className={`block w-full rounded-lg border px-3 py-2 text-left ${
                selectedId === model.id
                  ? "border-[var(--px-action)] bg-[var(--px-accent-soft)]"
                  : "border-slate-200 bg-white hover:border-slate-400"
              }`}
            >
              <span className="block truncate text-[13px] font-medium text-slate-900">
                {model.name}
              </span>
              <span className="mt-0.5 block text-[11px] text-slate-500">
                {model.isFallback
                  ? "Standard for alle bransjer"
                  : model.industryRules.length > 0
                    ? `NACE ${model.industryRules.map((rule) => rule.nacePrefix).join(", ")}`
                    : "Ingen bransjeregler"}
              </span>
              {!model.active ? (
                <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-slate-500">
                  avslått
                </span>
              ) : null}
              {!model.configValid ? (
                <span className="mt-1 inline-block rounded bg-rose-50 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-rose-700">
                  ugyldig config
                </span>
              ) : null}
            </button>
          ))}
          <button
            type="button"
            onClick={() => selectModel(null)}
            className={`block w-full rounded-lg border border-dashed px-3 py-2 text-left text-[12.5px] ${
              isNew
                ? "border-[var(--px-action)] text-[var(--px-action)]"
                : "border-slate-300 text-slate-600 hover:border-slate-500"
            }`}
          >
            + Ny modell
          </button>
        </aside>

        <div className="min-w-0 space-y-5">
          {/* Identity */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="m-0 text-[15px] font-semibold text-slate-900">Modell</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <FieldLabel>Navn</FieldLabel>
                <input
                  className={inputClass}
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder="Standardmodell"
                />
              </label>
              <label className="block">
                <FieldLabel>Nøkkel</FieldLabel>
                <input
                  className={inputClass}
                  value={draft.key}
                  onChange={(event) => setDraft({ ...draft, key: event.target.value })}
                  placeholder="standard"
                />
              </label>
              <label className="block sm:col-span-2">
                <FieldLabel>Beskrivelse</FieldLabel>
                <input
                  className={inputClass}
                  value={draft.description ?? ""}
                  onChange={(event) =>
                    setDraft({ ...draft, description: event.target.value || null })
                  }
                  placeholder="Når skal denne modellen brukes?"
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-[13px] text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.active}
                  disabled={draft.isFallback}
                  onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
                />
                Aktiv
              </label>
              {draft.isFallback ? (
                <span className="rounded-full bg-[var(--px-accent-soft)] px-3 py-1 text-[11.5px] text-[var(--px-action)]">
                  Standardmodell — brukes når ingen bransjeregel treffer
                </span>
              ) : selectedModel ? (
                <button
                  type="button"
                  onClick={promote}
                  disabled={saving}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-[12px] text-slate-700 hover:border-slate-400 disabled:opacity-50"
                >
                  Gjør til standardmodell
                </button>
              ) : null}
            </div>
          </section>

          {/* Industry rules */}
          {!draft.isFallback ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="m-0 text-[15px] font-semibold text-slate-900">Bransjeregler</h2>
              <p className="mt-1 max-w-[80ch] text-[12.5px] leading-relaxed text-slate-600">
                Selskaper med en NACE-kode som starter på en av disse kodene scores med denne
                modellen. Den lengste treffende koden vinner, så «68.20» slår «68». En kode kan bare
                tilhøre én modell — legger du den inn her, flyttes den fra modellen som eventuelt
                hadde den.
              </p>

              <div className="mt-3 space-y-2">
                {draft.industryRules.map((rule, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <input
                      className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] tabular-nums"
                      value={rule.nacePrefix}
                      aria-label={`NACE-kode ${index + 1}`}
                      placeholder="68.20"
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          industryRules: draft.industryRules.map((entry, position) =>
                            position === index
                              ? { ...entry, nacePrefix: event.target.value }
                              : entry,
                          ),
                        })
                      }
                    />
                    <input
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px]"
                      value={rule.note ?? ""}
                      aria-label={`Notat for regel ${index + 1}`}
                      placeholder="Notat (valgfritt)"
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          industryRules: draft.industryRules.map((entry, position) =>
                            position === index
                              ? { ...entry, note: event.target.value || null }
                              : entry,
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          industryRules: draft.industryRules.filter(
                            (_, position) => position !== index,
                          ),
                        })
                      }
                      className="rounded px-2 py-1 text-[11.5px] text-slate-500 hover:text-rose-700"
                    >
                      Fjern
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      industryRules: [...draft.industryRules, { nacePrefix: "", note: null }],
                    })
                  }
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-[12px] text-slate-600 hover:border-slate-400"
                >
                  Legg til NACE-kode
                </button>
              </div>
            </section>
          ) : null}

          {/* Pillars */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="m-0 text-[15px] font-semibold text-slate-900">
              Dimensjoner, nøkkeltall og vekting
            </h2>
            <p className="mt-1 max-w-[80ch] text-[12.5px] leading-relaxed text-slate-600">
              Vektene er relative — du trenger ikke få dem til å bli 100. Prosenten ved siden av
              viser hva hver vekt faktisk utgjør. Nøkkeltall merket «Regnskapslinjer» krever at vi
              har en mappet regnskapsoppstilling for selskapet; har vi bare hovedtallene, faller de
              ut og vekten fordeles på resten.
            </p>

            <div className="mt-4 space-y-3">
              {draft.config.pillars.map((pillar) => (
                <PillarEditor
                  key={pillar.key}
                  pillar={pillar}
                  pillarWeightTotal={pillarWeightTotal}
                  description={
                    dashboard.pillars.find((entry) => entry.key === pillar.key)?.description ?? ""
                  }
                  onChange={(next) =>
                    patchConfig({
                      pillars: draft.config.pillars.map((entry) =>
                        entry.key === next.key ? next : entry,
                      ),
                    })
                  }
                />
              ))}
            </div>
          </section>

          {/* Bands */}
          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="m-0 text-[15px] font-semibold text-slate-900">Karakterskala</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
                Laveste karakter må starte på 0 så hele skalaen er dekket.
              </p>
              <div className="mt-3 space-y-2">
                {draft.config.ratingBands.map((band, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <input
                      className="w-14 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-[13px] font-semibold"
                      value={band.grade}
                      aria-label={`Karakter ${index + 1}`}
                      onChange={(event) =>
                        patchConfig({
                          ratingBands: draft.config.ratingBands.map((entry, position) =>
                            position === index ? { ...entry, grade: event.target.value } : entry,
                          ),
                        })
                      }
                    />
                    <span className="text-[12px] text-slate-500">fra</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-[13px] tabular-nums"
                      value={band.minScore}
                      aria-label={`Nedre grense for karakter ${index + 1}`}
                      onChange={(event) =>
                        patchConfig({
                          ratingBands: draft.config.ratingBands.map((entry, position) =>
                            position === index
                              ? { ...entry, minScore: Number(event.target.value) }
                              : entry,
                          ),
                        })
                      }
                    />
                    <input
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[13px]"
                      value={band.label}
                      aria-label={`Beskrivelse av karakter ${index + 1}`}
                      onChange={(event) =>
                        patchConfig({
                          ratingBands: draft.config.ratingBands.map((entry, position) =>
                            position === index ? { ...entry, label: event.target.value } : entry,
                          ),
                        })
                      }
                    />
                    <select
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-[12.5px]"
                      value={band.tone}
                      aria-label={`Farge for karakter ${index + 1}`}
                      onChange={(event) =>
                        patchConfig({
                          ratingBands: draft.config.ratingBands.map((entry, position) =>
                            position === index
                              ? { ...entry, tone: event.target.value as HealthStatusTone }
                              : entry,
                          ),
                        })
                      }
                    >
                      {TONE_OPTIONS.map((tone) => (
                        <option key={tone.value} value={tone.value}>
                          {tone.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={draft.config.ratingBands.length <= 2}
                      onClick={() =>
                        patchConfig({
                          ratingBands: draft.config.ratingBands.filter(
                            (_, position) => position !== index,
                          ),
                        })
                      }
                      className="rounded px-1.5 py-1 text-[11.5px] text-slate-500 hover:text-rose-700 disabled:opacity-30"
                    >
                      Fjern
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={draft.config.ratingBands.length >= 8}
                  onClick={() =>
                    patchConfig({
                      ratingBands: [
                        ...draft.config.ratingBands,
                        { grade: "E", minScore: 20, label: "Svært svak", tone: "error" },
                      ],
                    })
                  }
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-[12px] text-slate-600 hover:border-slate-400 disabled:opacity-40"
                >
                  Legg til karakter
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="m-0 text-[15px] font-semibold text-slate-900">Risikonivåer</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
                Vises som «Risiko» i toppen av selskapssiden. Laveste nivå må starte på 0.
              </p>
              <div className="mt-3 space-y-2">
                {draft.config.riskBands.map((band, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[13px]"
                      value={band.label}
                      aria-label={`Risikonivå ${index + 1}`}
                      onChange={(event) =>
                        patchConfig({
                          riskBands: draft.config.riskBands.map((entry, position) =>
                            position === index ? { ...entry, label: event.target.value } : entry,
                          ),
                        })
                      }
                    />
                    <span className="text-[12px] text-slate-500">fra</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-[13px] tabular-nums"
                      value={band.minScore}
                      aria-label={`Nedre grense for risikonivå ${index + 1}`}
                      onChange={(event) =>
                        patchConfig({
                          riskBands: draft.config.riskBands.map((entry, position) =>
                            position === index
                              ? { ...entry, minScore: Number(event.target.value) }
                              : entry,
                          ),
                        })
                      }
                    />
                    <select
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-[12.5px]"
                      value={band.tone}
                      aria-label={`Farge for risikonivå ${index + 1}`}
                      onChange={(event) =>
                        patchConfig({
                          riskBands: draft.config.riskBands.map((entry, position) =>
                            position === index
                              ? { ...entry, tone: event.target.value as HealthStatusTone }
                              : entry,
                          ),
                        })
                      }
                    >
                      {TONE_OPTIONS.map((tone) => (
                        <option key={tone.value} value={tone.value}>
                          {tone.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={draft.config.riskBands.length <= 2}
                      onClick={() =>
                        patchConfig({
                          riskBands: draft.config.riskBands.filter(
                            (_, position) => position !== index,
                          ),
                        })
                      }
                      className="rounded px-1.5 py-1 text-[11.5px] text-slate-500 hover:text-rose-700 disabled:opacity-30"
                    >
                      Fjern
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Overrides + policy */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="m-0 text-[15px] font-semibold text-slate-900">
              Overstyring og manglende data
            </h2>

            <div className="mt-3 space-y-2">
              <div className="text-[12px] font-medium uppercase tracking-wider text-slate-500">
                Registerstatus
              </div>
              <p className="max-w-[80ch] text-[12.5px] leading-relaxed text-slate-600">
                Et konkursbo kan ha et pent siste regnskap. Her setter du taket på scoren, og
                eventuelt karakteren og risikonivået, uavhengig av hva tallene sier.
              </p>
              {draft.config.statusOverrides.map((override, index) => (
                <div key={override.status} className="flex flex-wrap items-center gap-2">
                  <span className="w-24 text-[13px] text-slate-800">
                    {STATUS_LABELS[override.status] ?? override.status}
                  </span>
                  <label className="flex items-center gap-1.5 text-[12px] text-slate-600">
                    maks score
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-[13px] tabular-nums"
                      value={override.capScore}
                      onChange={(event) =>
                        patchConfig({
                          statusOverrides: draft.config.statusOverrides.map((entry, position) =>
                            position === index
                              ? { ...entry, capScore: Number(event.target.value) }
                              : entry,
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-[12px] text-slate-600">
                    tvungen karakter
                    <select
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-[12.5px]"
                      value={override.forceGrade ?? ""}
                      onChange={(event) =>
                        patchConfig({
                          statusOverrides: draft.config.statusOverrides.map((entry, position) =>
                            position === index
                              ? { ...entry, forceGrade: event.target.value || null }
                              : entry,
                          ),
                        })
                      }
                    >
                      <option value="">ingen</option>
                      {draft.config.ratingBands.map((band) => (
                        <option key={band.grade} value={band.grade}>
                          {band.grade}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 text-[12px] text-slate-600">
                    tvungen risiko
                    <select
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-[12.5px]"
                      value={override.forceRiskLabel ?? ""}
                      onChange={(event) =>
                        patchConfig({
                          statusOverrides: draft.config.statusOverrides.map((entry, position) =>
                            position === index
                              ? { ...entry, forceRiskLabel: event.target.value || null }
                              : entry,
                          ),
                        })
                      }
                    >
                      <option value="">ingen</option>
                      {draft.config.riskBands.map((band) => (
                        <option key={band.label} value={band.label}>
                          {band.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
            </div>

            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="text-[12px] font-medium uppercase tracking-wider text-slate-500">
                Straff for tynt datagrunnlag
              </div>
              <p className="mt-1 max-w-[80ch] text-[12.5px] leading-relaxed text-slate-600">
                Uten dette blir et selskap vi bare har to hovedtall for scoret utelukkende på de to
                — og gjør de seg godt, får det en trygg karakter tallene ikke bærer. Straffen
                trekker fra på totalscoren i takt med hvor mye av modellen som står ubesvart, i
                stedet for å la nøkkeltall forsvinne eller late som de scoret null.
              </p>

              <label className="mt-3 flex items-center gap-2 text-[13px] text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.config.coveragePenalty.enabled}
                  onChange={(event) =>
                    patchConfig({
                      coveragePenalty: {
                        ...draft.config.coveragePenalty,
                        enabled: event.target.checked,
                      },
                    })
                  }
                />
                Trekk fra for manglende datadekning
              </label>

              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <FieldLabel>Styrke (%)</FieldLabel>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    disabled={!draft.config.coveragePenalty.enabled}
                    className={`${inputClass} disabled:opacity-40`}
                    value={draft.config.coveragePenalty.strength}
                    onChange={(event) =>
                      patchConfig({
                        coveragePenalty: {
                          ...draft.config.coveragePenalty,
                          strength: Number(event.target.value),
                        },
                      })
                    }
                  />
                  <span className="mt-1 block text-[11.5px] leading-relaxed text-slate-500">
                    Hvor stor del av scoren et selskap uten data i det hele tatt ville mistet.
                  </span>
                </label>
                <label className="block">
                  <FieldLabel>Full dekning nås ved (%)</FieldLabel>
                  <input
                    type="number"
                    min={10}
                    max={100}
                    disabled={!draft.config.coveragePenalty.enabled}
                    className={`${inputClass} disabled:opacity-40`}
                    value={draft.config.coveragePenalty.fullCoverageAt}
                    onChange={(event) =>
                      patchConfig({
                        coveragePenalty: {
                          ...draft.config.coveragePenalty,
                          fullCoverageAt: Number(event.target.value),
                        },
                      })
                    }
                  />
                  <span className="mt-1 block text-[11.5px] leading-relaxed text-slate-500">
                    Dekning på eller over dette regnes som fullstendig. Nesten ingen selskaper
                    besvarer 100 % av en bred modell.
                  </span>
                </label>
              </div>

              <p className="mt-2 text-[11.5px] text-slate-500">
                {draft.config.coveragePenalty.enabled
                  ? `Med disse innstillingene mister et selskap med 20 % dekning ${Math.round(
                      (draft.config.coveragePenalty.strength / 100) *
                        coverageShortfall(20, draft.config.coveragePenalty.fullCoverageAt) *
                        100,
                    )} % av scoren sin.`
                  : "Tynt datagrunnlag merkes, men koster ingen poeng."}
              </p>
            </div>

            <div className="mt-5 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
              <label className="block">
                <FieldLabel>Nøkkeltall uten data</FieldLabel>
                <select
                  className={inputClass}
                  value={draft.config.missingDataPolicy}
                  onChange={(event) =>
                    patchConfig({
                      missingDataPolicy: event.target.value as HealthMissingDataPolicy,
                    })
                  }
                >
                  {(Object.keys(MISSING_DATA_LABELS) as HealthMissingDataPolicy[]).map((policy) => (
                    <option key={policy} value={policy}>
                      {MISSING_DATA_LABELS[policy]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <FieldLabel>Minste datadekning før scoren flagges (%)</FieldLabel>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={inputClass}
                  value={draft.config.minimumCoverage}
                  onChange={(event) =>
                    patchConfig({ minimumCoverage: Number(event.target.value) })
                  }
                />
                <span className="mt-1 block text-[11.5px] leading-relaxed text-slate-500">
                  Under denne grensen får leseren beskjed om at scoren hviler på tynt grunnlag.
                  Scoren skjules ikke — den merkes.
                </span>
              </label>
            </div>
          </section>

          <HealthScorePreview config={draft.config} />

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-[var(--px-action)] px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-[var(--px-action-hover)] disabled:opacity-50"
            >
              {saving ? "Lagrer…" : isNew ? "Opprett modell" : "Lagre endringer"}
            </button>
            {selectedModel ? (
              <button
                type="button"
                onClick={duplicate}
                disabled={saving}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-[13px] text-slate-700 hover:border-slate-400 disabled:opacity-50"
              >
                Dupliser som ny modell
              </button>
            ) : null}
            {selectedModel && !selectedModel.isFallback ? (
              <button
                type="button"
                onClick={remove}
                disabled={saving}
                className="rounded-lg border border-rose-200 px-4 py-2.5 text-[13px] text-rose-700 hover:border-rose-400 disabled:opacity-50"
              >
                Slett modell
              </button>
            ) : null}
            {selectedModel ? (
              <span className="text-[11.5px] text-slate-500">
                Versjon {selectedModel.version} · sist endret{" "}
                {new Date(selectedModel.updatedAt).toLocaleString("nb-NO")}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {dashboard.recentChanges.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="m-0 text-[15px] font-semibold text-slate-900">Endringslogg</h2>
          <ul className="mt-3 space-y-1.5">
            {dashboard.recentChanges.map((change) => (
              <li key={change.id} className="text-[12.5px] text-slate-600">
                <span className="tabular-nums text-slate-500">
                  {new Date(change.createdAt).toLocaleString("nb-NO")}
                </span>{" "}
                · {change.action} · {change.modelKey} · {change.actorEmail ?? "ukjent bruker"}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
