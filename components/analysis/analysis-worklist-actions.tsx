"use client";

import React, { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type ParsedWorklistItem = {
  orgNumber: string;
  inclusionBasis: string[];
  dataGaps: string[];
  notes?: string;
};

function semicolonList(value: string) {
  return value.split(";").map((item) => item.trim()).filter(Boolean);
}

export function parseWorklistLines(value: string): ParsedWorklistItem[] {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error("Legg inn minst ett selskap.");
  return lines.map((line, index) => {
    const [rawOrgNumber = "", rawBasis = "", rawGaps = "", rawNotes = ""] = line
      .split("|")
      .map((part) => part.trim());
    const orgNumber = rawOrgNumber.replace(/\s/g, "");
    if (!/^\d{9}$/.test(orgNumber)) {
      throw new Error(`Linje ${index + 1} mangler et gyldig organisasjonsnummer.`);
    }
    const inclusionBasis = semicolonList(rawBasis);
    if (inclusionBasis.length === 0) {
      throw new Error(`Linje ${index + 1} mangler inklusjonsgrunn.`);
    }
    return {
      orgNumber,
      inclusionBasis,
      dataGaps: semicolonList(rawGaps),
      ...(rawNotes ? { notes: rawNotes } : {}),
    };
  });
}

const fieldClassName =
  "mt-2 w-full rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-3 text-sm text-[var(--px-text)] outline-none focus:border-[var(--px-accent)]";

export function WorklistCreateForm({
  analysisId,
  analysisVersion,
  criteriaVersion,
}: {
  analysisId: string;
  analysisVersion: number;
  criteriaVersion: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch(`/api/analyses/${analysisId}/worklists`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedAnalysisVersion: analysisVersion,
          type: String(form.get("type")),
          name: String(form.get("name") ?? ""),
          purpose: String(form.get("purpose") ?? ""),
          criteriaVersion,
          items: parseWorklistLines(String(form.get("items") ?? "")),
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Kunne ikke lagre arbeidslisten.");
      formElement.reset();
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke lagre arbeidslisten.");
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
        Ny arbeidsliste
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6"
    >
      <div className="data-label text-[11px] text-[var(--px-accent)]">Batch fra register-ID-er</div>
      <h3 className="mt-2 text-lg font-semibold text-[var(--px-text)]">Ny arbeidsliste</h3>
      <p className="mt-2 text-sm text-[var(--px-muted)]">
        Selskapsnavn og kilder hentes fra det offisielle registerspeilet ved lagring.
      </p>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <label className="text-sm font-medium text-[var(--px-text)]">
          Listetype
          <select name="type" className={fieldClassName}>
            <option value="LONGLIST">Longlist</option>
            <option value="SHORTLIST">Shortlist</option>
            <option value="SOURCING">Sourcingliste</option>
            <option value="PEER_SET">Peer-sett</option>
          </select>
        </label>
        <label className="text-sm font-medium text-[var(--px-text)]">
          Navn
          <input name="name" required maxLength={200} className={fieldClassName} />
        </label>
        <label className="text-sm font-medium text-[var(--px-text)] lg:col-span-2">
          Formål
          <textarea name="purpose" required maxLength={2_000} rows={3} className={fieldClassName} />
        </label>
        <label className="text-sm font-medium text-[var(--px-text)] lg:col-span-2">
          Organisasjonsnummer og dokumentasjon
          <textarea
            name="items"
            required
            rows={6}
            placeholder="Organisasjonsnummer | inklusjonsgrunn; flere grunnlag | datagap; flere gap | notat"
            className={fieldClassName}
          />
          <span className="mt-2 block text-xs text-[var(--px-muted)]">
            Én virksomhet per linje. Inklusjonsgrunn er obligatorisk; datagap og notat er valgfrie.
          </span>
        </label>
      </div>
      {error ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p> : null}
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
          {saving ? "Lagrer …" : "Lagre arbeidsliste"}
        </button>
      </div>
    </form>
  );
}

export function UniverseWorklistCreateForm({
  analysisId,
  analysisVersion,
}: {
  analysisId: string;
  analysisVersion: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch(
        `/api/analyses/${analysisId}/worklists/from-universe`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedAnalysisVersion: analysisVersion,
            type: String(form.get("type")),
            name: String(form.get("name") ?? ""),
            purpose: String(form.get("purpose") ?? ""),
          }),
        },
      );
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Kunne ikke kjøre universet.");
      formElement.reset();
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke kjøre universet.");
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
        Kjør lagret univers
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6"
    >
      <div className="data-label text-[11px] text-[var(--px-accent)]">
        company-universe-v1
      </div>
      <h3 className="mt-2 text-lg font-semibold text-[var(--px-text)]">
        Opprett arbeidsliste fra universet
      </h3>
      <p className="mt-2 text-sm text-[var(--px-muted)]">
        Den lagrede filter- og rangeringskontrakten kjøres på nytt. Bare komplette
        resultater fra det offisielle registerspeilet kan lagres.
      </p>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <label className="text-sm font-medium text-[var(--px-text)]">
          Listetype
          <select name="type" className={fieldClassName}>
            <option value="LONGLIST">Longlist</option>
            <option value="SHORTLIST">Shortlist</option>
            <option value="SOURCING">Sourcingliste</option>
            <option value="PEER_SET">Peer-sett</option>
          </select>
        </label>
        <label className="text-sm font-medium text-[var(--px-text)]">
          Navn
          <input name="name" required maxLength={200} className={fieldClassName} />
        </label>
        <label className="text-sm font-medium text-[var(--px-text)] lg:col-span-2">
          Formål
          <textarea name="purpose" required maxLength={2_000} rows={3} className={fieldClassName} />
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
          {saving ? "Kjører …" : "Kjør og lagre"}
        </button>
      </div>
    </form>
  );
}

export function WorklistItemActions({
  analysisId,
  sourceWorklistId,
  itemId,
  itemIndex,
  orderedItemIds,
  targets,
}: {
  analysisId: string;
  sourceWorklistId: string;
  itemId: string;
  itemIndex: number;
  orderedItemIds: string[];
  targets: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [targetWorklistId, setTargetWorklistId] = useState(targets[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "PATCH" | "POST", body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/analyses/${analysisId}/worklists/${sourceWorklistId}`,
        {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Handlingen kunne ikke lagres.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Handlingen kunne ikke lagres.");
    } finally {
      setBusy(false);
    }
  }

  function move(offset: -1 | 1) {
    const targetIndex = itemIndex + offset;
    if (targetIndex < 0 || targetIndex >= orderedItemIds.length) return;
    const next = [...orderedItemIds];
    [next[itemIndex], next[targetIndex]] = [next[targetIndex], next[itemIndex]];
    void send("PATCH", { itemIds: next });
  }

  return (
    <div className="min-w-48">
      <div className="flex flex-wrap gap-4">
        <button
          type="button"
          aria-label="Flytt opp"
          disabled={busy || itemIndex === 0}
          onClick={() => move(-1)}
          className="rounded-full border border-[var(--px-border)] px-3 py-1.5 text-xs font-semibold text-[var(--px-text)] hover:bg-[var(--px-subtle)] disabled:opacity-40"
        >
          ↑
        </button>
        <button
          type="button"
          aria-label="Flytt ned"
          disabled={busy || itemIndex === orderedItemIds.length - 1}
          onClick={() => move(1)}
          className="rounded-full border border-[var(--px-border)] px-3 py-1.5 text-xs font-semibold text-[var(--px-text)] hover:bg-[var(--px-subtle)] disabled:opacity-40"
        >
          ↓
        </button>
      </div>
      {targets.length > 0 ? (
        <div className="mt-2 flex gap-4">
          <select
            aria-label="Mål-arbeidsliste"
            value={targetWorklistId}
            onChange={(event) => setTargetWorklistId(event.target.value)}
            className="min-w-0 rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-2 py-1.5 text-xs text-[var(--px-text)]"
          >
            {targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
          </select>
          <button
            type="button"
            disabled={busy || !targetWorklistId}
            onClick={() => void send("POST", { itemId, targetWorklistId })}
            className="rounded-full border border-[var(--px-border)] px-3 py-1.5 text-xs font-semibold text-[var(--px-text)] hover:bg-[var(--px-subtle)] disabled:opacity-40"
          >
            Promoter
          </button>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
