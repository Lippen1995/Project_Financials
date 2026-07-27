"use client";

import React, { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type { AnalysisDetail, AnalysisWorkflow } from "@/server/analysis/analysis-read-service";

type AnalysisFormValues = {
  title: string;
  purpose: string;
  workflow: AnalysisWorkflow;
  query: string;
  industryCodePrefixes: string;
  municipalityNumbers: string;
  legalForms: string;
  statuses: Array<"ACTIVE" | "DISSOLVED" | "BANKRUPT">;
  minEmployees: string;
  maxEmployees: string;
  minRevenue: string;
  maxRevenue: string;
  fiscalYear: string;
  missingDataPolicy: "EXCLUDE" | "INCLUDE_WITH_GAP";
  limit: string;
};

type AnalysisPayload = {
  title: string;
  purpose: string;
  workflow: AnalysisWorkflow;
  criteria: Record<string, unknown>;
  universeQuery: Record<string, unknown>;
  calculationConfig?: Record<string, unknown> | null;
};

function commaList(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : Number(trimmed);
}

export function buildAnalysisPayload(values: AnalysisFormValues): AnalysisPayload {
  const filters = {
    query: values.query.trim() || undefined,
    industryCodePrefixes: commaList(values.industryCodePrefixes),
    municipalityNumbers: commaList(values.municipalityNumbers),
    legalForms: commaList(values.legalForms).map((item) => item.toUpperCase()),
    statuses: values.statuses,
    minEmployees: optionalNumber(values.minEmployees),
    maxEmployees: optionalNumber(values.maxEmployees),
    minRevenue: optionalNumber(values.minRevenue),
    maxRevenue: optionalNumber(values.maxRevenue),
    fiscalYear: optionalNumber(values.fiscalYear),
    missingDataPolicy: values.missingDataPolicy,
    limit: Number(values.limit),
  };

  return {
    title: values.title.trim(),
    purpose: values.purpose.trim(),
    workflow: values.workflow,
    criteria: {
      query: filters.query,
      industryCodePrefixes: filters.industryCodePrefixes,
      municipalityNumbers: filters.municipalityNumbers,
      legalForms: filters.legalForms,
      statuses: filters.statuses,
      minEmployees: filters.minEmployees,
      maxEmployees: filters.maxEmployees,
      minRevenue: filters.minRevenue,
      maxRevenue: filters.maxRevenue,
      fiscalYear: filters.fiscalYear,
      missingDataPolicy: filters.missingDataPolicy,
    },
    universeQuery: {
      version: "company-universe-v1",
      workflow: values.workflow,
      ...filters,
    },
  };
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function initialValues(analysis?: AnalysisDetail): AnalysisFormValues {
  const universe = objectValue(analysis?.universeQuery);
  return {
    title: analysis?.title ?? "",
    purpose: analysis?.purpose ?? "",
    workflow: analysis?.workflow ?? "MNA_SCREENING",
    query: typeof universe.query === "string" ? universe.query : "",
    industryCodePrefixes: stringList(universe.industryCodePrefixes).join(", "),
    municipalityNumbers: stringList(universe.municipalityNumbers).join(", "),
    legalForms: stringList(universe.legalForms).join(", "),
    statuses: (stringList(universe.statuses).filter(
      (status): status is "ACTIVE" | "DISSOLVED" | "BANKRUPT" =>
        status === "ACTIVE" || status === "DISSOLVED" || status === "BANKRUPT",
    ).length > 0
      ? stringList(universe.statuses).filter(
          (status): status is "ACTIVE" | "DISSOLVED" | "BANKRUPT" =>
            status === "ACTIVE" || status === "DISSOLVED" || status === "BANKRUPT",
        )
      : ["ACTIVE"]),
    minEmployees: typeof universe.minEmployees === "number" ? String(universe.minEmployees) : "",
    maxEmployees: typeof universe.maxEmployees === "number" ? String(universe.maxEmployees) : "",
    minRevenue: typeof universe.minRevenue === "number" ? String(universe.minRevenue) : "",
    maxRevenue: typeof universe.maxRevenue === "number" ? String(universe.maxRevenue) : "",
    fiscalYear: typeof universe.fiscalYear === "number" ? String(universe.fiscalYear) : "",
    missingDataPolicy: universe.missingDataPolicy === "EXCLUDE" ? "EXCLUDE" : "INCLUDE_WITH_GAP",
    limit: typeof universe.limit === "number" ? String(universe.limit) : "100",
  };
}

export function isAnalysisContextLocked(
  analysis?: Pick<AnalysisDetail, "worklists" | "conclusion" | "sourceBasis">,
) {
  return Boolean(
    analysis &&
    (
      analysis.worklists.length > 0 ||
      analysis.conclusion != null ||
      (Array.isArray(analysis.sourceBasis) && analysis.sourceBasis.length > 0)
    ),
  );
}

const fieldClassName =
  "mt-2 w-full rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-3 text-sm text-[var(--px-text)] outline-none focus:border-[var(--px-accent)]";

export function AnalysisEditor({
  mode,
  workspace,
  analysis,
}: {
  mode: "create" | "edit";
  workspace: { id: string; name: string };
  analysis?: AnalysisDetail;
}) {
  const router = useRouter();
  const initial = initialValues(analysis);
  const contextLocked = isAnalysisContextLocked(analysis);
  const [statuses, setStatuses] = useState(initial.statuses);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggleStatus(status: "ACTIVE" | "DISSOLVED" | "BANKRUPT") {
    setStatuses((current) => (
      current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status]
    ));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (statuses.length === 0) {
      setError("Velg minst én selskapsstatus.");
      return;
    }
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const payload = buildAnalysisPayload({
      title: String(form.get("title") ?? ""),
      purpose: String(form.get("purpose") ?? ""),
      workflow: contextLocked
        ? initial.workflow
        : String(form.get("workflow")) as AnalysisWorkflow,
      query: contextLocked ? initial.query : String(form.get("query") ?? ""),
      industryCodePrefixes: contextLocked
        ? initial.industryCodePrefixes
        : String(form.get("industryCodePrefixes") ?? ""),
      municipalityNumbers: contextLocked
        ? initial.municipalityNumbers
        : String(form.get("municipalityNumbers") ?? ""),
      legalForms: contextLocked ? initial.legalForms : String(form.get("legalForms") ?? ""),
      statuses: contextLocked ? initial.statuses : statuses,
      minEmployees: contextLocked ? initial.minEmployees : String(form.get("minEmployees") ?? ""),
      maxEmployees: contextLocked ? initial.maxEmployees : String(form.get("maxEmployees") ?? ""),
      minRevenue: contextLocked ? initial.minRevenue : String(form.get("minRevenue") ?? ""),
      maxRevenue: contextLocked ? initial.maxRevenue : String(form.get("maxRevenue") ?? ""),
      fiscalYear: contextLocked ? initial.fiscalYear : String(form.get("fiscalYear") ?? ""),
      missingDataPolicy: contextLocked
        ? initial.missingDataPolicy
        : String(form.get("missingDataPolicy")) as AnalysisFormValues["missingDataPolicy"],
      limit: contextLocked ? initial.limit : String(form.get("limit") ?? "100"),
    });

    const body = mode === "create"
      ? { workspaceId: workspace.id, ...payload }
      : {
          expectedVersion: analysis?.version,
          ...payload,
          calculationConfig: analysis?.calculationConfig == null
            ? null
            : objectValue(analysis.calculationConfig),
        };
    try {
      const response = await fetch(
        mode === "create" ? "/api/analyses" : `/api/analyses/${analysis?.id}`,
        {
          method: mode === "create" ? "POST" : "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = await response.json() as {
        analysis?: { id: string };
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Kunne ikke lagre analysen.");
      const analysisId = mode === "create" ? result.analysis?.id : analysis?.id;
      if (!analysisId) throw new Error("Analysen ble lagret uten en gyldig ID.");
      router.push(`/analyses/${analysisId}` as never);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke lagre analysen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
        <div className="data-label text-[11px] text-[var(--px-accent)]">
          {mode === "create" ? "Ny analyse" : "Rediger analyse"}
        </div>
        <h2 className="mt-2 text-xl font-semibold text-[var(--px-text)]">Formål og arbeidsflyt</h2>
        <p className="mt-2 text-sm text-[var(--px-muted)]">
          Lagres i {workspace.name}. Selskaper hentes først fra det offisielle registeruniverset.
        </p>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <label className="text-sm font-medium text-[var(--px-text)]">
            Tittel
            <input name="title" required maxLength={200} defaultValue={initial.title} className={fieldClassName} />
          </label>
          <label className="text-sm font-medium text-[var(--px-text)]">
            Arbeidsflyt
            <select
              name="workflow"
              defaultValue={initial.workflow}
              disabled={contextLocked}
              className={fieldClassName}
            >
              <option value="MNA_SCREENING">M&amp;A-screening</option>
              <option value="SOURCING">Sourcing</option>
              <option value="COMPETITOR_ANALYSIS">Konkurrentanalyse</option>
            </select>
          </label>
          <label className="text-sm font-medium text-[var(--px-text)] lg:col-span-2">
            Formål
            <textarea name="purpose" required maxLength={2_000} rows={4} defaultValue={initial.purpose} className={fieldClassName} />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
        <div className="data-label text-[11px] text-[var(--px-accent)]">company-universe-v1</div>
        <h2 className="mt-2 text-xl font-semibold text-[var(--px-text)]">Registerunivers</h2>
        <p className="mt-2 text-sm text-[var(--px-muted)]">
          Tomme filtre betyr ingen avgrensning. Finansielle filtre bruker bare tilgjengelige Brreg-regnskap.
        </p>
        {contextLocked ? (
          <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            Univers og kriterier er låst fordi analysen har lagrede arbeidslister eller konklusjon.
            Tittel og formål kan fortsatt korrigeres.
          </p>
        ) : null}
        <fieldset disabled={contextLocked} className="mt-6 grid gap-4 lg:grid-cols-2">
          <label className="text-sm font-medium text-[var(--px-text)]">
            Navn eller søkeord
            <input name="query" maxLength={200} defaultValue={initial.query} className={fieldClassName} />
          </label>
          <label className="text-sm font-medium text-[var(--px-text)]">
            Næringskodeprefiks
            <input name="industryCodePrefixes" placeholder="62, 63.1" defaultValue={initial.industryCodePrefixes} className={fieldClassName} />
          </label>
          <label className="text-sm font-medium text-[var(--px-text)]">
            Kommunenumre
            <input name="municipalityNumbers" placeholder="0301, 4601" defaultValue={initial.municipalityNumbers} className={fieldClassName} />
          </label>
          <label className="text-sm font-medium text-[var(--px-text)]">
            Organisasjonsformer
            <input name="legalForms" placeholder="AS, ASA" defaultValue={initial.legalForms} className={fieldClassName} />
          </label>
          <div className="lg:col-span-2">
            <div className="text-sm font-medium text-[var(--px-text)]">Selskapsstatus</div>
            <div className="mt-2 flex flex-wrap gap-4">
              {([
                ["ACTIVE", "Aktiv"],
                ["DISSOLVED", "Oppløst"],
                ["BANKRUPT", "Konkurs"],
              ] as const).map(([value, label]) => (
                <label key={value} className="flex items-center gap-4 text-sm text-[var(--px-text)]">
                  <input
                    type="checkbox"
                    checked={statuses.includes(value)}
                    onChange={() => toggleStatus(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <label className="text-sm font-medium text-[var(--px-text)]">
            Min. ansatte
            <input name="minEmployees" type="number" min={0} defaultValue={initial.minEmployees} className={fieldClassName} />
          </label>
          <label className="text-sm font-medium text-[var(--px-text)]">
            Maks. ansatte
            <input name="maxEmployees" type="number" min={0} defaultValue={initial.maxEmployees} className={fieldClassName} />
          </label>
          <label className="text-sm font-medium text-[var(--px-text)]">
            Min. driftsinntekt
            <input name="minRevenue" type="number" min={0} defaultValue={initial.minRevenue} className={fieldClassName} />
          </label>
          <label className="text-sm font-medium text-[var(--px-text)]">
            Maks. driftsinntekt
            <input name="maxRevenue" type="number" min={0} defaultValue={initial.maxRevenue} className={fieldClassName} />
          </label>
          <label className="text-sm font-medium text-[var(--px-text)]">
            Regnskapsår
            <input name="fiscalYear" type="number" min={1990} max={2200} defaultValue={initial.fiscalYear} className={fieldClassName} />
          </label>
          <label className="text-sm font-medium text-[var(--px-text)]">
            Maksimalt antall kandidater
            <input name="limit" type="number" min={1} max={500} required defaultValue={initial.limit} className={fieldClassName} />
          </label>
          <label className="text-sm font-medium text-[var(--px-text)] lg:col-span-2">
            Manglende data
            <select name="missingDataPolicy" defaultValue={initial.missingDataPolicy} className={fieldClassName}>
              <option value="INCLUDE_WITH_GAP">Ta med og marker datagap</option>
              <option value="EXCLUDE">Ekskluder når filterdata mangler</option>
            </select>
          </label>
        </fieldset>
      </section>

      {error ? (
        <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-full border border-[var(--px-border)] px-5 py-2.5 text-sm font-semibold text-[var(--px-text)] hover:bg-[var(--px-subtle)]"
        >
          Avbryt
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-[var(--px-action)] px-5 py-2.5 text-sm font-semibold text-[var(--px-surface)] hover:bg-[var(--px-action-hover)] disabled:opacity-60"
        >
          {saving ? "Lagrer …" : mode === "create" ? "Opprett analyse" : "Lagre endringer"}
        </button>
      </div>
    </form>
  );
}
