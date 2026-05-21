# AI / Læringsplan for Fjord Insight

Persistert plan for kontinuitet på tvers av sesjoner. Oppdateres etter hver
større endring. Skrevet for en økonom-reviewer, ikke en programmerer.

---

## 1 · Helhetlig mål

Bygge et selvlærende ekstraksjonssystem for norske årsrapporter som blir
bedre over tid uten avhengighet av betalte tredjeparts-LLMer. Læringssløyfen
består av tre nivåer:

| Nivå | Hva | Status |
|------|-----|--------|
| 1 | Kontinuerlig kalibrering av terskler basert på reviewer-godkjenninger | ✅ Levert |
| 2 | Mønstergjenkjenning — hvilke typer feil gjentar seg? | ✅ Levert |
| 3 | Egen ML-modell trent på reviewer-korreksjoner | 🔨 Under bygging |

---

## 2 · Arkitektoniske beslutninger (locked-in)

1. **In-house ML, ikke tredjeparts LLM.** Begrunnelse: kostnad og kontroll
   over data. Konsekvens: vi bygger små, oppgavespesifikke modeller framfor
   en bred språkmodell.

2. **Norsk bokmål** er primærspråket. Påvirker modellvalg — NB-BERT
   foretrekkes når vi går utover TF-IDF.

3. **Raspberry Pi 5 (8 GB)** som inferens-platform. Trening skjer på
   utviklingsmaskin eller skyleid GPU; modeller deployes som Docker-container
   til Pi-en for døgnkontinuerlig drift.

4. **Manuell godkjenning** av alt som påvirker produksjon — terskler,
   modeller, regelendringer. Aldri auto-aktivering uten admin-knapp.

5. **Versjonering** av alt læringssystemet produserer — terskler, modeller,
   datasett. Hver versjon har lifecycle PROPOSED → ACTIVE → RETIRED/REJECTED
   med audit-trail og rollback.

---

## 3 · Levert så langt

### Fase 0 — Bridge + AdminNotification (commit `01ec3e4`)
- `AdminNotification`-tabell og bell-ikon i global header
- Verifisert at legacy review-flyten allerede skriver `PdfTrainingLabel` for hver korreksjon
- Server actions for å markere lest / skjule

### Fase 1 — Database-drevne konfidens-terskler (commit `eb08078`)
- `ConfidenceThresholdVersion`-tabell med full lifecycle
- `confidence-threshold-version-service.ts` — CRUD + atomisk aktivering
- Seed-skript for v1 med innebygde standardverdier
- Fallback til hardkodede defaults hvis ingen ACTIVE rad finnes

### Fase 2 — Produksjonskalibrering (commit `eb08078`)
- `calibration-proposal-service.ts` — kjører eksisterende kalibrerings­analyse,
  oppretter PROPOSED-versjon hvis ≥20 reviews støtter forslaget
- Admin-varsel sendes til klokke-ikonet med direkte lenke til godkjenning
- Aldri auto-aktivering — admin må trykke "Godkjenn"

### Fase 3 — Mønsteranalyse (commit `b5c28c8`)
- `ExtractionPatternReport` / `ExtractionPattern`-tabeller
- `extraction-pattern-analysis-service.ts` — klassifiserer korreksjoner:
  - `UNIT_SCALE_MISS` (×1000 faktor)
  - `OCR_NOISE` (samme størrelse, ulike sifre)
  - `MISSING_VALUE` (null → tall)
  - `WRONG_PAGE` (samme verdi, ulik side)
  - `OTHER`
- Krever minimum 3 forekomster før et mønster er "signifikant"
- Konkret norsk forslagstekst per mønstertype

### Fase 4 — Few-shot retrieval (commit `b5c28c8`)
- `extraction-fewshot-retrieval-service.ts`
- Henter 3–5 historiske filings med samme bransjekode
- **Ny tolkning:** Brukes som *eksempel-bibliotek for human reviewers og
  treningsdata-eksport*, IKKE lengre som LLM-prompt-tilstandskontekst
- Bibliotek-inventar med "dekket"/under terskel-flagging per bransje

### Fase 5 — UI Dashbord (commit `eb08078` + `b5c28c8`)
- `/admin/extraction-learning` med fire seksjoner:
  - Aktiv konfidensversjon + kjør-kalibrering knapp
  - Forslag som venter på godkjenning
  - Feilmønstre med "Kjør analyse"-knapp
  - Few-shot bibliotek per bransje
- Lenke fra `/admin` landing-side (commit `aadb4c6`)

### Fase 6 — ODL auto-promote (commit `01ec3e4`)
- `OPENDATALOADER_AUTO_PROMOTE`-flagg i config
- Når ODL produserer et publiserbart resultat og Legacy ikke kan,
  byttes ODL inn som primær for den filingen
- Admin-varsel når byttet skjer

### Prisma-baseline (commit `aadb4c6`)
- Konsoliderte 13 ødelagte migrasjoner til ett `00000000000000_init`
- Tidligere migrasjoner arkivert lokalt, ikke i git
- `prisma migrate dev` fungerer nå igjen

---

## 4 · Pågående arbeid — Fase 7 (in-house ML)

### Mål
Bygge et virkende ende-til-ende ML-stack hvor:
- Reviewer-korreksjoner blir treningsdata
- En Python-tjeneste trener oppgavespesifikke klassifikatorer
- Modeller versjoneres og deployes med admin-godkjenning
- Inferens skjer i en Docker-container kallbar fra Node.js

### Designvalg

| Tema | Valg | Begrunnelse |
|------|------|-------------|
| Første modell | Enhetsskala-klassifikator (1 / 1000 / 1 000 000) | Klar input/output, mange korreksjoner, lite data trengs |
| Algoritme | TF-IDF + logistic regression (scikit-learn) | Trener på CPU i sekunder, kjører på Pi |
| Senere oppgraderinger | NB-BERT for sidetype-klassifisering | Krever 1000+ eksempler og evt. GPU |
| Tjenestespråk | Python (FastAPI) i Docker | Standard for ML, gjenbruker docker-mønsteret fra ODL |
| Modellfiler | Versjonert i `ModelVersion`-tabell + lagret i container-volum | Samme lifecycle som terskler |
| Deploy-mål | Raspberry Pi 5 (8 GB) | Bruker har ikke kjøpt enda; cloud-fallback initialt |

### Komponenter som skal bygges (denne sesjonen)

1. **`ModelVersion`-tabell + service** — versjonering for ML-modeller, samme
   lifecycle som terskler.
2. **Treningsdata-eksport-tjeneste** — skriver `PdfTrainingLabel` til JSONL
   per oppgavetype, med splitt for train/val/test.
3. **Python-inferenstjeneste** i `docker/ml-inference/`:
   - FastAPI app med `/healthz` og `/predict/unit-scale`
   - Laster modellfil ved oppstart
   - Returnerer prediksjon + konfidens
4. **Bootstrap unit-scale modell** — TF-IDF + logreg, trent på en kombinasjon
   av:
   - Eksisterende regex-mønstre i `unit-scale.ts` brukt som synthetic data
   - Reelle reviewer-korreksjoner når de finnes
5. **Node.js inferens-klient** — `ml-inference-client.ts`, kaller Python-tjenesten
   med timeout og fallback til regex.
6. **Dashboard-utvidelse** — modell-seksjon på `/admin/extraction-learning`:
   - Liste aktive modeller per oppgavetype
   - "Tren ny modell"-knapp (genererer JSONL, men trening kjører manuelt for nå)
   - Godkjenn/avvis modellforslag
7. **Tester** — service-CRUD, klassifiseringslogikk, klient-fallback.

### Fase 7B — levert (commit `0ab16c3`)

- `train_unit_scale.py` skriver nå en metadata-sidecar (`.metadata.json`)
- `scripts/register-ml-model.ts` — CLI som registrerer en trent modell som
  `MlModelVersion` (status PROPOSED, venter på godkjenning i UI)
- `server/ml/unit-scale-shadow-service.ts` — kjører ML-modellen ved siden av
  regex-detektoren og rapporterer hvor ofte de er enige, uten å endre output
- Shadow-sammenligning wiret inn i pipelinen, opt-in via `ML_INFERENCE_SHADOW=true`,
  alle feil svelges
- `scripts/cleanup-review-queue-duplicates.ts` — fjerner duplikate test-rader
  fra review-køen (dry-run som standard, `--apply` for å slette; rører aldri
  reviews et menneske har jobbet med)
- `scripts/bulk-ingest-filings.ts` — henter et mangfoldig utvalg filings fra
  Brreg (round-robin på tvers av bransjer)

### Gjenstår for å lukke Fase 7 (Fase 7C)

- Faktisk trene den første unit-scale modellen på reell data (krever
  reviewer-korreksjoner — kjør bulk-ingest + review først)
- Når modellen er god nok i shadow-modus: la prediksjonen faktisk overstyre
  regex (eget, bevisst steg med admin-godkjenning)
- A/B-sammenligning mot regex-baseline lagret som artefakt

---

## 4b · Konsern/selskap-skille (Fase K)

Bakgrunn: norske konsern leverer to regnskapssett — konsernregnskap og
selskapsregnskap (mor). Brukere skal kunne veksle mellom dem i appen.
Besluttet: **konsern som standardvisning**, **seksjonsbasert layout** i v1.

### K1 — Datamodell (levert)
- Ny enum `StatementScope` (`COMPANY`, `CONSOLIDATED`)
- `statementScope`-felt på `FinancialStatement`, `FinancialFact`,
  `RawFinancialLineItem`, `AnnualReportReviewedFact`, `AnnualReportNarrative`
- Unik-begrensninger utvidet med scope; alle eksisterende rader → `COMPANY`
- Migrasjon `20260521120000_add_statement_scope`

### K2 — Deteksjon (levert)
- `page-classification.ts` kjenner igjen "Konsernregnskap"/"Selskapsregnskap"-
  overskrifter; scope arves nedover sidene (samme mønster som enhetsskala)
- Ordgrense-matching hindrer at bøyde prosaformer ("konsernregnskapet")
  feilutløser; styre-/revisorsider kan aldri flippe scope
- `PageClassification` har nå `statementScope` + `hasExplicitScopeSignal`

### K3 — Pipeline-ruting (levert)
- Hver `CanonicalFactCandidate` merkes med scope fra siden den kom fra
- `chooseCanonicalFacts` / `validateCanonicalFacts` tar et scope-filter
- Pipelinen velger "primær-scope" (konsern hvis konsern-fakta finnes, ellers
  selskap) for validering, scoring og publisering
- **Alle** fakta lagres med korrekt scope — den dyre-å-gjenskape dataen er
  riktig fanget. Publisert snapshot stemples med primær-scope.

### K4 — Publiser begge + UI-veksler (levert)
- Pipelinen publiserer nå én `FinancialStatement` per scope — primær-settet
  (validert, scoret) og sekundær-settet (ved MANUAL_REVIEW-kvalitet)
- `NormalizedFinancialStatement` bærer `statementScope`
- Selskapssiden har en **Konsern/Selskap-veksler** (vises kun når begge
  finnes); konsern er standard
- Gjenstår (lavt-risiko follow-up): noter (`AnnualReportNarrative`) merkes
  ennå ikke med scope (DB-default COMPANY håndterer det); konsumenter av
  `getPublishedAnnualReportFinancials` utenom finanstabellen bør gjennomgås
  for dobbelttelling når begge scopes finnes

### K5 — Review per scope (levert, med én avgrensning)
- Reviewede fakta (`AnnualReportReviewedFact`) bærer `statementScope`,
  kopiert fra maskinfaktaene
- Review-payloaden bærer `statementScope`; review-arbeidsflaten viser
  "Regnskapssett: Konsern/Selskap" så reviewer vet hvilket sett hen retter
- Navigasjonsfeil fikset: "Åpne kontroll" i testgrunnlag-køen går nå til
  den ekte review-arbeidsflaten (`/admin/annual-report-reviews/{reviewId}`)
  i stedet for gold-set-kandidatsiden
- Avgrensning (follow-up): hver review dekker ett scope (primær-scopet for
  kjøringen). Å rette konsern OG selskap i samme arbeidsflate krever at
  review-payloaden bærer begge sett — egen oppgave senere

## C · Valuta (levert)

- `currency.ts` — oppdager rapporteringsvaluta (NOK/USD/EUR/GBP/SEK/DKK)
  fra "Beløp i USD"-aktige overskrifter; konservativ (kun eksplisitt
  erklæring nær "beløp i"/"amounts in" teller)
- `PageClassification` bærer `reportingCurrency`; arves nedover sidene
- Fakta merkes med detektert valuta i stedet for hardkodet "NOK"
- Finanstabellen viser valutaen dynamisk ("Beløp i USD" osv.)

---

## 5 · Framtidige faser (ikke startet)

### Fase 8 — Sidetype-klassifikator
Etter unit-scale fungerer, samme oppskrift for å klassifisere sidetyper
(STATUTORY_INCOME, NOTE, AUDITOR_REPORT etc.). Krever mer data — anslag
500+ eksempler per klasse.

### Fase 9 — År-kolonne-detektor
Avgjøre hvilken numerisk kolonne tilhører hvilket regnskapsår. Layout-aware
modell — mulig kandidat for LayoutLM når GPU er tilgjengelig.

### Fase 10 — Tabell-rekonstruksjon
End-to-end modell som tar et bilde + tekst-output og returnerer
strukturert tabell. Mest ambisiøs; krever betydelig treningsdata og GPU.

### Fase 11 — Aktiv læring
Modellen identifiserer hvilke filings som vil gi mest læringsverdi hvis
en menneskelig reviewer går gjennom dem. Prioriterer review-køen
intelligent.

---

## 6 · Maskinvarekjøpsliste

For å gjøre arkitekturen fullt operativ:

| Komponent | Hvorfor | Estimert kostnad |
|-----------|---------|------------------|
| Raspberry Pi 5 (8 GB) + microSD 64 GB + strømadapter + kjøling | Inferens-tjeneste 24/7 | NOK 1500–2000 |
| _Senere:_ GPU-server eller skyleie | Trening av større modeller | NOK 50–150k engang ELLER NOK 5–20/t |

Inntil GPU er tilgjengelig: alle modellene vi bygger trenes på din vanlige
PC (CPU-only). Det går saktere, men det går.

---

## 7 · Driftspraksis

- **Treningstrigger:** Manuell fra admin-UI inntil videre. Senere
  schedulert ukentlig.
- **Modell-aktivering:** Krever admin-godkjenning i UI. Ingen automatisk
  rollout selv om treningsmetrikker er gode.
- **Rollback:** Eldre `ModelVersion`-rader beholdes; ett klikk for å
  re-aktivere forrige modell.
- **Datasporbarhet:** Hver modell lagrer hvilket datasett den ble trent
  på som JSON-snapshot i `ModelVersion.trainingDataSnapshot`.

---

## 8 · Åpne avgjørelser / spørsmål

- [ ] Når kjøpes Raspberry Pi-en?
- [ ] Hvor lagres modellfiler (Docker volume vs S3-aktig blob storage)?
- [ ] Strategi for å avgjøre når en ny modell skal foreslås — antall nye
      korreksjoner, kalender­basert, eller manuell?
- [ ] Skal Python-tjenesten kjøre lokalt under utvikling (på din PC) eller
      bare i prod?

---

_Sist oppdatert: 2026-05-21 etter K5 (review viser regnskapssett), navigasjonsfiks for testgrunnlag-køen, K4 og valutadeteksjon._
