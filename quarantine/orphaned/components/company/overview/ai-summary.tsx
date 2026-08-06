/**
 * KI-sammendrag (AI assessment) surface.
 *
 * The design calls for a generated narrative assessment of the company, but
 * there is no generation backend yet — and the product rule is to never ship
 * synthetic/back-filled prose. So this renders the surface chrome with an
 * honest "not available yet" state, ready to be filled when a real summary
 * service exists. It intentionally does not invent an assessment.
 */
export function AiSummary() {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--px-border-subtle)] bg-[var(--px-surface-strong)]">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--px-border-subtle)] bg-[var(--px-accent-soft)] px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span
            className="material-symbols-outlined text-[22px] text-[var(--px-accent)]"
            style={{ fontVariationSettings: "'FILL' 1" }}
            aria-hidden="true"
          >
            insights
          </span>
          <span className="data-label text-[12px] font-semibold uppercase text-[var(--px-accent)]">
            KI-sammendrag
          </span>
        </div>
        <span className="data-label text-[10px] font-semibold uppercase text-[var(--px-muted)]">
          Fjord KI · BRREG-data
        </span>
      </div>

      <div className="px-5 py-6">
        <div className="flex items-start gap-3 rounded-xl border border-dashed border-[var(--px-border)] bg-[var(--px-subtle)] p-4">
          <span className="material-symbols-outlined text-[20px] text-[var(--px-muted)]" aria-hidden="true">
            hourglass_empty
          </span>
          <div>
            <p className="text-sm font-semibold leading-6 text-[var(--px-text)]">
              KI-sammendraget er ikke tilgjengelig ennå
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--px-muted)]">
              Et automatisk generert sammendrag basert på offentlige registerdata kommer her. Inntil
              kilden er koblet på viser vi ingen vurdering – tallene nedenfor er hentet direkte fra
              regnskapene.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
