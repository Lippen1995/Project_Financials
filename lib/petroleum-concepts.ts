import { PetroleumConceptEntry } from "@/lib/types";

export const PETROLEUM_CONCEPTS: PetroleumConceptEntry[] = [
  {
    id: "field",
    slug: "felt",
    label: "Felt",
    shortDefinition: "Et felt er en petroleumsforekomst som myndighetene har besluttet skal eller kan bygges ut samlet.",
    explanation:
      "I ProjectX brukes felt som hovedenhet for produksjon, reserver og investeringer. Felt knyttes til operatør, rettighetshavere, innretninger og produksjonsserier fra SODIR.",
    relatedConceptIds: ["discovery", "facility", "licence", "development"],
    relatedProducts: ["oil", "gas", "oe"],
    sourceLabel: "SODIR Faktasider",
    sourceUrl: "https://factpages.sodir.no/nb-no",
  },
  {
    id: "discovery",
    slug: "funn",
    label: "Funn",
    shortDefinition: "Et funn er en påvist petroleumsforekomst som ennå ikke nødvendigvis er satt i produksjon som eget felt.",
    explanation:
      "Funn brukes for å forstå fremtidig ressursbase, lisensmodenhet og mulig tilknytning til eksisterende infrastruktur. Ikke alle funn blir bygget ut.",
    relatedConceptIds: ["field", "licence", "survey"],
    relatedProducts: ["oil", "gas", "oe"],
    sourceLabel: "SODIR Ressursrapport",
    sourceUrl:
      "https://www.sodir.no/aktuelt/publikasjoner/rapporter/ressursrapporter/ressursrapport-2024/gjenvarende-ressurser/",
  },
  {
    id: "licence",
    slug: "lisens",
    label: "Lisens",
    shortDefinition: "En lisens gir rett til undersøkelse og utvinning innenfor et avgrenset område på sokkelen.",
    explanation:
      "Lisenser er bindeleddet mellom areal, selskaper, funn og senere feltutbygging. Overføringer og Petreg-meldinger gir viktig signal om endringer i rettighetsbildet.",
    relatedConceptIds: ["field", "discovery", "operator"],
    sourceLabel: "SODIR Faktasider",
    sourceUrl: "https://factpages.sodir.no/nb-no",
  },
  {
    id: "facility",
    slug: "innretning",
    label: "Innretning",
    shortDefinition: "En innretning er et fysisk anlegg på sokkelen eller tilknyttet virksomhet som støtter boring, prosessering eller produksjon.",
    explanation:
      "Innretninger er sentrale for å forstå kapasitet, vertsfelt og tilknytning for nye funn. I modulen brukes de både som kartobjekter og som del av infrastrukturanalysen.",
    relatedConceptIds: ["field", "tuf", "wellbore"],
    sourceLabel: "SODIR Faktakart",
    sourceUrl: "https://www.sodir.no/fakta/data-og-analyser/apne-data/faktasider-og-faktakart-teknisk-informasjon/",
  },
  {
    id: "tuf",
    slug: "tuf",
    label: "TUF",
    shortDefinition: "TUF brukes her som samlebetegnelse for åpne data om hovedrørledninger og transportsystemer som binder sokkelen sammen.",
    explanation:
      "TUF-laget er viktig for å vurdere knutepunkter, transportsystem og hvor nye funn kan knyttes til eksisterende infrastruktur.",
    relatedConceptIds: ["facility", "field", "discovery"],
    sourceLabel: "SODIR åpne data",
    sourceUrl: "https://www.sodir.no/fakta/data-og-analyser/apne-data/",
  },
  {
    id: "ngl",
    slug: "ngl",
    label: "NGL",
    shortDefinition: "NGL er naturgassvæsker som skilles ut fra gassproduksjon og rapporteres separat i SODIRs produksjonsdata.",
    explanation:
      "I modulen vises NGL separat fra olje, kondensat og gass for å gjøre produktsammensetningen mer forståelig og for å støtte rate- og volumanalyse.",
    relatedConceptIds: ["condensate", "oe"],
    relatedProducts: ["ngl", "liquids"],
    sourceLabel: "SODIR produksjonstal",
    sourceUrl: "https://www.sodir.no/aktuelt/nyheter/produksjonstal/",
  },
  {
    id: "condensate",
    slug: "kondensat",
    label: "Kondensat",
    shortDefinition: "Kondensat er lette hydrokarboner som produseres sammen med gass og rapporteres som egen produktkategori.",
    explanation:
      "Kondensat inngår sammen med olje og NGL i væskeproduksjonen, men bør fortsatt kunne analyseres separat fordi markeds- og volumprofilen skiller seg fra både råolje og gass.",
    relatedConceptIds: ["ngl", "oe"],
    relatedProducts: ["condensate", "liquids"],
    sourceLabel: "SODIR produksjonstal",
    sourceUrl: "https://www.sodir.no/aktuelt/nyheter/produksjonstal/",
  },
  {
    id: "boepd",
    slug: "boepd",
    label: "boepd",
    shortDefinition: "boepd betyr barrels of oil equivalent per day og brukes som ratevisning for å sammenligne produksjonstakt.",
    explanation:
      "I ProjectX brukes boepd som analyseenhet for løpende sammenligning av produksjon mot fjoråret og mot forecast. Råvolumene fra SODIR beholdes samtidig som sannhetsgrunnlag.",
    relatedConceptIds: ["oe", "forecast"],
    relatedProducts: ["oil", "liquids", "oe"],
    sourceLabel: "SODIR produksjonstal / ProjectX metode",
    sourceUrl: "https://www.sodir.no/aktuelt/nyheter/produksjonstal/",
  },
  {
    id: "resource-class",
    slug: "ressursklasse",
    label: "Ressursklasse",
    shortDefinition: "Ressursklasser brukes av SODIR for å beskrive modenhet og usikkerhet i ressursgrunnlaget.",
    explanation:
      "Ressursklassene er sentrale for å forstå hvilke volumer som er produsert, besluttet, sannsynlige eller uoppdagede. De er særlig viktige i ressursrapportene.",
    relatedConceptIds: ["discovery", "field", "forecast"],
    sourceLabel: "Ressursrapport 2024",
    sourceUrl:
      "https://www.sodir.no/aktuelt/publikasjoner/rapporter/ressursrapporter/ressursrapport-2024/bakgrunn/",
  },
  {
    id: "development",
    slug: "utbygging",
    label: "Utbygging",
    shortDefinition: "Utbygging er fasen der et funn eller felt modnes til faktisk produksjon gjennom beslutning, investering og installasjon.",
    explanation:
      "Dette er koblingen mellom funnporteføljen og fremtidig produksjon. I markedsperspektiv er utbygging nært knyttet til investeringsnivå og forventet decline rate på sokkelen.",
    relatedConceptIds: ["field", "discovery", "forecast"],
    sourceLabel: "Sokkelåret 2025",
    sourceUrl:
      "https://www.sodir.no/aktuelt/publikasjoner/rapporter/sokkelaret/sokkelaret-2025/olje-og-gass-pa-sokkelen-framover/",
  },
  {
    id: "survey",
    slug: "survey",
    label: "Survey",
    shortDefinition: "Survey dekker undersøkelser og datainnsamling, blant annet seismikk, som brukes til å forstå undergrunnen bedre.",
    explanation:
      "Surveyaktivitet er nyttig for å følge leteintensitet, geofysisk modenhet og hvor ny kunnskap bygges opp før boring eller videre modning.",
    relatedConceptIds: ["discovery", "wellbore"],
    sourceLabel: "SODIR åpne data",
    sourceUrl: "https://www.sodir.no/fakta/data-og-analyser/apne-data/",
  },
  {
    id: "forecast",
    slug: "forecast",
    label: "Forecast",
    shortDefinition: "Forecast brukes her om siste offisielle produksjons- og investeringsforventning publisert av SODIR.",
    explanation:
      "Marked-fanen viser alltid siste tilgjengelige offisielle forecast. Når brukeren filtrerer, forsøker modulen å sette forecasten i kontekst for utvalget, men markerer tydelig når grunnlaget fortsatt er sokkelnivå.",
    relatedConceptIds: ["boepd", "resource-class", "development"],
    relatedProducts: ["oe", "oil", "gas"],
    sourceLabel: "Sokkelåret / Produksjonstal",
    sourceUrl: "https://www.sodir.no/aktuelt/publikasjoner/rapporter/sokkelaret/",
  },
];

export function getPetroleumConceptById(id: string) {
  return PETROLEUM_CONCEPTS.find((concept) => concept.id === id) ?? null;
}
