# AGENTS.md

## Prosjekt
Dette repoet bygger Fjord Insight, en B2B webapplikasjon for selskapsinformasjon og innsikt i Norge.

## Overordnet mål
Bygg et fungerende MVP-produkt som lar brukere:
- søke opp selskaper
- åpne en selskapsprofil
- se grunnleggende virksomhetsinformasjon
- se roller og styre
- se regnskapsrelatert informasjon når den er reelt tilgjengelig
- filtrere selskaper
- logge inn
- møte feature gating / abonnement

## Absolutte regler
- Bruk kun reelle data fra offisielle kilder.
- Ikke bruk mock data.
- Ikke bruk seed-data.
- Ikke hardkod selskaper, personer, roller eller regnskapstall.
- Ikke generer syntetiske eksempler som ser ekte ut.
- Hvis en funksjon ikke kan bygges med ekte data, skal den stå tom, være deaktivert eller merkes tydelig som ikke tilgjengelig.
- Vær ærlig i UI og README om hva som faktisk er implementert og hvilke datakilder som støtter hvilke funksjoner.

## Midlertidig investor-demo-unntak for simulerte regnskap
Det eneste unntaket fra forbudet mot syntetiske data er en tidsavgrenset investor-demo med simulerte resultatregnskap og balanser. Unntaket gjelder ikke selskapsmaster, personer, roller, regulatoriske data eller andre datadomener.

Unntaket gjelder bare når alle disse kravene er oppfylt:
- Rapporterte regnskap og linjer forblir uendret source of truth i egne tabeller.
- Simulerte statements og linjer lagres i egne tabeller. Rapporterte tabeller skal aldri referere til simulerte tabeller, mens simulerte records kan referere til rapporterte ankere. Et rapportert anker refereres, ikke dupliseres som en frittstående verdi i simuleringslaget.
- Rapporterte verdier skal aldri endres, overskrives eller promoteres til syntetiske verdier. Simulerte verdier skal aldri kopieres eller promoteres til rapporterte tabeller.
- En versjonert database-view er eneste leseflate for finansielle statements og linjer. En atomisk dataset-peker bestemmer om viewet leser det rapporterte eller simulerte datasettet.
- Alle API-er, tjenester, verktøy, grafer, metrics, filtre, rangeringer, eksporter og Njord-funksjoner skal lese finansdata gjennom samme repository mot live-viewet, ikke direkte fra kildetabellene.
- Runtime-databaserollen skal bare ha lesetilgang til live-viewet. Direkte tilgang til kildetabellene begrenses til eksplisitte ingest-, simulerings- og migrasjonsjobber.
- Hver linje skal ha `valueOrigin` som minst skiller `reported` og `synthetic`. Hele regnskapsoppstillingen skal merkes `reported`, `hybrid` eller `simulated`.
- Når simulering er aktiv, skal hver syntetiske linje og hele regnskapsoppstillingen merkes tydelig i UI og eksport som simulert for demonstrasjon og ikke rapportert selskapsdata.
- Cachede svar, beregninger, søkeindekser, analyser, eksporter og bakgrunnsjobber som avhenger av finansdata skal ha `financialDatasetVersion`. Resultater fra en inaktiv versjon skal avvises eller invalideres.
- Simulering skal styres av en tilgangskontrollert funksjonsbryter, være av som standard og bare kunne aktiveres i godkjent investor-demo-miljø.
- Generatoren skal være deterministisk og versjonert. Kjente rapporterte ankere er immutable constraints; inkonsistente ankere skal gi eksplisitt residual eller kontrollert feil, aldri omskriving av rapporterte fakta.
- Simulerte linjer skal bruke en eksplisitt versjon av den originale `Fjord Simulation Taxonomy` (`FI-SIM`) bygget med de fritt lisensierte tekniske XBRL-spesifikasjonene. Første versjon er `FI-SIM-2026.1`.
- `FI-SIM` skal ikke importere, kopiere, oversette, gjenbruke eller etterligne IFRS-filer, namespace, QName, labels, definisjoner, referanser, presentation trees eller calculation linkbases. Produktet skal ikke omtale `FI-SIM` som IFRS-basert, IFRS-kompatibel eller IFRS-compliant.
- Linjeutvalget skal variere deterministisk med selskapstype og tilgjengelige rapporterte ankere; generatoren skal ikke gi alle selskaper samme linjer. Variasjon skal være semantisk begrunnet, ikke tilfeldig pynt.
- `FI-SIM`-konsept, original kildelabel og nullable intern `metricKey` skal lagres separat. Simulerte linjer skal gjennom samme metric-mapping-flyt som rapporterte linjer og skal ikke leveres ferdig mappet bare fordi generatoren kjenner konseptet.
- `FI-SIM` og alle tilhørende konsepter, profiler og relasjoner er del av simuleringslaget og skal fjernes sammen med dette laget før lukket beta eller produksjon.
- Før lukket beta eller produksjon skal GL-511 i go-live-planen være fullført: live-viewet gjøres rapportert-only, simuleringsavhengigheter og cache fjernes, simuleringstabellene droppes med migrasjon, og rapporterte regnskap regresjonstestes uavhengig.

Den styrende arkitekturbeslutningen er dokumentert i `docs/adr/ADR-0002-isolated-simulated-financials-layer.md`. Hvis implementasjonen ikke kan oppfylle alle kravene, gjelder de opprinnelige absolutte reglene uten unntak.

## Kildehierarki
### 1. Brønnøysundregistrene
Brukes som source of truth for norske virksomheter.

Bruk Brønnøysundregistrene til:
- organisasjonsnummer
- virksomhetsnavn
- organisasjonsform
- registreringsstatus
- adresser
- næringskode på virksomheten
- roller i virksomheten
- signatur/prokura når relevant
- regnskapsrelaterte nøkkeltall når de er reelt tilgjengelige

Ikke bruk andre kilder til å overstyre disse kjernefeltene for norske virksomheter.

### 2. SSB
Brukes som source of truth for kodeverk og klassifikasjoner.

Bruk SSB til:
- beskrivelse av næringskoder
- hierarki for næringskoder
- kodeverk og versjoner
- støtte for SN2007/SN2025 dersom relevant

SSB skal forklare og berike næringskode, ikke overstyre virksomhetens registrerte kode fra Brønnøysundregistrene.

### 3. Finanstilsynet
Brukes kun som regulatorisk overlay.

Bruk Finanstilsynet til:
- å markere at et foretak er under tilsyn eller registrert
- å vise konsesjonstype / regulatorisk status når relevant

Ikke bruk Finanstilsynet som generell kilde for selskapsmaster.

## Tillatte produktbegrensninger
Det er lov å levere et MVP der enkelte seksjoner er tomme eller skjult dersom ekte data ikke er tilgjengelige.
Det er ikke lov å fylle hull med oppdiktet innhold.

## Arkitekturprinsipper
Bygg appen med tydelig lagdeling:
- provider-lag for eksterne kilder
- mapping/normalisering
- intern domene-/datamodell
- persistence/cache
- API/service-lag
- frontend

Frontend skal aldri konsumere rå ekstern API-respons direkte.

## Providers som skal finnes
- BrregCompanyProvider
- BrregRolesProvider
- BrregFinancialsProvider hvis reell regnskapskilde kan brukes
- SsbIndustryCodeProvider
- FinanstilsynetRegulatoryProvider hvis relevant
- ingen mock provider, med unntak av det eksplisitt avgrensede simuleringslaget for investor-demoen

## Datadisiplin
Alle records hentet fra eksterne kilder skal kunne spores med:
- sourceSystem
- sourceEntityType
- sourceId
- fetchedAt
- normalizedAt

## Produktprioritering
Bygg i denne rekkefølgen:
1. virksomhetsoppslag og søk
2. selskapsprofil
3. roller/styre
4. filtrering
5. auth
6. abonnement / feature gating
7. regulatoriske overlays
8. regnskapsutvidelser dersom reelt tilgjengelig

## Hvis data mangler
Hvis en kilde ikke gir nok data til en funksjon:
- ikke simuler data, med unntak av det eksplisitt avgrensede simuleringslaget for investor-demoen
- vis tom tilstand eller utilgjengelig funksjon
- dokumenter begrensningen i README
- fortsett med resten av MVP-et

## Kodekrav
- Bruk TypeScript
- Hold koden enkel, ryddig og produksjonsnær
- Skriv gjenbrukbare komponenter
- Valider input
- Håndter loading/error/empty states
- Dokumenter setup tydelig i README

## Definisjon av ferdig
Løsningen skal kunne kjøres lokalt, bruke reelle offentlige data, og demonstrere en fungerende kjerne for Fjord Insight uten syntetisk innhold.

---

## Designsystem-sjekkliste

Alle nye komponenter MÅ følge disse reglene (se `DESIGN.md` for full spec):

### Farger
- Bruk alltid CSS-tokens: `var(--px-bg)`, `var(--px-surface)`, `var(--px-border)`, `var(--px-text)`, `var(--px-muted)`, `var(--px-accent)`, `var(--px-panel)`, `var(--px-action)`, `var(--px-action-hover)`, `var(--px-subtle)`, `var(--px-accent-soft)`
- Tillatte hardkodede verdier: Tailwind slate/emerald/rose/amber-skalaen, og følgende rgba/hex fra DESIGN.md: `rgba(15,23,42,0.08/0.10/0.06/0.14)`, `rgba(248,249,250,0.62/0.8)`, `rgba(255,255,255,0.86/0.9)`, `#192536` (panel), `#111827` (tekst)
- **Forbudt:** Alle andre hardkodede hex- eller rgb-verdier

### Radius
- **Tillatt:** `rounded-2xl` (ytre kort), `rounded-xl` (indre bokser/inputs), `rounded-full` (badges/pills/knapper)
- **Forbudt:** `rounded-lg`, `rounded-md`, `rounded-3xl`, alle `rounded-[...]` custom verdier
- **Unntak:** Finansielle tabeller bruker ingen radius (analytisk preg)

### Typografi
- `editorial-display` kun for H1-overskrifter og store redaksjonelle titler (Source Serif 4)
- `data-label` for metadata-labels, tabelloverskrifter, badges, statuser (IBM Plex Mono)
- Standard UI: IBM Plex Sans (Tailwind default i dette prosjektet)

### Spacing / radius
- Ytre kort: `p-5` eller `p-6`, `rounded-2xl`, `border border-[var(--px-border)]`
- Indre bokser: `rounded-xl`
- Gap: `gap-4`, `gap-6`, `gap-8` — ikke custom verdier
