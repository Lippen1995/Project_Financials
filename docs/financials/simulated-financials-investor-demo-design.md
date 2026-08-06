# Teknisk design: simulerte regnskap for investor-demo

**Status:** Godkjent designgrunnlag

**Dato:** 5. august 2026

**Beslutning:** [ADR-0002](../adr/ADR-0002-isolated-simulated-financials-layer.md)

**Normativ taksonomi:** [FI-SIM-2026.1](./fi-sim-2026.1-spec.md)
**Implementasjon:** [Sekvensert implementasjonsplan](./fi-sim-implementation-plan.md)

## 1. Formål og avgrensning

Designet gjør det mulig å demonstrere resultatregnskap, balanse, grafer, metrics, analyser og Njord med et komplett finansielt datasett før rapportert dekning er tilstrekkelig. Simulerte data er tillatt bare for resultatregnskap og balanse i et tilgangskontrollert investor-demo-miljø.

Følgende skal aldri simuleres gjennom dette laget:

- selskapsidentitet eller organisasjonsnummer
- personer, roller eller eierskap
- registreringsstatus, adresse eller næringskode
- regulatorisk status
- dokumenter eller kildehenvisninger som gir inntrykk av at simuleringen er rapportert

## 2. Styrende invariants

1. Rapporterte records er immutable source-of-truth-data.
2. Ingen rapportert tabell har fremmednøkkel eller annen avhengighet til en simuleringstabell.
3. Ingen simulert verdi kan promoteres eller kopieres inn i rapporterte tabeller.
4. Alle runtime-lesere bruker Live Table gjennom ett repository.
5. Aktivt dataset skiftes atomisk og har en unik, immutable versjon.
6. Alle syntetiske linjer og alle statements som inneholder dem er eksplisitt merket.
7. Alle avledede resultater kan spores til datasetversjonen de ble beregnet fra.
8. Systemet fungerer og viser ærlige tomtilstander når simulering er deaktivert eller fjernet.

## 3. Logisk datamodell

De endelige navnene tilpasses eksisterende Prisma-konvensjoner under implementasjon. Modellen skal minst uttrykke følgende konsepter.

### Rapportert lag

- `ReportedFinancialStatement`
- `ReportedFinancialLine`

Dette laget eies av `BrregFinancialsProvider`, normalisering og eksisterende provenienskrav. Dataene endres ikke av simulatoren.

### Simulert lag

- `SimulatedFinancialDataset`
  - immutable dataset-ID og versjon
  - generatorversjon
  - antakelses-/konfigurasjonsversjon
  - `FI-SIM`-versjon, XBRL-spesifikasjonsversjon og simuleringsprofilversjon
  - opprettet tidspunkt og aktør
  - status for bygging, validering og aktivering
- `SimulatedFinancialStatement`
  - organisasjonsnummer, periode, valuta og periodevarighet
  - statement-type: resultat eller balanse
  - statement-opprinnelse: `hybrid` eller `simulated`
  - valideringsstatus og eventuell residual
- `SimulatedFinancialLine`
  - originalt `FI-SIM`-konsept identifisert med eget namespace og QName
  - `FI-SIM`-versjon, original kildelabel og relevant presentation role
  - nøyaktig én av syntetisk verdi eller referanse til rapportert ankerlinje
  - enhet og fortegn for syntetiske verdier
  - `valueOrigin`: `reported` eller `synthetic`, avledet fra bindingstypen
  - derivation-/regel-ID og generatorversjon
- `SimulatedFinancialLineMapping`
  - append-only mappingresultat per linje og mappingrevisjon
  - nullable intern `metricKey`, separat fra `FI-SIM`-konseptet og den immutable finanslinjen
- `SimulatedMetricAlias`
  - append-only alias-overlay per dataset og mappingrevisjon
  - endrer aldri rapporterte `MetricAlias`-records

En rapportert ankerverdi dupliseres ikke i simuleringslaget. Live Table løser referansen til den rapporterte linjen når et hybrid-statement leses. Et simulert dataset skal være immutable etter validering. En endring eller regenerering oppretter en ny datasetversjon.

### Aktivt dataset

- `ActiveFinancialDataset`
  - én aktiv record per isolert miljø eller eksplisitt scope
  - modus: `SIMULATED` eller `REPORTED`
  - aktiv datasetversjon
  - `activatedAt` og `activatedBy`
  - monoton konfigurasjonsversjon for cache- og jobbkontroll

Investor-demo, staging og produksjon skal ikke dele en uklar global bryter. Separate databaser er foretrukket. Hvis samme database må inneholde flere miljø-/tenant-scope, skal scope være eksplisitt og beskyttet av database- og applikasjonskontroller.

## 4. Live Table

Live Table implementeres som versjonerte database-views for statements og linjer. Viewene eksponerer samme kolonner uavhengig av aktiv kilde og filtrerer alltid til den aktive immutable datasetversjonen.

Minimumsfelter i live-kontrakten:

- statement- og linje-ID
- organisasjonsnummer
- statement-type og regnskapsperiode
- linjekode, verdi, enhet og fortegn
- `valueOrigin`
- statement-opprinnelse
- `financialDatasetVersion`
- rapportert source-ID når verdien er rapportert
- generatorversjon når verdien er syntetisk

View-definisjonen og dataset-pekeren skal gjøre byttet atomisk. En konvensjonell truncate-and-refill-tabell er ikke tillatt. Hvis målt ytelse senere krever materialisering, bygges en komplett immutable snapshot-versjon først; pekeren byttes bare etter vellykket validering.

## 5. Lesearkitektur og tilgang

`FinancialsRepository` er eneste runtime-grensesnitt for finansielle statements og linjer. Følgende skal bruke repository-et:

- selskapsprofil og grafer
- finansielle metrics og nøkkeltall
- filtre, screening og rangering
- API-ruter og eksporter
- Njord-verktøy og analyseobjekter
- planlagte og asynkrone jobber som leser finansdata

Runtime-databaserollen får `SELECT` på Live Table og nødvendig aktiv-dataset-metadata, men ikke på rapporterte eller simulerte kildetabeller. Egne jobbroller får minste nødvendige tilgang til ingest eller generering.

Direkte kildeoppslag skal i tillegg motvirkes med kodeinventar og tester som oppdager bruk av kildemodeller utenfor eksplisitt tillatte moduler.

## 6. Fjord Simulation Taxonomy, linjevariasjon og generering

Generatoren skal være deterministisk for samme organisasjonsnummer, periode, taksonomi-, antakelses- og generatorversjon. Generering skal skje i bakgrunnsjobb, aldri i brukerens request-path.

`Fjord Simulation Taxonomy` er en original, versjonert konseptkatalog som bare brukes i det isolerte simuleringslaget. Første versjon er `FI-SIM-2026.1`. Den modelleres med de fritt lisensierte tekniske XBRL-spesifikasjonene for konsepter, labels, presentation relationships og calculation relationships, men eier sitt eget innhold og namespace. En senere `FI-SIM`-versjon innføres som en kontrollert migrasjon og generatorversjon, ikke som en stille oppdatering av eksisterende datasets.

`FI-SIM` skal utvikles uavhengig. Det skal ikke importere, kopiere, oversette, gjenbruke eller etterligne IFRS-filer, namespace, QName, labels, definisjoner, referanser, presentation trees eller calculation linkbases. Verken produktet eller dokumentasjonen skal omtale taksonomien som IFRS-basert, IFRS-kompatibel eller IFRS-compliant.

Taksonomien er en konseptkatalog, ikke en obligatorisk mal der alle konsepter skal brukes. Hvert simulert statement får et deterministisk, selskapstilpasset utvalg `FI-SIM`-konsepter basert på:

- statement-type og regnskapsperiode
- organisasjonsform og reell SSB-næringskode
- eventuell regulatorisk overlay
- tilgjengelige rapporterte ankere
- versjonert simuleringsprofil

Linjevariasjon skal være semantisk begrunnet. Et handelsselskap kan for eksempel ha varer og varekostnad, mens et tjenesteselskap kan utelate disse. Et holdingselskap kan ha finansielle eiendeler og finansinntekter uten ordinære salgsinntekter. Generatoren skal ikke legge til eller fjerne linjer tilfeldig bare for å skape variasjon.

Simuleringslaget lagrer `FI-SIM`-konseptets QName og originale kildelabel, men lar intern `metricKey` være nullable. Linjene sendes gjennom samme metric-mapping-kontrakt som rapporterte linjer. Mapping-resultatet lagres i simuleringslaget og eksponeres gjennom Live Table; det skal aldri skrives til rapporterte linjer. Dermed tester investor-demoen reell mappingadferd med varierende linjeutvalg uten å forurense source-of-truth-data.

Mappingresultatet lagres som append-only historikk i `SimulatedFinancialLineMapping`, ikke som en mutasjon av den validerte finanslinjen. Et nytt mappingresultat øker både mappingrevisjonen og den aktive `financialDatasetVersion` atomisk før resultatet kan vises.

Minstekontrollene er:

- rapporterte ankere endres aldri
- resultatlinjer summerer til rapporterte delsummer når slike finnes
- eiendeler er lik egenkapital pluss gjeld
- flerårsdata har en eksplisitt intern bro mellom årsresultat og egenkapitalbevegelse
- valuta, enhet, fortegn, periodevarighet og stiftelsesdato håndteres eksplisitt
- inkonsistente eller overbestemte ankere gir residual eller kontrollert feil
- ingen simulert dokumentreferanse eller kildeproveniens kan se rapportert ut
- hver calculation relationship valideres mot den samme regnskapsidentiteten som generatoren bruker
- et konsept kan ikke publiseres uten original definisjon, label, periodetype, balance-attributt og stabil mapping-identitet

## 7. Merking og produktadferd

Når simulering er aktiv, skal regnskapsoppstillingen ha en vedvarende melding tilsvarende:

> Simulert for demonstrasjon - ikke rapporterte selskapsdata.

Hver syntetisk linje merkes. Rapporterte ankerlinjer i et hybrid-statement beholder merking som rapportert, mens statementet merkes hybrid. Grafer, metrics og Njord kan bruke det aktive simulerte datasettet, men skal videreføre statementets og linjenes opprinnelse.

Eksporter skal inneholde datasetversjon, genereringstidspunkt og samme tydelige demo-forbehold.

## 8. Datasetbytte og invalidering

Et datasetbytte følger denne protokollen:

1. Bygg en ny immutable datasetversjon uten å gjøre den aktiv.
2. Valider skjema, unikhet, perioder, regnskapsidentiteter, opprinnelse og forventet dekning.
3. Stans eller versjonsavgrens publisering fra jobber som startet på gammel versjon.
4. Bytt `ActiveFinancialDataset` atomisk i én transaksjon.
5. Invalider eller namespace cache, søkeindekser, metrics og avledede analyseartefakter med ny `financialDatasetVersion`.
6. Kjør smoke-tester gjennom de faktiske API- og verktøygrensesnittene.
7. Behold tidligere immutable versjon bare så lenge den trengs for kontrollert rollback i demoen.

En jobb eller cacheoppføring med en annen datasetversjon enn den aktive kan ikke publiseres som gjeldende resultat.

## 9. Go-live og sletting

GL-511 er et absolutt go-live-krav og gjennomføres i denne rekkefølgen:

1. Deaktiver simulering i alle beta- og produksjonsmiljøer.
2. Erstatt Live Table med en rapportert-only view-definisjon.
3. Verifiser at aktive views, API-er, verktøy, cache, indekser og avledede records ikke inneholder eller peker på syntetiske data.
4. Fjern simuleringsprovider, generator, aktiveringskode og demo-spesifikk UI.
5. Dropp simuleringstabellene gjennom en eksplisitt, gjennomgått migrasjon.
6. Regresjonstest rapporterte statements, tomtilstander, grafer, metrics, eksporter og Njord uten simuleringstabellene.

Etter sletting skal en virksomhet uten tilstrekkelig rapportert regnskap vise en ærlig tomtilstand. Systemet skal ikke ha automatisk syntetisk fallback.

## 10. Verifikasjonskrav

Implementasjonen er ikke ferdig før testene beviser:

- deterministisk regenerering for samme versjon og input
- immutable rapporterte ankere
- korrekte resultat- og balanseidentiteter
- atomisk bytte uten tomme eller blandede resultater
- opprinnelsesmerking i API, UI, graf, metric, eksport og Njord
- avvisning av cache og jobbresultater fra inaktiv datasetversjon
- manglende runtime-tilgang til kildetabellene
- at ingen aktiv konsument spør kildetabellene direkte
- rapportert-only drift etter at simuleringstabellene er fjernet
- ærlig tomtilstand for manglende rapporterte data

## 11. Låste generatorbeslutninger

[FI-SIM-2026.1-spesifikasjonen](./fi-sim-2026.1-spec.md) låser perioder, profiler, konseptkatalog, calculation relationships, residualregler, mappingisolasjon og minimumsmerking. [Implementasjonsplanen](./fi-sim-implementation-plan.md) låser rekkefølge, reader-migrasjon, verifikasjonsporter og GL-511-repetisjon.

Endringer i disse beslutningene krever en ny spesifikasjons- eller profilversjon. Et aktivert dataset skal aldri endres i stedet.

## 12. Taksonomireferanser

- [XBRL-spesifikasjoner](https://www.xbrl.org/the-standard/what/specifications/)
- [XBRL: taxonomier som rapporteringsordbøker](https://www.xbrl.org/the-standard/what/key-concepts-in-xbrl/taxonomies/)
- [XBRL Taxonomy Packages](https://www.xbrl.org/guidance/taxonomy-publication/)
