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
