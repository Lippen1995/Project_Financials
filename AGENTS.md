# AGENTS.md

## Prosjekt
Dette repoet bygger ProjectX, en B2B webapplikasjon for selskapsinformasjon og innsikt i Norge.

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
- ingen mock provider

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
- ikke simuler data
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
Løsningen skal kunne kjøres lokalt, bruke reelle offentlige data, og demonstrere en fungerende kjerne for ProjectX uten syntetisk innhold.
