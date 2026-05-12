import Link from "next/link";
import { Suspense } from "react";

import { SearchForm } from "@/components/search/search-form";
import { safeAuth } from "@/lib/auth";

const exampleSearches = [
  "Orgnr 928846466",
  "Daglig leder",
  "Styremedlem",
  "Juridisk navn",
];

const discoveryItems = [
  {
    index: "01",
    title: "Kontroll og beslutningsmyndighet",
    description:
      "Se hvem som sitter i styret, hvem som leder foretaket og hvilke fullmakter som er registrert.",
  },
  {
    index: "02",
    title: "Regnskap over tid",
    description:
      "Les utviklingen i drift, resultat og balanse i et stramt finansielt format, ikke som katalogkort.",
  },
  {
    index: "03",
    title: "Juridisk struktur",
    description:
      "Forstå underenheter, registrerte relasjoner og formell struktur i én samlet analyseflate.",
  },
];

const sourceRows = [
  ["Brønnøysundregistrene", "Virksomhetsdata, roller, juridisk struktur og kunngjøringer"],
  ["SSB", "Næringskodeverk og klassifikasjoner"],
  ["Produktlogikk", "Tomme tilstander når offisielle data mangler"],
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "God morgen";
  if (hour >= 12 && hour < 18) return "God ettermiddag";
  return "God kveld";
}

function AuthenticatedHome({ userName }: { userName?: string | null }) {
  const greeting = getGreeting();
  const firstName = userName?.split(" ")[0] ?? null;

  return (
    <main className="space-y-12 pb-16">
      <section className="flex flex-col items-center pb-12 pt-16 text-center">
        <div className="data-label text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--px-muted)]">
          {greeting}{firstName ? `, ${firstName}` : ""}
        </div>

        <h1 className="editorial-display mt-5 max-w-3xl text-[3.5rem] leading-[0.96] text-[var(--px-text)] sm:text-[5rem] xl:text-[5.8rem]">
          Hva vil du undersøke i dag?
        </h1>

        <div className="mt-10 w-full max-w-2xl">
          <Suspense
            fallback={
              <div className="min-h-16 rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white/80" />
            }
          >
            <SearchForm />
          </Suspense>
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {exampleSearches.map((item) => (
            <span
              key={item}
              className="rounded-full border border-[rgba(15,23,42,0.1)] bg-[rgba(255,255,255,0.76)] px-3 py-1.5 text-xs font-medium text-[var(--px-muted)]"
            >
              {item}
            </span>
          ))}
        </div>
      </section>

      <section>
        <div className="data-label mb-5 text-[11px] font-semibold uppercase text-[var(--px-muted)]">
          Moduler
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/market/distress"
            className="group rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-6 hover:border-[rgba(15,23,42,0.18)] transition-colors"
          >
            <span className="material-symbols-outlined text-[var(--px-muted)]">warning</span>
            <h2 className="mt-3 text-[1.25rem] font-semibold text-[var(--px-text)]">Distress</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--px-muted)]">
              Screen selskaper i distress med status, varighet og siste tilgjengelige regnskapssignaler.
            </p>
            <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-[var(--px-text)]">
              <span>Åpne modul</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </Link>

          <Link
            href="/market/oil-gas"
            className="group rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-6 hover:border-[rgba(15,23,42,0.18)] transition-colors"
          >
            <span className="material-symbols-outlined text-[var(--px-muted)]">oil_barrel</span>
            <h2 className="mt-3 text-[1.25rem] font-semibold text-[var(--px-text)]">Olje &amp; gass</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--px-muted)]">
              Følg felt, operatører, hendelser og makrosignaler i én samlet markedsflate.
            </p>
            <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-[var(--px-text)]">
              <span>Åpne modul</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </Link>
        </div>
      </section>
    </main>
  );
}

function PublicHome() {
  return (
    <main className="space-y-10 pb-12">
      <section className="border-b border-[rgba(15,23,42,0.08)] pb-8">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.45fr),360px]">
          <div className="grid gap-6">
            <div className="grid gap-4">
              <div className="data-label inline-flex w-fit rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-3 py-1 text-[11px] font-semibold uppercase text-[var(--px-muted)]">
                Norsk selskapsanalyse
              </div>
              <div className="grid gap-5">
                <h1 className="editorial-display max-w-5xl text-[3.5rem] leading-[0.96] text-[var(--px-text)] sm:text-[4.8rem] xl:text-[6.15rem]">
                  Skarp innsikt for kritiske forretningsbeslutninger.
                </h1>
                <p className="max-w-3xl text-[1.06rem] leading-8 text-slate-600">
                  Søk i norske selskaper, personer og organisasjonsnumre med offisielle data fra
                  Brønnøysundregistrene og SSB. ProjectX er bygget for team som trenger raske,
                  etterprøvbare svar når vurderinger og beslutninger haster.
                </p>
              </div>
            </div>

            <div className="max-w-3xl">
              <Suspense
                fallback={
                  <div className="min-h-16 rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white/80" />
                }
              >
                <SearchForm />
              </Suspense>
            </div>

            <div className="flex flex-wrap gap-2">
              {exampleSearches.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-[rgba(15,23,42,0.1)] bg-[rgba(255,255,255,0.76)] px-3 py-1.5 text-xs font-medium text-slate-600"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <aside className="grid gap-0 border border-[rgba(15,23,42,0.08)] bg-[var(--px-panel)] text-white">
            <div className="border-b border-white/10 p-6">
              <div className="data-label text-[11px] font-semibold uppercase text-white/60">
                Hva produktet gjør
              </div>
              <div className="mt-4 text-[1.7rem] font-semibold leading-tight">
                Fra registerdata til skarpere vurderinger.
              </div>
              <p className="mt-4 text-sm leading-7 text-white/80">
                ProjectX er designet som et analyseverktøy, ikke en bedriftskatalog. Hver flate
                skal bidra til å vurdere et foretak raskt, presist og på et sporbart grunnlag.
              </p>
            </div>
            <div className="grid gap-4 p-6">
              <div>
                <div className="data-label text-[11px] font-semibold uppercase text-white/60">
                  Datagrunnlag
                </div>
                <div className="mt-2 text-sm leading-7 text-white/80">
                  Informasjonen er strukturert for vurdering og kontroll, med tydelig skille mellom
                  det som er registrert, og det som ikke er tilgjengelig i offisielle kilder.
                </div>
              </div>
              <div>
                <div className="data-label text-[11px] font-semibold uppercase text-white/60">
                  Produktdisiplin
                </div>
                <div className="mt-2 text-sm leading-7 text-white/80">
                  Ingen plassholdere, ingen pyntede signaler og ingen snarveier når datagrunnlaget
                  er tynt.
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[260px,minmax(0,1fr)]">
        <div className="border-t border-[rgba(15,23,42,0.12)] pt-4">
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
            Hva du kan avdekke
          </div>
        </div>
        <div className="grid gap-0 border-y border-[rgba(15,23,42,0.08)]">
          {discoveryItems.map((item) => (
            <div
              key={item.index}
              className="grid gap-4 border-b border-[rgba(15,23,42,0.08)] py-6 last:border-b-0 md:grid-cols-[90px,minmax(0,1fr),minmax(0,1.15fr)]"
            >
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                {item.index}
              </div>
              <h2 className="text-[1.35rem] font-semibold text-slate-950">{item.title}</h2>
              <p className="max-w-2xl text-sm leading-7 text-slate-600">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[260px,minmax(0,1fr)]">
        <div className="border-t border-[rgba(15,23,42,0.12)] pt-4">
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
            Moduler
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/market/oil-gas"
            className="group rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-6 hover:border-[rgba(15,23,42,0.18)]"
          >
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Marked</div>
            <h2 className="mt-3 text-[1.4rem] font-semibold text-slate-950">Olje &amp; gass</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              Følg felt, operatører, hendelser og makrosignaler i én samlet markedsflate.
            </p>
            <div className="mt-4 text-sm font-semibold text-slate-800 group-hover:text-slate-950">
              Åpne modul
            </div>
          </Link>

          <Link
            href="/market/distress"
            className="group rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-6 hover:border-[rgba(15,23,42,0.18)]"
          >
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Analyse</div>
            <h2 className="mt-3 text-[1.4rem] font-semibold text-slate-950">Distress</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              Screen selskaper i distress med status, varighet og siste tilgjengelige regnskapssignaler.
            </p>
            <div className="mt-4 text-sm font-semibold text-slate-800 group-hover:text-slate-950">
              Åpne modul
            </div>
          </Link>
        </div>
      </section>

      <section className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr),420px]">
        <div className="border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.72)] p-7">
          <div className="flex items-end justify-between gap-4 border-b border-[rgba(15,23,42,0.08)] pb-5">
            <div>
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                Produktets flater
              </div>
              <h2 className="mt-3 text-[2.2rem] font-semibold text-slate-950">
                Bygget for rask scanning og skarp analyse
              </h2>
            </div>
            <Link
              href="/search"
              className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:border-[rgba(15,23,42,0.18)]"
            >
              Åpne søk
            </Link>
          </div>

          <div className="mt-6 grid gap-0">
            {[
              [
                "Selskapsprofil",
                "Juridisk navn, status, bransje, kommune, hovedsignaler og sentrale vurderingspunkter i samme arbeidsflate.",
              ],
              [
                "Regnskap",
                "Tidsserier, analyserbare tabeller og sober grafikk med tydelige årskolonner og lesbare negative tall.",
              ],
              [
                "Organisasjon",
                "Roller, juridisk struktur, signatur og prokura presentert som formell kontrollinformasjon.",
              ],
            ].map(([title, description]) => (
              <div
                key={title}
                className="grid gap-3 border-b border-[rgba(15,23,42,0.08)] py-5 last:border-b-0"
              >
                <div className="text-lg font-semibold text-slate-950">{title}</div>
                <div className="max-w-3xl text-sm leading-7 text-slate-600">{description}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-0 border border-[rgba(15,23,42,0.08)] bg-white">
          <div className="border-b border-[rgba(15,23,42,0.08)] p-6">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
              Datagrunnlag
            </div>
            <h2 className="mt-3 text-[2rem] font-semibold text-slate-950">
              Tillit bygges i hvordan data brukes
            </h2>
          </div>

          {sourceRows.map(([source, description]) => (
            <div key={source} className="border-b border-[rgba(15,23,42,0.08)] p-6 last:border-b-0">
              <div className="text-base font-semibold text-slate-950">{source}</div>
              <div className="mt-2 text-sm leading-7 text-slate-600">{description}</div>
            </div>
          ))}

          <div className="border-t border-[rgba(15,23,42,0.08)] bg-[rgba(25,37,54,0.03)] p-6">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
              Videre bruk
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Avanserte funksjoner kan legges til senere, men kjerneinnholdet skal alltid beholde
              prioritet.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default async function HomePage() {
  const session = await safeAuth();

  if (session?.user) {
    return <AuthenticatedHome userName={session.user.name} />;
  }

  return <PublicHome />;
}
