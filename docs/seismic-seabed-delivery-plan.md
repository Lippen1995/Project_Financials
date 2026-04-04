# Seismic & Seabed Delivery Plan

Dato: 2026-04-04

## Goal

Bygge to nye gratisdrevne analysefaner i olje- og gassmodulen:

- `Seismikk & Undersøkelser`
- `Havbunn & Routeing`

Begge fanene skal:

- bruke kun reelle, åpne og gratis datakilder
- gjenbruke dagens kartmotor, filterstate og URL-state
- eksponere kun normaliserte ProjectX-API-er til frontend
- være ærlige om dekning, kvalitet og begrensninger

Målet er ikke å vise proprietære 3D-volumer eller engineering-grade route design. Målet er å gi en sterk screening- og innsiktsflate for:

- letemodning
- survey-overvåkning
- subsea screening
- havbunnsrisiko
- rutevurdering for rør og kabler på høyt nivå

## Product Scope

### Tab 1: Seismikk & Undersøkelser

Skal svare på:

- Hvor finnes det datadekning?
- Hvilke typer undersøkelser er gjort, planlagt eller pågående?
- Hvor er det høy aktivitet nå?
- Hvilke områder er modne nok til å jobbe videre med, og hvor har vi "white space"?

### Tab 2: Havbunn & Routeing

Skal svare på:

- Hvordan ser havbunnen ut i valgt område?
- Hvor er det geofarer eller terrengmessige konflikter?
- Hvor ser havbunnen mest installasjonsvennlig ut?
- Hvor er det sannsynligvis vanskelig å legge kabel eller rør?

## Free Data Sources

### Seismikk & undersøkelser

- `SODIR Survey / FactMaps / Data Service`
  - survey-footprints
  - surveystatus
  - surveykategori
  - geometri
- `SODIR geofysiske undersøkelser`
  - kart for planlagte og pågående undersøkelser
  - domene- og kategoriforklaringer
- `Diskos public navigation`
  - offentlig navigasjon for norsk sokkel
  - dekning og linjekontekst

Kilder:

- [SODIR åpne data](https://www.sodir.no/fakta/data-og-analyser/apne-data/)
- [SODIR geofysiske undersøkelser](https://www.sodir.no/fakta/geofysiske-undersokelser/)
- [Diskos Seismic](https://www.sodir.no/en/diskos/seismic/)

### Havbunn & routeing

- `Mareano`
  - bathymetri
  - marine geodata
  - sedimentkart
  - sedimentasjonsmiljø
  - marine landformer
  - gassoppkommer
  - relativ bunnhardhet der tilgjengelig
- `NGU`
  - marine grunnkart
  - geologiske lag som støtter seabed-forståelse
- `Kartverket`
  - sjøterreng- og dybdereferanser via åpne marine karttjenester
- `SODIR Deep Sea`
  - MBES
  - backscatter
  - SBP
  - video
  - water column
  - utvalgte dypvannsundersøkelser

Kilder:

- [Mareano kart og data](https://www.mareano.no/kart-og-data)
- [Marine geospatial data](https://www.mareano.no/en/maps-and-data/marine-geospatial-data)
- [NGU marine grunnkart](https://www.ngu.no/geologisk-kartlegging/marine-grunnkart-kystnaer-havbunnskartlegging)
- [SODIR order deep sea data](https://www.sodir.no/en/facts/seabed-minerals/order-deep-sea-data/)
- [SODIR data acquisition and analyses](https://www.sodir.no/en/facts/seabed-minerals/data-acquisition-and-analyses/)

## Data Model

Nye normaliserte domeneobjekter:

- `PetroleumSurveyCoverage`
- `PetroleumSurveyActivity`
- `PetroleumSurveyReference`
- `SeabedFeature`
- `SeabedHazardFeature`
- `SeabedRasterReference`
- `RouteScreenCandidate`
- `RouteScreenConflict`

Felles felt på alle records:

- `sourceSystem`
- `sourceEntityType`
- `sourceId`
- `fetchedAt`
- `normalizedAt`

Valgfrie felt for kart- og analysebruk:

- `geometry`
- `bbox`
- `centroid`
- `areaKm2`
- `lengthKm`
- `status`
- `category`
- `updatedAtSource`
- `qualityNote`
- `coverageVintage`

## Frontend Principles

- Kartet forblir hovedflaten.
- Fanen bestemmer aktive lag, widgets og tabeller.
- `bbox` skal fortsatt styre KPI-er, tabeller og detaljpanel.
- Alle raster- eller WMS-referanser skal mappes til et internt lagformat før frontend bruker dem.
- Hvis et lag ikke er gratis tilgjengelig eller ikke kan brukes stabilt, skal det merkes som utilgjengelig.

## Sprint Plan

## Sprint 1: Seismikk & Undersøkelser MVP

### Objective

Bygge første nyttige gratisflate for surveydekning og geofysisk aktivitet.

### User outcomes

- Brukeren kan se hvor det finnes surveydekning.
- Brukeren kan filtrere på surveytype og status.
- Brukeren kan sammenholde surveys med felt, funn, lisenser, brønner og infrastruktur.
- Brukeren kan se hvilke områder som har fersk eller gammel datadekning.

### Scope

- ny toppfane: `Seismikk & Undersøkelser`
- survey-footprints fra SODIR
- surveykategorier:
  - ordinær seismisk undersøkelse
  - havbunnseismisk undersøkelse
  - elektromagnetisk undersøkelse
  - borestedsundersøkelse / site survey
  - grunnundersøkelse / soil survey
- status:
  - planlagt
  - pågående
  - fullført
  - avlyst der tilgjengelig
- kobling mot eksisterende lag:
  - felt
  - funn
  - lisenser
  - brønner / brønnbaner
  - innretninger
  - TUF / hovedrørledninger

### New API routes

- `GET /api/market/oil-gas/seismic/features`
- `GET /api/market/oil-gas/seismic/summary`
- `GET /api/market/oil-gas/seismic/table`
- `GET /api/market/oil-gas/seismic/entity/[id]`

### New filters

- `surveyCategories`
- `surveyStatuses`
- `surveyYearFrom`
- `surveyYearTo`
- `nearInfrastructure`
- `nearDiscoveries`

### UI components

- `components/market/oil-gas/seismic/seismic-summary-strip.tsx`
- `components/market/oil-gas/seismic/seismic-layer-panel.tsx`
- `components/market/oil-gas/seismic/seismic-table.tsx`
- `components/market/oil-gas/seismic/seismic-detail-panel.tsx`

### Backend files

- `integrations/sodir/sodir-seismic-provider.ts`
- `server/services/petroleum-seismic-service.ts`
- `server/persistence/petroleum-seismic-repository.ts`
- `lib/seismic-market.ts`

### Schema additions

- `PetroleumSurveyCoverage`
- `PetroleumSurveyActivity`

### MVP widgets

- `Datadekning i valgt utsnitt`
- `Surveyaktivitet siste 12 mnd`
- `Fordeling per surveytype`
- `Nyeste undersøkelser`
- `White space`

### Definition of done

- Surveydata vises i kartet som ekte geometrier.
- Filtrering på type og status fungerer.
- Summary og tabell følger samme `bbox`.
- Detaljpanelet viser navn, type, status, år og kilde.
- UI viser tydelig at dette er survey-/dekningsovervåkning, ikke rå seismikkvolumer.

## Sprint 2: Havbunn & Routeing MVP

### Objective

Bygge en gratis screeningflate for havbunnsforhold og trasevurdering.

### User outcomes

- Brukeren kan se bathymetri og sentrale havbunnslag i samme analyseflate.
- Brukeren kan vurdere en korridor eller et utsnitt for installasjon og routeing på screeningnivå.
- Brukeren kan identifisere havbunnsrisiko og potensielle konfliktpunkter.

### Scope

- ny toppfane: `Havbunn & Routeing`
- baselag:
  - bathymetri
  - slope eller avledet terrengindikator der dette finnes
- vektor-/temalag:
  - sedimenttype
  - sedimentasjonsmiljø
  - marine landformer
  - gassoppkommer
  - relativ bunnhardhet der kilden tillater det
- kontekstlag:
  - felt
  - innretninger
  - TUF / hovedrørledninger
  - brønner som valgfritt overlay

### New API routes

- `GET /api/market/oil-gas/seabed/features`
- `GET /api/market/oil-gas/seabed/summary`
- `GET /api/market/oil-gas/seabed/table`
- `POST /api/market/oil-gas/seabed/route-screen`
- `GET /api/market/oil-gas/seabed/entity/[id]`

### Route-screen output

`route-screen` skal i MVP ikke late som det er optimalisering. Det skal være screening.

Responsen bør gi:

- total lengde for tegnet eller valgt korridor
- antall konfliktpunkter
- andel hard/soft/ukjent seabed
- andel nær gassoppkommer eller annen hazard
- enkel samlet `screeningRisk`

### UI components

- `components/market/oil-gas/seabed/seabed-summary-strip.tsx`
- `components/market/oil-gas/seabed/seabed-layer-panel.tsx`
- `components/market/oil-gas/seabed/route-screen-panel.tsx`
- `components/market/oil-gas/seabed/seabed-detail-panel.tsx`

### Backend files

- `integrations/mareano/mareano-seabed-provider.ts`
- `integrations/ngu/ngu-marine-provider.ts`
- `server/services/petroleum-seabed-service.ts`
- `server/persistence/petroleum-seabed-repository.ts`
- `lib/seabed-market.ts`

### Schema additions

- `SeabedFeature`
- `SeabedHazardFeature`
- `SeabedRasterReference`
- `RouteScreenCandidate`

### MVP widgets

- `Route risk`
- `Installation suitability`
- `Burial friendliness`
- `Geohazard summary`

### Definition of done

- Bathymetri og minst tre havbunnslag vises i kartet.
- Brukeren kan slå lag av og på.
- `route-screen` tar imot enkel korridor eller linje og returnerer screeningresultat.
- Resultatene er ærlig merket som screening, ikke detaljengineering.

## Sprint 3: Kontekst og scoring

### Objective

Gjøre de to fanene mer beslutningsrelevante ved å koble dem tettere til leting og infrastruktur.

### Scope

- survey-freshness score
- near-infrastructure score
- enkel white-space score for leteområder
- route-risk score
- installation-suitability score
- bedre krysskobling mot:
  - funn
  - felt
  - brønner
  - vertsinnretninger

### New API routes

- `GET /api/market/oil-gas/seismic/opportunity-screen`
- `GET /api/market/oil-gas/seabed/install-screen`

### UI additions

- `Coverage freshness`
- `Near-infrastructure opportunities`
- `High-risk route segments`
- `Installation candidate zones`

### Definition of done

- Scoringene beregnes fra reelle åpne data og forklares i UI.
- Brukeren kan se hvorfor en score er høy eller lav.
- Ingen score presenteres som proprietær sannhet eller engineering-beslutning.

## Sprint 4: Diskos navigation og avansert åpne lag

### Objective

Øke datadekningen med flere gratis lag uten å introdusere proprietære avhengigheter.

### Scope

- Diskos public navigation som eget kartlag
- flere survey- og dekningsoverlays
- utvalgte SODIR Deep Sea-lag der åpne og teknisk stabile
- forbedret "coverage gap"-analyse

### Backend files

- `integrations/diskos/diskos-navigation-provider.ts`
- `integrations/sodir/sodir-deepsea-provider.ts`

### Definition of done

- Diskos navigasjonslag kan slås av og på.
- Appen skiller tydelig mellom offentlig navigasjon og full seismikktilgang.
- Deep Sea-lag vises bare der kilde og dekning er dokumentert.

## Sprint 5: Hardening and documentation

### Objective

Gjøre modulene stabile, raske og ærlige i produksjonsnær bruk.

### Scope

- caching og refresh-strategi
- feilhåndtering for eksterne karttjenester
- tydelig kildevisning i UI
- README-oppdatering
- testdekning for providers, API og sentrale kartinteraksjoner

### Refresh strategy

- SODIR survey metadata: daglig
- SODIR pågående/planlagte undersøkelser: hver 6. time
- Mareano/NGU-lag: ukentlig eller sjeldnere avhengig av oppdateringstakt
- Diskos navigation: daglig eller ved behov, avhengig av tilgjengelighet

### Definition of done

- README beskriver hvilke gratis kilder som er brukt.
- Hvert lag viser kilde og sist oppdatert.
- Feil i én ekstern kilde tar ikke ned hele siden.

## File map

Foreslått filstruktur:

- `app/api/market/oil-gas/seismic/features/route.ts`
- `app/api/market/oil-gas/seismic/summary/route.ts`
- `app/api/market/oil-gas/seismic/table/route.ts`
- `app/api/market/oil-gas/seismic/entity/[id]/route.ts`
- `app/api/market/oil-gas/seabed/features/route.ts`
- `app/api/market/oil-gas/seabed/summary/route.ts`
- `app/api/market/oil-gas/seabed/table/route.ts`
- `app/api/market/oil-gas/seabed/route-screen/route.ts`
- `app/api/market/oil-gas/seabed/entity/[id]/route.ts`
- `components/market/oil-gas/seismic/`
- `components/market/oil-gas/seabed/`
- `integrations/sodir/`
- `integrations/mareano/`
- `integrations/ngu/`
- `integrations/diskos/`
- `server/services/`
- `server/persistence/`

## Testing plan

### Provider tests

- survey-provider mapper surveytype og status korrekt
- Mareano-/NGU-provider bevarer geometri og kategori
- Diskos navigation mapper dekning uten å late som det er full seismikktilgang

### API tests

- `bbox` påvirker summary og tabell riktig
- filterkombinasjoner gir korrekt AND/OR-adferd
- `route-screen` returnerer screeningresultat uten å feile på ukjent dekning

### UI tests

- fanebytte bevarer `bbox` og kartstate
- lag kan slås av og på
- summary, kart og tabell er synkronisert
- empty/error/loading states er tydelige

## Risks and boundaries

- Gratis data er svært god for screening, men ikke nok for full detaljprosjektering.
- Raster- og WMS-kilder kan ha varierende ytelse og tilgjengelighet.
- Noen havbunnslag kan ha ujevn geografisk dekning.
- Diskos offentlig navigasjon er nyttig, men må ikke presenteres som fri tilgang til komplette seismikkpakker.
- `route-screen` må eksplisitt markeres som screening og ikke optimal endelig trase.

## Recommended build order

1. Sprint 1: `Seismikk & Undersøkelser`
2. Sprint 2: `Havbunn & Routeing`
3. Sprint 3: scoring og bedre beslutningsstøtte
4. Sprint 4: Diskos navigation og avanserte åpne lag
5. Sprint 5: hardening, tester og dokumentasjon

## Immediate next step

Start med Sprint 1 og bygg `Seismikk & Undersøkelser` før `Havbunn & Routeing`.

Begrunnelse:

- SODIR surveydata er enklest å få inn raskt med høy verdi.
- Den fanen vil koble naturlig mot dagens eksisterende sokkelobjekter.
- Den gir umiddelbart innsikt i datadekning og aktivitet uten å være avhengig av raster- og karttjenestekompleksitet fra flere eksterne havbunnskilder.
