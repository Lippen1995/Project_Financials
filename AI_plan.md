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

### Fase 6 — ODL motorvalg: beste resultat vinner (commit `01ec3e4`, revidert)
- `OPENDATALOADER_AUTO_PROMOTE`-flagg i config (nå satt `true` i `.env`)
- Opprinnelig regel var asymmetrisk: ODL ble kun byttet inn når Legacy
  *ikke* kunne publisere. I praksis betydde det at ODL aldri kunne vinne
  på kvalitet — Legacy var alltid primær så lenge den klarte terskelen.
- Revidert til symmetrisk seleksjon: i dual-run kjøres begge motorene, og
  den som gjorde best jobb publiseres. Publiserbart slår ikke-publiserbart;
  innenfor samme nivå vinner høyest konfidens; uavgjort → Legacy (stabilitet).
- Admin-varsel når ODL overtar, med begge konfidens-scorene
- Merknad: ODL hybrid (Docling) er foreløpig treg og ustabil — én scannet
  filing tok 89 min, og Docling-containeren OOM-krasjet under last. Se
  åpne spørsmål (seksjon 8).

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

## D · Selvkorrigerende ekstraksjon (ny strategi)

### Omdefinering av problemet

Bulk-ingest av scannede Canica-rapporter (mai 2026) ga en klar diagnose:
flaskehalsen er **ikke tegngjenkjenning, men tabellrekonstruksjon**.
Tesseract leste 41–47 sider per rapport uten en eneste lesefeil — men
~40 % av tallradene kunne ikke plasseres sikkert. Problemet er å avgjøre
hvilket tall som hører til hvilket årskolonne, hvor tusenskille har
splittet et tall, og hvilke rader som er sumrader. Blokkeringskodene
bekreftet det: `YEAR_COLUMN_ASSIGNMENT_UNCERTAIN`, `SUSPICIOUS_COLUMN_SWAP`,
`STATEMENT_TABLE_LAYOUT_WEAK`.

Konsekvens: å bytte OCR-motor gir lite. Verdien ligger i et sterkt
rekonstruksjonssystem rundt OCR, og i en løkke som retter seg selv.

### Kjernen: en selvkorrigerende ekstraksjonsløkke

Dagens pipeline er ett gjennomløp — OCR én gang, rekonstruer én gang,
score én gang. Den nye modellen er en løkke:

1. **Ekstraher.**
2. **Score mot interne begrensninger** — regnskapsidentitetene (balansen
   balanserer, delsummer summerer, noter stemmer med oppstilling). Dette er
   en feilfunksjon dokumentet bærer med seg selv; ingen merkede etiketter
   trengs. Bedre enn en lært modell som startpunkt — deterministisk og
   forklarbar, virker fra dag én.
3. **Diagnostiser** hvor og hvorfor konfidensen er lav: *recognition*
   (tegnene ble lest feil) eller *reconstruction* (tegnene er riktige,
   strukturen er feil)? De to etterlater forskjellige fingeravtrykk —
   recognition gir lav OCR-ord-konfidens og ikke-parsbare tokens;
   reconstruction gir høy OCR-konfidens men brutte begrensninger.
4. **Målrettet omarbeiding av regionen** — aldri hele dokumentet:
   - Recognition → re-OCR av regionen med ny rute: høyere oppløsning,
     bildeforbehandling, annen page-seg-modus, eventuelt en annen motor
     som *second opinion på den ene cellen*.
   - Reconstruction → alternativ rekonstruksjonslogikk: geometri-først
     kolonnetilordning, constraint-drevet gruppering.
5. **Re-score. Behold det beste resultatet, ikke det siste.**

Stoppbetingelse: maks 2 ekstra runder; stopp når begrensnings-avviket
slutter å falle. Uten konvergenskriterium oscillerer løkken.

### Slingringsmonn — en ikke-deterministisk toleranse

Begrensningene kan ikke håndheves som eksakt likhet. Summen av
balanseposter er ikke alltid nøyaktig lik totalen — **avrunding i selve
regnskapsføringen** skaper små avvik, særlig når tall rapporteres i hele
tusen. Toleransen skal derfor:

- **Avledes, ikke hardkodes.** Et fast tak ("±2") er feil — det er nettopp
  den deterministiske regelen vi vil unngå. Akseptabelt avrundingsavvik
  avhenger av enhetsskala (rapportert i tusen → hver post kan være avrundet
  ±1 tusen) og av antall poster som summeres. Når N poster hver er
  uavhengig avrundet, vokser det *forventede* akkumulerte avviket omtrent
  som √N — et statistisk bånd, ikke et lineært verste-fall.
- **Være gradert, ikke binær.** Avviket gir ikke et skarpt bestått/ikke-
  bestått ved en terskel. Det tolkes sannsynlighetsbasert: avvik på null →
  sterkt bevis for korrekt; avvik på avrundingsstørrelse → svakt, godartet
  signal; avvik langt utenfor båndet → sterkt bevis for ekstraksjonsfeil.
  Begrensnings-sjekken bidrar en *kontinuerlig sannsynlighet* til
  loss-funksjonen — ikke en port.

### Tre årsaker til et begrensningsbrudd — og kildetroskap

Et brudd på en regnskapsidentitet har minst tre årsaker:

1. **Ekstraksjonsfeil** (recognition eller reconstruction) — løkkens
   egentlige mål.
2. **Avrunding** i den opprinnelige regnskapsføringen — godartet, innenfor
   det graderte båndet.
3. **En reell feil i det innleverte regnskapet.** Regnskaper *inneholder*
   feil. Da er vår ekstraksjon korrekt, og kilden er gal.

Å skille (1) fra (3) hindrer at løkken jager en uoppnåelig begrensning.
Diskriminanten er **konsensus**: hvis flere uavhengige ekstraksjonsforsøk
(Legacy, ODL, re-OCR) alle gir *samme* ikke-balanserende tall, ligger
inkonsistensen i kilden — ikke i oss.

Av dette følger et hardt prinsipp: **kildetroskap slår intern konsistens.**
Løkken skal aldri "rette" et trofast ekstrahert tall for å tilfredsstille
en begrensning kilden selv bryter. Vi registrerer regnskapet slik det er
innlevert — også når det er feil — og *flagger* avviket som
"kildeinkonsistens", tydelig adskilt fra "ekstraksjon usikker".
Constraint-drevet korreksjon utløses derfor kun når det finnes uavhengig
bevis for at avviket er et ekstraksjonsartefakt (lav OCR-konfidens på et
tall, eller motorene er uenige) — aldri når motorene er enige.

### Forutsetninger og komponenter

- **Konfidens per region.** Dagens `calculateConfidenceScore` kollapser alt
  til ett tall per filing. Løkken krever konfidens per side / rad / celle.
  Ingrediensene finnes allerede (per-side klassifiseringskonfidens, per-rad
  ambiguous-flagg, per-ord OCR-konfidens) — de midles bare bort. Å slutte å
  kollapse konfidensen er det første konkrete steget.
- **Konsensus som korrekthetssignal.** Dual-run produserer allerede en
  `comparisonSummary` med `factDifferences` — i dag kun logget. Mat den
  inn: enighet mellom motorer → høyere konfidens; uenighet → flagg akkurat
  det faktumet for review.
- **Bildeforbehandling** før OCR (deskew, binarisering, støyfjerning) —
  gjøres ikke i dag. Billig, treffer recognition-grenen.
- **Behold ekte geometri** for digitalt fødte PDF-er — tekstlag-veien
  fabrikkerer i dag x-koordinater og mister kolonneinformasjon.
- **Per-side ruting.** Decision-engine emitterer i dag én rute for *hele*
  dokumentet, og `hasReliableTextLayer` er et gjennomsnitt over alle sider
  — et dokument med mest prosa og noen få scannede regnskapssider feilrutes.
  Ruting per side velger riktig vei per sidetype og reduserer hvor mye
  løkka må rette i utgangspunktet.

### Måling — gullsett som fundament

Ingen av endringene over bør gjøres på magefølelse. Hver justering av
rekonstruksjon, toleranse eller ruting må måles mot fasit, ellers vet vi
ikke om vi forbedrer eller forverrer. Gullsett-apparatet finnes allerede
(`generate-annual-report-gold-set`, `pdf-decision-gold-set`). Det som
mangler er et merket referansesett på ~30–50 filings som spenner
digital/scannet/konsern/SMB. Reviewer-korreksjonene er i ferd med å bli
dette datasettet — derfor betyr bulk-ingest og review noe. Mønsteranalysen
(Fase 3) bør så styre hvor innsatsen settes inn: dominerer `OCR_NOISE` →
bildeforbehandling; dominerer `WRONG_PAGE` → klassifisering; dominerer
årskolonne → reconstruction-grein.

### Hvor ML hører hjemme

Selve **diagnose-ruteren** — "gitt disse signalene, var dette recognition
eller reconstruction?" — er den naturlige ML-oppgaven. Mennesket som retter
i review-køen sier implisitt hva slags feil det var; det gir naturlig
merkede data. Løkken identifiserer dessuten selv hvilke regioner som er
vanskeligst — aktiv læring nær gratis.

### Minste første steg

Ikke bygg hele constraint-solveren først. Den minste versjonen som beviser
tesen:
- Konfidens per side (slutt å kollapse til ett tall).
- Én forgrening: lav side-konfidens *men* høy OCR-ord-konfidens →
  reconstruction → kjør geometri-først rekonstruksjon som alternativ.
- Én iterasjon, kun på de 4–6 regnskapssidene.

Flytter den selv en håndfull av de ~40 % tvetydige radene riktig, er tesen
bevist — og arkitekturen utvides med selvtillit.

---

## 5 · Framtidige faser (ikke startet)

Merk: Canica-diagnosen (se seksjon D) har endret rekkefølgen. Tabell-
rekonstruksjon og år-kolonne er flaskehalsen — de er flyttet fram og inn
i den selvkorrigerende løkka. Sidetype er nedprioritert.

### Fase 9 (framskyndet) — År-kolonne-detektor
Avgjøre hvilken numerisk kolonne som tilhører hvilket regnskapsår — selve
feilmodusen i Canica-kjøringen (`YEAR_COLUMN_ASSIGNMENT_UNCERTAIN`,
`SUSPICIOUS_COLUMN_SWAP`). Liten, veldefinert klassifiseringsoppgave med
mye data; inngår som reconstruction-grein i løkka (seksjon D).

### Fase 10 — Tabell-rekonstruksjon
Folder inn i den selvkorrigerende løkka (seksjon D) framfor å være en egen
end-to-end modell. Geometri-først og constraint-drevet rekonstruksjon
først; en lært tabellmodell (f.eks. Doclings TableFormer, eller LayoutLM
når GPU finnes) kommer som reconstruction-grein senere.

### Fase 8 — Sidetype-klassifikator (nedprioritert)
Samme oppskrift som unit-scale, for sidetyper (STATUTORY_INCOME, NOTE,
AUDITOR_REPORT etc.). Krever mer data — anslag 500+ eksempler per klasse.
Lavere prioritet enn rekonstruksjon.

### Fase 11 — Aktiv læring
Den selvkorrigerende løkka identifiserer av seg selv hvilke regioner som
er vanskeligst — det gir aktiv læring nær gratis. Prioriterer review-køen
mot de mest lærerike filingene.

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
- [ ] Docling-containeren OOM-krasjer under last (exit 137) og bruker
      ~89 min på én scannet filing. Trenger mer minne, eller hybrid-modus
      er ikke levedyktig for store scannede dokumenter. `OPENDATALOADER_TIMEOUT_MS`
      er 30 min — når Docling er treg men oppe, ventes fullt timeout per forsøk.
- [ ] Hvordan kalibreres det graderte slingringsmonnet (seksjon D)?
      Startpunkt: avled båndet fra enhetsskala og √N for antall poster.
      Bør det finjusteres mot reviewer-data over tid?

## I · Bakgrunns-opplastingsindikator (levert)

- `IngestionRun`-tabell sporer hver bulk-opplastingsjobb (status, fremdrift,
  tellere) i databasen — overlever at terminalen lukkes
- `ingestion-run-service.ts` — oppretter kjøring, oppdaterer fremdrift,
  fullfører; sender et `INGESTION_COMPLETED`-varsel til bjella ved slutt
- Bulk-ingest-skriptet prosesserer filing for filing og oppdaterer
  fremdriften etter hver enkelt — så fremdriftslinjen beveger seg jevnt
  selv når ett selskap har mange årsrapporter
- Live-widget på `/admin` (`AdminIngestionIndicator`) poller hvert 4. sekund
  og viser fremdriftslinje mens en opplasting pågår; viser resultatet i
  noen minutter etter at den er ferdig
- Skript-feilrettinger: `_load-env.ts` (laster `.env` for frittstående
  skript), og bulk-ingest oppretter selskapet fra Brreg hvis det mangler

---

_Sist oppdatert: 2026-05-22 etter ODL motorvalg (beste resultat vinner) og strategien for selvkorrigerende ekstraksjon (seksjon D — med ikke-deterministisk slingringsmonn og prinsippet om kildetroskap)._
