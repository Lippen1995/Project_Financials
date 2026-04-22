# ProjectX

ProjectX er et MVP for selskapsinformasjon og innsikt bygget med Next.js, TypeScript, Tailwind, Prisma, PostgreSQL og NextAuth. Repoet følger en streng regel: ingen mock data, ingen seed-data og ingen syntetisk utfylling av virksomhetsinformasjon.

## Stack

- Next.js App Router
- TypeScript + React
- Tailwind CSS
- Prisma + PostgreSQL
- NextAuth Credentials + Prisma Adapter
- Docker Compose for lokal PostgreSQL

## Hva som er implementert

- Globalt søk mot Brønnøysundregistrene
- AI-assistert fritekstsøk som tolker spørringer som aktivitet + geografi før kandidater rangeres
- Selskapsprofil med virksomhetsdata fra Brønnøysundregistrene
- Roller og styre når de er tilgjengelige fra Brønnøysundregistrene
- Årsbundet selskapsstruktur basert på importerte aksjonærregisterdata fra Skatteetaten når snapshot er tilgjengelig
- Faner for Oversikt, Regnskap, Nøkkeltall, Organisasjon og Kunngjøringer
- Dynamisk fane for "Immaterielle rettigheter" (patent, varemerke, design) når selskapet har treff hos Patentstyret
- Næringskodeberiking fra SSB Klass
- Filtrering på sentrale virksomhetsfelt
- Innlogging, registrering og enkel feature gating
- Workspace-basert kontooversikt med personlig workspace, team-workspaces og invitasjoner
- DD-rom med mandat, workflow, funn, evidens, beslutningshistorikk og frie romposter
- Kommentartråder på oppgaver, funn, kunngjøringer og regnskap i riktig DD-romkontekst
- Workspace-abonnementer, inbox-varsler og distress-monitorer
- Markedsanalysemodul for olje og gass på `/market/oil-gas` med SODIR-masterdata, kartlag, produksjonsserier, reserver og investeringsoversikt
- Distress-modul med todelt flyt:
  - oversikt på `/workspaces/[workspaceId]/distress`
  - screener på `/workspaces/[workspaceId]/distress/search`
- Lokal cache/persistens av hentede records med sporbarhet

## Datakilder

### Brønnøysundregistrene

Brukes som source of truth for:

- organisasjonsnummer
- virksomhetsnavn
- organisasjonsform
- registreringsstatus
- adresser
- registrert næringskode
- roller i virksomheten

ProjectX bruker åpne Brreg-endepunkter under `data.brreg.no/enhetsregisteret/api`.
Registrert næringskode beholdes med Brreg som kildesporing i domenemodellen; SSB brukes bare til beskrivelse og kodeverksberiking.
For regnskap bruker ProjectX Brregs offisielle PDF-kopier av årsregnskap under `data.brreg.no/regnskapsregisteret/regnskap/aarsregnskap/kopi/...`.
Historikk bygges nå gjennom en kontrollert ingest-pipeline med filing discovery, rå artifact-lagring, preflight, sideklassifisering, ekstraksjonskjøringer, validering og publiserte snapshots med provenance.

### SSB Klass

Brukes som source of truth for:

- beskrivelse av næringskoder
- kodeverksberiking

ProjectX bruker SSB Klass API under `data.ssb.no/api/klass/v1`.

### Finanstilsynet

Ikke aktivert i denne iterasjonen. ProjectX viser derfor ingen regulatorisk overlay i stedet for å anta eller simulere tilsynsstatus.

### Skatteetatens aksjonærregister

Brukes som source of truth for:

- aksjonærer per selskap og år
- antall aksjer per aksjonær
- beregning av direkte eierandel når totalt antall aksjer finnes i leveransen

ProjectX støtter import av reelle aksjonærregisteruttrekk fra Skatteetatens leveranseformat som CSV per selskap/år. Data er årsbundet og vises aldri som live-data.

ProjectX kan også hente aksjonærdata direkte fra Skatteetatens `Aksjonær i virksomhet API` når Maskinporten-tilgang, rettighetspakke og bearer-token er konfigurert lokalt. Live API prioriteres foran importerte snapshots.

### Sokkeldirektoratet, Havtil og Gassco

Brukes i olje- og gassmodulen slik:

- Sokkeldirektoratet (SODIR) er master for felt, funn, lisenser, innretninger, TUF/hovedrørledninger, survey, produksjonsserier, reserver og forventede investeringer
- Havtil brukes som regulatorisk event-overlay for tilsynsrapporter, samtykker, samsvarsuttalelser og granskingsrapporter
- Gassco brukes nå til sanntidsnomineringer via den offentlige `realTimeAtom.xml`-feed-en, mens generell UMM-feed fortsatt behandles konservativt fordi eventinnholdet kan være tomt eller variere over tid

Frontend i `/market/oil-gas` bruker kun normaliserte ProjectX-API-er under `app/api/market/oil-gas/*`, aldri rå SODIR-, Havtil- eller Gassco-responser.

### Patentstyret

Brukes som kilde for:

- patent-, varemerke- og designportefølje på selskapsprofil
- detaljoppslag per IP-sak

ProjectX bruker Patentstyrets Open Data-endepunkter med organisasjonsnummer som primær identifikator for portefølje.

## Viktige begrensninger

- ProjectX viser bare publiserte regnskapssnapshots når pipeline-en klarer å identifisere relevante sider, enhetsskala, primærmetrikker og nødvendige balansesjekker.
- Rå PDF-er, preflight-data, klassifiseringer, ekstraksjonskjøringer, facts og valideringsfeil lagres separat før noe kan publiseres til `FinancialStatement`.
- Filing-er som feiler på enhetsskala, sideklassifisering, required metrics eller regnskapslikninger blir stående i `MANUAL_REVIEW` eller `FAILED` i stedet for å skrive usikre tall til publisert snapshot.
- Hvis samme regnskapsår senere dukker opp med endret dokumenthash, bevares filing-historikken som en ny filing-versjon i stedet for å overskrive den gamle raden blindt.
- Artifact-lagring bruker nå `output/annual-report-artifacts/` som lokal artifact-store i utvikling; database-rader peker til hvert lagret artifact slik at lagringen kan flyttes bak et annet storage-interface senere.
- Regulatorisk overlay fra Finanstilsynet er ikke aktivert ennå.
- Aksjonærdata krever et reelt Skatteetaten-uttrekk for aktuelt selskap og år. Hvis snapshot mangler, viser ProjectX en tydelig tomtilstand i stedet for en plassholdergraf.
- Eierandeler beregnes bare når totalt antall aksjer finnes og er konsistent i den importerte leveransen.
- Filtrering skjer i MVP-et gjennom åpne søkekall og etterbehandling i ProjectX, så presisjonen er best når filtre kombineres med navn eller organisasjonsnummer.
- AI-søk bruker OpenAI kun til å tolke søketeksten til strukturert intensjon. Kandidater hentes fortsatt fra Brreg, næringskoder berikes fra SSB, og sortering på størrelse bruker bare reelle inntektstall som finnes i lokal lagring/importerte regnskap.
- Hvis `OPENAI_API_KEY` mangler, faller søket tilbake til en enklere regelbasert tolkning og UI-et markerer dette tydelig.
- Distress-monitorer matcher bare selskaper som allerede finnes i ProjectX-lageret lokalt. ProjectX hevder ikke full nasjonal dekning dersom selskapet ikke er hentet eller lagret ennå.
- Distress-tidslinjen på oversiktssiden bruker `lastAnnouncementPublishedAt` (siste registrerte kunngjøringsdato per profil), ikke full historikk av alle kunngjøringer.
- Distress-KPI for regnskapsdekning teller profiler med dataCoverage `FINANCIALS_AVAILABLE` eller `FINANCIALS_PARTIAL`.
- Første sync for regnskapsvarsler etablerer en baseline for lagret watch for å unngå falske historiske "nye regnskap"-varsler.
- DD-kommentarer på selskapsprofilen vises bare når profilen er åpnet fra et gyldig DD-rom med `ddRoom` i URL-en.
- Gassco-integrasjonen i olje- og gassmodulen bruker ekte sanntidsnomineringer fra offentlig Atom-feed. ProjectX lover fortsatt ikke full Gassco-eventdekning dersom den generelle UMM-feed-en er tom eller ikke kan verifiseres i siste sync.
- Havtil-hendelser normaliseres fra åpne listesider og brukes som event-overlay, ikke som master for sokkelobjekter.

## Arkitektur

- `integrations/`: provider-lag for Brreg og SSB
- `server/`: mapping, persistens og service-lag
- `server/shareholdings/`: importpipeline, normalisering, entity resolution og graph-transform for aksjonærdata
- `app/`: Next.js UI og API-ruter
- `prisma/`: datamodell

Frontend konsumerer kun normaliserte interne objekter, aldri rå ekstern API-respons.

## Lokal oppstart

1. Kopier `.env.example` til `.env`
2. Start PostgreSQL:

```bash
docker compose up -d
```

3. Installer avhengigheter:

```bash
npm install
```

4. Push schema til databasen:

```bash
npm run db:push
```

5. Hvis databasen allerede har brukere, backfill workspace-tilstand:

```bash
npm run backfill:workspaces
```

6. Start appen:

```bash
npm run dev
```

7. Hvis du vil synkronisere workspace-varsler manuelt lokalt:

```bash
npm run sync:workspace-notifications
```

Appen kjører da på [http://localhost:3000](http://localhost:3000).

## Auth

Det finnes ingen seedede demo-brukere. Opprett en konto i UI for lokal bruk.

Hver bruker får automatisk en personlig workspace ved registrering eller første innlogging etter schema-oppdateringen. Team-workspaces og medlemsinvitasjoner administreres fra dashboardet.

Aktive workspaces kan, avhengig av tilgangsnivå, eie DD-rom, watches, inbox-varsler og distress-monitorer. Disse objektene er workspace-scopet, ikke bruker-scopet.

Subscription-modellen finnes i databasen og brukes til enkel feature gating i produktet. Betalingsflyt er ikke ferdigstilt i denne iterasjonen.

## Import av årsrapporter og financial ingest

ProjectX bruker nå en staged ingest for årsregnskap. I stedet for å OCR-e en PDF direkte inn i `FinancialStatement`, skjer flyten slik:

- filing discovery per selskap og regnskapsår
- nedlasting og lagring av rå PDF som artifact
- preflight av tekstlag / sidegrunnlag
- sideklassifisering og enhetsskala-detektering
- ekstraksjonskjøring med persisted facts og valideringsfeil
- publish gate som bare oppdaterer `FinancialStatement` når confidence og regnskapslikninger passerer

For enkel enkeltselskaps-import finnes fortsatt:

```bash
npm run import:annual-reports -- 928846466
```

Dette vil nå:

- hente virksomheten fra Brreg
- oppdage tilgjengelige filings
- laste ned og registrere rå årsrapport-artifacts
- kjøre ekstraksjon, validering og publiseringsgate
- oppdatere publiserte `FinancialStatement`-snapshots bare for filings som passerer kontrollene

For operasjonell drift finnes også idempotente jobs:

```bash
npm run financials:discover-filings
npm run financials:backfill-filings
npm run financials:process-pending-filings
npm run financials:sync-new-filings
npm run financials:reprocess-low-confidence
npm run financials:validate-published-financials
npm run financials:list-review-queue
npm run financials:list-blocked-by-issue -- --rule=BS_TOTAL_BALANCES
npm run financials:reprocess-filing -- <filingId>
npm run financials:reprocess-runs -- --parser=annual-report-pipeline-v2 --max-quality=0.9
npm run financials:inspect-coverage
npm run financials:inspect-pending
npm run financials:inspect-published-provenance -- <orgNumber> --fiscal-year=2024
npm run test:financial-regression
```

Disse kan ta en eller flere `orgNumber` som argumenter. Uten argumenter brukes selskaper som allerede finnes i ProjectX-databasen.

### Historic backfill

- `financials:backfill-filings` oppdager alle åpne årsrapporter for kjente selskaper
- hver filing registreres separat med status, hash, artifacts, extraction runs og validation issues
- bare filings som passerer publish gate oppdaterer publisert snapshot for sitt regnskapsår
- `CompanyFinancialCoverage` oppdateres med siste discovered/downloaded/published år

### Incremental sync for nye filings

- `financials:sync-new-filings` går bare over selskaper som er due for ny sjekk via `CompanyFinancialCoverage.nextCheckAt`
- nye filings oppdages via Brreg-årslisten og registreres idempotent
- for de nyeste kjente filingene verifiserer sync-jobben også dokumenthash for å oppdage reviderte PDF-er på allerede kjente regnskapsår
- bare nye eller uferdige filings med status `DISCOVERED`, `DOWNLOADED` eller `PREFLIGHTED` prosesseres automatisk videre
- filings i `FAILED` eller `MANUAL_REVIEW` reprocesses bare via eksplisitt low-confidence/retry-jobb
- publiserte filings blir ikke destruktivt slettet og opprettet på nytt; nye extraction runs og artifacts beholdes som historikk

### Planlagt produksjons-sync

- internruten `/api/internal/annual-report-financials/scheduled` kjører den inkrementelle annual-report-syncen i produksjon
- ruten er beskyttet med `FINANCIALS_SYNC_SECRET` og aksepterer `Authorization: Bearer <secret>` eller `x-financials-sync-secret`
- Vercel cron er koblet til denne ruten i [vercel.json](./vercel.json)
- scheduleren kjører bare inkrementell discovery + pending processing, ikke full historisk backfill
- en DB-basert lease (`PipelineJobLease`) hindrer overlappende cron-kjøringer i å prosessere samme batch samtidig
- hvis en kjøring allerede holder lease, returnerer ruten en strukturert "skipped" respons i stedet for å starte dobbeltarbeid
- scheduleren kan valgfritt trigge en liten low-confidence retry-batch via query-parameter `lowConfidenceRetryLimit`, men standard cron kjører konservativt uten dette

### OpenDataLoader document-understanding

Annual-report-pipelinen kan nå kjøre med OpenDataLoader som upstream document-understanding-engine. OpenDataLoader brukes bare til PDF-forståelse, OCR, leseorden og tabell-/layout-artifacts. ProjectX sin egen klassifisering, canonical mapping, validering, quality scoring og publish gate er fortsatt source of truth for hva som publiseres til `FinancialStatement`.

Flyten er:

- rå PDF artifact
- OpenDataLoader parse
- intern normalisering til en rik annual-report document-modell med reelle bbox-er, blokktyper, leseorden og tabellstruktur
- eksisterende financial extraction, validations og publish gate

OpenDataLoader-adapteren brukes ikke lenger primært som en syntetisk `PageTextLayer`-generator. Normaliseringen bevarer nå så langt som mulig:

- reelle side- og blokk-bounding boxes
- blokktyper og heading-hierarki
- tabellgrenser og rad-/celle-struktur
- provenance tilbake til ODL-element og execution mode

Legacy-`lines` bygges fortsatt som et kompatibilitetslag for eksisterende downstream-kode, men ODL-pathen mates nå først og fremst gjennom den rikere annual-report-representasjonen.

Konfigurasjon:

- `OPENDATALOADER_ENABLED=false` holder integrasjonen av
- `OPENDATALOADER_MODE=local|hybrid|auto` styrer ruting
- `OPENDATALOADER_HYBRID_BACKEND` og `OPENDATALOADER_HYBRID_URL` brukes bare når hybrid er valgt
- `OPENDATALOADER_FORCE_OCR=true` tvinger OCR-kapabel hybrid-flyt
- `OPENDATALOADER_USE_STRUCT_TREE=true` prøver tagged PDF / structure-tree når preflight viser tekstlag
- `OPENDATALOADER_DUAL_RUN=true` kjører shadow-sammenligning uten å gjøre OpenDataLoader til publiseringskilde
- `OPENDATALOADER_STORE_ANNOTATED_PDF=true` lagrer annotert PDF artifact for review/debug
- `OPENDATALOADER_FALLBACK_TO_LEGACY=true` lar pipelinen falle tilbake til legacy document path hvis OpenDataLoader feiler

Ruting:

- `local` er standard når PDF-en har pålitelig tekstlag
- `hybrid` brukes eksplisitt eller når preflight peker på svak/manglende tekst
- OCR kjøres via hybrid-banen for scan-/image-baserte PDF-er
- structure-tree aktiveres bare når det er eksplisitt slått på og dokumentet faktisk har tekstlag

Artifacts:

- rå OpenDataLoader JSON lagres som annual-report artifact
- Markdown-output lagres som annual-report artifact
- annotert PDF lagres som annual-report artifact når aktivert
- normalisert document-representasjon og eventuelle dual-run-sammenligninger lagres som egne artifacts / raw summaries
- review payloads og review queue inkluderer referanser til artifactene slik at operatører kan inspisere hva engine-en faktisk så

Driftskrav:

- `@opendataloader/pdf` er installert som Node-avhengighet
- lokal OpenDataLoader-kjøring krever Java 11+ i runtime-miljøet
- hybrid backend må startes separat dersom `hybrid` brukes
- integrasjonen er laget for bakgrunnskjøring, ikke tunge synkrone web-requests

Verifikasjon:

```bash
npm run test:opendataloader-integration
npm run opendataloader:runtime-diagnostics
npm run opendataloader:smoke-test
```

Dette dekker OpenDataLoader-konfig, strukturbevarende normalisering, runtime-readiness, smoke-path, artifact persistence, dual-run-sammenligning og annual-report service-integrasjonstester.

`opendataloader:runtime-diagnostics` skriver en eksplisitt readiness-oppsummering for package, Java-versjon, local readiness og hybrid-konfigurasjon.

`opendataloader:smoke-test` forsøker en reell lokal ODL-parse mot en liten kontroll-PDF. Hvis Java 11+ ikke er tilgjengelig, feiler den tidlig og tydelig i stedet for senere i pipelinen.

### Manual review queue

- filings som blokkeres av publish gate oppretter `AnnualReportReview` med status `PENDING_REVIEW`
- review-raden peker til filing, extraction run, blocking rule codes, sidehenvisninger og et review-payload med klassifiseringer og utvalgte facts
- operatører kan liste køen via `financials:list-review-queue` eller filtrere på regelkode via `financials:list-blocked-by-issue`
- review-status oppdateres via backend-tjenesten eller internruten `/api/internal/annual-report-financials/reviews`
- når en ny bedre extraction run publiseres for samme filing, tidligere åpne review-rader markeres som `RESOLVED_BY_NEW_RUN`

### Reprocessing og parser-versjoner

- hver extraction run lagrer `parserVersion`, OCR-engine, confidence score og valideringsscore
- `financials:reprocess-filing` tvinger en enkelt filing gjennom pipeline-en igjen uten å slette tidligere runs eller publisert snapshot
- `financials:reprocess-runs` kan velge filings per orgnummer, parser-versjon, årsintervall, quality score eller spesifikke filing-id-er
- lav-confidence reprocessing bruker samme sikre flyt og kan ikke degradere et allerede publisert high-confidence snapshot
- hvis samme regnskapsår oppdages med endret dokumenthash, opprettes en ny filing-versjon i stedet for å overskrive gammel provenance

### Golden regression-fixtures

- regression-fixturene ligger under `integrations/brreg/annual-report-financials/`
- `annual-report-regression.test.ts` bruker representative dokumentfixturer med ekte PDF-preflight og golden forventninger for klassifisering, skala, canonical facts, validering og publish gate
- OCR-/scan-lignende tilfeller dekkes med `ocrRegressionFixtures`, som bruker realistiske `PageTextLayer`-fixturer med tokeniserings- og formateringsstoy
- suite dekker blant annet:
  - statutory NOK + supplementary NOK 1000 i samme dokument
  - multi-page balance continuation
  - note tie-out
  - ambiguous/manual-review blokkering
  - parentheses negatives, blanks og OCR token-oddities
- kjør lokalt eller i CI med `npm run test:financial-regression`

### Annual-report benchmark / golden set

Repoet har i tillegg et eget benchmark-lag for å sammenligne legacy annual-report-ekstraksjon mot OpenDataLoader-assistert flyt uten å endre publish-gaten.

Case-definisjoner ligger under `benchmarks/annual-report-golden/cases/` og kan peke til:

- eksisterende document-regression-fixturer
- eksisterende OCR-regression-fixturer
- inline PDF-sideinnhold for parrede benchmark-caser
- captured OpenDataLoader JSON-artifacts i repoet
- live PDF-input for OpenDataLoader dersom runtime senere er tilgjengelig

Kjør benchmarken:

```bash
npm run financials:benchmark-annual-reports
```

Kjør én case:

```bash
npm run financials:benchmark-annual-reports -- --case paired-digital-happy-path
```

Oppsummer siste kjøring:

```bash
npm run financials:summarize-annual-report-benchmark
```

Outputs:

- JSON-resultat under `output/benchmarks/annual-report-golden/`
- Markdown-oppsummering under samme katalog
- `latest.json` og `latest.md` peker alltid til siste benchmark-kjøring

Benchmarken er nå eksplisitt brukt til å evaluere den rikere ODL-adapteren. Den viktigste paired happy-path-casen skal ikke lenger falle ut bare fordi ODL-normaliseringen kollapser tabellrader eller mister arvede unit-signaler.

Benchmarken støtter to praktiske moduser:

- expected-output mode: sammenligner pipeline-resultat mot golden forventninger når labels finnes
- differential mode: sammenligner legacy og OpenDataLoader side om side og flagger materielle uenigheter selv når full labeling er begrenset

Den rapporterer blant annet:

- statement page selection accuracy
- unit-scale accuracy
- canonical fact accuracy
- validation/pass-fail-utfall
- publish vs `MANUAL_REVIEW`
- runtime
- artifact-generation status når live OpenDataLoader faktisk kjøres
- disagreement-rate mellom legacy og OpenDataLoader

I dagens repo er benchmarken fullt kjørbar med fixture-/captured-artifact mode. Live lokal OpenDataLoader-benchmark krever fortsatt Java 11+ i runtime-miljøet.

### Hva blokkerer auto-publisering

En filing publiseres ikke automatisk dersom ett eller flere av disse forholdene gjelder:

- relevante inntekts- og balansesider kan ikke klassifiseres sikkert
- enhetsskala (`NOK` vs `NOK 1000`) er ukjent eller inkonsistent
- required primary metrics mangler
- resultat- eller balanselikninger feiler materielt
- duplikate statement-seksjoner ikke stemmer etter normalisering
- note-tie-out eller skala/kolonnekontroller peker på mistenkelig konflikt
- extraction confidence eller validation score er for lav
- confidence score havner under terskel

I slike tilfeller lagres fortsatt rå PDF, artifacts, extraction run, facts og validation issues, men filing-en merkes som `MANUAL_REVIEW` eller `FAILED`.

### Operatør-runbook

- bruk `financials:inspect-pending` for nye discoveries som ennå ikke er prosessert
- bruk `financials:list-review-queue` for filings som trenger menneskelig gjennomgang
- bruk `financials:inspect-coverage -- --only-due` for selskaper som skal sjekkes i neste inkrementelle sync
- bruk `financials:inspect-published-provenance` for å se hvilken filing og extraction run som produserte publisert snapshot
- hvis en filing sitter fast i `FAILED` eller `MANUAL_REVIEW`, kjør `financials:reprocess-filing -- <filingId>` eller `financials:reprocess-runs` med relevante filtre
- intern overvåking kan lese `/api/internal/annual-report-financials/overview` og `/api/internal/annual-report-financials/reviews` med samme `WORKSPACE_SYNC_SECRET`-mekanisme som øvrige interne ruter
- den planlagte syncen kan overvåkes via `/api/internal/annual-report-financials/scheduled`, `financials:inspect-pending`, `financials:list-review-queue` og overview-endepunktet
- roter `FINANCIALS_SYNC_SECRET` på samme måte som andre interne cron-hemmeligheter; oppdater både miljøvariabel i deploy og eventuelle kallende jobber samtidig

## Import av aksjonærdata

ProjectX har en egen importjobb for aksjonærregisterdata fra Skatteetaten:

```bash
npm run import:shareholding -- 928846466 2024 ./data/aksjonaerer-928846466-2024.csv
```

Dette vil:

- lese inn rå CSV-leveranse for valgt selskap og år
- lagre råkilden separat fra normaliserte data
- normalisere aksjonærer og direkte eierskap
- forsøke konservativ kobling av selskapsaksjonærer mot Brreg
- beregne direkte eierandel når total shares finnes
- persistere et graph-ready snapshot for UI-et

## Miljøvariabler

- `DATABASE_URL`: PostgreSQL-tilkobling
- `AUTH_SECRET`: primær secret for Auth.js/NextAuth-sesjoner
- `NEXTAUTH_SECRET`: secret for auth-sesjoner
- `NEXTAUTH_URL`: lokal base-URL
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`: stabil base64-nøkkel for Server Actions lokalt og i deploy
- `BRREG_BASE_URL`: base-URL for Brreg virksomhetsdata
- `BRREG_ROLES_BASE_URL`: base-URL for Brreg roller
- `BRREG_COMPANY_LOOKUP_BASE_URL`: base-URL for Brreg virksomhetsoppslag brukt til åpne årsregnskapsmetadata
- `BRREG_ANNOUNCEMENTS_BASE_URL`: base-URL for Brreg kunngjøringer
- `BRREG_FINANCIALS_BASE_URL`: base-URL for Brreg Regnskapsregisterets åpne regnskaps-API
- `PATENTSTYRET_BASE_URL`: base-URL for Patentstyrets Open Data API
- `PATENTSTYRET_SUBSCRIPTION_KEY`: subscription key for Patentstyret (sendes kun server-side)
- `PATENTSTYRET_ORGNUMBER_PARAM`: query-parameter brukt i `/register/v1/IprCasesByCompany` (standard `orgNumber`)
- `SKATTEETATEN_SHAREHOLDING_BASE_URL`: base-URL for Skatteetatens Aksjonær i virksomhet API
- `SKATTEETATEN_SHAREHOLDING_PACKAGE`: rettighetspakke for datasettet
- `SKATTEETATEN_SHAREHOLDING_TOKEN`: bearer-token med scope `skatteetaten:aksjonaer`
- `SSB_KLASS_BASE_URL`: base-URL for SSB Klass
- `SSB_INDUSTRY_CLASSIFICATION_ID`: klassifikasjons-ID for næringskodeverket
- `PROJECTX_CACHE_HOURS`: antall timer før cache oppfriskes
- `OPENAI_API_KEY`: API-nøkkel brukt til å tolke fritekstsøk
- `OPENAI_SEARCH_MODEL`: modellnavn for søketolkning, standard `gpt-5-mini`
- `FINANCIALS_SYNC_SECRET`: delt secret for intern annual-report cron/scheduler
- `WORKSPACE_SYNC_SECRET`: delt secret for intern workspace-sync-endepunkt i produksjon

## Workspace-sync

ProjectX kan synkronisere watches og distress-monitorer til workspace-inboxen via:

```bash
npm run sync:workspace-notifications
```

I produksjon er internruten `/api/internal/workspace-sync` satt opp for timebasert cron via [vercel.json](./vercel.json). Sett `WORKSPACE_SYNC_SECRET` i miljøet og kall ruten med `Authorization: Bearer <secret>` eller `x-workspace-sync-secret`.

## Petroleum-sync

Petroleum-ingest og petroleum read-model refresh skal ikke lenger trigges fra vanlige brukerrequests. Kjør dem via script eller interne ruter:

```bash
npm run sync:petroleum -- scheduled
npm run sync:petroleum -- bootstrap-all
npm run sync:petroleum -- refresh-snapshots
npm run sync:petroleum -- refresh-company-exposure
```

Interne ruter:

- `/api/internal/petroleum-sync?job=bootstrap-all`
- `/api/internal/petroleum-sync?job=refresh-snapshots`
- `/api/internal/petroleum-sync?job=refresh-company-exposure`
- `/api/internal/petroleum-sync/scheduled`

Ruten bruker samme `WORKSPACE_SYNC_SECRET`-mekanisme som workspace-sync og kan kalles med `Authorization: Bearer <secret>` eller `x-workspace-sync-secret`.

Den planlagte petroleum-ruten i [vercel.json](./vercel.json) er ment som første fase av scheduled ingest/read-model refresh. Snapshot-tabellene brukes nå for raske read-paths i markedssammendrag, tabeller og kart/features, mens rå petroleum-tabeller fortsatt er intern source of truth for normaliserte records.

## Provider-oversikt

- `BrregCompanyProvider`: søker og henter virksomheter
- `BrregRolesProvider`: henter roller/styre
- `BrregFinancialsProvider`: discovery/download-provider for offisielle PDF-kopier av årsregnskap
- `SsbIndustryCodeProvider`: beriker næringskode med SSB-beskrivelse

## Kjørbart resultat

ProjectX kan kjøres lokalt, registrere brukere, søke i reelle virksomheter og vise profiler/roller med sporbarhet til offisielle kilder, uten syntetisk innhold.
