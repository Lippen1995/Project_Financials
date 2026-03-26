import Link from "next/link";
import { Suspense } from "react";

import { SearchForm } from "@/components/search/search-form";

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

export default function HomePage() {
  return (
    <main className="space-y-10 pb-12">
      <section className="border-b border-[rgba(15,23,42,0.08)] pb-8">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.45fr),360px]">
          <div className="grid gap-6">
            <div className="grid gap-4">
              <div className="data-label inline-flex w-fit rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-3 py-1 text-[11px] font-semibold uppercase text-slate-600">
                Norsk selskapsanalyse
              </div>
              <div className="grid gap-5">
                <h1 className="editorial-display max-w-5xl text-[3.5rem] leading-[0.96] text-[#111827] sm:text-[4.8rem] xl:text-[6.15rem]">
                  Presis selskapsanalyse for vurdering, research og beslutninger.
                </h1>
                <p className="max-w-3xl text-[1.06rem] leading-8 text-slate-600">
                  Søk i norske selskaper, personer og organisasjonsnumre med et grensesnitt bygget
                  for investorer, rådgivere, regnskapsførere og kommersielle team som trenger raske,
                  etterprøvbare svar.
                </p>
              </div>
            </div>

            <div className="max-w-3xl">
              <Suspense
                fallback={
                  <div className="min-h-16 rounded-[1rem] border border-[rgba(15,23,42,0.1)] bg-white/80" />
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

          <aside className="grid gap-0 border border-[rgba(15,23,42,0.08)] bg-[#192536] text-white">
            <div className="border-b border-white/10 p-6">
              <div className="data-label text-[11px] font-semibold uppercase text-white/60">
                Hva produktet gjør
              </div>
              <div className="mt-4 text-[1.7rem] font-semibold leading-tight">
                Fra registerdata til faktisk arbeidsflate.
              </div>
              <p className="mt-4 text-sm leading-7 text-white/72">
                ProjectX er designet som et analyseverktøy, ikke en bedriftskatalog. Hver flate
                skal bidra til å vurdere et foretak raskt og presist.
              </p>
            </div>
            <div className="grid gap-4 p-6">
              <div>
                <div className="data-label text-[11px] font-semibold uppercase text-white/60">
                  Datagrunnlag
                </div>
                <div className="mt-2 text-sm leading-7 text-white/76">
                  Informasjonen er strukturert for vurdering og kontroll, med tydelig skille mellom
                  det som er registrert og det som ikke er tilgjengelig.
                </div>
              </div>
              <div>
                <div className="data-label text-[11px] font-semibold uppercase text-white/60">
                  Produktdisiplin
                </div>
                <div className="mt-2 text-sm leading-7 text-white/76">
                  Ingen mockdata, ingen syntetiske selskaper og ingen pyntede signaler når grunnlag
                  mangler.
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

      <section className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr),420px]">
        <div className="border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.72)] p-7">
          <div className="flex items-end justify-between gap-4 border-b border-[rgba(15,23,42,0.08)] pb-5">
            <div>
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                Produktets flater
              </div>
              <h2 className="mt-3 text-[2.2rem] font-semibold text-slate-950">
                Bygget for rask scanning og dyp analyse
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
                "Juridisk navn, status, bransje, kommune, executive snapshot og sentrale signaler i samme arbeidsflate.",
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
              Datadekning
            </div>
            <h2 className="mt-3 text-[2rem] font-semibold text-slate-950">
              Tillit bygges i hvordan informasjonen presenteres
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
