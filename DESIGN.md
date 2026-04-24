# DESIGN.md

## Product
ProjectX er en norsk B2B-plattform for selskapsanalyse, søk og arbeidsflater rundt selskapsresearch.

Produktet skal føles som et presist analyseverktøy for investorer, rådgivere, selgere, regnskapsførere og ledere. Det skal ikke ligne en bedriftskatalog, en annonseportal eller en generisk SaaS-mal.

## Source Direction

Denne designretningen er bevisst inspirert av følgende referanser fra `awesome-design-md`:

- `linear.app` for produktpresisjon, spacing og arbeidsflate-logikk
- `wise` for kommersiell troverdighet og institusjonell klarhet
- `notion` for editorial ro, typografisk varme og lesbarhet
- `hashicorp` som enterprise-korrektiv når løsningen blir for startup-preget

I tillegg bygger ProjectX nå på en tydelig visuell retning fra den nye referanseskissen vi har valgt:

- venstrestilt navigasjonsrail
- toppbar med søk, verktøy og selskapsnavigasjon
- serif-drevet selskapsheader
- lys papiraktig bakgrunn
- luftig hovedkolonne for analyse
- høyre research-kolonne for overvåkninger, notater, due diligence og kontekst
- sobere grafer med tynn strek og dempet sand- eller gulltone

Disse referansene skal ikke kopieres direkte. De brukes som retningsgivende prinsipper for hvordan ProjectX skal oppleves.

## 1. Visual Theme & Atmosphere

### Core direction
- Nordic enterprise editorial
- data-first product UI
- premium analytical software

### Desired feeling
- sober
- calm
- high-trust
- precise
- premium
- analytical

### Product character
- mer Linear enn generisk Tailwind
- mer Bloomberg light enn dashboard-kit
- mer McKinsey-troverdighet enn startup-markedsføring
- mer Wise i klarhet enn katalog i presentasjon
- mer nordisk research-terminal enn adminflate

### What the interface should communicate
- dette er et verktøy for vurdering og beslutning
- informasjon er strukturert, ikke bare listet
- produktet er moderne, men disiplinert
- designet hjelper brukeren å se mønstre raskt

## 2. Color Palette & Roles

### Base palette
- `Background`: `#f5f4f0`
- `Surface`: `rgba(255, 255, 255, 0.90)`
- `Surface Strong`: `#ffffff`
- `Border`: `rgba(15, 23, 42, 0.10)`
- `Text Primary`: `#111827`
- `Text Secondary`: `#5f6b7a`
- `Accent`: `#31495f`
- `Accent Soft`: `#e7edf3`

### Data accents
- `Primary Series`: dyp marine/blågrå
- `Secondary Series`: dempet sand, gull eller jordet brun
- `Success`: dempet grønn
- `Warning`: dempet amber
- `Error`: dempet rød

### Color rules
- lys bakgrunn er hovedretning
- mørk tekst på lyse flater er standard
- bruk én primær aksentfarge
- statusfarger skal være funksjonelle, ikke dekorative
- unngå sterke gradients og mettet neon

### Never do
- flerfargede aksentsystemer
- lilla som standardaksent
- store dekorative fargeflater uten funksjon
- mørk modus som primæridentitet

## 3. Typography Rules

### Typeface roles
- `Display Serif`: Source Serif 4
- `UI Sans`: IBM Plex Sans
- `Mono`: IBM Plex Mono

### Hierarchy
- store overskrifter: serif, høy kontrast, tett og presis
- UI-tekst, tabeller og brødtekst: sans
- metadata, labels og tallkolonner: mono eller tabular numerals

### Typography behavior
- overskrifter skal være korte og beslutningsorienterte
- labels skal være små, uppercase og nøkterne
- lange ingressavsnitt skal unngås
- tall må være lette å skanne i tabeller og signalflater

### Preferred classes and patterns
- `.editorial-display`
- `.data-label`
- tabular numerals der det er mulig

## 4. Component Stylings

### Headers and hero sections
- liten mono-label først
- tydelig overskrift med serif
- én kort ingress
- eventuelt en mørk høyrespalte for status eller kontekst

Heroer skal brukes som arbeidsflate-intro, ikke som markedsføringsbanner.

På selskapsflater skal overskriften ofte følges av:
- en smal metadata-linje over tittelen
- en kompakt rad med signaler under tittelen
- en separat høyrekolonne for market cap, overvåkninger eller relaterte notater

### Cards
- cards er tillatt, men de skal være stramme og informative
- lav til moderat radius
- tynne borders
- minimale skygger
- kortet skal være en informasjonsbeholder, ikke en visuell effekt

### Buttons
- primærknapper: mørk marine bakgrunn, hvit tekst, tydelig men rolig
- sekundærknapper: hvit eller lys bakgrunn, tynn border, mørk tekst
- hover skal være subtil og skarp, ikke hoppende

### Inputs and search
- inputs skal være brede, luftige og nøkterne
- placeholder-tekst skal være konkret, ikke eksempeltung
- søkefelt er ofte den primære handlingen og må være visuelt tydelig

### Tabs and segmented controls
- lav visuell støy
- tydelig aktiv tilstand
- ikke leken pill-estetikk
- skal se ut som verktøysnavigasjon, ikke app-store UI

### Side panels
- brukes til signaler, innsikt, metadata og sekundærkontekst
- kompakte, tydelige og rolige
- skal støtte hovedflaten, ikke konkurrere med den

Sidepaneler bør ofte organiseres som:
- overvåkninger
- analysenotater
- due diligence
- kontakt- eller lokasjonskontekst

## 5. Layout Principles

### Primary layout pattern
Bruk som hovedregel:
- venstre navigasjonsrail når arbeidsflaten krever det
- bred hovedkolonne for analyseinnhold
- smal sekundærkolonne for signaler, status eller kontekst

Dette gjelder særlig for:
- forside når det er relevant
- søk
- selskapsprofil
- oversikt
- organisasjon
- dashboard

### Top bar pattern
Når flaten er operativ og produktnær, kan den ha:
- øvre verktøylinje med søk og handlinger
- sekundær linje for faner eller selskapsnavigasjon
- diskrete skillere fremfor tunge beholdere

### Section structure
Hver seksjon skal typisk ha:
1. liten label
2. tydelig overskrift
3. én kort forklaring
4. selve analyseflaten
5. eventuelle detaljer eller sekundærsignaler

Typisk selskapsprofil bør også følge denne rytmen:
1. markeds- eller juridisk metadata
2. selskapsnavn
3. primære signaler
4. hovedseksjoner som oversikt, historisk utvikling og tabeller
5. høyre innsiktskolonne med løpende vurderingsstøtte

### Spacing philosophy
- whitespace skal brukes aktivt for å skape hierarki
- ikke stapp mange kort tett sammen
- seksjoner skal puste, men ikke føles luftige på bekostning av informasjon

### Density
- høy informasjonstetthet er bra når strukturen er tydelig
- produktet skal være desktop-first
- mobil skal fungere, men ikke få bestemme desktop-layouten

## 6. Depth & Elevation

### Surface hierarchy
- bakgrunn: varm off-white
- primære flater: lyse, nesten flate
- sekundære flater: svakt tonede
- mørke paneler brukes kun som kontrastmoduler, ikke som standard

Den nye referanseretningen trekker produktet enda tydeligere mot:
- papiraktig bakgrunn
- skarpe hvite analyseflater
- nesten usynlige skiller fremfor tunge bokser

### Shadow rules
- svært lett skygge eller ingen skygge
- shadows skal aldri bære designet
- borders og spacing skal gjøre mesteparten av jobben

### Border rules
- tynne, diskrete borders
- konsekvent borderfarge
- del opp store flater med borders heller enn sterke bakgrunner

## 7. Do’s and Don’ts

### Do
- bygg rundt informasjonshierarki
- la typografi og struktur skape premium-følelse
- hold komponenter rolige og konsekvente
- bruk norsk språk og riktig tegnsett
- vis data på en måte som hjelper vurdering
- prioriter scanning først, dybde etterpå

### Don’t
- ikke bygg generiske SaaS-dashboards
- ikke bruk markedsføringsspråk i produktflater
- ikke overdriv med cards
- ikke bruk mange aksentfarger
- ikke bygg infografikk når brukeren trenger analyse
- ikke bland engelsk og norsk i sentrale labels
- ikke la kilde- eller systemlogikk dominere hovedbudskapet
- ikke fyll høyrekolonnen med tilfeldige widgets uten analysemessig verdi
- ikke bruk tykk chrome eller tunge sidebokser

## 8. Responsive Behavior

### Desktop
- analyseflaten skal dominere
- sekundærpaneler kan ligge i høyrekolonne
- tabeller og grafer skal være lett skannbare

### Mobile
- seksjoner kan stables
- sidepaneler flyttes ned
- tabs må fortsatt være tydelige
- kritisk informasjon må komme først

### Interaction rules
- subtile hover states
- ingen unødvendige animasjoner
- overganger skal forbedre forståelse, ikke pynte

## 9. Content & Microcopy

### Tone
- norsk
- presis
- profesjonell
- konkret
- rolig

### Copy rules
- skriv for beslutning og orientering
- korte overskrifter
- én tydelig forklaringssetning er nok i de fleste seksjoner
- unngå intern produktlogikk i synlig UI
- unngå ord som `MVP`, `mock`, `syntetisk` og lignende i brukerflater

### Terminology rules
- bruk `arbeidsflate` heller enn `workspace` i synlig UI
- bruk `administrator` heller enn `admin` i synlig UI når det passer
- bruk `kunngjøringer`, `nøkkeltall`, `åpne`, `årsregnskap`, `regnskapsår`
- bruk korrekt norsk alfabet: `Æ Ø Å`

## 10. Product Surface Guidance

### Homepage
- søk er primærhandling
- hero skal være redaksjonell og rolig
- tillit bygges med struktur og klarhet, ikke med salgsretorikk

### Search
- skal føles som en vurderingsflate
- filterpanel til venstre eller i rail
- tydelig treffoppsummering
- resultater skal være skannbare og profesjonelle

### Company profile
- juridisk navn og metadata først
- toppseksjon med hovedsignaler
- sticky seksjonsnavigasjon
- moduler for oversikt, regnskap, organisasjon og historikk
- høyre innsiktskolonne skal føles som en research-assistent, ikke et widgetpanel

Selskapsprofilen skal i større grad minne om:
- en kombinasjon av analysebrev, terminal og premium webapp
- ikke et klassisk dashboard eller en katalogdetaljside

### Charts
- sober, analytisk stil
- få serier
- tydelige akser
- ingen flashy effekter
- grafen skal se ut som et analyseverktøy, ikke en KPI-widget

Foretrukket grafuttrykk i denne retningen:
- tynn strek
- mye luft
- diskret grid
- svak eller ingen fyllflate
- dempet sand- eller gulltone for sekundær eller historisk serie når det gir mening

### Tables
- stramme finansielle tabeller
- tydelige kolonneoverskrifter
- tabular numerals
- høy lesbarhet i negative tall og årskolonner

### Organization and legal structure
- skal se ut som et juridisk analyseverktøy
- nøktern relasjonsvisning
- detaljer i hover eller panel der det forbedrer lesbarhet

### Dashboard
- samme designsystem som resten av appen
- arbeidsflate først
- tilgang, medlemmer og invitasjoner skal være en ryddig operativ flate
- dashboardet bør visuelt nærme seg venstre rail, tydelig toppbar, hovedkolonne og høyre kontekstkolonne

## 11. Design Guardrails for Agents

Når du bygger nye flater i ProjectX:
- bruk eksisterende farge- og typografisystem
- følg samme seksjonsrytme som forside og selskapsprofil
- bruk ikke nye visuelle idiomer uten tydelig grunn
- foretrekk plain layout fremfor flere kort
- hvis du er i tvil, velg roligere og mer presist

Hvis en ny side ser ut som:
- et admin-dashboard
- en katalog
- en startup-landingsside
- eller et template-bibliotek

så matcher den ikke ProjectX.

## 12. Comparison Heuristics

Bruk disse referansene aktivt når du er i tvil:

- hvis løsningen føles for travel eller generisk: trekk mot `linear.app`
- hvis løsningen føles for kald eller teknisk: trekk mot `notion`
- hvis løsningen føles for svak i tillit og kommersiell tyngde: trekk mot `wise`
- hvis løsningen føles for vennlig, myk eller startup-preget: trekk mot `hashicorp`
- hvis løsningen mangler research-preg og nordisk editorial ro: trekk mot den nye venstrerail- og research-kolonne-retningen

## 13. Quick Prompt Guide

Bruk dette når du ber en agent bygge UI i ProjectX:

> Bygg dette i ProjectX-stilen: lys nordisk enterprise editorial, data-first arbeidsflate, premium analytisk programvare. Bruk Source Serif 4 til store overskrifter, IBM Plex Sans til UI, IBM Plex Mono til labels og metadata. Hold fargepaletten lys og nøytral med dempet marine aksent, tynne borders, svært lite skygge og rolig spacing. Tenk Linear for presisjon, Wise for tillit, Notion for editorial ro og HashiCorp som enterprise-korrektiv. Legg til research-preg med venstre navigasjonsrail, luftig hovedkolonne, høyre innsiktskolonne og sobere grafer med dempet sand- eller gulltone. Unngå generisk SaaS-card grid, gradients og markedsføringspreg. Design for rask scanning og høy troverdighet.

