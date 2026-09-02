"use client";

import { useState } from "react";
import Link from "next/link";

import { NjordAskPanel } from "@/components/njord/njord-ask-panel";
import { NjordCapabilityExplorer } from "@/components/njord/njord-capability-explorer";
import { NjordChapterReader } from "@/components/njord/njord-chapter-reader";
import { NjordMark } from "@/components/njord/njord-mark";
import {
  NJORD_ASSOCIATIONS,
  NJORD_CLAIM_KINDS,
  NJORD_PASSAGE_STAGES,
  NJORD_SOURCES,
  NJORD_TRANSLATIONS,
  njordAskHref,
} from "@/lib/njord-intro";

const SECTION_INNER = "mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-10";

function AskNjordButton({ onClick, tone }: { onClick: () => void; tone: "accent" | "light" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        tone === "accent"
          ? "inline-flex items-center gap-2.5 rounded-full bg-[var(--px-action)] px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--px-action-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)] focus-visible:ring-offset-2"
          : "inline-flex items-center gap-2.5 rounded-full bg-white px-7 py-4 text-[15px] font-semibold text-[var(--px-panel)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--px-panel)]"
      }
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
        bolt
      </span>
      Spør Njord
    </button>
  );
}

/**
 * Skjematisk figur som viser formen på en utvikling og hva som skjer når et år mangler.
 * Den har med vilje ingen tall, ingen akseverdier og ingen selskapsnavn — poenget er
 * dekningsgapet, ikke et datasett.
 */
function CoverageGapDiagram() {
  return (
    <figure className="mt-6 rounded-xl border border-[var(--px-border)] bg-[var(--px-bg)] px-4 pb-3.5 pt-4">
      <div className="flex items-baseline justify-between gap-4">
        <figcaption className="data-label text-[8.5px] uppercase text-[var(--px-muted)]">
          Utvikling over tid
        </figcaption>
        <span className="data-label text-[8.5px] uppercase text-[var(--px-muted)]">
          Skjematisk · uten tall
        </span>
      </div>
      <svg
        viewBox="0 0 640 200"
        role="img"
        aria-label="Skjematisk figur med tre kurver: én som stiger jevnt, én som ligger flat og én som faller og brytes i en stiplet linje der siste år mangler."
        className="mt-3 block h-auto w-full"
      >
        <g stroke="var(--px-chart-grid)" strokeWidth="1">
          <path d="M16 24 H624" />
          <path d="M16 68 H624" />
          <path d="M16 112 H624" />
          <path d="M16 156 H624" />
        </g>
        <path
          d="M40 118 L186 94 L332 104 L478 64 L608 34"
          fill="none"
          stroke="var(--px-chart-1)"
          strokeWidth="2.25"
          strokeLinecap="round"
        />
        <path
          d="M40 132 L186 128 L332 146 L478 142 L608 124"
          fill="none"
          stroke="var(--px-chart-2)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M40 104 L186 122 L332 158 L478 170"
          fill="none"
          stroke="var(--px-chart-3)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M478 170 L608 164"
          fill="none"
          stroke="var(--px-chart-3)"
          strokeWidth="2"
          strokeDasharray="4 4"
          strokeLinecap="round"
        />
      </svg>
      <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--px-border-subtle)] pt-3">
        <span className="inline-flex items-center gap-2 text-xs text-[var(--px-text)]">
          <span aria-hidden="true" className="block h-0.5 w-4 bg-[var(--px-chart-1)]" />
          Jevn forbedring
        </span>
        <span className="inline-flex items-center gap-2 text-xs text-[var(--px-text)]">
          <span aria-hidden="true" className="block h-0.5 w-4 bg-[var(--px-chart-2)]" />
          Flat utvikling
        </span>
        <span className="inline-flex items-center gap-2 text-xs text-[var(--px-muted)]">
          <span aria-hidden="true" className="block h-0.5 w-4 bg-[var(--px-chart-3)]" />
          Fallende · siste år ikke publisert
        </span>
      </div>
    </figure>
  );
}

export function NjordIntroPage() {
  const [askOpen, setAskOpen] = useState(false);
  const openAsk = () => setAskOpen(true);

  return (
    <div className="bg-[var(--px-bg)] text-[var(--px-text)]">
      {/* 1 — Hero */}
      <section className={`${SECTION_INNER} pb-24 pt-16 lg:pb-28 lg:pt-24`}>
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-16">
          <div>
            <div className="data-label text-[10px] uppercase text-[var(--px-muted)]">
              Njord · Digital analytiker
            </div>
            <h1 className="editorial-display mt-5 text-[44px] leading-[1.04] text-[var(--px-text)] sm:text-[56px] lg:text-[64px]">
              Bli kjent med Njord
            </h1>
            <p className="mt-5 text-[20px] font-medium leading-[1.35] tracking-[-0.02em] text-[var(--px-accent)] sm:text-[22px]">
              Din digitale analytiker
            </p>
            <p className="mt-6 max-w-[62ch] text-[17px] leading-[1.62] text-[var(--px-muted)] sm:text-[18px]">
              Njord er intelligenslaget i Fjord Insight. Han kombinerer selskapsdata, regnskap,
              eierskap, dokumenter, nyheter og andre kilder for å hjelpe deg med å forstå selskaper
              raskere — og gå fra informasjon til innsikt.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <AskNjordButton onClick={openAsk} tone="accent" />
              <a
                href="#hva-er-njord"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--px-border)] px-5 py-3 text-sm font-semibold text-[var(--px-text)] transition-colors hover:bg-[var(--px-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)]"
              >
                Se hvordan han arbeider
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                  arrow_downward
                </span>
              </a>
            </div>

            <dl className="mt-11 flex flex-wrap gap-7 border-t border-[var(--px-border-subtle)] pt-5">
              {[
                { label: "Rolle", value: "Analytiker og researchpartner" },
                { label: "Grunnlag", value: "Offentlige registre og dokumenter" },
                { label: "Prinsipp", value: "Alltid etterprøvbart" },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="data-label text-[9px] uppercase text-[var(--px-muted)]">
                    {item.label}
                  </dt>
                  <dd className="mt-1.5 text-sm font-medium text-[var(--px-text)]">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-2xl bg-[var(--px-panel)] p-8 text-white">
            <div className="flex items-center gap-4">
              <NjordMark className="h-16 w-16 border-white/20" />
              <div>
                <div className="text-[17px] font-semibold tracking-[-0.01em]">Njord</div>
                <div className="data-label mt-1 text-[9px] uppercase text-white/60">
                  Digital analytiker · Fjord Insight
                </div>
              </div>
            </div>
            <p className="mt-6 text-[15px] leading-[1.6] text-white/80">
              Njord arbeider på tvers av informasjonen som finnes i Fjord Insight. Han svarer med
              grunnlaget synlig — aldri med et svar du ikke kan kontrollere.
            </p>

            <div className="data-label mt-7 text-[9px] uppercase text-white/45">
              Kilder han arbeider i
            </div>
            <dl className="mt-3 divide-y divide-white/10">
              {NJORD_SOURCES.map((source) => (
                <div key={source.name} className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-sm text-white">{source.name}</dt>
                  <dd className="data-label text-[9px] uppercase text-white/50">{source.origin}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-6 border-t border-white/10 pt-4 text-[13px] leading-[1.55] text-white/60">
              Njord har ikke alltid rett. Derfor viser han hva han bygger på, og hvor grunnlaget er
              tynt.
            </p>
          </div>
        </div>
      </section>

      {/* 2 — Hva er Njord */}
      <section
        id="hva-er-njord"
        className="scroll-mt-24 border-t border-[var(--px-border-subtle)] bg-[var(--px-surface-strong)]"
      >
        <div className={`${SECTION_INNER} py-20 lg:py-28`}>
          <div className="max-w-[76ch]">
            <div className="data-label text-[10px] uppercase text-[var(--px-muted)]">
              Hva er Njord
            </div>
            <h2 className="editorial-display mt-4 text-[32px] leading-[1.12] sm:text-[42px]">
              Bygget for å gjøre det en god analytiker gjør
            </h2>
            <p className="mt-5 text-[17px] leading-[1.62] text-[var(--px-muted)] sm:text-[18px]">
              Finne relevant informasjon, koble datapunkter, stille spørsmål ved det åpenbare og
              trekke fram det som faktisk betyr noe. I stedet for at du må lete gjennom regnskap,
              årsrapporter, selskapsregistre, eierskapsdata og nyheter hver for seg, arbeider Njord
              på tvers av informasjonen som finnes i Fjord Insight.
            </p>
          </div>

          <NjordCapabilityExplorer />
        </div>
      </section>

      {/* 2b — Etterprøvbarhet */}
      <section className="border-t border-[var(--px-border-subtle)] bg-[var(--px-bg)]">
        <div className={`${SECTION_INNER} py-20 lg:py-24`}>
          <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-14">
            <div>
              <div className="data-label text-[10px] uppercase text-[var(--px-muted)]">
                Etterprøvbarhet
              </div>
              <h2 className="editorial-display mt-4 text-[30px] leading-[1.14] sm:text-[38px]">
                Et svar uten grunnlag er ikke et svar
              </h2>
              <p className="mt-5 text-[17px] leading-[1.62] text-[var(--px-muted)]">
                Njord er ikke en allvitende AI. Hver påstand han legger fram er knyttet til kilden
                den kommer fra, med kildesystem, kildetype, tidspunkt for henting og normalisering.
                Beregninger vises som beregninger, forklaringer som forklaringer.
              </p>
              <p className="mt-4 text-[17px] leading-[1.62] text-[var(--px-muted)]">
                Mangler grunnlaget, sier han det. Fjord Insight fyller aldri hull med konstruerte
                tall.
              </p>
              <p className="mt-4 text-[17px] leading-[1.62] text-[var(--px-muted)]">
                Det gjelder også denne siden. Kortet ved siden av viser oppbygningen av et svar —
                ikke et svar. Ekte tall får du fra Njord, med selskapet foran deg.
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface-strong)] p-7">
              <div className="flex items-center justify-between gap-4 border-b border-[var(--px-border-subtle)] pb-4">
                <div className="flex items-center gap-3">
                  <NjordMark className="h-8 w-8" />
                  <span className="text-sm font-semibold text-[var(--px-text)]">Njord</span>
                </div>
                <span className="data-label rounded-full border border-[var(--px-border)] px-2.5 py-1.5 text-[8.5px] uppercase text-[var(--px-muted)]">
                  Svarformat · ikke et svar
                </span>
              </div>

              <div className="mt-5 border-l-2 border-[var(--px-accent)] pl-3.5">
                <div className="data-label text-[8.5px] uppercase text-[var(--px-muted)]">
                  Slik ser et spørsmål ut
                </div>
                <p className="mt-1.5 text-[15px] font-medium leading-6 text-[var(--px-text)]">
                  Hvilket av disse selskapene har hatt best driftsutvikling de siste fem årene?
                </p>
              </div>

              <div className="mt-5">
                <div className="data-label text-[8.5px] uppercase text-[var(--px-muted)]">
                  Slik bygges svaret
                </div>
                <dl className="mt-3 divide-y divide-[var(--px-border-subtle)]">
                  {NJORD_CLAIM_KINDS.map((kind) => (
                    <div key={kind.label} className="flex items-baseline gap-3 py-2.5">
                      <dt className="data-label w-[74px] shrink-0 text-[8px] uppercase text-[var(--px-accent)]">
                        {kind.label}
                      </dt>
                      <dd className="min-w-0 flex-1 text-[13.5px] leading-5 text-[var(--px-text)]">
                        {kind.description}
                        <span className="data-label ml-2 whitespace-nowrap text-[8px] uppercase text-[var(--px-muted)]">
                          {kind.provenance}
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              <CoverageGapDiagram />

              <p className="mt-5 text-[13px] leading-[1.55] text-[var(--px-muted)]">
                Der et regnskapsår ikke er publisert, brytes kurven. Njord anslår ikke det året — han
                oppgir at det mangler.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3 — Hvorfor heter han Njord */}
      <section className="bg-[var(--px-panel)] text-white">
        <div className={`${SECTION_INNER} py-20 lg:py-28`}>
          <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <div className="data-label text-[10px] uppercase text-white/50">Navnet</div>
              <h2 className="editorial-display mt-4 text-[34px] leading-[1.1] sm:text-[44px]">
                Hvorfor heter han Njord?
              </h2>
              <p className="mt-6 text-[17px] leading-[1.65] text-white/80 sm:text-[18px]">
                Njord, norrønt{" "}
                <em className="text-[20px] not-italic" style={{ fontFamily: "var(--font-serif)" }}>
                  Njǫrðr
                </em>
                , er en av vanegudene i norrøn mytologi. Han ble påkalt for gode reiser og velstand,
                og hjemmet hans var Nóatún — et sted sterkt knyttet til skip og sjøfart.
              </p>
              <p className="mt-4 text-[17px] leading-[1.65] text-white/80 sm:text-[18px]">
                Han var guden man vendte seg til når man skulle ut på noe usikkert og komme tilbake
                med noe av verdi. Det er nøyaktig den rollen en analytiker har.
              </p>
            </div>

            <div>
              <div className="data-label text-[9px] uppercase text-white/45">Forbindes med</div>
              <ol className="mt-5">
                {NJORD_ASSOCIATIONS.map((item, index) => (
                  <li
                    key={item.num}
                    className={`flex items-baseline justify-between gap-6 py-4 ${
                      index === NJORD_ASSOCIATIONS.length - 1 ? "" : "border-b border-white/10"
                    }`}
                  >
                    <span className="editorial-display text-[26px]">{item.title}</span>
                    <span className="data-label text-[9px] uppercase text-white/45">{item.num}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* 4 — Historien */}
      <section className="bg-[var(--px-panel)] text-white">
        <div className={`${SECTION_INNER} pb-28 pt-20 lg:pt-28`}>
          <NjordChapterReader />
        </div>
      </section>

      {/* 5a — Fra hav til innsikt */}
      <section aria-label="Fra hav til innsikt" className="bg-[var(--px-panel)]">
        <div className={`${SECTION_INNER} pb-20 lg:pb-24`}>
          <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3 lg:grid-cols-6">
            {NJORD_PASSAGE_STAGES.map((stage, index) => (
              <li
                key={stage.label}
                className="flex flex-col items-center gap-3 bg-[var(--px-panel)] px-4 py-8"
              >
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[26px]"
                  style={{
                    color: `color-mix(in srgb, var(--px-accent) ${30 + index * 14}%, #ffffff)`,
                  }}
                >
                  {stage.icon}
                </span>
                <span className="data-label text-[9px] uppercase text-white/70">{stage.label}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 5b — Fra Njord til Njord */}
      <section className="relative overflow-hidden bg-[var(--px-surface-strong)]">
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-0 top-0 hidden w-1/2 bg-[var(--px-panel)] lg:block"
        />
        <div className={`relative ${SECTION_INNER} py-20 lg:py-28`}>
          <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)] lg:gap-0">
            <div className="lg:pr-8 lg:text-right">
              <div className="data-label text-[10px] uppercase text-[var(--px-muted)] lg:text-white/50">
                Den norrøne Njord
              </div>
              <h2 className="editorial-display mt-3.5 text-[32px] leading-[1.1] text-[var(--px-text)] sm:text-[40px] lg:text-white">
                Fra Njord
              </h2>
            </div>
            <div aria-hidden="true" className="hidden lg:block" />
            <div className="lg:pl-8">
              <div className="data-label text-[10px] uppercase text-[var(--px-muted)]">
                Fjord Insights Njord
              </div>
              <h2 className="editorial-display mt-3.5 text-[32px] leading-[1.1] sm:text-[40px]">
                til Njord
              </h2>
            </div>
          </div>

          <ul className="mt-12">
            {NJORD_TRANSLATIONS.map((row, index) => {
              const isLast = index === NJORD_TRANSLATIONS.length - 1;
              return (
                <li
                  key={row.myth}
                  className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)] lg:gap-0"
                >
                  <div
                    className={`border-t border-[var(--px-border)] py-5 lg:border-white/15 lg:pr-8 lg:text-right ${
                      isLast ? "lg:border-b lg:border-b-white/15" : ""
                    }`}
                  >
                    <span className="editorial-display text-[24px] text-[var(--px-text)] sm:text-[27px] lg:text-white">
                      {row.myth}
                    </span>
                  </div>
                  <div aria-hidden="true" className="hidden items-center justify-center lg:flex">
                    <span className="material-symbols-outlined text-[20px] text-[var(--px-accent)]">
                      east
                    </span>
                  </div>
                  <div
                    className={`border-t border-[var(--px-border)] py-5 lg:pl-8 ${
                      isLast ? "lg:border-b" : ""
                    }`}
                  >
                    <div className="text-[19px] font-medium tracking-[-0.02em] text-[var(--px-text)] sm:text-[20px]">
                      {row.product}
                    </div>
                    <div className="mt-1.5 text-sm leading-6 text-[var(--px-muted)]">{row.detail}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* 6 — Avslutning */}
      <section className="bg-[var(--px-panel)] text-white">
        <div className={`${SECTION_INNER} py-24 lg:py-32`}>
          <div className="data-label text-[10px] uppercase text-white/50">Samme mål</div>
          <p className="editorial-display mt-6 max-w-[22ch] text-[40px] leading-[1.08] sm:text-[56px]">
            Vår Njord navigerer et annet hav
          </p>
          <div className="mt-10 grid items-end gap-10 lg:grid-cols-2 lg:gap-16">
            <p className="text-[18px] leading-[1.62] text-white/75 sm:text-[19px]">
              Den gamle Njord hjalp mennesker å navigere havet på jakt etter handel og velstand. Vår
              Njord navigerer et annet hav — informasjon. Målet er det samme: å hjelpe deg med å
              finne veien til det som har verdi.
            </p>
            <div className="flex flex-wrap items-center gap-4 lg:justify-end">
              <AskNjordButton onClick={openAsk} tone="light" />
              <Link
                href={njordAskHref()}
                className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-4 text-[15px] font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Åpne AI-søket
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                  arrow_forward
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <NjordAskPanel open={askOpen} onOpenChange={setAskOpen} />
    </div>
  );
}
