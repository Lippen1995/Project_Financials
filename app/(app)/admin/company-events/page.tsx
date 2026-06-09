import Link from "next/link";

import { getCompanyEventReviewDashboard } from "@/server/news/company-event-admin-review-service";

import { reviewCompanyEventAction, reviewCompanyEventExposureAction } from "./actions";

export const dynamic = "force-dynamic";

const ISSUE_FEEDBACK_LABELS = {
  wrong_company: "Feil selskap",
  wrong_event_type: "Feil hendelsestype",
  duplicate: "Duplikat",
  dismissed: "Avvis",
} as const;

const EXPOSURE_LABELS: Record<string, string> = {
  direct: "Direkte",
  sector: "Sektor",
  petroleum: "Petroleum",
  commodity: "Råvare",
  regulatory: "Regulering",
  value_chain: "Verdikjede",
};

function formatTimestamp(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toneClass(tone: string | undefined) {
  if (tone === "error") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function feedbackRatings(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const relevanceScore =
    typeof record.relevanceScore === "number" ? record.relevanceScore : null;
  const investorValueScore =
    typeof record.investorValueScore === "number" ? record.investorValueScore : null;
  return relevanceScore === null && investorValueScore === null
    ? null
    : { relevanceScore, investorValueScore };
}

function buildReturnPath(searchParams: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string" && value) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `/admin/company-events?${query}` : "/admin/company-events";
}

export default async function AdminCompanyEventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const dashboard = await getCompanyEventReviewDashboard({
    search: typeof sp.q === "string" ? sp.q : undefined,
    status: typeof sp.status === "string" ? sp.status : undefined,
    exposureType: typeof sp.exposure === "string" ? sp.exposure : undefined,
    eventType: typeof sp.eventType === "string" ? sp.eventType : undefined,
    feedbackState:
      sp.feedback === "all" || sp.feedback === "reviewed" || sp.feedback === "negative" || sp.feedback === "unreviewed"
        ? sp.feedback
        : undefined,
    minInvestorValueScore: typeof sp.minScore === "string" ? Number(sp.minScore) : undefined,
    limit: typeof sp.limit === "string" ? Number(sp.limit) : undefined,
  });

  const returnPath = buildReturnPath(sp);
  const message = typeof sp.message === "string" ? sp.message : null;
  const tone = typeof sp.tone === "string" ? sp.tone : undefined;

  return (
    <div className="space-y-6 pb-12">
      <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
              Company Event Intelligence
            </p>
            <h1 className="editorial-display text-[2.4rem] leading-tight text-[var(--px-text)]">
              Review og kvalitetsløkke
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-[var(--px-muted)]">
              Filtrer høyverdige eventer, merk støy raskt og følg hvilke kilder som skaper for mye lavsignal. Dette er arbeidsflaten for å kalibrere motoren videre.
            </p>
          </div>
          <Link
            href="/admin"
            className="rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-2 text-sm text-[var(--px-text)] hover:bg-[var(--px-subtle)]"
          >
            Tilbake til admin
          </Link>
        </div>

        {message ? (
          <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${toneClass(tone)}`}>{message}</div>
        ) : null}

        <form method="GET" className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))]">
          <input
            name="q"
            defaultValue={dashboard.filters.search}
            placeholder="Søk selskap, org.nr. eller tittel"
            className="rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2 text-sm text-[var(--px-text)]"
          />
          <select
            name="feedback"
            defaultValue={dashboard.filters.feedbackState}
            className="rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2 text-sm text-[var(--px-text)]"
          >
            <option value="unreviewed">Uten review</option>
            <option value="all">Alle</option>
            <option value="reviewed">Reviewet</option>
            <option value="negative">Negativ feedback</option>
          </select>
          <select
            name="status"
            defaultValue={dashboard.filters.status}
            className="rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2 text-sm text-[var(--px-text)]"
          >
            <option value="">Alle statuser</option>
            {dashboard.options.statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select
            name="exposure"
            defaultValue={dashboard.filters.exposureType}
            className="rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2 text-sm text-[var(--px-text)]"
          >
            <option value="">Alle eksponeringer</option>
            {dashboard.options.exposureTypes.map((exposureType) => (
              <option key={exposureType} value={exposureType}>
                {EXPOSURE_LABELS[exposureType] ?? exposureType}
              </option>
            ))}
          </select>
          <select
            name="eventType"
            defaultValue={dashboard.filters.eventType}
            className="rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2 text-sm text-[var(--px-text)]"
          >
            <option value="">Alle eventtyper</option>
            {dashboard.options.eventTypes.map((eventType) => (
              <option key={eventType} value={eventType}>
                {eventType}
              </option>
            ))}
          </select>
          <input
            name="minScore"
            type="number"
            min={0}
            max={100}
            defaultValue={dashboard.filters.minInvestorValueScore}
            className="rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2 text-sm text-[var(--px-text)]"
          />
          <button
            type="submit"
            className="rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--px-action-hover)]"
          >
            Filtrer
          </button>
        </form>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
          <div className="data-label text-[11px] uppercase tracking-widest text-[var(--px-muted)]">Treff</div>
          <div className="editorial-display mt-3 text-[2.1rem] leading-none text-[var(--px-text)]">
            {dashboard.totals.matchingEvents.toLocaleString("nb-NO")}
          </div>
          <p className="mt-2 text-sm text-[var(--px-muted)]">Eventer som matcher filteret akkurat nå.</p>
        </div>
        <div className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
          <div className="data-label text-[11px] uppercase tracking-widest text-[var(--px-muted)]">Høy verdi, uten review</div>
          <div className="editorial-display mt-3 text-[2.1rem] leading-none text-[var(--px-text)]">
            {dashboard.totals.highValueUnreviewed.toLocaleString("nb-NO")}
          </div>
          <p className="mt-2 text-sm text-[var(--px-muted)]">Bør vurderes først for å lære motoren raskt.</p>
        </div>
        <div className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
          <div className="data-label text-[11px] uppercase tracking-widest text-[var(--px-muted)]">Negativ feedback</div>
          <div className="editorial-display mt-3 text-[2.1rem] leading-none text-[var(--px-text)]">
            {dashboard.totals.negativeReviewed.toLocaleString("nb-NO")}
          </div>
          <p className="mt-2 text-sm text-[var(--px-muted)]">Signal på feilklassifiseringer og støy.</p>
        </div>
        <div className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
          <div className="data-label text-[11px] uppercase tracking-widest text-[var(--px-muted)]">Feedback-rader</div>
          <div className="editorial-display mt-3 text-[2.1rem] leading-none text-[var(--px-text)]">
            {dashboard.totals.totalFeedback.toLocaleString("nb-NO")}
          </div>
          <p className="mt-2 text-sm text-[var(--px-muted)]">Grunnlaget vi kan bruke for shadow mode og kalibrering.</p>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(22rem,1fr)]">
        <div className="space-y-4">
          {dashboard.items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
                      {item.company.name}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {item.eventType}
                    </span>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      Score {Math.round(item.investorValueScore)}
                    </span>
                    {item.routineDisclosure ? (
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        Rutinemelding
                      </span>
                    ) : null}
                  </div>
                  <h2 className="text-lg font-semibold text-[var(--px-text)]">{item.title}</h2>
                  <p className="text-sm text-[var(--px-muted)]">
                    {item.summary ?? "Ingen oppsummering lagret."}
                  </p>
                  <p className="text-xs text-[var(--px-muted)]">
                    Oppdatert {formatTimestamp(item.lastSeen)} · confidence {(item.confidenceScore * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.exposures.map((exposure) => (
                    <span
                      key={`${item.id}-${exposure.exposureType}`}
                      className="rounded-full border border-[var(--px-border)] bg-[var(--px-subtle)] px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--px-text)]"
                    >
                      {EXPOSURE_LABELS[exposure.exposureType] ?? exposure.exposureType}
                      {exposure.exposureLevel ? ` · ${exposure.exposureLevel}` : ""}
                    </span>
                  ))}
                </div>
              </div>

              {item.exposures.some((exposure) => exposure.exposureType !== "direct") ? (
                <div className="mt-4 space-y-3 border-t border-[var(--px-border)] pt-4">
                  <p className="data-label text-[10px] uppercase tracking-widest text-[var(--px-muted)]">
                    Målspesifikk read-across
                  </p>
                  {item.exposures
                    .filter((exposure) => exposure.exposureType !== "direct")
                    .map((exposure) => (
                      <form
                        key={exposure.id}
                        action={reviewCompanyEventExposureAction}
                        className="rounded-xl border border-[var(--px-border)] p-4"
                      >
                        <input type="hidden" name="exposureId" value={exposure.id} />
                        <input type="hidden" name="returnPath" value={returnPath} />
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-[var(--px-text)]">
                              {exposure.sourceCompanyName} → {exposure.targetCompanyName}
                            </p>
                            <p className="mt-1 text-xs text-[var(--px-muted)]">
                              {exposure.exposureLevel ?? exposure.exposureType} · {exposure.feedPolicy ?? "ukjent policy"}
                            </p>
                            {exposure.rationale ? (
                              <p className="mt-1 text-xs text-[var(--px-muted)]">{exposure.rationale}</p>
                            ) : null}
                          </div>
                          {exposure.latestFeedback ? (
                            <span className="rounded-full border border-[var(--px-border)] bg-[var(--px-subtle)] px-2 py-1 text-[10px] font-semibold text-[var(--px-text)]">
                              {exposure.latestFeedback.label} · {Math.round(exposure.latestFeedback.relevanceScore)}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <input
                            name="relevanceScore"
                            type="number"
                            min={0}
                            max={100}
                            step={5}
                            defaultValue={Math.round(exposure.exposureScore * 100)}
                            aria-label="Relevans for målselskapet"
                            className="rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2 text-sm text-[var(--px-text)]"
                          />
                          <input
                            name="investorValueScore"
                            type="number"
                            min={0}
                            max={100}
                            step={5}
                            defaultValue={Math.round(item.investorValueScore * exposure.exposureScore)}
                            aria-label="Investorverdi for målselskapet"
                            className="rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2 text-sm text-[var(--px-text)]"
                          />
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                          <input
                            name="issueTags"
                            placeholder="Feiltagger, kommaseparert"
                            className="rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2 text-sm text-[var(--px-text)]"
                          />
                          <input
                            name="notes"
                            placeholder="Begrunn koblingen"
                            className="rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2 text-sm text-[var(--px-text)]"
                          />
                          <button
                            type="submit"
                            className="rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--px-action-hover)]"
                          >
                            Lagre
                          </button>
                        </div>
                      </form>
                    ))}
                </div>
              ) : null}

              {item.scoreExplanation ? (
                <div className="mt-4 rounded-xl bg-[var(--px-subtle)] p-4">
                  <p className="data-label text-[10px] uppercase tracking-widest text-[var(--px-muted)]">Hvorfor scorer den?</p>
                  <p className="mt-2 text-sm text-[var(--px-text)]">
                    {item.scoreExplanation.topDrivers.join(" · ")}
                  </p>
                  {item.scoreExplanation.penalties.length > 0 ? (
                    <p className="mt-1 text-xs text-amber-700">{item.scoreExplanation.penalties.join(" · ")}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <p className="data-label text-[10px] uppercase tracking-widest text-[var(--px-muted)]">Evidens</p>
                  {item.evidence.map((evidence) => (
                    <div key={evidence.documentId} className="rounded-xl border border-[var(--px-border)] p-3">
                      <a
                        href={evidence.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-[var(--px-text)] hover:text-[var(--px-accent)]"
                      >
                        {evidence.title}
                      </a>
                      <p className="mt-1 text-xs text-[var(--px-muted)]">
                        {evidence.sourceName} · {formatTimestamp(evidence.publishedAt)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--px-muted)]">
                        {evidence.reasons.join(" · ")}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="data-label text-[10px] uppercase tracking-widest text-[var(--px-muted)]">Siste vurderinger</p>
                  {item.latestFeedback.length > 0 ? (
                    item.latestFeedback.map((feedback, index) => (
                      <div key={`${item.id}-feedback-${index}`} className="rounded-xl border border-[var(--px-border)] p-3">
                        <p className="text-sm font-medium text-[var(--px-text)]">
                          {feedback.action} · {feedback.label}
                        </p>
                        <p className="mt-1 text-xs text-[var(--px-muted)]">
                          {feedback.reviewerName ?? "Ukjent"} · {formatTimestamp(feedback.reviewedAt)}
                        </p>
                        {feedback.notes ? (
                          <p className="mt-1 text-xs text-[var(--px-muted)]">{feedback.notes}</p>
                        ) : null}
                        {feedbackRatings(feedback.correctedValue) ? (
                          <p className="mt-1 text-xs text-[var(--px-muted)]">
                            Relevans {Math.round(feedbackRatings(feedback.correctedValue)?.relevanceScore ?? 0)}
                            {" · "}
                            Investorverdi {Math.round(feedbackRatings(feedback.correctedValue)?.investorValueScore ?? 0)}
                          </p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-[var(--px-border)] p-3 text-sm text-[var(--px-muted)]">
                      Ingen feedback registrert ennå.
                    </div>
                  )}
                </div>
              </div>

              <form action={reviewCompanyEventAction} className="mt-4 space-y-3 border-t border-[var(--px-border)] pt-4">
                <input type="hidden" name="eventId" value={item.id} />
                <input type="hidden" name="returnPath" value={returnPath} />
                <input type="hidden" name="previousInvestorValueScore" value={item.investorValueScore} />
                <input
                  type="hidden"
                  name="previousRelevanceScore"
                  value={Math.round(item.relevanceScore)}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="data-label text-[10px] uppercase text-[var(--px-muted)]">
                      Relevans for selskapet
                    </span>
                    <input
                      name="relevanceScore"
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      defaultValue={Math.round(item.relevanceScore)}
                      className="w-full rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2 text-sm text-[var(--px-text)]"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="data-label text-[10px] uppercase text-[var(--px-muted)]">
                      Investorverdi
                    </span>
                    <input
                      name="investorValueScore"
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      defaultValue={Math.round(item.investorValueScore)}
                      className="w-full rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2 text-sm text-[var(--px-text)]"
                    />
                  </label>
                </div>
                <input
                  type="text"
                  name="notes"
                  placeholder="Begrunn vurderingen (valgfritt)"
                  className="w-full rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2 text-sm text-[var(--px-text)]"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    name="action"
                    value="rated"
                    className="rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--px-action-hover)]"
                  >
                    Lagre gradert vurdering
                  </button>
                  {Object.entries(ISSUE_FEEDBACK_LABELS).map(([action, label]) => (
                    <button
                      key={action}
                      type="submit"
                      name="action"
                      value={action}
                      className="rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2 text-sm text-[var(--px-text)] hover:bg-[var(--px-subtle)]"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </form>
            </article>
          ))}

          {dashboard.items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--px-border)] bg-[var(--px-surface)] p-6 text-sm text-[var(--px-muted)]">
              Ingen company events matcher filteret akkurat nå.
            </div>
          ) : null}
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
            <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-muted)]">Noisy sources</p>
            <div className="mt-3 space-y-3">
              {dashboard.quality.staleNoisySourceCandidates.slice(0, 5).map((source) => (
                <div key={source.sourceId} className="rounded-xl bg-[var(--px-subtle)] p-3">
                  <p className="text-sm font-medium text-[var(--px-text)]">{source.sourceId}</p>
                  <p className="mt-1 text-xs text-[var(--px-muted)]">
                    {source.documentCount} dokumenter · event-rate {source.eventRate}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
            <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-muted)]">False positive candidates</p>
            <div className="mt-3 space-y-3">
              {dashboard.quality.falsePositiveCandidates.lowEntityConfidenceHighScore.slice(0, 4).map((candidate) => (
                <div key={candidate.eventId} className="rounded-xl bg-[var(--px-subtle)] p-3">
                  <p className="text-sm font-medium text-[var(--px-text)]">{candidate.title}</p>
                  <p className="mt-1 text-xs text-[var(--px-muted)]">
                    Score {Math.round(candidate.investorValueScore)} · entity confidence {candidate.entityConfidence ?? 0}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
