# PLANS.md

# ProjectX MVP Exec Plan

## Mål
Bygg et fungerende MVP for ProjectX som bruker reelle offentlige data for norske virksomheter og ikke inneholder mock data eller seed-data.

## Suksesskriterier
Produktet skal:
- la brukeren søke opp selskaper
- vise selskapsprofil med reelle virksomhetsdata
- vise roller/styre når tilgjengelig fra Brønnøysundregistrene
- støtte filtrering på sentrale virksomhetsfelt
- ha auth og enkel feature gating
- være ærlig om datamangler
- kunne kjøres lokalt med tydelig setup

## Ikke-mål
- ingen syntetiske virksomheter
- ingen falsk regnskapshistorikk
- ingen oppdiktede personprofiler
- ingen avansert scoring uten reelt datagrunnlag
- ingen overengineering i første iterasjon

## Kilder og ansvar
### Brønnøysundregistrene
Ansvar:
- virksomhetsmaster
- organisasjonsnummer
- navn
- organisasjonsform
- status
- adresse
- registrert næringskode
- roller
- signatur/prokura når relevant
- regnskapsnøkkeltall når reelt tilgjengelig

### SSB
Ansvar:
- bransjebeskrivelser
- næringskodehierarki
- kodeverk
- versjoner og ev. overgang mellom standarder

### Finanstilsynet
Ansvar:
- regulatorisk overlay for foretak under tilsyn

## Arbeidsrekkefølge

### Fase 1: fundament
- velg stack
- opprett prosjektstruktur
- etabler env-konfigurasjon
- etabler database og ORM
- definer intern datamodell
- definer provider interfaces

### Fase 2: kilder
- implementer BrregCompanyProvider
- implementer BrregRolesProvider
- implementer SsbIndustryCodeProvider
- avklar om BrregFinancialsProvider er praktisk mulig med reelt tilgjengelige data
- implementer FinanstilsynetRegulatoryProvider bare hvis den gir tydelig MVP-verdi

### Fase 3: normalisering og lagring
- bygg mapping fra råkilder til intern modell
- lagre source metadata
- bygg cache/persistence for henting og oppslag
- sørg for at frontend ikke bruker råresponser

### Fase 4: produktflater
- landingsside
- globalt søk
- resultatside
- selskapsprofil
- roller/styre-seksjon
- filterflate
- tomtilstander ved manglende data

### Fase 5: auth og tilgang
- login
- account/dashboard
- feature gating
- pricing-side

### Fase 6: dokumentasjon og finish
- README
- .env.example
- dokumentasjon av datakilder
- dokumentasjon av begrensninger
- kjøreinstruksjoner

## Beslutningsregler
Når det oppstår tvil:
- velg ekte data fremfor kompletthet
- velg enkel og robust arkitektur fremfor bred feature-liste
- velg tom tilstand fremfor falsk utfylling
- velg tydelig dokumentasjon fremfor skjult begrensning

## Datamangler
Hvis historisk regnskap ikke kan hentes reelt:
- ikke generer tall
- vis kun det som faktisk finnes
- dokumenter begrensningen

Hvis roller mangler for en virksomhet:
- vis tom rollevisning
- ikke generer personer

Hvis regulatorisk overlay ikke matcher:
- vis ingenting
- ikke anta tilsynsstatus

## Leveranse
Lever:
- fungerende kodebase
- providers
- intern modell
- søk
- profilside
- filtrering
- auth
- feature gating
- dokumentasjon

## Done
Oppgaven er ferdig når repoet kan kjøres lokalt og demonstrerer ProjectX med reelle offentlige data og uten syntetisk innhold.
