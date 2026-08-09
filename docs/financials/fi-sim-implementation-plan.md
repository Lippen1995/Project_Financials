# Implementasjonsplan: isolert FI-SIM-datasett

**Status:** Under implementasjon

**Dato:** 7. august 2026

**Styrende dokumenter:** [ADR-0002](../adr/ADR-0002-isolated-simulated-financials-layer.md) og [FI-SIM-2026.1](./fi-sim-2026.1-spec.md)

Planen er en additiv expand-and-contract-migrasjon. Ingen fase skal endre eller slette rapporterte finansdata. Hver fase har en selvstendig verifikasjonsport.

## Implementasjonsstatus 9. august 2026

| Fase | Status | Bevis |
|---|---|---|
| F0 | Fullført | Eksakt reader-register og baseline-gate finnes. Porten skiller nå tilsiktede kildestier fra migrasjonsgjeld: bare `temporary-runtime-reader` teller, siden `source-ingest`, `source-migration`, `source-admin`, `source-observability` og `source-maintenance` er permanente og ikke kan gå gjennom live-datasettet. |
| F1 | Kontraktgrunnlag fullført | Runtime-validert live-kontrakt for IDs, datasetversjon og provenance. |
| F2 | Fullført | Additive Prisma-modeller, database-constraints, immutability-triggere og verifikasjon i disposable PostgreSQL. |
| F3 | **Fullført** | Versionerte views, eget metadata-view, atomisk `reportedRevision`-inkrement og snapshot-konsistent repository. `searchCompanyUniverse` gjør «nyeste statement per selskap» i databasen med totalordning og valgfri scope-preferanse; `aggregateCompanyFinancials` grupperer på år, scope, valuta *og* enhetsskala. Tre flater som gjorde utvalget i JavaScript med tre ulike tie-break-regler er lagt om: company-universe, søkerangering og `analysis-service.loadOfficialCompanies`. |
| F4 | **Fullført** | Alle sju grupper migrert. Rest-gjelden gikk fra 13 til 1 tilgang, og den siste (`presentation-node-service.ts`) hører til F5. `published-financials-reader.ts` er slettet; `company-repository.ts` er splittet i tillatt kildeskriving og live-lesing. |
| F5 | **Nesten fullført** | Delt motor (`server/financials/mapping/mapping-engine.ts`) er ren og tar registeret som parameter. Skriving rutes av `mapping-store.ts` etter *effektiv* modus fra `live_financial_dataset_v1`, ikke fra pekeren, så gatene gjelder. Mapping-lesing går mot `live_financial_line_items_v2` uten forgrening. Kildetilgang-gjelden er **0**. Gjenstår: manifest over konsepter som skal starte umappet — det forutsetter at F6 definerer konseptene. |
| F6 | **Fullført** | `server/financials/fi-sim/catalog/`: 56 konsepter (seksjon 4), 6 profiler (seksjon 5), 14 calculation relationships + balanselikning (seksjon 8), deterministisk profilvalg med regel-ID og ruleset-versjon (seksjon 6). Bank/kredittgivning og forsikring gir `UNSUPPORTED_SIMULATION_PROFILE`. Lint-test håndhever XBRL-grensen. **Til gjennomgang:** næringskode-reglene utover de blokkerte er en lesning av SN2007, ikke spec-diktat; organisasjonsform-steget er bevisst tomt. |
| F7 | **Fullført** | `server/financials/fi-sim/generator/`: merket seed uten klokke eller global tilstand, versjonert antakelseskonfigurasjon, ankerbinding gjennom LIVE, identitetsløser med flerårsbro, residualregler etter seksjon 10, validator som re-utleder alt fra katalogen, `BUILDING → VALIDATED`-skriving og jobben `npm run fi-sim:generate`. Determinisme, egenskapssveip over alle seks profiler og ankerimmutabilitet er dekket av tester; databasenivået er dekket av verifikasjonsskriptet. |
| F8 | Nesten fullført | DB-aktivering og live-views er fail-closed med capability-rolle, `FJORD_DEPLOYMENT_ENVIRONMENT=investor-demo` og `FJORD_FINANCIAL_SIMULATION_ENABLED=true`. Kontrollert kommando (`npm run fi-sim:activation`) med atomisk activate/rollback/deactivate finnes, og `FinancialDatasetActivationAudit` skrives av en trigger på selve pekeren — aktivering uten navngitt aktør og begrunnelse avvises av databasen. Cache, analyser, snapshots og eksporter er allerede versjonert på datasettversjon. **Gjenstår: reell runtime-principal.** |
| F9–F11 | Ikke startet | UI/eksport/Njord, operativ demo og teardown-repetisjon gjenstår. |

**Den ene gjenstående F8-tingen, sagt tydelig:** applikasjonen kobler seg fortsatt til databasen som eieren, ikke som et medlem av `fjord_financial_runtime`. `REVOKE`-ene og `pg_has_role`-sjekkene er reelle og verifiseres av porten, men de beskytter ingenting så lenge runtime-tilkoblingen er superbruker. Det er en deploy- og tilkoblingsendring, ikke en kodeendring i dette laget, og stoppkriteriet «database-rollen kan ikke begrenses til live-viewene» er ikke innfridd før den er gjort.

**Valg i F8 som er verdt å være uenig i:**

- **Triggeren skriver revisjonsloggen, ikke koden.** En logg som aktiveringskoden må huske å skrive, er en logg som en dag mangler akkurat den raden det gjelder. `record_financial_dataset_activation` avviser pekerendringen når ingen har sagt hvem og hvorfor, så en uauditert aktivering er umulig — også fra en psql-konsoll.
- **Deaktivering krever ikke demo-flagget.** Å skru demoen *av* er den trygge retningen. Å kreve flagget som skrur den på for å skru den av, gjør flagget ubrukelig i nettopp den situasjonen det betyr mest.
- **Ingen fremmednøkkel fra revisjonsloggen til datasettet.** En revisjonsrad forteller hva som skjedde; den skal ikke kunne bli uskrivbar eller usann på grunn av tilstanden i en annen tabell.
- **Rollback leser historikken, ikke en «forrige»-kolonne.** Den peker på forrige aktiverte immutable datasett og kopierer ingenting.

**Valg i F7 som er verdt å være uenig i:**

- **Generatoren leser ankere gjennom LIVE, ikke fra kildetabellene.** `live_financial_line_items_v2` eksponerer `reportedFinancialLineItemId`, så ankeret kan refereres uten en eneste ny kildelesning — kildetilgang-gjelden er fortsatt 0. Prisen er en hard forutsetning: generatoren nekter å kjøre når det aktive datasettet er simulert, ellers ville «rapporterte» ankere vært forrige demos syntetiske tall.
- **Ett residual per statement.** To uavhengige motsigelser mellom rapporterte tall gir `UNSOLVABLE_STATEMENT_IDENTITY` i stedet for to balanserende linjer. To slike linjer ville se ut som presisjon.
- **Statements med `MANUAL_REVIEW` skrives ikke.** De listes som ekskludert i manifestet. Alternativet er at ett statement av ti tusen hindrer aktivering, siden databasetriggeren krever at alle er `VALID`.
- **`profileOverride` finnes.** Ingen SN2007-regel velger `DORMANT_PRE_REVENUE`, så profilen var ellers uoppnåelig. Overstyringen er manifest-eid og får sin egen regel-ID `manifest.explicit`, slik at et håndklassifisert statement fortsatt kan si hvorfor det ser ut som det gjør.
- **Ankerbindingen `metricKey → conceptKey` er ikke mapping-orakelet.** Orakelet går motsatt vei og er testfasit. Denne tabellen sier bare hvilken rapportert linje et konsept kan *referere*; den gir aldri en simulert linje en `metricKey`. Tvetydige nøkler (`revenue`, `total_equity_and_liabilities`) står bevisst utenfor.

**To F5-porter er innfridd av design, ikke av kode:** det finnes intet mapping-orakel i runtime-katalogen å flytte ut, og `SimulatedFinancialLine` har ingen `metricKey`-kolonne — mapping ligger i append-only-tabellen `SimulatedFinancialLineMapping`. Generatoren *kan* derfor ikke skrive en ikke-null `metricKey` direkte.

**Kjent asymmetri:** `DdFindingEvidence` har `financialDatasetMode`, `financialDatasetVersion` og `financialDatasetQuarantined`; `DdCommentThread` har dem ikke. En kommentartråd kan derfor ikke karantenesettes når det aktive datasettet byttes, slik evidence kan. Begge flater leser nå gjennom live-datasettet, men skjemaet mangler for tråder.

**Merk om referanser:** `targetFinancialStatementId` på begge DD-tabellene er en fremmednøkkel til `FinancialStatement`. Postgres kan ikke la en fremmednøkkel peke på et view, så LIVE kan aldri være mål. Nøkkelen står som integritetsanker for rapporterte rader; ingen kode bruker den som oppslagsnøkkel.

Kommandoer for fundamentet:

```text
npm run financials:check-source-access
npm run financials:verify-simulation-foundation
npm run fi-sim:generate -- --limit 50 --years 5
npm run fi-sim:activation -- --action status
npm run fi-sim:activation -- --action activate --dataset <versjon> --actor <bruker> --reason "<hvorfor>"
npm run fi-sim:activation -- --action rollback --actor <bruker> --reason "<hvorfor>"
npm run fi-sim:activation -- --action deactivate --actor <bruker> --reason "<hvorfor>"
```

Verifikasjonsskriptet nekter å kjøre med mindre databasen heter `fi_sim_migration_test_*`.

`financials:check-source-access` er en baseline-regresjonsport, ikke et bevis på at F4 er ferdig. Den avviser nye eller uregistrerte kildelesere, men rapporterer eksplisitt den eksisterende migrasjonsgjelden. Simulering skal ikke aktiveres før gjelden er null og alle avhengige jobber, cacher og eksporter er inventarisert.

## 1. Nå-situasjon

Den permanente rapporterte kjernen er:

- `FinancialStatement` for normaliserte statements og headline-verdier
- `FinancialLineItem` for source labels, nullable `metricKey` og mapping
- `MetricAlias` og canonical-key-modellen for mapping

`PublishedFinancialLineItem` er en separat, eldre publiseringsflate. Den skal ikke bli kilde for det nye live-viewet. Rapporterte linjer må være normalisert til `FinancialLineItem` før de kan brukes som ankere.

Prisma 6.19.3 brukes i dag. Live-viewet bør opprettes i SQL-migrasjonen og leses gjennom eksplisitte repository-DTO-er og parameterisert SQL. Da er viewet read-only selv om ORM-støtten for views endres.

## 2. Målarkitektur

```mermaid
flowchart LR
  I["Rapportert ingest"] --> RS["FinancialStatement + FinancialLineItem"]
  G["FI-SIM generator"] --> SS["Simulated dataset + statements + lines"]
  RS --> LV["Versionerte live-views"]
  SS --> LV
  P["Atomisk dataset-peker"] --> LV
  LV --> R["FinancialsRepository"]
  R --> C["API, UI, grafer, metrics, søk, eksport, jobber og Njord"]
```

Kun ingest-, mapping-, simulerings- og migrasjonsjobber kan lese kildetabeller direkte. Runtime-konsumenter bruker `FinancialsRepository`.

## 3. Faseplan

### F0 — Baseline og leserregister

**Leveranser**

- Legg til en maskinlesbar allowlist for moduler som kan bruke finansielle kildemodeller.
- Legg til en CI-kontroll som feiler ved nye direkte runtime-lesere.
- Lag parity-fixtures for dagens rapporterte output fra public financials service.
- Dokumenter hvilke bakgrunnsjobber, cache-nøkler og eksportformater som inneholder finansdata.

**Port**

- Alle aktive lesere i tabellen under er klassifisert.
- Baseline-testene passerer uten schemaendring.

### F1 — Live-kontrakt og proveniens

**Leveranser**

- Innfør delte typer for `FinancialDatasetVersion`, `ValueOrigin` og `StatementOrigin`.
- Gjør normalized statement og line item kildeuavhengige.
- Legg til kildeavgrenset `liveStatementId` og nullable `reportedStatementId`.
- Gjør filing- og dokumentfelt nullable for simulerte statements.
- Krev datasetversjon i alle finansielle service-resultater.

**Port**

- Typecheck beviser at alle forbrukere håndterer provenance.
- En simulert linje kan ikke serialiseres som rapportert ved manglende felt.

### F2 — Additivt skjema

Opprett en ny migrasjon etter den eksisterende, pågående company-map-migrasjonen. Den eksisterende migrasjonen skal ikke endres.

**Nye modeller**

- `SimulatedFinancialDataset`
  - immutable ID, status og versjoner
  - generator-, antakelses-, profil- og taksonomiversjon
  - manifest, opprettet av og valideringsresultat
- `SimulatedFinancialStatement`
  - dataset, company, fiscal year, scope og origin
  - profil, perioder, valuta, enhet og valideringsstatus
- `SimulatedFinancialLine`
  - statement, concept, source label og presentation metadata
  - XOR mellom rapportert line-item-referanse og syntetisk verdi
  - derivation rule og provenance; finansverdien forblir immutable etter validering
- `SimulatedFinancialLineMapping`
  - append-only nullable `metricKey` per linje og mappingrevisjon
- `SimulatedMetricAlias`
  - append-only dataset- og mappingrevisjon, normalisert alias og canonical metric
- `ActiveFinancialDataset`
  - singleton/scope, modus, aktiv simulert dataset-ID, mappingrevisjon og monoton aktiveringsrevisjon
- `FinancialDatasetRevision`
  - monoton revisjon for rapportert ingest og aktivert simulert dataset

**Database-constraints**

- XOR-constraint for ankerreferanse og syntetisk verdi.
- Ingen fremmednøkkel fra rapporterte tabeller til simulerte tabeller.
- Unik statement per dataset, company, year og scope.
- Unik line per statement og concept.
- Aktiv simulert pointer må referere til et validert, immutable dataset.
- Et aktivert dataset kan ikke oppdateres.

**Port**

- Migrasjonen kan rulles frem på en kopi av gjeldende database.
- Eksisterende rapporterte records er byte-likt uendret.
- Constraint-tester avviser ugyldige bindinger og mutable aktiverte datasets.

### F3 — Versionerte live-views og repository

**Leveranser**

- Opprett `live_financial_statements_v1`.
- Opprett `live_financial_line_items_v1`.
- Viewene velger én gren basert på `ActiveFinancialDataset` i samme database-snapshot.
- Rapportert gren leser `FinancialStatement` og `FinancialLineItem`.
- Simulert gren løser rapporterte ankerverdier ved join; den kopierer dem ikke.
- Implementer `FinancialsRepository` med metoder for company, perioder, scope, aggregation og univers-søk.
- Eksponer datasetversjon på hver rad og hvert repository-resultat.

Univers-søket velger nyeste statement per selskap i databasen, i samme snapshot som leser det, med en *total* ordning (år, scope-preferanse, normalisering, live-ID) slik at to like statements kommer ut i samme rekkefølge hver gang. Aggregeringen grupperer også på valuta og enhetsskala: en sum av NOK mot EUR, eller kroner mot tusener, er feil uten å si fra.

**Datasetversjon**

- Rapportert modus bruker `reported:<reportedRevision>`.
- Simulert modus bruker `simulated:<datasetId>:<activationRevision>`.
- Rapportert ingest øker `reportedRevision` i samme transaksjon som publisering.
- Datasetaktivering øker `activationRevision` i samme transaksjon som pekerbyttet.

**Port**

- Rapportert modus matcher baseline-fixtures.
- Et pekerbytte gir aldri blandede eller tomme resultater under samtidige lesinger.
- Repository-et kan kjøres når simuleringstabellene er tomme.

### F4 — Flytt alle runtime-lesere

Migrer i denne rekkefølgen:

1. offentlig company financials service og company profile
2. watchlist og company-universe/screening
3. distress- og investment-analyser
4. Njord-verktøyene for gruppeestimat og M&A pro forma
5. raw-financials API og eksport
6. presentasjons- og metric-konsumenter
7. bakgrunnsjobber, cache og søkeindekser

Etter hver gruppe kjøres parity-test i rapportert modus før neste gruppe flyttes.

**Port**

- CI-kontrollen finner ingen ikke-tillatt runtime-lesing fra kildemodellene.
- Alle finansielle responses har `financialDatasetVersion`.

### F5 — Mapping-isolasjon

**Leveranser**

- Trekk ut normalisering og matching fra dagens metric-mapping til en delt, ren motor.
- La rapportert mapping fortsette å bruke `MetricAlias` og `FinancialLineItem`.
- La simulert mapping bruke `SimulatedMetricAlias` og `SimulatedFinancialLine`.
- Route mapping-lesing og -skriving etter aktivt datasett og autorisert miljø.
- Hold mapping-orakelet i testdata, utenfor runtime-katalogen.
- Legg inn et eksplisitt manifest over concepts som skal starte umappet i demoen.

**Port**

- En mapping opprettet i simulert modus endrer ingen rapportert alias eller linje.
- Samme input til den delte motoren gir samme kandidatresultat i begge modi.
- Generatoren har aldri skrevet en ikke-null `metricKey` direkte.

### F6 — FI-SIM-katalog og profiler

**Leveranser**

- Implementer `FI-SIM-2026.1` som versjonerte, kodeeide manifests.
- Implementer concepts, labels, definitions, presentation roles og calculation relationships.
- Implementer de seks godkjente profilene.
- Implementer deterministisk profilvalg fra reell SSB-næringskode, organisasjonsform og regulatorisk overlay.
- Blokker bank og forsikring med eksplisitt feilkode.
- Legg til en lint-test som forbyr IFRS-importer, namespaces og forbudte produktpåstander i FI-SIM-laget.

**Port**

- Catalog snapshot er stabil og versjonert.
- Hver profil har både gyldig resultat- og balansetre.
- Ingen profil publiserer alle concepts.

### F7 — Generator og validator

**Leveranser**

- Implementer stabil seed og versjonert antakelseskonfigurasjon.
- Generer inntil fem fullførte år uten perioder før stiftelsesdato.
- Bind rapporterte ankere før noen syntetisk verdi løses.
- Implementer calculation identities, flerårsbro og residualregler.
- Lagre nye datasets i `BUILDING`, valider, og flytt dem til `VALIDATED` uten mutasjon etterpå.
- Kjør generering i en eksplisitt bakgrunnsjobb.

**Port**

- Determinismetester er byte-stabile.
- Property-tester dekker alle profiler, år, scopes og relevante ankerkombinasjoner.
- Rapporterte anchor records har identisk hash før og etter generering.
- Alle publiserbare statements balanserer eksakt.

**Bevis (9. august 2026)**

| Port | Hvor den holdes |
|---|---|
| Byte-stabil determinisme | `generator.test.ts`: samme input gir identisk serialisering; to organisasjonsnummer gir ulike tall; et år endrer seg ikke når kalleren ber om et annet spenn; endrede ankere gir ny tegning. |
| Property-dekning | `generator.test.ts`: 40 selskaper × {1, 3, 5} år × {COMPANY, CONSOLIDATED} × alle seks profiler, alle validert. Ankerkombinasjoner dekkes av egne tester per feilkode og residualklasse. |
| Ankere uendret | `generator.test.ts` hasher ankerobjektene før og etter kjøring; `verify-fi-sim-foundation.ts` hasher `FinancialStatement`- og `FinancialLineItem`-radene før og etter at et ekte datasett skrives. |
| Eksakt balanse | Validatoren re-utleder alle relasjoner i seksjon 8 pluss balanselikningen fra katalogen, ikke fra generatorens eget regnskap. |

### F8 — Aktivering, tilgang og versjonskontroll

**Leveranser**

- Legg til tilgangskontrollert feature flag, av som standard.
- Tillat aktivering bare når miljøet eksplisitt er klassifisert som investor-demo.
- Implementer atomisk activate/rollback-kommando med audit-logg.
- Opprett separate database-roller for runtime, reported ingest og simulation jobs.
- Runtime-rollen får bare `SELECT` på live-views og nødvendig datasetmetadata.
- Namespace eller invalider cache, analyser, søkeindekser, eksporter og jobbresultater med datasetversjon.
- Avvis publisering fra en jobb som startet på en inaktiv versjon.

**Port**

- Feature flag av + simulert DB-peker gir fail-closed-adferd.
- Runtime-rollen kan ikke lese noen kildetabell direkte.
- Rollback aktiverer forrige immutable demo-dataset uten kopiering.

**Bevis (9. august 2026)**

| Port | Hvor den holdes | Status |
|---|---|---|
| Fail-closed med flagget av | `verify-fi-sim-foundation.ts`: simulert peker + flagg av gir rapporterte tall, og aktiveringsforsøket avvises av `validate_active_financial_dataset_pointer`. | Innfridd |
| Runtime-rollen ser ingen kildetabell | Samme skript sjekker `has_table_privilege` for `fjord_financial_runtime` mot både kildetabeller og live-views. | Innfridd i rettighetene, **ikke i tilkoblingen** — appen kobler seg fortsatt til som eier |
| Rollback uten kopiering | `activation-service.test.ts` peker tilbake på forrige aktiverte datasett-ID; ingen rader leses eller skrives i simuleringstabellene. | Innfridd |
| Aktivering kan ikke skje uauditert | `verify-fi-sim-foundation.ts` avviser en pekerendring uten aktør, og avviser både `UPDATE` og `DELETE` mot revisjonsloggen. | Innfridd |

### F9 — UI, API, eksport og Njord

**Leveranser**

- Vis vedvarende demo-banner på hybride og simulerte statements.
- Merk hver syntetiske tabellinje.
- Før `statementOrigin` og datasetversjon gjennom grafer og metrics.
- Legg disclaimer og datasetmetadata i eksport.
- La Njord oppgi at et finansielt svar bygger på demo-simulering.
- Avvis kommentar- og evidence-mutasjoner for simulerte statements.
- Ikke vis filing-, dokument- eller innsendingsmetadata for simulerte statements.

**Port**

- E2E-test dekker tabell, graf, metric, eksport og Njord i begge modi.
- Tilgjengelighetstest bekrefter at markering ikke bare kommuniseres med farge.
- API-contract test hindrer syntetisk provenance i å bli serialisert som rapportert.

### F10 — Demo-dataset og operativ prøve

**Leveranser**

- Bygg et komplett immutable dataset for den avtalte selskapsmengden.
- Produser valideringsrapport med profilfordeling, ankertyper, residualer, mappinggrad og feil.
- Kjør aktivering, cache-invalidering og rollback i demo-miljøet.
- Kjør investor-demoens viktigste brukerreiser.

**Port**

- Ingen uventede generatorfeil eller material residual er aktivert.
- Alle selskaper er enten validert eller eksplisitt listet som ikke støttet.
- Alle viste statements og syntetiske linjer er merket.

### F11 — GL-511-repetisjon

GL-511 skal øves før investor-demoen, ikke først ved produksjonsforberedelse.

**Leveranser**

- Erstatt views med rapportert-only definisjon i et engangsmiljø.
- Fjern simuleringskode, manifests, mapping-overlay og demo-UI fra aktive paths.
- Dropp simuleringstabellene med en egen migrasjon.
- Kjør hele rapportert-mode testpakken og tomtilstander.
- Produser en sjekkliste med kommandoer, eiere og bevis som kan gjenbrukes ved faktisk go-live.

**Port**

- Applikasjonen bygger og kjører uten simuleringstabeller eller `FI-SIM`-filer.
- Ingen cache, indeks, analyse eller eksport refererer til en simulert datasetversjon.
- Rapporterte selskaper viser samme output som før; selskaper uten data viser ærlig tomtilstand.

## 4. Register over eksisterende direkte lesere

| Område | Nåværende direkte kilde | Disposisjon |
|---|---|---|
| Public financials | `published-financials-reader.ts` | Erstatt med hovedrepository i F4. |
| Watchlist | `FinancialStatement` | Flytt til repository aggregation. |
| Company universe | rå SQL mot `FinancialStatement` | Flytt SQL-semantikken bak repository. |
| M&A pro forma | `FinancialStatement` og `PublishedFinancialLineItem` | Flytt til live statements og lines. |
| Group estimate | `FinancialStatement` og `PublishedFinancialLineItem` | Flytt til live aggregation og lines. |
| Raw financials API | `PublishedFinancialLineItem` | Returner live lines med provenance. |
| Distress analysis | `FinancialStatement` | Flytt til repository; versjoner snapshots. |
| DD investment reads | `FinancialStatement` | Flytt lesing; blokker synthetic FK-mutasjoner. |
| DD comments | `FinancialStatement` | Behold reported-only mutasjon; bruk live read-model for visning. |
| Presentation nodes | `FinancialLineItem` | Bruk mapping-repository for aktivt datasett. |
| Canonical key admin | `FinancialLineItem` | Behold reported admin-sti; legg til isolert demo-sti. |
| Structured ingest | `FinancialStatement` og `FinancialLineItem` | Tillatt source-writer; ikke flytt til live repository. |
| Company repository ingest | `FinancialStatement` | Splitt read og write; write forblir tillatt source-sti. |
| Admin source health | `FinancialStatement` | Tillatt eksplisitt source-observability, aldri produktmetric. |

Tillatte source-stier skal navngis i allowlisten. En bred mappebasert tillatelse er ikke tilstrekkelig.

## 5. Testmatrise

| Lag | Kritiske tester |
|---|---|
| Skjema | XOR-binding, immutable dataset, ingen reverse FK, unikhet, pointer-validitet |
| View | reported parity, hybrid anchor resolution, no mixed version, empty-state |
| Repository | company, years, scope, aggregation, stable live IDs, datasetversion |
| Mapping | null-at-ingest, shared engine, overlay isolation, oracle score |
| Generator | determinisme, identities, perioder, profiles, residualer, error codes |
| Sikkerhet | runtime permission denial, demo-only activation, fail closed |
| UI/API | statement- og linjemerking, nullable filing metadata, no provenance downgrade |
| Jobs/cache | stale result rejection, switch invalidation, rollback isolation |
| Teardown | reported-only view, tables dropped, build/test without FI-SIM |

## 6. Stoppkriterier

Implementasjonen skal stoppes og investor-demo-unntaket skal ikke aktiveres dersom:

- én runtime-konsument må lese kildetabellene direkte
- database-rollen ikke kan begrenses til live-viewene
- rapporterte ankere må kopieres eller omskrives
- mapping i demoen kan endre rapporterte records
- datasetbyttet ikke er atomisk og versjonert
- en syntetisk linje kan miste provenance i en avledet flate
- GL-511-repetisjonen ikke fungerer uten simuleringslaget

## 7. Anbefalt arbeidsdeling i commits

Hver fase bør leveres som små, reversible commits:

1. `test(financials): register direct source readers`
2. `feat(financials): add live dataset contracts`
3. `feat(db): add isolated simulation schema`
4. `feat(db): add versioned financial live views`
5. `refactor(financials): route runtime reads through repository`
6. `feat(financials): isolate simulated metric mappings`
7. `feat(fi-sim): add 2026.1 taxonomy and profiles`
8. `feat(fi-sim): add deterministic generator and validator`
9. `feat(financials): add controlled dataset activation`
10. `feat(ui): disclose simulated financial data`
11. `test(fi-sim): verify demo dataset and teardown`

Ingen commit skal kombinere eksisterende company-map-arbeid med FI-SIM-endringer.
