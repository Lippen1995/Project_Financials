# DESIGN.md — Fjord Insight

## Produkt og identitet

Fjord Insight er en norsk B2B-plattform for selskapsanalyse. Produktet skal føles som et presist analyseverktøy for investorer, rådgivere, selgere, regnskapsførere og ledere — ikke en bedriftskatalog, annonseportal eller generisk SaaS-mal.

### Designkarakter
- Nordic enterprise editorial
- Data-first product UI
- Premium analytical software

### Referanseprodukter
- `linear.app` — presisjon, spacing, arbeidsflate-logikk
- `wise.com` — kommersiell troverdighet, institusjonell klarhet
- `notion.so` — editorial ro, typografisk varme, whitespace
- `hashicorp.com` — enterprise-korrektiv, disiplin

---

## Token-system

Alle farger i koden skal referere til disse token-navnene. Hardkodede hex-verdier er **forbudt** med mindre tokennavnet er dokumentert her.

### CSS-variabler (`app/globals.css`)

| Token | Verdi | Bruk |
|---|---|---|
| `--px-bg` | `#f8f9ff` | Sidens bakgrunn (kjølig lysblå) |
| `--px-surface` | `rgba(255,255,255,0.9)` | Primære kortflater |
| `--px-surface-strong` | `#ffffff` | Hvite innholdsflater |
| `--px-border` | `rgba(15,23,42,0.10)` | Standardkant |
| `--px-border-subtle` | `rgba(15,23,42,0.08)` | Diskrete skiller |
| `--px-text` | `#111827` | Primærtekst (mørk blåsvart) |
| `--px-muted` | `#5f6b7a` | Sekundærtekst |
| `--px-accent` | `#00668a` | Aksent, lenker, aktiv navigasjon (teal) |
| `--px-accent-soft` | `rgba(0,102,138,0.09)` | Lys aksent-bakgrunn |
| `--px-panel` | `#192536` | Mørke kontrastpaneler |
| `--px-action` | `#00668a` | Primærknapper |
| `--px-action-hover` | `#00526e` | Hover på primærknapper |
| `--px-subtle` | `rgba(239,244,255,0.9)` | Lys sekundær bakgrunn |

### Farger i mørke paneler (`--px-panel`)

| Rolle | Klasse |
|---|---|
| Seksjonslabel | `text-white/60` |
| Brødtekst | `text-white/80` |
| Innrammede underbokser | `bg-white/10 border-white/10` |

**Forbudt:** `text-white/72`, `/76`, `/82` og andre custom opacity-verdier.

### Statusfarger

| Status | Border | Bakgrunn | Tekst |
|---|---|---|---|
| Suksess | `border-emerald-200` | `bg-emerald-50` | `text-emerald-800` |
| Advarsel | `border-amber-200` | `bg-amber-50` | `text-amber-700` |
| Feil | `border-rose-200` | `bg-rose-50` | `text-rose-800` |

---

## Typografi

Tre tydelige fontroller — aldri blandes på tvers av sin rolle.

### Fontroller

| CSS-variabel | Google Font | Klasse/bruk |
|---|---|---|
| `--font-serif` | Source Serif 4 | `.editorial-display` — primær H1, selskapsnavnet, store redaksjonelle overskrifter |
| `--font-sans` | IBM Plex Sans | Standard — brødtekst, funksjonelle overskrifter, UI-tekst, tabeller |
| `--font-mono` | IBM Plex Mono | `.data-label` — metadata-labels, seksjonsetiketter, tabelloverskrifter, badges |

### `.editorial-display`

```css
font-family: var(--font-serif), serif;
letter-spacing: -0.05em;
```

**Brukes for:**
1. Sidens primære H1 — én per side
2. Selskapsnavnet i company header
3. Store redaksjonelle seksjonsoverskrifter (f.eks. «Siste selskapsanalyser»)
4. Innlogget startside — produkttittel og command center-tittel

**Brukes IKKE for:**
- Funksjonelle kortoverskrifter («Rask vurdering», «Finansielle signaler»)
- Tabellhoder, paneltitler, UI-elementer

**Tommelfingerregel:** Redaksjonell inngang til innhold → serif. Funksjonelt UI-element → sans.

### `.data-label`

```css
font-family: var(--font-mono), monospace;
letter-spacing: 0.14em;
```

**Brukes for:**
- Seksjonsetiketter (`REGNSKAP`, `ENERGY SECTOR`, `TRENDING SØK`)
- Metadata-labels (`Org.nr.`, `Kommune`, `EBIT`, `NACE`)
- Tabelloverskrifter
- Badges, kategoripills, status-labels
- Personlig hilsen på innlogget startside

### Tekststørrelser

| Bruk | Klasse | Font |
|---|---|---|
| Display H1 (offentlig forside) | `text-[4.8rem]`–`text-[6.15rem]` | `.editorial-display` |
| Display H1 (interne sider) | `text-[3rem]`–`text-[4rem]` | `.editorial-display` |
| Innlogget startside — tittel | `text-[3rem]`–`text-[4rem]` | `.editorial-display` |
| Redaksjonell seksjonsoverskrift | `text-[2rem] font-semibold` | `.editorial-display` |
| Funksjonell seksjonsoverskrift | `text-[1.7rem] font-semibold` | sans |
| Kortoverskrift | `text-lg`–`text-xl font-semibold` | sans |
| Dataverdi (stor) | `text-[1.45rem] font-semibold tabular-nums` | sans |
| Brødtekst | `text-sm leading-7` | sans |
| Ingresstekst | `text-[1.02rem] leading-8` | sans |
| Data-label | `text-[11px] font-semibold uppercase tracking-[0.14em]` | `.data-label` (mono) |

---

## Radius og spacing

### Radius — tre tillatte verdier

| Tailwind | px | Bruk |
|---|---|---|
| `rounded-2xl` | 16px | Ytre kort, modulkort, flash-meldinger, tomme tilstander |
| `rounded-xl` | 12px | Indre bokser, listeelementer, input-felt |
| `rounded-full` | — | Badges, pills, knapper |

**Forbudt:** Alle `rounded-[...]` custom verdier, `rounded-lg`, `rounded-md`, `rounded-3xl`.

**Unntak:** Finansielle tabeller bruker ingen radius — bevisst valg for analytisk preg.

### Spacing

- Seksjonsgap: `space-y-6`, `space-y-8`, `space-y-10`
- Grid-gap: `gap-4`, `gap-6`, `gap-8`
- Padding: `p-5` (kompakt), `p-6` (standard), `p-8` (hero)

---

## Layout

### Primær navigasjonsstruktur: horisontal toppbar

**Alle sider bruker horisontal toppbar. Ingen venstrerail.**

```
┌──────────────────────────────────────────────────────────────────┐
│ Fjord Insight  │  Søk  │  Due Diligence  │  ...  │  Konto  │ JS│
└──────────────────────────────────────────────────────────────────┘
```

#### Toppbar-spec

| Egenskap | Verdi |
|---|---|
| Høyde | `h-16`, fast og `sticky top-0` |
| Bakgrunn | `--px-surface` med `backdrop-blur` |
| Venstre | Produktnavn + tier-label |
| Midtre | Nav-items med ikon + tekst |
| Høyre | Konto, logg ut, bruker-avatar |

#### Nav-ikoner (Material Symbols Outlined, wght 400, fill 0)

| Lenke | Ikon |
|---|---|
| Søk | `search` |
| Due Diligence | `fact_check` |
| Distressed | `warning` |
| Olje & gass | `oil_barrel` |
| Tilgang | `key` |
| Admin | `admin_panel_settings` |
| Konto | `account_circle` |
| Logg ut | `logout` |

#### Aktiv nav-item
```
border-b-2 border-[var(--px-accent)] text-[var(--px-accent)] font-semibold
```

#### Inaktiv nav-item
```
text-[var(--px-muted)] hover:bg-[var(--px-subtle)] transition-colors
```

---

## Sidetype-mønstre

### 1. Offentlig forside (uinnlogget)

Markedsflate for ikke-innloggede brukere. Viser produktets verdi og driver til innlogging.

```
Todelt layout
├── Venstre (lys): H1 editorial-display + ingresstekst + søkefelt + feature-poeng
└── Høyre (--px-panel, mørk): live data-panel, nøkkeltall, troverdighets-signaler
```

Referanse: `app/page.tsx`

### 2. Innlogget startside (command center)

**Dette er ikke en markedsside.** Det er applikasjonens arbeidsflate-inngang etter innlogging.

```
Sentrert, max-w-4xl, text-center
├── .data-label — personlig hilsen («Hei Johannsen, hva skal vi analysere i dag?»)
├── h1 .editorial-display — produktets søketittel
├── Søkefelt — linje-stil (border-bottom, ingen boks/kortramme)
│   └── .data-label — datakilde-note under søk
├── Forslag-tags — trending søk, aktuelle selskaper, bransjefokus
└── Redaksjonelle innholdsseksjoner
```

**Søkefelt — linje-stil:**
```
border-b-2 border-[var(--px-border)] focus:border-[var(--px-accent)] bg-transparent py-4 pl-12
```

Referanse: `app/(app)/dashboard/page.tsx`

### 3. Selskapsprofil

```
├── CompanyHeader — kompakt, juridisk metadata + selskapsnavn (.editorial-display) + signaler
├── Sticky sekundærnavigasjon — faner (Oversikt, Regnskap, Nøkkeltall, ...)
└── Innholdsområde (grid 12 kolonner)
    ├── col-span-9 — primært analyseinnhold
    └── col-span-3 — kontekstuell høyrekolonne (persistent gjennom alle faner)
```

Høyrekolonnen (3/12) er en **analytisk støttekolonne** — ikke et widgetpanel. Den inneholder markedskontekst, raske lenker, varsler og DD-notater.

Referanse: `app/(app)/companies/[slug]/page.tsx`

### 4. Søkeside

Todelt layout: filterpanel til venstre (~320px), resultatliste til høyre.

Referanse: `app/(app)/search/page.tsx`

---

## Redaksjonelle innholdsmønstre

### Seksjonsoverskrift (editorial stil)

```html
<div class="flex justify-between items-end border-b border-[var(--px-text)] pb-2 mb-8">
  <h2 class="editorial-display text-[2rem]">Siste selskapsanalyser</h2>
  <a class="data-label text-[var(--px-accent)]">SE ALLE →</a>
</div>
```

Kjennetegn: tung `border-bottom` mot `--px-text`, serif, valgfri høyre-handling.

### Artikkel/innsikt-rad

```
grid grid-cols-12 gap-8 py-8 border-b border-[var(--px-border)]
├── col-span-3 — .data-label: kategori + dato
├── col-span-6 — h4 .editorial-display: overskrift + brødtekst
└── col-span-3 — bilde (grayscale, hover: farge) — valgfritt
```

### Forslag-tags (innlogget startside)

```
border border-[var(--px-border)] px-4 py-3 rounded-xl
hover:border-[var(--px-accent)] hover:bg-[var(--px-accent-soft)]
├── .data-label — kategori (f.eks. «TRENDING SØK»)
└── font-semibold — innhold (f.eks. «Kvartalsrapporter: Energi»)
```

---

## Komponentspesifikasjoner

### Knapper

| Type | Klasser |
|---|---|
| Primær | `rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--px-action-hover)] transition-colors` |
| Sekundær | `rounded-full border border-[var(--px-border)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-[rgba(15,23,42,0.2)] transition-colors` |
| Tekst-lenke | `text-[var(--px-accent)] text-sm font-semibold hover:underline` |

### Badges og pills

```
rounded-full border border-[var(--px-border)] bg-white px-3 py-1
text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600
```

### Kort (Card)

```
rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6
```

Indre statistikkboks:
```
rounded-xl border border-[var(--px-border-subtle)] bg-white p-4
```

Indre listeelement:
```
rounded-xl border border-[var(--px-border-subtle)] bg-[var(--px-subtle)] p-4
```

### Input-felt

```
rounded-xl border border-[var(--px-border)] bg-white px-4 py-3 text-sm
outline-none focus:border-[var(--px-accent)] transition-colors
```

### Tabeller

- Ingen radius på tabellen selv
- Kolonneoverskrifter: `.data-label text-[11px]`
- Tall: `tabular-nums`
- Rad-hover: `hover:bg-[var(--px-subtle)]`
- Negative tall: `text-rose-700`
- Siste rad (sum/total): `font-semibold border-t border-[var(--px-border)]`

### Tomme tilstander

```
rounded-2xl border border-dashed border-[rgba(15,23,42,0.14)]
bg-[var(--px-subtle)] p-6 text-sm leading-7 text-slate-600
```

### Flash-meldinger / varsler

```
Feil:     rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800
Suksess:  rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800
Info:     rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-800
```

### Grafer

- Tynn strek, dempet gridlines, minimal fyllflate
- Primær dataserie: `--px-accent` (`#00668a`)
- Sekundær dataserie: dempet brun/sand (`#8b7355` e.l.)
- Ingen dekorative fill-areas uten analytisk formål
- Tooltip: kompakt, hvit boks med `rounded-xl border shadow-sm`

### Skeleton-loading

```
rounded-xl bg-[var(--px-border)] animate-pulse
```

---

## Tilstander

| Tilstand | Implementasjon |
|---|---|
| **Tom** | Dashed border + forklaringstekst (se «Tomme tilstander» over) |
| **Feil** | Rød flash-melding øverst i seksjonen |
| **Laster** | Skeleton-elementer som matcher innholdsstrukturen |
| **Ikke tilgjengelig** | Tydelig melding uten å bryte layout |
| **Betalingsmur** | `components/paywall/premium-lock.tsx` |

---

## Språk og microcopy

All tekst skal være norsk, presis og profesjonell.

| Unngå | Bruk heller |
|---|---|
| «Executive snapshot» | «Hovedsignaler» |
| «Workspace» | «Arbeidsflate» |
| «Admin» (synlig UI) | «Administrator» |
| «Dashboard» | «Oversikt» eller «Startside» |
| «Loading...» | «Laster...» |
| Engelske forkortelser | Norske ekvivalenter der de finnes |

Regler:
- Korrekt norsk alfabet: `Æ Ø Å` — aldri `Ae`, `Oe`, `Aa`
- Behold juridiske/tekniske termer der de er standard (BRREG, NACE, EBIT)
- Unngå intern MVP-copy i synlig UI (`mockdata`, `kildeoppslag`, `TODO`)

---

## Do og Don't

### Do
- Bruk horisontal toppbar — ikke venstrerail
- Bruk Material Symbols-ikoner i alle nav-items (ikon + tekst)
- Bruk `.editorial-display` for H1 og store redaksjonelle seksjonsoverskrifter
- Bruk linje-stil søkefelt på innlogget startside
- Hold selskapsprofil i 9/3-grid gjennom alle faner
- Bruk kun de tre tillatte radius-verdiene
- Referer alltid til CSS-variabler for farger — aldri hardkode hex

### Don't
- Ikke bygg venstrerail-navigasjon
- Ikke bruk `.editorial-display` for funksjonelle kortoverskrifter
- Ikke bruk `rounded-[...]` custom verdier
- Ikke hardkod farger — bruk CSS-variabler
- Ikke bygg generiske SaaS-dashboards
- Ikke fyll høyrekolonnen med widgeter uten analytisk verdi
- Ikke forveksle innlogget startside med offentlig forside
- Ikke bruk engelske labels i ellers norske flater

---

## Agent-sjekkliste

Bruk denne listen når du bygger eller reviewer en ny side/komponent:

**Layout:**
- [ ] Bruker siden horisontal toppbar (ikke venstrerail)?
- [ ] Har alle nav-items ikon + tekst fra Material Symbols?
- [ ] Er aktiv nav-item markert med `border-b-2 border-[var(--px-accent)]`?

**Sidetype:**
- [ ] Er innlogget startside sentrert med linje-søkefelt (ikke todelt hero)?
- [ ] Er offentlig forside todelt (lys venstre + mørk høyrepanel)?
- [ ] Har selskapsprofilen 9/3-grid gjennom alle faner?

**Typografi:**
- [ ] Bruker store redaksjonelle seksjoner `.editorial-display`?
- [ ] Er funksjonelle kortoverskrifter i sans?
- [ ] Er alle metadata-labels i `.data-label` (mono)?

**Radius:**
- [ ] Kun `rounded-2xl`, `rounded-xl` eller `rounded-full`?
- [ ] Ingen `rounded-lg`, `rounded-md`, `rounded-[...]`?

**Farger:**
- [ ] Alle farger via CSS-variabler (`var(--px-...)`)?
- [ ] Mørke paneler: kun `text-white/60` og `text-white/80`?
- [ ] Ingen hardkodede hex-verdier?

**Innhold:**
- [ ] All tekst på korrekt norsk?
- [ ] Korrekt norsk alfabet (`Æ Ø Å`)?
- [ ] Tomme tilstander definert?
- [ ] Loading-tilstand definert?

---

## Referansefiler

| Formål | Fil |
|---|---|
| CSS-tokens og globale stiler | `app/globals.css` |
| Fonter og metadata | `app/layout.tsx` |
| Offentlig forside-mønster | `app/page.tsx` |
| Innlogget startside | `app/(app)/dashboard/page.tsx` |
| Selskapsprofil (hoved) | `app/(app)/companies/[slug]/page.tsx` |
| Søkeside | `app/(app)/search/page.tsx` |
| Standard Card-komponent | `components/ui/card.tsx` |
| Finansielle tabeller | `components/company/financial-time-series-table.tsx` |
| Organisasjonsstruktur | `components/company/organization-tab.tsx` |
| Tailwind-konfig og MD3-tokens | `tailwind.config.ts` |

---

## Hurtigprompt for agenter

> Bygg i Fjord Insight-stil: horisontal toppbar med Material Symbols-ikoner + tekst i nav, lys nordisk enterprise editorial, data-first, premium analytisk. Source Serif 4 (`.editorial-display`) for primær H1 og store redaksjonelle seksjonsoverskrifter. IBM Plex Sans for funksjonelle overskrifter og UI-tekst. IBM Plex Mono (`.data-label`) for metadata, labels, tabelloverskrifter og kategoripills. Fargepalett: kjølig bakgrunn (`--px-bg: #f8f9ff`), teal aksent (`--px-accent: #00668a`). Alle farger via CSS-variabler — aldri hardkodede hex. Knapper er `rounded-full`. Kort er `rounded-2xl`. Indre bokser er `rounded-xl`. Ingen andre radius-verdier. Selskapsprofil bruker 9/3-kolonner gjennom alle faner. Innlogget startside: sentrert søkehero med linje-søkefelt. Offentlig forside: todelt (lys venstre + mørk `--px-panel` høyrepanel). Unngå generisk SaaS-dashboard, startup-gradienter og engelske labels i norsk UI.
