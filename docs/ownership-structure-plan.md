# Konsern- og aksjonærstruktur — bygge­plan

> Status: Fase 0–3 implementert (Fase 4 delvis). Eierbasert konsern- og aksjonærstruktur
> som *value add* på toppen av regnskapstall. Modellert etter proff.no, hvor ~70 % av
> brukerne kommer for nettopp «hvem eier hvem».

## Implementeringsstatus

- **Fase 0 ✅** `OwnershipEdge`-modell + `OwnershipRelationship`-enum (pushet til DB),
  `server/ownership/ownership-thresholds.ts`, `ownership-edge-builder.ts` (aggregert
  `INSERT … SELECT`), `scripts/build-ownership-edges.ts`, npm-script
  `ownership:build-edges`. Kanter bygget for alle 21 skatteår (2005–2025), ~6,4 mill.
  kanter. Tester: `ownership-thresholds.test.ts` (8).
- **Fase 1 ✅** `group-structure-service.ts` — BFS over materialisert tabell: oppover til
  konsernspiss (unik >50 %-eier, syklusvern) + nedover gjennom kontrollkanter, tilknyttede
  som blad, global dedup, dybde-/nodegrenser. Tester: `group-structure-service.test.ts` (8).
- **Fase 2 ✅** `ownership-overview-service.ts` (konsern + aksjonærliste + eierposter,
  aggregert over aksjeklasser), API `GET /api/companies/[slug]/group-structure`,
  «Eierskap»-fane i `company-tabs.tsx` + selskapssiden.
- **Fase 3 ✅** `components/company/ownership/` — `ownership-chart.tsx` (React Flow,
  tre-layout, uthevet «du er her», datter/tilknyttet-stiler), `ownership-tab.tsx`
  (årvelger, aksjonærtabell, eierposter, tomtilstander).
- **Fase 4 (delvis)** Aksjeklasse-aggregering ✅, dybde/node-grenser ✅, API `revalidate`
  ✅. Gjenstår: personaggregering på tvers av selskaper (egen person-side), evt. paywall.

## Launch-polish (interaktiv design)

Testdrevet iterasjon (test → evaluer → implementer → reiterer) mot ekte data for alle
brreg-selskaper i registeret:

- **`ownership-graph-layout.ts`** — ren, testet layoutmotor: collapse/expand, default-fokus
  på det aktive selskapet (stien konsernspiss→deg utvidet, søsken-grener skjult), og
  **child-cap + overflow-node** (en flat eier med f.eks. 252 datterselskaper viser 12 +
  «+240 flere» i stedet for en 59 000 px rad). Tester: `ownership-graph-layout.test.ts` (5).
- **`ownership-chart.tsx`** (redesign) — React Flow, on-brand noder (konsernspiss mørk,
  «dette selskapet» aksent, datter/tilknyttet venstre-stripe), legende, «Utvid/Skjul alle»,
  klamret `fitView` (`minZoom 0.5`) så brede konsern forblir lesbare og panorerbare.
- **`ownership-tree.tsx`** — kompakt innrykket «konsernstruktur»-tre i proff.no-stil:
  stiplede føringslinjer, fylte aksent-prikker på stien til det aktive selskapet (hule grå
  ellers), uthevet pille for «deg», %-verdi til venstre, inline SVG-flagg (ikke emoji —
  Windows mangler flagg-font). **Standardvisning** (mer info på mindre plass enn kartet);
  React Flow-kartet beholdes som valgfri «Kart»-visning.
- **Struktur/Kart-veksler** i `ownership-tab.tsx`; lead viser «Morselskapet er …».
- **Inaktiv-merking:** nodene berikes med status fra den lokale `Company`-tabellen
  (`getGroupStructure` → `enrichWithCompanyStatus`). Vises i **begge** visninger — rødt
  `(KONKURS)` / `(SLETTET)` i strukturtreet og som rødt merke i React Flow-kortene (status
  føres gjennom `buildRenderTree`). DB-basert, ingen BRREG-kall; selskaper som ennå ikke er
  lastet inn vises uten merke.
- Visuelt verifisert mot Orkla-konsernet (konsernspiss + 40 datterselskaper), et 3-nivå
  datterselskap (konsernspiss→mor→deg→datter, korrekt uthevet), og aksjonær-/eierpost-
  tabeller med riktig datter/tilknyttet/minoritet-klassifisering.

**Dev-harness:** `app/dev/ownership/[org]/page.tsx` (uten auth, `notFound()` i produksjon)
for visuell iterasjon via preview. `.claude/launch.json` (`autoPort`) lar preview kjøre på
egen port samtidig som `npm run dev`.

### Drill-through: DB-backet (ikke BRREG on-demand)

Datalaget dekker *alle* selskaper i registeret, og API-et resolver navn fra registeret når
selskapet ikke ligger i den lokale `Company`-tabellen. Selve **selskapssiden**
(`getCompanyProfile` → `getCachedCompanyCore`) leser i dag kun `Company`-tabellen og gir
404 for selskaper som ikke er lastet inn ennå.

**Beslutning:** drill-through skal hente fra den lokale databasen, **ikke** on-demand fra
BRREG (for tidkrevende). En egen, pågående database-jobb fyller `Company`-tabellen med alle
norske selskaper; etter hvert som den populeres vil klikk på en hvilken som helst node i
konsernkartet løse opp mot DB-en.

**Mellomløsning implementert ✅** `getRegisterBackedCompanyProfile(orgNumber)` i
`ownership-overview-service.ts`: når et 9-sifret orgnr ikke finnes i `Company`-tabellen,
rendrer selskapssiden en minimumsprofil (navn/orgnr fra registeret + full Eierskap-fane).
Øvrige faner (regnskap, roller) viser «ikke lastet inn i databasen ennå». Ingen BRREG-kall.
Når Company-databasen er populert, overtar den fulle profilen automatisk (fallback treffer
bare ved miss).

## Mål

På hver selskapsside skal brukeren kunne se:

1. **Nedover:** alle datterselskaper (>50 %), deres datterselskaper rekursivt, og
   tilknyttede selskaper (20–50 %) som bladnoder.
2. **Oppover:** direkte og indirekte eiere. Hvis selskapet er >50 %-eid, klatre til
   **konsernspissen** (ultimate parent) og tegn hele konsern-treet ovenfra, med det
   aktuelle selskapet uthevet.
3. **Aksjonærliste:** direkte aksjonærer (personer + selskaper) med %, antall aksjer og
   aksjeklasse, samt en «eier i»-liste (hva selskapet/eieren selv eier i).

Lagt i en **ny «Eierskap»-fane**, adskilt fra dagens BRREG-baserte «Organisasjon»-fane
(juridiske underenheter/roller — beholdes som den er; underenheter ≠ datterselskaper).

## Semantikk (norsk standard)

| Begrep | Definisjon | Kilde |
|---|---|---|
| Datterselskap | eier > 50 % | regnskapsloven §1-3, aksjeloven §1-3 |
| Tilknyttet selskap | 20–50 % (betydelig innflytelse) | rskl. §1-3 |
| Konsern | morselskap + alle datterselskaper rekursivt | |
| Konsernspiss | toppen av kjeden av >50 %-eierskap | |

Terskler samles i `server/ownership/ownership-thresholds.ts` (ett sted å justere).

## Datagrunnlag

`ShareholderRegisterHolding` (Skatteetatens aksjonærregister) er fundamentet — har både
`issuerOrgNumber` og `shareholderOrgNumber`, indeksert begge veier, for alle norske
selskaper per skatteår.

Forhold som må håndteres:

- **Rader er per aksjeklasse.** Aggreger `numberOfShares` per
  `(issuerOrgNumber, shareholderOrgNumber, taxYear)` og del på utsteders totale aksjer.
  Bruk **ikke** `ownershipPercent` på enkeltrad for kontroll.
- **Org→org-kanter** finnes bare når `shareholderOrgNumber` er satt. Personer terminerer
  kjeden oppover (bladnoder, ikke videre traversering).
- **Årlig snapshot** — alt er per skatteår, med årvelger.
- **Kryssholdinger / sykler finnes** — traversering må ha syklusdeteksjon + dybdegrense.

## Arkitektur (lagdelt)

### Lag 1 — Materialisert kant-tabell (`OwnershipEdge`)
Ren selskap→selskap-graf, bygget i batch fra registeret. Person-aksjonærer materialiseres
ikke her (de hentes direkte til aksjonærlista).

```
model OwnershipEdge {
  taxYear           Int
  issuerOrgNumber   String   @db.VarChar(9)   // selskapet som eies
  ownerOrgNumber    String   @db.VarChar(9)   // selskapseier (kun org→org)
  ownerName         String
  issuerName        String
  aggregatedShares  BigInt
  totalIssuerShares BigInt?
  ownershipPercent  Decimal? @db.Decimal(9,6) // aggregert over aksjeklasser
  relationship      OwnershipRelationship      // SUBSIDIARY | ASSOCIATED | MINORITY
  builtAt           DateTime @default(now())

  @@id([taxYear, issuerOrgNumber, ownerOrgNumber])
  @@index([taxYear, ownerOrgNumber])   // nedover: hva eier X
  @@index([taxYear, issuerOrgNumber])  // oppover: hvem eier X
}
```

### Lag 2 — Build-jobb (`server/ownership/ownership-edge-builder.ts` + `scripts/build-ownership-edges.ts`)
Aggreger register-rader → skriv `OwnershipEdge`, klassifiser `relationship` ut fra
terskler. Idempotent per `taxYear`. Kjøres etter register-import.

### Lag 3 — Traverseringsmotor (`server/ownership/group-structure-service.ts`)
Rekursiv CTE i Postgres mot `OwnershipEdge`:
- `getDescendants(org, year)` — alle datter/datterdøtre nedover, dybdegrense + `path` for
  syklusvern.
- `getAncestors(org, year)` — eiere oppover langs >50 %-kanter.
- `getUltimateParent(org, year)` — konsernspiss.
- `getGroupStructure(org, year)` — konsern-tre fra spiss (eller fra org selv hvis ingen
  spiss), med `isCurrent`-flagg.

Indirekte eierandel = produkt av kant-prosenter langs stien.

### Lag 4 — Aksjonær/eier-data (gjenbruk eksisterende)
- Direkte aksjonærliste: `getRegisteredOwnersForCompany`.
- «Eier i»: `getRegisteredCompanyHoldings`.
- Formatering: `formatPercentForDisplay`, `computeOwnershipPercentString`.

### Lag 5 — API (`app/api/companies/[slug]/group-structure/route.ts`)
`{ tree, ultimateParent, directShareholders, holdings, availableYears, year }`,
`revalidate = 3600`.

### Lag 6 — UI (ny «Eierskap»-fane)
`components/company/ownership/`:
- `OwnershipChart` — konsern-orgkart (React Flow, `@xyflow/react` finnes alt), uthevet
  «du er her», kollaps/ekspander.
- `ShareholderTable` — direkte aksjonærer, sortert på %, person/selskap-skille, lenke til
  eierens selskapsside.
- `HoldingsList` — «dette selskapet eier i …».
- Årvelger + tomtilstand.

## Faseplan

- **Fase 0 — Skjema & build:** `OwnershipEdge` + migrasjon, edge-builder, npm-script,
  tester på aggregering/klassifisering.
- **Fase 1 — Traverseringsmotor:** rekursiv CTE for ned/opp/spiss + syklus/dybdevern +
  indirekte-%. Tester på sykler, dype kjeder, manglende totalaksjer.
- **Fase 2 — API + minimal UI:** endpoint + «Eierskap»-fane med aksjonærliste og enkel
  nedover-liste.
- **Fase 3 — Konsernkart:** grafisk orgkart (React Flow), oppover-til-spiss, uthevet node,
  kollaps/ekspander, årvelger.
- **Fase 4 — Polering:** personaggregering, ytelse på store konsern, caching, paywall.

## Risikoer

1. **Skala** — store konsern (hundrevis av noder): dybdegrense + lazy ekspandering +
   materialisert tabell.
2. **Sykler/krysseie** — `path`-array i CTE obligatorisk.
3. **Identitet** — orgnr er rent; personer matches på navn+fødselsår (konservativt).
4. **Aksjeklasse-aggregering** — vanligste feilkilde, testes eksplisitt.
5. **Datafriskhet** — årlig register; vær tydelig på skatteår i UI.
