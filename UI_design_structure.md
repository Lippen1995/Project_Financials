# UI Design Structure — Fjord Insight

## Formål

Dette dokumentet er et praktisk arbeidsnotat og sjekkliste for UI-arbeid i Fjord Insight. Det utfyller `DESIGN.md`, som er hoveddokumentet for designretning og tekniske spesifikasjoner.

Bruk `DESIGN.md` for: fargetokens, typografiklasser, komponentspesifikasjoner, og hurtigprompt.
Bruk dette dokumentet for: prinsipper, mønstre per side, og sjekkliste før merge.

---

## Designretning

Fjord Insight kombinerer:

- **Nordic enterprise editorial** — rolig, analytisk, presis
- **Data-first product UI** — data i sentrum, pynt i periferien
- **Premium analytical software** — institusjonell troverdighet, ikke SaaS-startup

Referanser: Linear (presisjon), Wise (tillit), Notion (editorial ro), HashiCorp (enterprise-korrektiv).

**Langt unna:**
- Generisk Tailwind SaaS-template
- Startup-gradienter og overdekorert UI
- Katalog- eller portalestetikk
- Overfylte kort-stabler uten hierarki
- Markedsføringsspråk og growth-UI

---

## Kjerneprinsipper

### 1. Analyse først
Hver skjerm skal hjelpe brukeren å forstå noe raskt.

- Forside → forstå produktets verdi og start søk
- Søk → snevre inn og vurdere treff
- Selskapsprofil → gå fra oversikt til dyp analyse
- Regnskap → lese tidsserier og finansielle tall
- Organisasjon → forstå kontroll, roller og struktur

### 2. Informasjon i lag
Hvert innholdsområde skal ha tydelig visuell hierarki:

1. Seksjonslabel (`.data-label`, mono, uppercase)
2. Overskrift (sans eller `.editorial-display`)
3. Kort forklaring
4. Primær analyseflate
5. Sekundære detaljer og signaler

Bruker skal kunne skanne siden på 3 sekunder og forstå hva de ser på.

### 3. Troverdighet foran pynt
Premium-følelse skapes av typografi, spacing og datadisiplin — ikke effekter.

- Minimal skyggebruk
- Ingen sterke gradienter
- Ingen illustrasjoner uten funksjon
- Ingen visuelle elementer som konkurrerer med data

### 4. Desktop-first arbeidsflate
Selskapsanalyse er primært en desktop-opplevelse. Strukturen prioriteres for brede flater; mobil skal fungere, men er sekundært.

---

## Gjeldende fargepalett

Hentet fra `app/globals.css` — bruk alltid CSS-variabelnavnene, aldri hardkodede hex.

| Token | Verdi | Bruk |
|---|---|---|
| `--px-bg` | `#f8f9ff` | Sidens bakgrunn |
| `--px-surface` | `rgba(255,255,255,0.9)` | Kortflater |
| `--px-surface-strong` | `#ffffff` | Hvite flater |
| `--px-border` | `rgba(15,23,42,0.10)` | Standardkant |
| `--px-border-subtle` | `rgba(15,23,42,0.08)` | Diskrete skiller |
| `--px-text` | `#111827` | Primærtekst |
| `--px-muted` | `#5f6b7a` | Sekundærtekst |
| `--px-accent` | `#00668a` | Aksent og lenker (teal) |
| `--px-accent-soft` | `rgba(0,102,138,0.09)` | Lys aksent-bakgrunn |
| `--px-panel` | `#192536` | Mørke kontrastpaneler |
| `--px-action` | `#00668a` | Primærknapper |
| `--px-action-hover` | `#00526e` | Hover på primærknapper |
| `--px-subtle` | `rgba(239,244,255,0.9)` | Lys sekundær bakgrunn |

---

## Typografi

Tre fontroller — aldri blandes på tvers av sin funksjon.

| Font | CSS-variabel | Klasse | Bruk |
|---|---|---|---|
| Source Serif 4 | `--font-serif` | `.editorial-display` | Primær H1, selskapsnavnet, store redaksjonelle overskrifter |
| IBM Plex Sans | `--font-sans` | *(ingen klasse)* | All UI-tekst, brødtekst, funksjonelle overskrifter, tabeller |
| IBM Plex Mono | `--font-mono` | `.data-label` | Metadata, seksjonslabels, tabelloverskrifter, badges |

**Tommelfingerregel:** Er det redaksjonell inngang til innhold? → Serif. Er det et funksjonelt UI-element? → Sans.

---

## Mønstre per sidetype

### Offentlig forside (`app/page.tsx`)
- Todelt layout: lys venstre + mørk høyrepanel (`--px-panel`)
- Venstre: H1 `.editorial-display`, ingresstekst, søkefelt, feature-poeng
- Høyre: live data-panel med nøkkeltall og troverdighets-signaler
- Aldri: markedsføringsspråk, illustrasjoner, startup-gradienter

### Innlogget startside (`app/(app)/dashboard/page.tsx`)
- Sentrert, `max-w-4xl`, `text-center`
- `.data-label` personlig hilsen øverst
- H1 `.editorial-display` som produktets søketittel
- Søkefelt i **linje-stil**: `border-b-2`, ingen kortramme
- Forslag-tags under søk
- Redaksjonelle seksjoner med editorial overskrifter

### Selskapsprofil (`app/(app)/companies/[slug]/page.tsx`)
- CompanyHeader: kompakt med juridisk metadata + selskapsnavn (`.editorial-display`)
- Sticky sekundærnavigasjon med faner
- **9/3-grid** gjennom alle faner — aldri bryte denne strukturen
- col-span-9: primært analyseinnhold
- col-span-3: analytisk støttekolonne (kontekst, varsler, DD-notater)

### Søkeside (`app/(app)/search/page.tsx`)
- Todelt: filterpanel til venstre (~320px), resultatliste til høyre
- Kompakt, skanerbart format på søkeresultater

---

## Komponentmønstre

### Hero-seksjoner
- Liten `.data-label` label øverst
- Stor `.editorial-display` overskrift
- Én kort forklarende ingress (sans)
- Eventuell mørk høyrespalte for status eller kontekst
- Hero skal aldri se ut som en marketing-side

### Kort (Cards)
- Flate og stramme — `rounded-2xl border bg-[var(--px-surface)]`
- Informasjonsmoduler, ikke dekorasjon
- Ingen tunge skygger
- Ikke stable kort uten tydelig informasjonshierarki

### Datapaneler
- Kompakte og tydelige
- Brukt til: analytisk sammendrag, fakta- og statuspaneler, innsiktspaneler
- Innhold: `rounded-xl border border-[var(--px-border-subtle)]`

### Tabeller
- Ingen radius — bevisst analytisk preg
- `.data-label` tabelloverskrifter
- `tabular-nums` på alle tall
- Rolig header-bakgrunn
- Hover: `bg-[var(--px-subtle)]`
- Finansielle, ikke generiske

### Grafer
- Én tydelig jobb per graf
- Tynn strek, rolige gridlines, minimal fill
- Primær serie: `--px-accent`
- Sekundær serie: dempet brun/sand
- Tooltip: kompakt hvit boks

### Organisasjons- og strukturflater
- Analyseverktøy, ikke infografikk
- Tydelig gruppering og nøktern node-/relasjonsbruk
- Hover og detaljpaneler for tunge data

---

## Språkregler

All synlig tekst skal være norsk, profesjonell og presis.

- Korrekt norsk alfabet: `Æ Ø Å` — aldri `Ae`, `Oe`, `Aa`
- Unngå engelske produktord der norsk fungerer like godt
- Behold juridiske/tekniske termer der de er standard (BRREG, NACE, EBIT, EBITDA)
- Aldri intern MVP-copy i synlig UI: `TODO`, `mockdata`, `kildeoppslag`, `placeholder`

| Unngå | Bruk heller |
|---|---|
| Executive snapshot | Hovedsignaler |
| Workspace (synlig UI) | Arbeidsflate |
| Admin (knapp/label) | Administrator |
| Dashboard | Oversikt / Startside |
| Loading... | Laster... |

---

## Hva vi aktivt unngår

- Nye sider som faller tilbake til standard SaaS-dashboard
- Tunge kortstabler uten tydelig informasjonshierarki
- Tilfeldige nye aksentfarger — bruk kun `--px-accent`
- Inkonsistente radius-, border- eller shadow-mønstre
- Engelske labels i ellers norske flater
- Hardkodede hex-farger — alltid CSS-variabler

---

## Sjekkliste før ny UI merges

### Visuell kontroll
- [ ] Følger siden fargesystem og radius fra `DESIGN.md`?
- [ ] Bruker siden riktige typografiklasser (`.editorial-display`, `.data-label`)?
- [ ] Ser komponenten ut som en del av samme produkt som selskapsprofilen?
- [ ] Er det for mange kort eller for mye dashboard-preget UI?
- [ ] Er det hardkodede farger som burde vært CSS-variabler?

### Layout
- [ ] Horisontal toppbar — ikke venstrerail?
- [ ] Selskapsprofil: 9/3-grid gjennom alle faner?
- [ ] Innlogget startside: sentrert med linje-søkefelt?

### Typografi
- [ ] `.editorial-display` kun for H1 og redaksjonelle seksjonsoverskrifter?
- [ ] `.data-label` for alle metadata, labels og tabelloverskrifter?

### Språk
- [ ] All tekst på korrekt norsk?
- [ ] Korrekt bruk av `Æ Ø Å`?
- [ ] Ingen intern MVP-copy eller engelske labels?

### Data og tilstander
- [ ] Er data gruppert og lett å skanne?
- [ ] Er tomme tilstander definert (`rounded-2xl border-dashed`)?
- [ ] Er loading-tilstand definert (skeleton)?
- [ ] Er feil-tilstand definert (rød flash-melding)?

---

## Referansefiler

Nye komponenter skal ta utgangspunkt i eksisterende mønstre:

| Mønster | Fil |
|---|---|
| CSS-tokens | `app/globals.css` |
| Fonter og metadata | `app/layout.tsx` |
| Offentlig forside | `app/page.tsx` |
| Innlogget startside | `app/(app)/dashboard/page.tsx` |
| Selskapsprofil | `app/(app)/companies/[slug]/page.tsx` |
| Søkeside | `app/(app)/search/page.tsx` |
| Finansielle tabeller | `components/company/financial-time-series-table.tsx` |
| Organisasjonsstruktur | `components/company/organization-tab.tsx` |
| Analytisk oversikt | `components/company/overview-analytics.tsx` |
| Tailwind-konfig | `tailwind.config.ts` |

Hvis en ny komponent bryter med disse mønstrene, skal det være et bevisst valg med tydelig grunn.
