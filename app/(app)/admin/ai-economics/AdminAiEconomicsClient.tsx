"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import type { AdminAiEconomicsDashboard } from "@/server/services/admin-ai-economics-service";

type Props = { model: AdminAiEconomicsDashboard };
type PlanRow = AdminAiEconomicsDashboard["plans"][number];

const labels: Record<string, string> = {
  CUSTOMER: "Vanlige brukere",
  INTERNAL_ADMIN: "Adminbrukere",
  INTERNAL_REVIEWER: "Finansielle kontrollører",
  USER: "Vanlig bruker",
  ADMIN: "Admin",
  FINANCIAL_REVIEWER: "Finansiell kontrollør",
  UNCLASSIFIED: "Ikke klassifisert (eldre data)",
};

function nok(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function count(value: number) {
  return new Intl.NumberFormat("nb-NO").format(value);
}

function date(value: string) {
  return new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Oslo",
  }).format(new Date(value));
}

function numberValue(form: FormData, key: string) {
  return Number(form.get(key));
}

function Field({
  label,
  name,
  defaultValue,
  description,
  min = 0,
  step = "any",
}: {
  label: string;
  name: string;
  defaultValue?: number;
  description?: string;
  min?: number;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="data-label text-[11px] uppercase tracking-widest text-[var(--px-muted)]">
        {label}
      </span>
      <input
        type="number"
        name={name}
        defaultValue={defaultValue}
        required
        min={min}
        step={step}
        className="mt-2 w-full rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2.5 text-sm text-[var(--px-text)] outline-none focus:border-[var(--px-accent)]"
      />
      {description ? (
        <span className="mt-1 block text-xs leading-5 text-[var(--px-muted)]">
          {description}
        </span>
      ) : null}
    </label>
  );
}

export default function AdminAiEconomicsClient({ model }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const submit = (
    url: string,
    payload: Record<string, unknown>,
    successText: string,
  ) => {
    startTransition(async () => {
      setFeedback(null);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (!response.ok) {
          setFeedback({
            tone: "error",
            text: result?.error ?? "Kunne ikke lagre endringen.",
          });
          return;
        }
        setFeedback({ tone: "success", text: successText });
        router.refresh();
      } catch {
        setFeedback({
          tone: "error",
          text: "Nettverksfeil: endringen ble ikke lagret.",
        });
      }
    });
  };

  const saveSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    submit("/api/admin/ai-economics/settings", {
      runtimeEnabled: form.get("runtimeEnabled") === "on",
      billingCurrency: String(form.get("billingCurrency") ?? "").trim().toUpperCase(),
      exchangeRateNok: numberValue(form, "exchangeRateNok"),
      fxRiskBufferBps: numberValue(form, "fxRiskBufferBps"),
      inputPricePerMillion: numberValue(form, "inputPricePerMillion"),
      cachedInputPricePerMillion: numberValue(form, "cachedInputPricePerMillion"),
      outputPricePerMillion: numberValue(form, "outputPricePerMillion"),
      globalMonthlyBudgetNok: numberValue(form, "globalMonthlyBudgetNok"),
      requestCostLimitNok: numberValue(form, "requestCostLimitNok"),
      dailyRequestLimit: numberValue(form, "dailyRequestLimit"),
      internalMonthlyTokenAllowance: numberValue(form, "internalMonthlyTokenAllowance"),
    }, "AI-økonomien ble oppdatert og endringen er loggført.");
  };

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
              AI-økonomi
            </p>
            <h1 className="editorial-display mt-3 text-[2.25rem] leading-tight text-[var(--px-text)]">
              Kostnader, kvoter og inntektsallokering
            </h1>
            <p className="mt-3 max-w-4xl text-base leading-7 text-[var(--px-muted)]">
              Styr hva Njord kan bruke, skill interne tester fra kundebruk, og
              modeller hvor mye av abonnementsinntekten som dekker AI. Leverandørkost
              beregnes i fakturavaluta; abonnement prises i NOK.
            </p>
          </div>
          <span className={`rounded-full px-4 py-2 text-sm font-medium ${
            model.runtimeControl.effectiveEnabled
              ? "bg-emerald-50 text-emerald-800"
              : "bg-amber-50 text-amber-800"
          }`}>
            {model.runtimeControl.effectiveEnabled ? "Betalt AI: aktiv" : "Betalt AI: stengt"}
          </span>
        </div>
      </section>

      {feedback ? (
        <div role="status" className={`rounded-2xl border p-5 text-sm ${
          feedback.tone === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-rose-200 bg-rose-50 text-rose-900"
        }`}>
          {feedback.text}
        </div>
      ) : null}

      {!model.settings ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <p className="font-semibold">Njord er låst inntil økonomien er konfigurert.</p>
          <p className="mt-2 text-sm leading-6">
            Fyll inn leverandørens reelle priser, referansekurs og sikkerhetsgrenser.
            Ingen pris eller valutakurs er forhåndsutfylt.
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          ["Fakturakost, estimat", nok(model.totals.estimatedCostNok)],
          ["Risikobudsjettert", nok(model.totals.budgetedCostNok)],
          ["Åpne reservasjoner", nok(model.totals.reservedCostNok)],
          ["Gjenstående budsjett", nok(model.totals.remainingBudgetNok)],
          ["Prognose måned", nok(model.totals.projectedBudgetedCostNok)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
            <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-muted)]">
              {label}
            </p>
            <p className="mt-3 text-xl font-semibold text-[var(--px-text)]">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
        <div className="grid gap-8 xl:grid-cols-[1fr_1.5fr]">
          <div>
            <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
              Valuta og sikkerhetsgrenser
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--px-text)]">
              Global AI-konfigurasjon
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--px-muted)]">
              Referansekursen konverterer leverandørkost til NOK. Risikobufferen
              brukes i kvoter og budsjett, mens forventet fakturakost vises uten buffer.
              Miljøets hovedbryter og API-nøkkel må også være aktive.
            </p>
            <div className="mt-4 rounded-xl border border-[var(--px-border)] bg-[var(--px-subtle)] p-4 text-sm text-[var(--px-text)]">
              Deploy-bryter:{" "}
              <span className="font-semibold">
                {model.runtimeControl.environmentMasterEnabled ? "aktiv" : "stengt"}
              </span>
              {" · "}Admin-bryter:{" "}
              <span className="font-semibold">
                {model.runtimeControl.adminEnabled ? "aktiv" : "stengt"}
              </span>
            </div>
            {model.settings ? (
              <p className="mt-4 text-xs text-[var(--px-muted)]">
                Versjon {model.settings.version}, sist endret {date(model.settings.updatedAt)}.
              </p>
            ) : null}
          </div>
          <form onSubmit={saveSettings} className="grid gap-4 md:grid-cols-2">
            <label>
              <span className="data-label text-[11px] uppercase tracking-widest text-[var(--px-muted)]">
                Fakturavaluta
              </span>
              <input
                name="billingCurrency"
                defaultValue={model.settings?.billingCurrency ?? ""}
                placeholder="USD"
                required
                pattern="[A-Za-z]{3}"
                maxLength={3}
                className="mt-2 w-full rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2.5 text-sm uppercase text-[var(--px-text)]"
              />
            </label>
            <Field label="Referansekurs, NOK" name="exchangeRateNok" defaultValue={model.settings?.exchangeRateNok} description="NOK per én enhet fakturavaluta." />
            <Field label="Valutarisikobuffer, bp" name="fxRiskBufferBps" defaultValue={model.settings?.fxRiskBufferBps} step="1" description="1500 bp tilsvarer 15 %." />
            <Field label="Inputpris / 1 mill." name="inputPricePerMillion" defaultValue={model.settings?.inputPricePerMillion} description="I fakturavaluta." />
            <Field label="Cachet input / 1 mill." name="cachedInputPricePerMillion" defaultValue={model.settings?.cachedInputPricePerMillion} description="I fakturavaluta." />
            <Field label="Outputpris / 1 mill." name="outputPricePerMillion" defaultValue={model.settings?.outputPricePerMillion} description="I fakturavaluta." />
            <Field label="Globalt månedsbudsjett, NOK" name="globalMonthlyBudgetNok" defaultValue={model.settings?.globalMonthlyBudgetNok} />
            <Field label="Maks per kall, NOK" name="requestCostLimitNok" defaultValue={model.settings?.requestCostLimitNok} />
            <Field label="Dagsgrense per bruker" name="dailyRequestLimit" defaultValue={model.settings?.dailyRequestLimit} min={1} step="1" />
            <Field label="Intern tokenkvote / måned" name="internalMonthlyTokenAllowance" defaultValue={model.settings?.internalMonthlyTokenAllowance} step="1" description="Egen per-bruker-kvote for admin og finansiell kontrollør." />
            <label className="flex items-center gap-4 rounded-xl border border-[var(--px-border)] bg-[var(--px-subtle)] p-4 md:col-span-2">
              <input type="checkbox" name="runtimeEnabled" defaultChecked={model.settings?.runtimeEnabled ?? false} className="h-4 w-4" />
              <span>
                <span className="block text-sm font-semibold text-[var(--px-text)]">
                  Tillat betalt AI med denne konfigurasjonen
                </span>
                <span className="mt-1 block text-xs text-[var(--px-muted)]">
                  Slå av for å stoppe nye reservasjoner når lagringen er fullført. Deploy-bryteren kan fortsatt stenge.
                </span>
              </span>
            </label>
            <button type="submit" disabled={isPending} className="rounded-full bg-[var(--px-action)] px-5 py-3 text-sm font-medium text-slate-50 hover:bg-[var(--px-action-hover)] disabled:opacity-50 md:col-span-2 md:justify-self-start">
              {isPending ? "Lagrer…" : "Lagre global konfigurasjon"}
            </button>
          </form>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
            Abonnement og AI-inntekt
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--px-text)]">Planøkonomi</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--px-muted)]">
            Inntekten er modellert som aktive abonnement × månedspris, ikke avstemt
            innbetalt Stripe-inntekt. «Kost + påslag» bruker risikobudsjettert
            AI-kost pluss valgt påslag, begrenset til planens modellerte
            abonnementsinntekt. Lagret pris og AI-rett gjelder produktstyringen her;
            Stripe-priser synkroniseres ikke før betalingsflyten er koblet til.
          </p>
        </div>
        {model.plans.map((plan) => (
          <PlanEditor key={plan.planKey} row={plan} pending={isPending} submit={submit} />
        ))}
        <PlanEditor row={null} pending={isPending} submit={submit} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <SplitTable title="Kostnad per brukertype" rows={model.splits.categories} />
        <SplitTable title="Kostnad per app-rolle" rows={model.splits.roles} />
        <SplitTable title="Kostnad per abonnement" rows={model.splits.plans} />
        <SplitTable title="Kostnad per modell" rows={model.splits.models} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)]">
        <div className="p-6">
          <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
            Kostnad per bruker
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--px-text)]">
            Brukerfordeling denne måneden
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse">
            <thead className="bg-[var(--px-subtle)]">
              <tr>
                {["Bruker", "Kategori", "Rolle", "Abonnement", "Kall", "Feil", "Tokens", "Estimert", "Risikobudsjett"].map((label) => (
                  <th key={label} className="px-4 py-4 text-left data-label text-[11px] uppercase tracking-widest text-[var(--px-text)]">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.users.length === 0 ? (
                <tr><td colSpan={9} className="px-6 py-8 text-sm text-[var(--px-muted)]">Ingen AI-forbruk registrert i perioden.</td></tr>
              ) : model.users.map((user) => (
                <tr key={`${user.userId}-${user.category}-${user.planKey}`} className="border-t border-[var(--px-border)]">
                  <td className="px-4 py-4">
                    <div className="font-medium text-[var(--px-text)]">{user.name ?? "Uten navn"}</div>
                    <div className="mt-1 text-xs text-[var(--px-muted)]">{user.email}</div>
                  </td>
                  <td className="px-4 py-4 text-sm text-[var(--px-muted)]">{labels[user.category] ?? user.category}</td>
                  <td className="px-4 py-4 text-sm text-[var(--px-muted)]">{labels[user.appRole] ?? user.appRole}</td>
                  <td className="px-4 py-4 text-sm text-[var(--px-muted)]">{user.planKey}</td>
                  <td className="px-4 py-4 text-sm text-[var(--px-text)]">{count(user.calls)}</td>
                  <td className="px-4 py-4 text-sm text-[var(--px-text)]">{count(user.failedCalls)}</td>
                  <td className="px-4 py-4 text-sm text-[var(--px-text)]">{count(user.usageTokens)}</td>
                  <td className="px-4 py-4 text-sm text-[var(--px-text)]">{nok(user.estimatedCostNok)}</td>
                  <td className="px-4 py-4 text-sm font-medium text-[var(--px-text)]">{nok(user.budgetedCostNok)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
        <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">Endringslogg</p>
        <div className="mt-4 space-y-3">
          {model.recentChanges.length === 0 ? (
            <p className="text-sm text-[var(--px-muted)]">Ingen endringer registrert.</p>
          ) : model.recentChanges.map((change) => (
            <div key={change.id} className="rounded-xl border border-[var(--px-border)] bg-[var(--px-subtle)] p-4 text-sm text-[var(--px-text)]">
              <span className="font-semibold">{change.actor}</span> oppdaterte{" "}
              {change.entityType === "SETTINGS" ? "global konfigurasjon" : change.entityKey}
              <span className="ml-2 text-[var(--px-muted)]">{date(change.createdAt)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function PlanEditor({
  row,
  pending,
  submit,
}: {
  row: PlanRow | null;
  pending: boolean;
  submit: (url: string, payload: Record<string, unknown>, success: string) => void;
}) {
  const plan = row?.configured;
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const planKey = String(form.get("planKey") ?? "").trim().toLowerCase();
    submit("/api/admin/ai-economics/plans", {
      planKey,
      displayName: String(form.get("displayName") ?? "").trim(),
      active: form.get("active") === "on",
      monthlyPriceNok: numberValue(form, "monthlyPriceNok"),
      includedAiUsageTokens: numberValue(form, "includedAiUsageTokens"),
      includedAiCostNok: numberValue(form, "includedAiCostNok"),
      allocationMode: String(form.get("allocationMode")),
      costPlusMarkupBps: numberValue(form, "costPlusMarkupBps"),
      fixedAiAllocationNokPerSubscriber: numberValue(form, "fixedAiAllocationNokPerSubscriber"),
      revenueShareBps: numberValue(form, "revenueShareBps"),
    }, `Abonnementet ${planKey} ble lagret.`);
  };

  return (
    <form onSubmit={save} className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-[var(--px-text)]">{plan?.displayName ?? row?.planKey ?? "Legg til abonnement"}</h3>
          {row ? (
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-[var(--px-muted)]">
              <span>{count(row.activeSubscribers)} aktive</span>
              <span>Estimert AI-kost: {nok(row.actualAiCostNok)}</span>
              <span>AI-kost inkl. valutarisiko: {nok(row.budgetedAiCostNok)}</span>
              <span>Modellert inntekt: {row.economics ? nok(row.economics.modeledSubscriptionRevenueNok) : "Ikke konfigurert"}</span>
              <span>AI-allokering: {row.economics ? nok(row.economics.allocatedAiRevenueNok) : "Ikke konfigurert"}</span>
              <span>AI-bidrag: {row.economics ? nok(row.economics.aiContributionNok) : "Ikke konfigurert"}</span>
            </div>
          ) : null}
        </div>
        {row && !plan ? <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">Ikke konfigurert</span> : null}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label>
          <span className="data-label text-[11px] uppercase tracking-widest text-[var(--px-muted)]">Plannøkkel</span>
          <input name="planKey" defaultValue={row?.planKey ?? ""} readOnly={Boolean(row)} required pattern="[a-z0-9][a-z0-9_-]*" className="mt-2 w-full rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2.5 text-sm text-[var(--px-text)] read-only:bg-[var(--px-subtle)]" />
        </label>
        <label>
          <span className="data-label text-[11px] uppercase tracking-widest text-[var(--px-muted)]">Visningsnavn</span>
          <input name="displayName" defaultValue={plan?.displayName ?? ""} required className="mt-2 w-full rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2.5 text-sm text-[var(--px-text)]" />
        </label>
        <Field label="Månedspris, NOK" name="monthlyPriceNok" defaultValue={plan?.monthlyPriceNok ?? 0} />
        <Field label="Inkludert AI-kost, NOK" name="includedAiCostNok" defaultValue={plan?.includedAiCostNok ?? 0} description="Hard månedlig ramme per abonnent, målt med valutarisikobuffer." />
        <Field label="Inkluderte AI-tokens" name="includedAiUsageTokens" defaultValue={plan?.includedAiUsageTokens ?? 0} step="1" />
        <label>
          <span className="data-label text-[11px] uppercase tracking-widest text-[var(--px-muted)]">Allokeringsmetode</span>
          <select name="allocationMode" defaultValue={plan?.allocationMode ?? "COST_PLUS"} className="mt-2 w-full rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2.5 text-sm text-[var(--px-text)]">
            <option value="COST_PLUS">Kost + påslag</option>
            <option value="FIXED_PER_SUBSCRIBER">Fast NOK per abonnent</option>
            <option value="REVENUE_SHARE">Andel av abonnementsinntekt</option>
          </select>
        </label>
        <Field label="Kostpåslag, bp" name="costPlusMarkupBps" defaultValue={plan?.costPlusMarkupBps ?? 0} step="1" description="2500 bp = kost + 25 %." />
        <Field label="Fast AI-NOK / abonnent" name="fixedAiAllocationNokPerSubscriber" defaultValue={plan?.fixedAiAllocationNokPerSubscriber ?? 0} />
        <Field label="Inntektsandel, bp" name="revenueShareBps" defaultValue={plan?.revenueShareBps ?? 0} step="1" description="2000 bp = 20 %." />
        <label className="flex items-center gap-4 rounded-xl border border-[var(--px-border)] bg-[var(--px-subtle)] p-4">
          <input type="checkbox" name="active" defaultChecked={plan?.active ?? false} className="h-4 w-4" />
          <span className="text-sm font-medium text-[var(--px-text)]">Planen kan bruke AI</span>
        </label>
      </div>
      <button type="submit" disabled={pending} className="mt-6 rounded-full bg-[var(--px-action)] px-5 py-3 text-sm font-medium text-slate-50 hover:bg-[var(--px-action-hover)] disabled:opacity-50">
        {pending ? "Lagrer…" : "Lagre abonnement"}
      </button>
    </form>
  );
}

function SplitTable({
  title,
  rows,
}: {
  title: string;
  rows: AdminAiEconomicsDashboard["splits"]["categories"];
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)]">
      <h2 className="p-6 text-lg font-semibold text-[var(--px-text)]">{title}</h2>
      <table className="w-full border-collapse">
        <thead className="bg-[var(--px-subtle)]">
          <tr>
            {["Kategori", "Kall", "Feil", "Tokens", "Estimert", "Risikobudsjett"].map((label) => (
              <th key={label} className="px-4 py-3 text-left data-label text-[11px] uppercase tracking-widest text-[var(--px-text)]">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-6 text-sm text-[var(--px-muted)]">Ingen registrert bruk.</td></tr>
          ) : rows.map((row) => (
            <tr key={row.key} className="border-t border-[var(--px-border)]">
              <td className="px-4 py-3 text-sm text-[var(--px-text)]">{labels[row.key] ?? row.key}</td>
              <td className="px-4 py-3 text-sm text-[var(--px-muted)]">{count(row.calls)}</td>
              <td className="px-4 py-3 text-sm text-[var(--px-muted)]">{count(row.failedCalls)}</td>
              <td className="px-4 py-3 text-sm text-[var(--px-muted)]">{count(row.usageTokens)}</td>
              <td className="px-4 py-3 text-sm text-[var(--px-muted)]">{nok(row.estimatedCostNok)}</td>
              <td className="px-4 py-3 text-sm font-medium text-[var(--px-text)]">{nok(row.budgetedCostNok)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
