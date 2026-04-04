# UI Design Structure

## Formål
Dette dokumentet beskriver den aktive designstrukturen i ProjectX slik produktet ser ut nå. Målet er å sikre kontinuitet når nye flater bygges eller eksisterende flater videreutvikles.

Dette er ikke en løs inspirasjonsliste. Det er en praktisk standard for hvordan ProjectX skal se ut, oppføre seg og kommunisere videre.

`DESIGN.md` er nå hoveddokumentet for designretning. Denne filen fungerer som et mer praktisk arbeidsnotat og sjekkliste for videre UI-arbeid i repoet.

## Designretning
ProjectX følger en stil som kombinerer:

- Nordic enterprise editorial
- data-first product UI
- premium analytical software

Referanseretningen er nær:

- Linear for presisjon og disiplin
- Wise for tillit og kommersiell klarhet
- Notion for editorial ro og lesbarhet
- HashiCorp som enterprise-korrektiv

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

Fra dagens implementasjon i [globals.css](C:\Users\simen\Project_Financials\app\globals.css):

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

## Typografi

### Fontroller
ProjectX bruker tre tydelige typografiske roller:

- serif-display for store overskrifter
- sans for UI, lesetekst og tabeller
- mono for metadata, seksjonslabeler og tabulære data

Nåværende oppsett i [layout.tsx](C:\Users\simen\Project_Financials\app\layout.tsx):

- `Source Serif 4`
- `IBM Plex Sans`
- `IBM Plex Mono`

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
- dashboard

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

### 4. Tabeller
Tabeller er en kjernekomponent i produktet.

Tabeller skal:

- ha tydelige kolonneoverskrifter
- bruke tabulære tall
- ha rolig headerbakgrunn
- ha høy lesbarhet i rader og negative tall
- føles finansielle, ikke generiske

### 5. Grafer
Grafer skal være sobere og analytiske.

Regler:

- én tydelig jobb per graf
- rolige akser og gridlines
- tooltip som forklarer uten å dominere
- tydelig aktivt år eller valgt punkt
- mørk marine for primær dataserie
- dempet brun for sekundær eller alternativ serie

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

### Språkregler

- bruk korrekt norsk alfabet: `Æ Ø Å`
- unngå engelske produktord hvis det finnes en god norsk form
- behold tekniske eller juridiske termer bare når de faktisk er best forstått slik

Eksempler:

- bruk `Hovedsignaler` heller enn `Executive snapshot`
- bruk `arbeidsflate` heller enn `workspace` i synlig UI
- bruk `administrator` heller enn `admin` i synlig UI når det passer
- bruk `Åpne kunngjøringer`, `årsregnskap`, `regnskapsår`, `nøkkeltall`

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

- bruker siden samme typografiske hierarki som forsiden?
- følger siden samme farge- og border-system?
- ser modulen ut som en del av samme produkt som selskapsprofilen?
- er det for mange kort eller for mye dashboard-preget UI?

### Språk

- er all tekst på korrekt norsk?
- finnes det mojibake eller ASCII-erstatninger for `Æ Ø Å`?
- høres teksten ut som et kommersielt analyseprodukt, ikke intern MVP-copy?

### Data

- er data tydelig gruppert og lett å skanne?
- er hovedpoenget på skjermen klart innen få sekunder?
- er detaljer underordnet oversikten?

## Standard for videre arbeid
Når nye flater bygges, skal de ta utgangspunkt i eksisterende mønstre i:

- [page.tsx](C:\Users\simen\Project_Financials\app\page.tsx)
- [page.tsx](C:\Users\simen\Project_Financials\app\search\page.tsx)
- [page.tsx](C:\Users\simen\Project_Financials\app\companies\[slug]\page.tsx)
- [overview-analytics.tsx](C:\Users\simen\Project_Financials\components\company\overview-analytics.tsx)
- [financial-time-series-table.tsx](C:\Users\simen\Project_Financials\components\company\financial-time-series-table.tsx)
- [organization-tab.tsx](C:\Users\simen\Project_Financials\components\company\organization-tab.tsx)
- [globals.css](C:\Users\simen\Project_Financials\app\globals.css)

Hvis en ny komponent bryter med disse mønstrene, skal det være et bevisst valg med tydelig grunn.

