# DESIGN.md

## Produkt og identitet

Fjord Insight er en norsk B2B-plattform for selskapsanalyse. Produktet skal føles som et presist analyseverktøy for investorer, rådgivere, selgere, regnskapsførere og ledere — ikke en bedriftskatalog, annonseportal eller generisk SaaS-mal.

### Designkarakter
- Nordic enterprise editorial
- data-first product UI
- premium analytical software

### Referanseprodukter
- `linear.app` — presisjon, spacing, arbeidsflate-logikk
- `wise` — kommersiell troverdighet, institusjonell klarhet
- `notion` — editorial ro, typografisk varme, whitespace
- `hashicorp` — enterprise-korrektiv, disiplin

---

## Token-system

Alle farger i koden skal referere til disse token-navnene. Hardkodede hex-verdier er **forbudt** med mindre tokennavnet er dokumentert her.

### CSS-variabler (globals.css)

| Token | Nåværende verdi | Planlagt retning | Bruk |
|---|---|---|---|
| `--px-bg` | `#f5f4f0` | `#f8f9ff` | Sidens bakgrunn |
| `--px-surface` | `rgba(255,255,255,0.9)` | uendret | Primære kortflater |
| `--px-surface-strong` | `#ffffff` | uendret | Hvite innhold-flater |
| `--px-border` | `rgba(15,23,42,0.10)` | uendret | Standardkant |
| `--px-border-subtle` | `rgba(15,23,42,0.08)` | uendret | Diskrete skiller |
| `--px-text` | `#111827` | uendret | Primærtekst |
| `--px-muted` | `#5f6b7a` | uendret | Sekundærtekst |
| `--px-accent` | `#31495f` | `#00668a` (teal) | Merkeaksent, lenker, aktiv navigasjon |
| `--px-accent-soft` | `#e7edf3` | justeres med teal | Lys aksent-bakgrunn |
| `--px-panel` | `#192536` | uendret | Mørke kontrastpaneler |
| `--px-action` | `#162233` | vurderes | Primærknapper |
| `--px-action-hover` | `#223246` | vurderes | Hover på primærknapper |
| `--px-subtle` | `rgba(248,249,250,0.9)` | uendret | Lys sekundær bakgrunn |

Fargepaletten skifter retning mot teal (`#00668a`) og kjølig bakgrunn (`#f8f9ff`). Implementeres i egen kode-runde.

### Farger i mørke paneler (`--px-panel`)

| Rolle | Klasse |
|---|---|
| Seksjonslabel | `text-white/60` |
| Brødtekst | `text-white/80` |
| Innrammede underbokser | `bg-white/10 border-white/10` |

**Forbudt:** `text-white/72`, `/76`, `/82`.

### Statusfarger

| Status | Border | Bakgrunn | Tekst |
|---|---|---|---|
| Suksess | `border-emerald-200` | `bg-emerald-50` | `text-emerald-800` |
| Advarsel | `border-amber-200` | `bg-amber-50` | `text-amber-700` |
| Feil | `border-rose-200` | `bg-rose-50` | `text-rose-800` |

---

## Typografi

### Fontroller

| Klasse | Font | Bruk |
|---|---|---|
| `.editorial-display` | Source Serif 4 | Primær H1, selskapsnavnet, store redaksjonelle seksjonsoverskrifter |
| `.data-label` | IBM Plex Mono, uppercase | Metadata-labels, seksjonsetiketter, tabelloverskrifter, badges, kategorilabels |
| *(ingen klasse)* | IBM Plex Sans | Brødtekst, funksjonelle overskrifter, UI-tekst, tabeller |

### Regler for `editorial-display`

**Brukes for:**
1. Sidens primære H1 — én per side
2. Selskapsnavnet i company header
3. Store redaksjonelle seksjonsoverskrifter (f.eks. "Siste selskapsanalyser", "Nye registreringer")
4. Innlogget startside — produkttittel/command center-tittel

**Brukes IKKE for:**
- Funksjonelle kortoverskrifter ("Rask vurdering", "Finansielle signaler")
- Tabellhoder, paneltitler, UI-elementer

**Tommelfingerregel:** Redaksjonell inngang til innhold → serif. Funksjonelt UI-element → sans.

### `.data-label` brukes for
- Seksjonsetiketter (`REGNSKAP`, `ENERGY SECTOR`, `TRENDING SØK`)
- Metadata-labels (`Org.nr.`, `Kommune`, `EBIT`)
- Tabelloverskrifter
- Badges, kategoripills, status-labels
- Personlig hilsen på innlogget startside

### Tekststørrelser

| Bruk | Klasse | Font |
|---|---|---|
| Display H1 (homepage) | `text-[4.8rem]`–`text-[6.15rem]` | editorial-display |
| Display H1 (interne sider) | `text-[3rem]`–`text-[4rem]` | editorial-display |
| Innlogget startside tittel | `text-[3rem]`–`text-[4rem]` | editorial-display |
| Redaksjonell seksjonsoverskrift | `text-[2rem] font-semibold` | editorial-display |
| Funksjonell seksjonsoverskrift | `text-[1.7rem] font-semibold` | sans |
| Kortoverskrift | `text-lg`–`text-xl font-semibold` | sans |
| Dataverdi stor | `text-[1.45rem] font-semibold tabular-nums` | sans |
| Brødtekst | `text-sm leading-7` | sans |
| Ingresstekst | `text-[1.02rem] leading-8` | sans |
| Data-label | `text-[11px] font-semibold uppercase` | mono |

---

## Radius og spacing

### Radius — tre verdier

| Tailwind | px | Bruk |
|---|---|---|
| `rounded-2xl` | 16px | Ytre kort, modulkort, flash-meldinger |
| `rounded-xl` | 12px | Indre bokser, listeelementer, input-felt |
| `rounded-full` | — | Badges, pills, knapper |

**Forbudt:** Alle `rounded-[...]` custom verdier.
**Unntak:** Finansielle tabeller har ingen radius — bevisst.

### Spacing

Seksjonsgap: `space-y-6`, `space-y-8`, `space-y-10`.
Grid-gap: `gap-4`, `gap-6`, `gap-8`.
Padding: `p-5` (kompakt), `p-6` (standard), `p-8` (hero).

---

## Layout

### Primær navigasjonsstruktur: toppbar

Alle sider bruker horisontal toppbar. Ingen venstrerail.

```
┌──────────────────────────────────────────────────────────────────┐
│ Logo/navn  │  Søk  │  Due Diligence  │  ...  │  Konto  Logg ut  JS│
└──────────────────────────────────────────────────────────────────┘
```

#### Toppbar-spec
- Høyde: `h-16`, fast, `sticky top-0`
- Bakgrunn: `--px-surface` med `backdrop-blur`
- Venstre: produktnavn + tier-label
- Midtre: nav-items med ikon + tekst
- Høyre: Konto, Logg ut, bruker-avatar

#### Nav-items: ikon + tekst
Nav-items bruker **Material Symbols Outlined** (vekt 400, fill 0):

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

## Sidetype-mønster

### 1. Offentlig forside (uinnlogget)

Markedsflate for ikke-innloggede brukere. Viser produktets verdi og driver til innlogging.

- Hero: todelt (bred venstre med H1 + søk, smal høyre mørk panel)
- Innhold: discoveryItems, moduler, datagrunnlag
- Eksisterende mønster i `app/page.tsx` er referansen

### 2. Innlogget startside

**Viktig:** Dette er ikke en markedsside — det er applikasjonens arbeidsflate-inngang etter innlogging. Nærmere en "command center" enn en landingsside.

Mønster:
```
Sentrert, max-w-4xl, text-center
├── .data-label — personlig hilsen ("Hei Johannsen, hva skal vi analysere i dag?")
├── h1 editorial-display — produktets søketittel
├── Søkefelt — linje-stil (border-bottom, ingen boks/kortramme)
│   └── .data-label — datakilde-note under søk
├── Forslag-tags — trending søk, aktuelle selskaper, bransjefokus
└── Redaksjonelle innholdsseksjoner (se mønster under)
```

Søkefeltet bruker **linje-stil**, ikke boks:
```
border-b-2 border-[var(--px-border)] focus:border-[var(--px-accent)] bg-transparent py-4 pl-12
```

### 3. Selskapsprofil

```
├── CompanyHeader — kompakt, juridisk metadata + selskapsnavn (editorial-display) + signaler
├── Sticky sekundærnavigasjon — faner (Oversikt, Regnskap, Nøkkeltall, ...)
└── Innholdsområde
    ├── col-span-9 — primært analyseinnhold
    └── col-span-3 — kontekstuell høyrekolonne (persistent gjennom alle faner)
```

Høyrekolonnen (3/12) er en analytisk støttekolonne — ikke et widgetpanel. Den inneholder markedskontekst, raske lenker, varsler og DD-notater.

### 4. Søk

Todelt layout: filterpanel til venstre (ca. 320px), resultatliste til høyre. Eksisterende mønster i `app/search/page.tsx`.

---

## Redaksjonelle innholdsmønstre

### Seksjonsoverskrift (editorial stil)

Brukes for store innholdsseksjoner (innsikter, tabeller, lister):

```html
<div class="flex justify-between items-end border-b border-[var(--px-text)] pb-2 mb-8">
  <h2 class="editorial-display text-[2rem]">Siste selskapsanalyser</h2>
  <a class="data-label text-[var(--px-accent)]">SE ALLE →</a>
</div>
```

Kjennetegn: tung border-bottom mot primærtekstfarge, serif, valgfri høyre-handling.

### Artikkel/innsikt-rad

Brukes for nyheter, kunngjøringer, insights-lister:

```
grid grid-cols-12 gap-8 py-8 border-b
├── col-span-3 — .data-label kategori + dato (IBM Plex Mono)
├── col-span-6 — h4 (serif) overskrift + brødtekst
└── col-span-3 — bilde (grayscale, hover: farge) — valgfritt
```

### Forslag-tags (innlogget startside)

Klikkbare kort under søkefelt for trending-innhold:

```
border border-[var(--px-border)] px-4 py-3 hover:border-[var(--px-accent)] hover:bg-[var(--px-accent-soft)]
├── .data-label — kategori (f.eks. "TRENDING SØK")
└── font-semibold — innhold (f.eks. "Kvartalsrapporter: Energi")
```

---

## Komponenter

### Knapper

| Type | Klasser |
|---|---|
| Primær | `rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--px-action-hover)]` |
| Sekundær | `rounded-full border border-[var(--px-border)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-[rgba(15,23,42,0.2)]` |

### Badges og pills

```
rounded-full border border-[var(--px-border)] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600
```

### Kort

`<Card>` — `rounded-2xl`, border, lys bakgrunn, minimal skygge.

Indre statistikkboks: `rounded-xl border border-[var(--px-border-subtle)] bg-white p-4`

Indre listeelement: `rounded-xl border border-[var(--px-border-subtle)] bg-[var(--px-subtle)] p-4`

### Input-felt

```
rounded-xl border border-[var(--px-border)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--px-accent)]
```

### Tabeller

Ingen radius. Tydelige kolonneoverskrifter (`.data-label`), `tabular-nums`, hover: `bg-[var(--px-subtle)]`.

### Tomme tilstander

```
rounded-2xl border border-dashed border-[rgba(15,23,42,0.14)] bg-[var(--px-subtle)] p-6 text-sm leading-7 text-slate-600
```

### Feil og varsler

```
rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800
rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800
```

### Grafer

- Tynn strek, dempet grid, minimal fyllflate
- Primær serie: `--px-accent`
- Sekundær serie: dempet brun/sand
- Ingen fill-areas uten grunn, ingen flashy effekter

---

## Tilstander

| Tilstand | Krav |
|---|---|
| **Tom** | Dashed border + forklaringstekst |
| **Feil** | Rød flash-melding øverst i seksjonen |
| **Laster** | Skeleton eller minimalt loading-signal |
| **Ikke tilgjengelig** | Tydelig melding uten å bryte layout |

---

## Do og Don't

### Do
- Bruk horisontal toppbar — ikke venstrerail
- Bruk ikoner (Material Symbols) i alle nav-items
- Bruk `editorial-display` for H1 og store redaksjonelle seksjonsoverskrifter
- Bruk linje-stil søkefelt på innlogget startside
- Hold selskapsprofil i 9/3-grid gjennom alle faner
- Bruk kun tre radius-verdier
- Bruk CSS-variabler for alle farger
- Skriv norsk i alle brukervendte tekster

### Don't
- Ikke bygg venstrerail-navigasjon
- Ikke bruk `editorial-display` for funksjonelle kortoverskrifter
- Ikke bruk `rounded-[...]` custom verdier
- Ikke hardkod farger — bruk CSS-variabler
- Ikke bygg generiske SaaS-dashboards
- Ikke fyll høyrekolonnen med widgeter uten analytisk verdi
- Ikke forveksle innlogget startside med offentlig forside

---

## Agent-sjekkliste

**Layout:**
- [ ] Bruker siden horisontal toppbar (ikke venstrerail)?
- [ ] Har alle nav-items ikon + tekst fra Material Symbols?
- [ ] Er aktiv nav-item markert med `border-b-2 border-[var(--px-accent)]`?

**Sidetype:**
- [ ] Er innlogget startside sentrert med linje-søkefelt (ikke todelt hero)?
- [ ] Er offentlig forside todelt (lys venstre + mørk høyrepanel)?
- [ ] Har selskapsprofilen 9/3-grid gjennom alle faner?

**Typografi:**
- [ ] Er store redaksjonelle seksjoner brukt med `editorial-display`?
- [ ] Er funksjonelle kortoverskrifter i sans?
- [ ] Er alle metadata-labels i `.data-label`?

**Radius:**
- [ ] Kun `rounded-2xl`, `rounded-xl` eller `rounded-full`?

**Farger:**
- [ ] Alle farger via CSS-variabler?
- [ ] Mørke paneler: kun `text-white/60` og `text-white/80`?

**Innhold:**
- [ ] All tekst på korrekt norsk?
- [ ] Tomme tilstander definert?

---

## Neste steg i kode (prioritert)

1. **Toppbar** — oppdater `app/layout.tsx` med ikoner i nav og mini-søk
2. **Innlogget startside** — ny side/komponent som erstatter/supplerer eksisterende dashboard-inngang
3. **Fargepalett** — oppdater `globals.css` mot teal og kjølig bakgrunn
4. **Selskapsprofil** — implementer persistent 9/3-grid for alle faner

---

## Referansefiler

- `app/globals.css` — token-system
- `components/ui/card.tsx` — standardkort
- `components/company/financial-time-series-table.tsx` — finansielle tabeller
- `app/page.tsx` — offentlig forside-mønster

---

## Hurtigprompt for agenter

> Bygg i Fjord Insight-stil: horisontal toppbar med Material Symbols-ikoner + tekst i nav, lys nordisk enterprise editorial, data-first, premium analytisk. Source Serif 4 for primær H1 og store redaksjonelle seksjonsoverskrifter. IBM Plex Sans for funksjonelle overskrifter og UI. IBM Plex Mono (.data-label) for metadata, labels, tabelloverskrifter og kategoripills. Fargepalett: kjølig bakgrunn (#f8f9ff), teal aksent (#00668a). Knapper er `rounded-full`. Kort er `rounded-2xl`. Indre bokser er `rounded-xl`. Ingen andre radius-verdier. Selskapsprofil bruker 9/3-kolonner gjennom alle faner. Innlogget startside bruker sentrert søkehero med linje-søkefelt. Offentlig forside er todelt (lys venstre + mørk høyrepanel). Unngå generisk SaaS-dashboard.
