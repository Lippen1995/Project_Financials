"use client";

import React, { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type { AnalysisStatus } from "@/server/analysis/analysis-read-service";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function textField(value: unknown, key: string) {
  const item = record(value)[key];
  return typeof item === "string" ? item : "";
}

function parseOrgNumbers(value: string) {
  const orgNumbers = [
    ...new Set(
      value
        .split(/[,;\r\n]+/)
        .map((item) => item.replace(/\s/g, ""))
        .filter(Boolean),
    ),
  ];
  if (orgNumbers.length === 0) {
    throw new Error("Legg inn minst ett organisasjonsnummer som kildegrunnlag.");
  }
  const invalid = orgNumbers.find((orgNumber) => !/^\d{9}$/.test(orgNumber));
  if (invalid) throw new Error(`Ugyldig organisasjonsnummer: ${invalid}.`);
  return orgNumbers;
}

export function buildOutcomePayload(input: {
  expectedVersion: number;
  status: AnalysisStatus;
  summary: string;
  nextStep: string;
  sourceOrgNumbers: string;
  existingConclusion: unknown;
  existingFollowUp: unknown;
}) {
  const summary = input.summary.trim();
  if (!summary) throw new Error("Konklusjonen kan ikke være tom.");
  const conclusion = {
    ...record(input.existingConclusion),
    summary,
  };
  const followUp = { ...record(input.existingFollowUp) };
  const nextStep = input.nextStep.trim();
  if (nextStep) followUp.nextStep = nextStep;
  else delete followUp.nextStep;

  return {
    expectedVersion: input.expectedVersion,
    status: input.status,
    conclusion,
    ...(Object.keys(followUp).length > 0 ? { followUp } : {}),
    sourceOrgNumbers: parseOrgNumbers(input.sourceOrgNumbers),
  };
}

const fieldClassName =
  "mt-2 w-full rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-3 text-sm text-[var(--px-text)] outline-none focus:border-[var(--px-accent)]";

export function AnalysisOutcomeEditor({
  analysisId,
  analysisVersion,
  status,
  conclusion,
  followUp,
  sourceOrgNumbers,
}: {
  analysisId: string;
  analysisVersion: number;
  status: AnalysisStatus;
  conclusion: unknown;
  followUp: unknown;
  sourceOrgNumbers: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const body = buildOutcomePayload({
        expectedVersion: analysisVersion,
        status: String(form.get("status")) as AnalysisStatus,
        summary: String(form.get("summary") ?? ""),
        nextStep: String(form.get("nextStep") ?? ""),
        sourceOrgNumbers: String(form.get("sourceOrgNumbers") ?? ""),
        existingConclusion: conclusion,
        existingFollowUp: followUp,
      });
      const response = await fetch(`/api/analyses/${analysisId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Kunne ikke lagre konklusjonen.");
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke lagre konklusjonen.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-semibold text-[var(--px-surface)] hover:bg-[var(--px-action-hover)]"
      >
        Lagre konklusjon
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6"
    >
      <div className="data-label text-[11px] text-[var(--px-accent)]">Analyseutfall</div>
      <h2 className="mt-2 text-xl font-semibold text-[var(--px-text)]">
        Konklusjon og oppfølging
      </h2>
      <p className="mt-2 text-sm text-[var(--px-muted)]">
        Kildegrunnlaget valideres mot det offisielle registerspeilet før lagring.
      </p>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <label className="text-sm font-medium text-[var(--px-text)]">
          Status
          <select name="status" defaultValue={status} className={fieldClassName}>
            <option value="DRAFT">Utkast</option>
            <option value="IN_PROGRESS">Pågår</option>
            <option value="COMPLETED">Ferdigstilt</option>
            <option value="ARCHIVED">Arkivert</option>
          </select>
        </label>
        <label className="text-sm font-medium text-[var(--px-text)]">
          Organisasjonsnumre i kildegrunnlaget
          <textarea
            name="sourceOrgNumbers"
            required
            rows={3}
            defaultValue={sourceOrgNumbers
              .map((orgNumber) => orgNumber.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3"))
              .join("\n")}
            className={fieldClassName}
          />
        </label>
        <label className="text-sm font-medium text-[var(--px-text)] lg:col-span-2">
          Konklusjon
          <textarea
            name="summary"
            required
            maxLength={10_000}
            rows={6}
            defaultValue={textField(conclusion, "summary")}
            className={fieldClassName}
          />
        </label>
        <label className="text-sm font-medium text-[var(--px-text)] lg:col-span-2">
          Neste steg
          <textarea
            name="nextStep"
            maxLength={5_000}
            rows={4}
            defaultValue={textField(followUp, "nextStep")}
            className={fieldClassName}
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-end gap-4">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full border border-[var(--px-border)] px-4 py-2 text-sm font-semibold text-[var(--px-text)] hover:bg-[var(--px-subtle)]"
        >
          Avbryt
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-semibold text-[var(--px-surface)] hover:bg-[var(--px-action-hover)] disabled:opacity-60"
        >
          {saving ? "Lagrer …" : "Lagre konklusjon"}
        </button>
      </div>
    </form>
  );
}
