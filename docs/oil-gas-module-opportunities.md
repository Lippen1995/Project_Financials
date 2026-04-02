# Oil & Gas-modul for ProjectX

Dato: 2026-04-02

## Mål

Bygge en egen olje- og gassmodul som bruker reelle, offisielle data for markedsanalyse av norsk sokkel, uten mock-data og uten a overstyre Bronnoysundregistrene som selskapsmaster.

Modulen bor ha to hovedflater:

- en interaktiv markedsanalyseflate med kart, filtre, grafer og tabeller
- en selskapskoblet overlayflate der petroleumseksponering kan vises pa selskapsprofil

Markedsanalyseflaten bor kunne vise:

- felt, funn, utvinningstillatelser og innretninger pa kart
- gassinfrastruktur og relevante terminal-/transportpunkter
- produksjonsdata og ressursdata i grafer og tabeller
- regulatoriske og operasjonelle hendelser som egne lag eller overlays
- flervalg-filtrering av hvilke objekter og dataserier som skal vises

## Viktige kilder vi faktisk kan bruke

### 1. Bronnoysundregistrene

Skal fortsatt vaere source of truth for:

- organisasjonsnummer
- juridisk navn
- organisasjonsform
- status
- adresser
- roller i juridisk enhet

Olje- og gassmodulen ma derfor modellere sokkeldata som et overlay pa toppen av eksisterende `Company`.

### 2. Sokkeldirektoratet

Sokkeldirektoratet er den viktigste kilden for faktiske petroleumsdata.

Relevante flater:

- Open data / FactPages / FactMaps: felt, funn, utvinningstillatelser, selskaper, bronnbaner, innretninger, produksjon, ressursdata og historikk.
- `Ressursbilde per selskap`: aggregert selskapseksponering pa sokkelen.
- `Nokkeltall`: sektornivaa for produksjon, lisenser, felt, funnkostnad og CO2-utslipp.
- Nyhetsflater for boreloyve, produksjonstal og resultat av leiteboring.

Det mest interessante for ProjectX er at Sokkeldirektoratet allerede har offentlige selskaps-, felt- og lisensvisninger som kan kobles til en egen domenemodell for sokkelaktivitet.

### 3. Havindustritilsynet

Petroleumstilsynet heter na Havindustritilsynet. Dette er relevant for regulatoriske overlays.

Relevante flater:

- tilsynsrapporter
- samtykker
- samsvarsuttalelser (SUT)
- meldinger om palegg

Dette egner seg godt som regulatoriske hendelser og risikosignaler pa selskapsprofil og i workspace-varsler.

### 4. Gassco

Gassco er ikke selskapsmaster, men gir verdifull infrastruktur- og markedsdriftskontekst.

Relevante flater:

- UMM/Gassco FLOW for planlagte og uplanlagte hendelser i gasstransportsystemet
- tariff- og omradeinformasjon
- offentlig informasjon om transportnett, prosessanlegg, mottaksterminaler og roller

Dette er spesielt nyttig for selskaper med gass- og eksporteksponering, og for en senere alerts-modul.

### 5. Andre nyttige offisielle/halvoffisielle kilder

- `norskpetroleum.no`: nyttig redaksjonell og forklarende presentasjon av felt, infrastruktur og historikk. Bør behandles som sekundarkilde for forklaring og kontekst, ikke som master for kjernefelter.

## Hva vi bor bygge i en forste MVP

### A. Markedsanalysekart for norsk sokkel

Dette bor vaere hovedflaten i modulen.

Kartet bor kunne vise egne lag for:

- felt
- funn
- utvinningstillatelser
- innretninger
- bronnbaner eller utvalgte bronnpunkter dersom datagrunnlaget er robust
- prosessanlegg og mottaksterminaler
- sentral gassinfrastruktur der offisielle data finnes

Brukeren bor kunne velge flere lag samtidig og skru dem av og pa med flervalg.

### B. Analysepanel med filtre

Ved siden av eller over kartet bor vi ha et kontrollpanel for flervalg-filtre som:

- objekt-type: felt, funn, lisens, innretning, terminal, prosessanlegg
- status: aktivt, under utbygging, avsluttet, funn, planlagt
- geografi: Nordsjoen, Norskehavet, Barentshavet
- operatør
- rettighetshaver
- ressurs-/produksjonskategori
- gass/olje/kondensat/NGL nar dette finnes eksplisitt i kilden

Dette er kjernen i at modulen blir en ekte analyseflate og ikke bare en presentasjonsside.

### C. Produksjonsdata i grafer og tabeller

For valg i kart og filterpanel bor brukeren kunne se:

- produksjon over tid
- produksjon per felt
- produksjon per operatør
- ressurs- og reservekontekst der kilden tillater det
- antall lisenser/felt/innretninger innenfor gjeldende filtersett

Presentasjon:

- tidsseriegrafer
- rangerte stolpediagrammer
- pivoterbare eller sorterbare tabeller

### D. Detaljpanel for valgt objekt

Klikk pa felt, lisens eller innretning i kartet bor apne et detaljpanel med:

- navn og offisiell identifikator
- operatør
- rettighetshavere
- status
- produksjons- eller ressursnokkeltall nar de finnes
- relevante regulatoriske hendelser
- lenke eller kobling til relevante selskapsprofiler i ProjectX

### E. Selskapskobling som sekundarflate

Selskapsprofilen er fortsatt nyttig, men som sekundar funksjon i denne modulen:

- en selskapsprofil kan vise sokkeleksponering
- markedsanalyseflaten kan lenke til selskaper
- man kan filtrere kartet pa valgt operatør eller rettighetshaver

## Anbefalt domenemodell

Frontend skal fortsatt ikke konsumere ra eksternrespons. Derfor bor vi legge til et eget domene for petroleumsoverlays.

Forslag til nye interne entiteter:

- `PetroleumMapLayer`
- `PetroleumMapFeature`
- `PetroleumCompanyProfile`
- `PetroleumLicenceInterest`
- `PetroleumFieldInterest`
- `PetroleumDiscoveryInterest`
- `PetroleumFacilityRelation`
- `PetroleumProductionSeries`
- `PetroleumRegulatoryEvent`
- `GasInfrastructureEvent`

I praksis bor vi ogsa ha egne normaliserte analyseobjekter:

- `PetroleumField`
- `PetroleumDiscovery`
- `PetroleumLicence`
- `PetroleumFacility`
- `PetroleumTerminal`
- `PetroleumAreaAggregate`

Forslag til nodvendige fellesfelt pa alle records:

- `sourceSystem`
- `sourceEntityType`
- `sourceId`
- `fetchedAt`
- `normalizedAt`

I tillegg bor alle petroleumrecords ha en tydelig kobling til enten:

- `companyId` nar vi trygt kan mappe til Brreg-selskap
- separat ekstern selskapsidentitet nar koblingen ikke er sikker nok

## Anbefalte providers

Disse passer inn i dagens struktur under `integrations/`:

- `SodirCompanyActivityProvider`
- `SodirLicenceProvider`
- `SodirFieldProvider`
- `SodirDiscoveryProvider`
- `SodirFacilityProvider`
- `SodirMapGeometryProvider`
- `SodirProductionProvider`
- `SodirWellboreEventProvider`
- `HavtilRegulatoryProvider`
- `GasscoFlowProvider`
- `GasscoInfrastructureProvider`

Sekundar og valgfri:

- `NorskPetroleumContentProvider`

## Viktigste arkitekturregel

Brreg skal fortsatt eie selskapet.

Det betyr i praksis:

- ikke lag en ny "company master" basert pa Sokkeldirektoratet
- ikke overstyr navn, status eller orgnummer med sokkelkilder
- legg heller petroleum som et spesialisert overlay pa eksisterende `Company`

## Realistisk koblingsstrategi

Dette er den viktigste tekniske utfordringen.

Sokkeldirektoratet, Havtil og Gassco publiserer ofte selskap via navn eller egen identifikator, ikke alltid via orgnummer i alle visninger. Derfor bor vi bruke en konservativ linkestrategi:

1. Koble direkte via offisiell identifikator dersom orgnummer finnes i kilden.
2. Hvis ikke: bruk en egen `ExternalCompanyIdentity`/mapping-tabell med kilde, kildenavn og evt. ekstern ID.
3. Koble til Brreg bare ved hoy sikkerhet.
4. Hvis koblingen er usikker: vis data som uknyttet petroleumaktivitetsrecord i stedet for a late som den tilhorer feil juridisk enhet.

Dette er i trad med AGENTS-regelen om a vaere aerlige i UI nar data ikke kan knyttes sikkert.

## Konkret MVP-scope jeg anbefaler

### Fase 1

- bygg interaktivt sokkelkart
- legg til flervalg for lag: felt, funn, lisenser og innretninger
- vis detaljpanel for valgt kartobjekt
- vis grunnleggende produksjonstabeller og tidsserier for felt
- legg til operatør- og statusfiltre

### Fase 2

- legg til selskapsperspektiv: operatør- og rettighetshaveranalyse
- koble kartobjekter til relevante ProjectX-selskaper
- legg til aggregater for produksjon per operatør og per område
- legg til Havtil-overlay med tilsynsrapporter, samtykker og palegg

### Fase 3

- legg til gassinfrastruktur og Gassco-kontekst
- vis UMM/Gassco FLOW som hendelseslag eller sidefeed
- legg til varsler pa felt-, terminal- eller gassrutingsrelaterte hendelser

### Fase 4

- bygg full analyseflate med avanserte tabeller og benchmark
- sammenlign operatører, feltklynger og havomrader
- legg til sektorbenchmark mot Sokkeldirektoratets nøkkeltall

## Konkrete UI-muligheter

### Hovedflate

En egen side, for eksempel `/market/oil-gas`, med:

- stort interaktivt kart som hovedfokus
- filterpanel med flervalg-checkboxer og sok
- toppstripe med nøkkeltall
- faneomrader for `Kart`, `Produksjon`, `Infrastruktur`, `Regulatorisk`, `Tabeller`

### Kartlag

Brukeren bor kunne sla pa flere lag samtidig:

- felt
- funn
- lisenser
- innretninger
- terminaler/prosessanlegg
- regulatoriske hendelser
- gassinfrastrukturhendelser

### Analysevisninger

Under eller ved siden av kartet:

- produksjon over tid for valgte felt
- topp-felt etter volum
- operatørfordeling
- lisensoversikter
- tabell med eksport/sortering/filter pa aktive valg

### Selskapskobling

Pa selskapsprofilen kan vi fortsatt vise:

- `Sokkelstatus`
- `Sokkelrolle`
- `Eksponering`
- `Regulatorisk status`
- lenke til markedsanalyse med ferdig satt filter pa selskapet

## Hva vi ikke bor love i starten

- fullstendig live produksjonsregnskap per selskap i sanntid
- presis juridisk kobling for alle sokkelselskaper pa dag 1
- komplette HSE-scorecards per selskap uten en tydelig og reproduserbar metode
- detaljert asset economics uten offisielt, robust grunnlag

Hvis koblingen eller datakvaliteten ikke er god nok, skal seksjonen sta tom eller merkes som utilgjengelig.

## Hvor dette passer i dagens repo

Naturlige steder:

- `integrations/`: nye providers mot Sokkeldirektoratet, Havtil og Gassco
- `server/mappers/`: normalisering til petroleum-domene
- `server/persistence/`: snapshot- og cachetabeller for petroleumrecords
- `server/services/`: sammensatt selskapsservice som kan hydrate petroleumsoverlays
- `app/`: nye tabs/komponenter pa selskapsprofil og nye filtre i sok

## Anbefalt forste implementasjonsrekkefolge

1. Bygg normaliserte geometri- og analyseobjekter for felt, lisenser, funn og innretninger.
2. Implementer et kart-API som returnerer filtrerbare features med metadata.
3. Bygg produksjonsserier og aggregater for felt og operatører.
4. Lag hovedsiden for markedsanalyse med kart og flervalg-filtre.
5. Legg til detaljpanel og tabell/grafvisninger.
6. Koble inn Havtil- og Gassco-overlays.
7. Legg til selskapskobling tilbake til ProjectX-profiler.

## Kilder vurdert

- Sokkeldirektoratet open data og FactPages
- Sokkeldirektoratet `Ressursbilde per selskap`
- Sokkeldirektoratet `Nokkeltall`
- Havindustritilsynet: tilsynsrapporter, samtykker og SUT
- Gassco: roller, tariffer/omrader og UMM/Gassco FLOW

## Konklusjon

Det finnes gode muligheter for en ekte olje- og gassmodul i ProjectX, og den bor bygges som en markedsanalysemodul med kart som primarflate.

Den riktige strategien er:

- egen analyseflate for kart, grafer og tabeller
- Sokkeldirektoratet som faglig master for sokkelobjekter og produksjonskontekst
- Havtil som regulatorisk overlay
- Gassco som infrastruktur- og markedsoverlay
- Brreg fortsatt som juridisk master nar analyseflaten kobles tilbake til selskaper

Dette gir en modul som blir bade visuelt sterk, nyttig i praksis og i traad med reglene i repoet.
