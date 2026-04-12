# Petroleum Performance Plan

## Problem Today

Olje- og gass-modulen har vært treg fordi read-pathene har gjort for mye arbeid per request:

- request-lag har kunnet trigge freshness-check og sync
- brede `findMany()`-kall laster store råtabeller inn i minnet
- filtrering, mapping og aggregasjon gjøres i stor grad i service-laget
- flere ingest-flyter bruker `delete-all + full rewrite`
- summary, table og company exposure blir bygd tungt for hver request

Dette gjør API-kallene både trege og mer sårbare for timeouts og connection-pool-press.

## Target Architecture

Målet er en tydelig delt petroleum-arkitektur:

1. `ingest/sync`
   - kjøres via bootstrap, interne jobber eller schedule
   - henter og normaliserer rådata fra offisielle kilder
   - skriver til interne råtabeller

2. `snapshot/read-model refresh`
   - kjører separat fra ingest
   - bygger små, query-optimiserte tabeller for de mest brukte leseflatene

3. `read path`
   - leser snapshots eller smale, indekserte queries
   - skal ikke trigge tung sync i vanlige brukerrequests
   - returnerer ærlig tomtilstand eller tilgjengelighetsstatus hvis data ikke finnes ennå

## What This Iteration Implements

Denne runden er fase 1 og prioriterer størst ytelsesgevinst først:

- tung petroleum-sync flyttes ut av normal request path
- tydelige jobb-entrypoints legges til for bootstrap og refresh
- første sett snapshot/read-modeller innføres
- market summary og market table flyttes over på snapshots eller smalere queries
- company exposure forberedes og delvis flyttes mot snapshot-inputs
- intern kjøreflate legges til via script og interne API-ruter

## What Is Explicitly Deferred

Denne runden gjør ikke alt:

- ingen full incremental upsert for alle råkilder ennå
- ingen total omskriving av alle petroleum-read-paths
- detail, full historikk og alle feature-paths flyttes ikke samtidig
- ingen avansert kø-infrastruktur eller partisjonering
- timeseries/read-modeller for alle brukssaker kommer senere

## Ingest vs Read Models

Rå petroleum-tabeller er fortsatt intern source of truth for normaliserte records:

- `PetroleumField`
- `PetroleumLicence`
- `PetroleumProductionPoint`
- `PetroleumReserveSnapshot`
- `PetroleumInvestmentSnapshot`
- events/publications/macros

Oppå disse innføres fase-1-read-modeller:

- `PetroleumFieldSnapshot`
- `PetroleumLicenceSnapshot`
- `PetroleumOperatorSnapshot`
- `PetroleumAreaSnapshot`

Disse snapshot-tabellene er avledede, deterministiske og raske å lese. De brukes først og fremst til:

- summary
- tabeller
- operator concentration
- felt-/områdeoversikter
- enklere eksponeringsberegninger

## Why Sync Must Leave the Request Path

Sync i request path gir feil arbeidsdeling:

- bruker må vente på IO og brede databaseoperasjoner
- samme request kan både lese og skrive store datamengder
- støy i eksterne kilder påvirker frontend-latens direkte
- connection pool og timeout-problemer blir langt mer sannsynlige

Derfor er policyen i fase 1:

- brukerrequests leser kun det som finnes i databasen
- sync trigges via jobbflater, ikke via normal sidebruk
- manglende data håndteres ærlig i responsen

## Snapshot Tables Introduced Now

### PetroleumFieldSnapshot

Én rad per felt med:

- identitet og operator
- område, status og hydrokarbonprofil
- siste produksjonsnøkler
- reserver
- forventede investeringer
- enkle endringsmål som `yoyYtdDeltaPercent` og `currentMonthDeltaPercent`

### PetroleumLicenceSnapshot

Én rad per lisens med:

- identitet og operator
- område, status og fase
- areal
- transfer-count
- licensee-count

### PetroleumOperatorSnapshot

Én rad per operatør med:

- tellinger for felt/lisenser/funn/innretninger
- produksjon, reserver og framtidige investeringer
- hovedområder og hoved-hydrokarbontyper

### PetroleumAreaSnapshot

Én rad per område med:

- antall felt og lisenser
- antall operatører
- aggregert produksjon, reserver og investeringer

## Read-Path Strategy in Phase 1

- `getPetroleumMarketSummary(...)` skal primært lese snapshots og bare bruke smale produksjonsspørringer der det fortsatt trengs
- `getPetroleumMarketTable(...)` skal lese snapshot-tabeller med paging og order-by
- company exposure skal i større grad bruke snapshots som input
- request path skal ikke automatisk kjøre `core`, `metrics`, `publications`, `events` eller `macro` sync

## Operational Entry Points in Phase 1

Fase 1 legger til en enkel, praktisk jobbflate:

- script-runner for petroleum-sync
- intern API for petroleum-sync med secret
- scheduled internal route for petroleum-jobber

Dette gir et tydelig skille mellom:

- ingest/refresh-operasjoner
- vanlige brukerrequests

## Phase 2 Follow-up

Fase 2 bygger videre på samme arkitektur, men flytter flere tunge read-paths bort fra brede råtabell-lesninger:

- `timeseries` leser filtrerte field snapshots og smale produksjonsspørringer per entitet/periode
- `entity detail` leser valgt entitet direkte, sammen med smale reserve-/investment-/production-/event-spørringer
- `events` leser filtrerte entity-referanser i stedet for å laste hele eventtabellen inn i minnet
- company petroleum-tab bruker snapshot-inputs og målrettede operator-/company-spørringer i stedet for å laste alle felt, lisenser, produksjonspunkter, reserver og investeringer

Dette er fortsatt ikke en full sluttarkitektur. Kart-/feature-read path og flere detaljhistorikker kan optimaliseres videre i neste fase.

## Phase 3 Follow-up

Fase 3 flytter de tre siste tunge petroleum-read-pathene over på smalere query-baserte reads:

- `features/map` laster nå bare valgte lag, bruker snapshots til å finne riktig delmengde for felt og lisenser, og henter rå geometri bare for kandidater som faktisk skal vises
- `timeseries` bygger først riktig feltutvalg via snapshots eller entitetsreferanser og henter deretter bare relevante produksjonspunkter for valgte felt/operatorer/områder
- `entity detail` bruker entitetsspesifikke repository-kall for reserve, investering, produksjon og events i stedet for brede `core`-/`metrics`-load helpers

Dette betyr at:

- `summary` og `table` fortsatt er snapshot-baserte slik de ble i tidligere fase
- `features`, `timeseries` og `detail` ikke lenger trenger brede dataset-loads som hovedstrategi
- bbox kan fortsatt postfiltreres i app-laget der geometrifunksjoner ikke er tilgjengelige direkte i DB-laget, men dette skjer nå på en langt snevrere kandidatmengde

## What Still Remains for Phase 4

Fase 4 bør ta de neste strukturelle gevinstene uten å overdesigne:

- egne read-modeller eller generaliserte geometrier for kartlag med svært store geometriobjekter
- mer inkrementell ingest/upsert for rådata som fortsatt bruker `replace-all`
- videre innsnevring av publication/macro/detail-historikk der enkelte kall fortsatt leser bredere enn ønskelig
- eventuelle DB-nære bbox-/geometrioptimaliseringer hvis repoet senere får mer moden geostakk

## Phase 4 Follow-up

Fase 4 tar første konkrete steg på kart/read-model-siden:

- en egen `PetroleumMapFeatureSnapshot` brukes som lettvekts read-model for kart/features
- snapshot-refresh bygger nå kartsnapshotter sammen med de øvrige petroleum-snapshottene
- `features/map` leser disse snapshottene direkte i stedet for å kombinere felt-/lisenssnapshots, rå entiteter og produksjonsoppslag per request

Dette reduserer request-arbeid i kartflaten ved å:

- unngå rå entity-loads med store payloads når vi bare trenger kartmetadata og geometri
- unngå ekstra produksjonsoppslag for felt bare for karttooltip/feature-kort
- holde eksisterende frontend-kontrakt stabil, siden API-et fortsatt returnerer samme `PetroleumMapFeature`-format

Det som fortsatt gjenstår etter fase 4:

- eventuell geometri-generalisering per zoomnivå hvis enkelte lag fortsatt er tunge med full geometri
- mer DB-nær bbox/interseksjon hvis repoet senere får bedre geostøtte
- videre overgang fra `replace-all` til mer inkrementelle refresh-mønstre for store snapshotsett
## Map Value Guardrails

Videre kartoptimalisering skal ikke redusere brukerens objektforstÃ¥else for kjernegeometri.

Det betyr at:

- `fields`, `licences` og `tuf` beholdes som full geometri i standard kartvisning
- overlapp mellom felt og lisenser lÃ¸ses med eksplisitt interaksjonsprioritet og layer-switching, ikke ved Ã¥ fjerne geometri
- lettere representasjon er fortsatt akseptabel for tette sekundÃ¦rlag som `surveys`, men ikke for kjerneflaten brukeren analyserer

Ytelsesarbeid etter fase 4 bÃ¸r derfor primÃ¦rt fokusere pÃ¥:

- prebuilt map snapshots og read-optimaliserte DTO-er
- viewport-baserte feature-kall
- request-cancellation og cachelag
- mer effektiv geometri-lagring og eventuell ekstern leveranse/cache av tunge map payloads
