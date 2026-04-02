# UI Design Structure

## Formål
Dette dokumentet beskriver den aktive designstrukturen i ProjectX slik produktet ser ut nå. Målet er å sikre kontinuitet når nye flater bygges eller eksisterende flater videreutvikles.

Dette er ikke en løs inspirasjonsliste. Det er en praktisk standard for hvordan ProjectX skal se ut, oppføre seg og kommunisere videre.

## Designretning
ProjectX følger en stil som kombinerer:

- Nordic enterprise editorial
- data-first product UI
- premium analytical software

Referanseretningen er nær:

- Linear for presisjon og disiplin
- Bloomberg light for informasjonsstruktur
- McKinsey for troverdighet og ro

Retningen skal være langt unna:

- generisk Tailwind SaaS-template
- startup-gradienter
- katalog- eller portalestetikk
- overfylt card-stabling
- markedsføringsspråk og growth-UI

## Kjerneprinsipper

### 1. Analyse først
Hver skjerm skal hjelpe brukeren å forstå noe raskt.

- Forsiden: start søk og forstå produktets verdi
- Søkesiden: snevre inn og vurdere treff raskt
- Selskapsprofil: gå fra oversikt til dyp analyse
- Organisasjon: forstå kontroll, roller og struktur
- Regnskap: lese tidsserier og verifiserbare tall

### 2. Informasjon i lag
Informasjon skal presenteres i tydelige lag:

- seksjonslabel
- overskrift
- kort forklaring
- primær analyseflate
- sekundær signalflate eller detaljer

Brukeren skal kunne skanne først og fordype seg etterpå.

### 3. Troverdighet foran pynt
Typografi, spacing, struktur og datadisiplin skal skape premium-følelse, ikke effekter.

- lite skyggebruk
- ingen sterke gradients
- ingen illustrasjoner uten funksjon
- ingen visuelle elementer som konkurrerer med data

### 4. Desktop-first arbeidsflate
Selskapsanalyse er hovedsakelig en desktop-opplevelse. Mobil skal fungere godt, men strukturen prioriteres for bredere flater.

## Visuell stil

### Overordnet tone

- sober
- analytisk
- lys og rolig
- høy tillit
- premium B2B
- presis

### Fargebruk
Basen er lys og nøytral.

Fra dagens implementasjon i [app/globals.css](C:\Users\simen\Project_Financials\app\globals.css):

- `--px-bg: #f5f4f0`
- `--px-surface: rgba(255, 255, 255, 0.9)`
- `--px-surface-strong: #ffffff`
- `--px-border: rgba(15, 23, 42, 0.1)`
- `--px-text: #111827`
- `--px-muted: #5f6b7a`
- `--px-accent: #31495f`
- `--px-accent-soft: #e7edf3`

Praktisk bruk:

- bakgrunn: varm, lys, diskret off-white
- hovedflater: hvit eller nesten hvit
- tekst: mørk blåsvart eller kull
- aksent: dempet blågrå eller marine
- sekundær dataserie i grafer: jordet brun
- statusfarger skal være diskrete og funksjonelle

Unngå:

- sterke metningsgrader
- flerfargede aksentpaletter
- lilla som standardaksent
- mørk modus som primærretning

## Typografi

### Fontroller
ProjectX bruker tre tydelige typografiske roller:

- serif-display for store overskrifter
- sans for UI, lesetekst og tabeller
- mono for metadata, seksjonslabeler og tabulære data

Nåværende oppsett i [app/layout.tsx](C:\Users\simen\Project_Financials\app\layout.tsx):

- `Source Serif 4`
- `IBM Plex Sans`
- `IBM Plex Mono`

### Regler

- store overskrifter bruker serif og tett tracking
- seksjonslabeler bruker mono og uppercase
- tall skal bruke tabular numerals der det er mulig
- lesetekst skal være rolig og saklig, ikke reklamepreget
- overskrifter skal være korte og beslutningsorienterte

### Klassenavn som bør videreføres

- `.editorial-display`
- `.data-label`

## Layoutsystem

### Primært layoutmønster
Mange sider følger dette oppsettet:

- bred hovedkolonne for analyse
- smal høyrekolonne for signaler, status eller kontekst

Dette mønsteret brukes på:

- forside
- søk
- selskapsprofil
- oversikt
- organisasjon

### Seksjonscontainere
Seksjoner skal normalt bruke:

- tynn border
- svak, lys flate
- lav til moderat radius
- lite eller ingen skygge
- god intern padding

Vanlige mønstre:

- toppseksjon med border-bottom
- innhold som følger i tydelige blokker
- sekundærinformasjon i sidekolonne eller nederst

### Sticky navigasjon
Lange selskapsprofiler skal bruke sticky lokal navigasjon når det gir mening, slik vi gjør i fanene på selskapsprofilen.

## Komponentmønstre

### 1. Hero-seksjoner
Hero brukes på forside, søk, login, pricing og dashboard.

Mønster:

- liten uppercase label øverst
- stor editorial overskrift
- én kort forklarende ingress
- eventuell mørk høyrespalte for status eller kontekst

Hero skal aldri se ut som en marketing-side.

### 2. Cards
Cards brukes, men kontrollert.

Kort skal:

- være flate og stramme
- fungere som informasjonsmoduler
- ikke stables i overdreven grad

Kort skal ikke:

- være den primære designideen i seg selv
- ha tunge skygger
- ha overdreven radius

### 3. Datapaneler
Signalpaneler og sidepaneler skal være kompakte og tydelige.

Eksempler:

- analytisk sammendrag i oversikt
- fakta- og statuspaneler i selskapsprofil
- innsiktspanel i organisasjon

Disse panelene skal:

- prioritere tall og signaler
- ha tydelig visuelt hierarki
- ikke ligne widgets fra et admin-dashboard

### 4. Tabeller
Tabeller er en kjernekomponent i produktet.

Tabeller skal:

- ha tydelige kolonneoverskrifter
- bruke tabulære tall
- ha rolig headerbakgrunn
- ha høy lesbarhet i rader og negative tall
- føles finansielle, ikke generiske

Tabeller skal ikke:

- ha tung zebra-striping
- bruke dekorative farger
- være tettpakket uten luft

### 5. Grafer
Grafer skal være sober og analytiske.

Regler:

- én tydelig jobb per graf
- rolige akser og gridlines
- tooltip som forklarer uten å dominere
- tydelig aktivt år eller valgt punkt
- mørk marine for primær dataserie
- dempet brun for sekundær eller alternativ serie

Grafer skal ikke:

- se ut som SaaS-widgets
- bruke flashy gradients
- bruke mange serier uten grunn
- ha playful interaksjoner

### 6. Struktur- og organisasjonsflater
Disse skal se ut som analyseverktøy, ikke infografikk.

Regler:

- tydelig gruppering
- nøktern node- og relasjonsbruk
- klare labels
- hover og detaljpaneler skal gjøre tunge data lesbare
- rolle- og strukturinformasjon skal skilles tydelig

## Språk og microcopy

### Tone
All tekst skal være:

- norsk
- presis
- profesjonell
- konkret
- rolig

Teksten skal ikke være:

- intern
- MVP-preget
- markedsføringsfluffy
- overforklarende

### Språkregler

- bruk korrekt norsk alfabet: `Æ Ø Å`
- unngå engelske produktord hvis det finnes en god norsk form
- behold tekniske eller juridiske termer bare når de faktisk er best forstått slik

Eksempler:

- bruk `Hovedsignaler` heller enn `Executive snapshot`
- bruk `Tilgjengelighet` eller `Datagrunnlag` heller enn intern systemtekst
- bruk `Åpne kunngjøringer` heller enn kildeorienterte CTA-er når kilden er underforstått

### Forholdet mellom produkt og kilder
Produktet skal være ærlig om data, men ikke overkommunisere kilder i alle synlige flater.

Bruk kildereferanser:

- når de faktisk hjelper brukeren å vurdere data
- i metadata, detaljpaneler eller egne forklarende områder

Unngå:

- å nevne kilder i hver ingress
- å la kildelogikk dominere hovedbudskapet

## Interaksjon

Interaksjoner skal være subtile og funksjonelle.

- diskrete hover-stater
- små transformasjoner når de hjelper fokus
- ingen unødige animasjoner
- tydelig aktiv tilstand i tabs, filtere og segmentkontroller

## Designmønstre som skal videreføres

### Forside

- stor editorial hero
- søk som primærhandling
- mørk sekundærkolonne
- tydelige seksjonsblokker under

### Søk

- samme hero-system som forsiden
- filterpanel til venstre
- stram resultatliste
- fokus på vurdering, ikke katalog

### Selskapsprofil

- tydelig header med juridisk navn og metadata
- hovedsignal-seksjon i toppen
- sticky tabs
- modulær seksjonsoppbygging
- høyrekolonner for signaler eller fakta

### Regnskap

- én tydelig finansiell tidsserieflate
- stramme tabeller
- lesbare KPI-topper
- dokumentmodul som følger samme struktur

### Organisasjon og juridisk struktur

- struktur som analyseflate
- nøkkelroller og fullmakter lett tilgjengelig
- interaktivitet kun der den forbedrer lesbarhet

### Login, pricing, dashboard

- samme editorial hero og innledningsmønster
- samme farge- og typografisystem
- samme språkføring som resten av produktet

## Hva vi aktivt skal unngå videre

- nye sider som faller tilbake til standard SaaS-dashboard
- tunge kortstabler uten tydelig informasjonshierarki
- tilfeldige nye aksentfarger
- inkonsistente radius-, border- eller shadow-mønstre
- engelske labels i ellers norske flater
- `MVP`, `mockdata`, `kildeoppslag` og annen intern formulering i synlig UI
- visuelle avvik mellom forside og underflater

## Praktisk sjekkliste før ny UI merges

### Visuell kontroll

- Bruker siden samme typografiske hierarki som forsiden?
- Følger siden samme farge- og border-system?
- Ser modulen ut som en del av samme produkt som selskapsprofilen?
- Er det for mange kort eller for mye dashboard-preget UI?

### Språk

- Er all tekst på korrekt norsk?
- Finnes det mojibake eller ASCII-erstatninger for `Æ Ø Å`?
- Høres teksten ut som et kommersielt analyseprodukt, ikke intern MVP-copy?

### Data

- Er data tydelig gruppert og lett å skanne?
- Er hovedpoenget på skjermen klart innen få sekunder?
- Er detaljer underordnet oversikten?

## Standard for videre arbeid
Når nye flater bygges, skal de ta utgangspunkt i eksisterende mønstre i:

- [app/page.tsx](C:\Users\simen\Project_Financials\app\page.tsx)
- [app/search/page.tsx](C:\Users\simen\Project_Financials\app\search\page.tsx)
- [app/companies/[slug]/page.tsx](C:\Users\simen\Project_Financials\app\companies\[slug]\page.tsx)
- [components/company/overview-analytics.tsx](C:\Users\simen\Project_Financials\components\company\overview-analytics.tsx)
- [components/company/financial-time-series-table.tsx](C:\Users\simen\Project_Financials\components\company\financial-time-series-table.tsx)
- [components/company/organization-tab.tsx](C:\Users\simen\Project_Financials\components\company\organization-tab.tsx)
- [app/globals.css](C:\Users\simen\Project_Financials\app\globals.css)

Hvis en ny komponent bryter med disse mønstrene, skal det være et bevisst valg med tydelig grunn.
