# Implementasjonsplan: isolert FI-SIM-datasett

**Status:** Investor-demoen er lokalt klar med et aktivt, immutable datasett for hele selskapsbasen. Ett kodevedlikeholdspunkt og eventuell provisjonering av et separat delt demo-miljø gjenstår.

**Dato:** 7. august 2026

**Styrende dokumenter:** [ADR-0002](../adr/ADR-0002-isolated-simulated-financials-layer.md) og [FI-SIM-2026.1](./fi-sim-2026.1-spec.md)

Planen er en additiv expand-and-contract-migrasjon. Ingen fase skal endre eller slette rapporterte finansdata. Hver fase har en selvstendig verifikasjonsport.

## Implementasjonsstatus 10. august 2026

| Fase | Status | Bevis |
|---|---|---|
| F0 | Fullført | Eksakt reader-register og baseline-gate finnes. Porten skiller nå tilsiktede kildestier fra migrasjonsgjeld: bare `temporary-runtime-reader` teller, siden `source-ingest`, `source-migration`, `source-admin`, `source-observability` og `source-maintenance` er permanente og ikke kan gå gjennom live-datasettet. |
| F1 | Kontraktgrunnlag fullført | Runtime-validert live-kontrakt for IDs, datasetversjon og provenance. |
| F2 | Fullført | Additive Prisma-modeller, database-constraints, immutability-triggere og verifikasjon i disposable PostgreSQL. |
| F3 | **Fullført** | Versionerte views, eget metadata-view, atomisk `reportedRevision`-inkrement og snapshot-konsistent repository. `searchCompanyUniverse` gjør «nyeste statement per selskap» i databasen med totalordning og valgfri scope-preferanse; `aggregateCompanyFinancials` grupperer på år, scope, valuta *og* enhetsskala. Tre flater som gjorde utvalget i JavaScript med tre ulike tie-break-regler er lagt om: company-universe, søkerangering og `analysis-service.loadOfficialCompanies`. |
| F4 | **Fullført** | Alle sju grupper migrert. Rest-gjelden gikk fra 13 til 1 tilgang, og den siste (`presentation-node-service.ts`) hører til F5. `published-financials-reader.ts` er slettet; `company-repository.ts` er splittet i tillatt kildeskriving og live-lesing. |
| F5 | **Fullført** | Delt motor (`server/financials/mapping/mapping-engine.ts`) er ren og tar registeret som parameter. Skriving rutes av `mapping-store.ts` etter *effektiv* modus fra `live_financial_dataset_v1`, ikke fra pekeren, så gatene gjelder. Mapping-lesing går mot `live_financial_line_items_v2` uten forgrening. Kildetilgang-gjelden er **0**. Manifestfeltet `intentionallyUnmappedConcepts` finnes og settes med `--unmapped-concepts`. `npm run fi-sim:map` kjører den delte motoren over et validert datasett og skriver append-only mappingrader; aktivering bærer datasettets mappingrevisjon slik at mappingen faktisk publiseres. Orakelet fra spec 11.6 finnes nå som testfasit i `catalog-mapping-oracle.test-data.ts` og forbyr at et konsept mappes til feil nøkkel. **Fullført.** |
| F6 | **Fullført** | `server/financials/fi-sim/catalog/`: 56 konsepter (seksjon 4), 6 profiler (seksjon 5), 14 calculation relationships + balanselikning (seksjon 8), deterministisk profilvalg med regel-ID og ruleset-versjon (seksjon 6). Bank/kredittgivning og forsikring gir `UNSUPPORTED_SIMULATION_PROFILE`. Lint-test håndhever XBRL-grensen. **Til gjennomgang:** næringskode-reglene utover de blokkerte er en lesning av SN2007, ikke spec-diktat; organisasjonsform-steget er bevisst tomt. |
| F7 | **Fullført** | `server/financials/fi-sim/generator/`: merket seed uten klokke eller global tilstand, versjonert antakelseskonfigurasjon, ankerbinding gjennom LIVE, identitetsløser med flerårsbro, residualregler etter seksjon 10, validator som re-utleder alt fra katalogen, `BUILDING → VALIDATED`-skriving og jobben `npm run fi-sim:generate`. Determinisme, egenskapssveip over alle seks profiler og ankerimmutabilitet er dekket av tester; databasenivået er dekket av verifikasjonsskriptet. |
| F8 | **Fullført lokalt** | DB-aktivering og live-views er fail-closed med capability-rolle, `FJORD_DEPLOYMENT_ENVIRONMENT=investor-demo` og `FJORD_FINANCIAL_SIMULATION_ENABLED=true`. En egen lokal innloggingsrolle er provisjonert og bevist: den kan lese de versjonerte finans- og company-map-live-viewene, men avvises fra rapporterte og simulerte kildetabeller, publiserte kart-snapshots, datasetpekeren og revisjonsloggen. Manglende runtime-URL gir nå kontrollert feil når investor-demoen er aktiv, mens vanlig rapportert utvikling beholder fallback. |
| F9 | **Fullført** | `lib/financial-simulation-disclosure.ts` eier ordlyden ett sted. Banner, per-verdi-markører, graftekst og datasettversjon vises i regnskap, nøkkeltall, selskapsoversikt, dashboard og overvåkning. Markeringen er tekstlig og tilgjengelig, ikke bare farge. Regnskapsvisningen omtaler FI-SIM-konseptkatalogen og kaller aldri simulert struktur «som rapportert». Kommentar- og evidence-mutasjoner mot simulerte statements avvises fortsatt. |
| F10 | **Fullført** | Det immutable datasettet `fi-sim-investor-2026.1-20260810-a` er bygget, mappet og aktivert lokalt: 9 004 selskaper, 33 345 perioder, 66 690 statements og 1 057 365 linjer. 74 645 linjer er referanser til rapporterte ankere; 982 720 er syntetiske. Mappingrevisjon 2 mapper 693 725 linjer (65,6 %), mens 327 173 er eksplisitt umappet for mapping-demoen. [Valideringsrapport](./fi-sim-investor-2026.1-20260810-a-generation-report.md) og [mappingrapport](./fi-sim-investor-2026.1-20260810-a-mapping-report.md) er lagret. Kritiske brukerreiser er kjørt i nettleser uten konsollfeil. |
| F11 | **Fullført** | Teardown-SQL i `prisma/teardown/gl-511/` — bevisst *utenfor* migrasjonskjeden, siden en forberedt migrasjon som lå i kjeden ville sluppet simuleringstabellene neste gang noen kjørte `migrate deploy`. `npm run fi-sim:rehearse-teardown` bygger et ekte datasett, aktiverer, mapper, deaktiverer, fjerner 20 databaseobjekter og krever deretter byte-identisk svar fra produktet. Sjekkliste i [gl-511-teardown-checklist.md](./gl-511-teardown-checklist.md). |

## Gjenstående arbeid

- **Lokalt investormøte:** ingen åpen FI-SIM-port. Det aktive datasettet, runtime-rollen og brukerreisene er verifisert.
- **Delt demo-host, hvis den skal brukes:** opprett den samme begrensede runtime-principalen og sett de tre demo-variablene. Dette er miljøprovisjonering, ikke en endring i datasettet.
- **Kodevedlikehold:** avgjør senere om `aggregateCompanyFinancials` skal få en produktkonsument eller fjernes. Metoden påvirker ikke de verifiserte demo-reisene.

## Åpne punkter (historikk)

Tabellen under er bevart som beslutningshistorikk. Gjeldende status står i «Gjenstående arbeid» ovenfor; rader som senere ble lukket kan derfor beskrive den tidligere mangelen.

| # | Punkt | Fase | Hvorfor det betyr noe |
|---|---|---|---|
| 1 | ~~Demo-datasettet er helt umappet.~~ **Lukket 10. august.** Mappingrevisjon 2 har én rad per linje: 693 725 mappet, 327 173 eksplisitt umappet og 36 467 `NO_MATCH`. | F5 / F10 | Det eksplisitte manifestet bevarer en realistisk mapping-demo uten tilfeldig variasjon eller ferdigmapping fra generatoren. |
| 2 | **Lukket lokalt 10. august.** Egen runtime-principal er opprettet og aktivt brukt av investor-demoen. Ved en senere delt demo-host må samme rolle og miljøvariabel provisjoneres der. | F8 | Demoen feiler lukket dersom den eksakte demo-konfigurasjonen mangler den begrensede tilkoblingen. |
| 3 | ~~Grafer og nøkkeltall manglet visuell markering.~~ **Lukket 10. august 2026.** | F9 | Banner, graftekst og eksakte per-verdi-markører er implementert; rapporterte ankere i hybride statements merkes ikke som syntetiske. |
| 4 | **`aggregateCompanyFinancials` har ingen konsument i produktet.** Bare verifikasjonsskriptet kaller den. | F3 | Metoden er en F3-leveranse og er testet og verifisert mot database, men den er ikke koblet til noen flate. Enten skal en flate ta den i bruk, eller så skal den fjernes — den skal ikke bli stående som kode ingen kaller. |
| 5 | ~~Investor-demoens brukerreiser er ikke kjørt.~~ **Lukket 10. august.** | F10 | Registrering/onboarding, dashboard, søk, selskapsoversikt, regnskap og nøkkeltall er kjørt i nettleser uten konsollfeil. |
| 6 | ~~Ingen avtalt selskapsmengde.~~ **Lukket 10. august.** Hele den lokale selskapsbasen ble forsøkt: 10 843 selskaper. | F10 | 9 004 har minst én publiserbar periode. Alle øvrige selskaper og avviste perioder er eksplisitt kodet i det immutable manifestet. |
| 7 | ~~F11 er ikke startet.~~ **Lukket 9. august.** Fjerningen er øvd i engangsdatabase og sjekklisten finnes. | F11 | Steg 6 i sjekklisten — å faktisk slette filene og se at `npm run build` går — er ikke øvd. Sprengradiusen er bevist ved import-inventar (`fi-sim-teardown-surface.test.ts`): ingen kjøretidskode importerer fra `server/financials/fi-sim/`, bare fem jobber. |

**Mapping fant en feil i den delte motoren, ikke bare i demoen.** Aliaset `oevrige driftsinntekter` på `other_operating_income` kunne aldri treffe noe: normalisereren gjør `ø` til `o`, ikke til `oe`. Enhver linje som het «Øvrige driftsinntekter» falt derfor gjennom til `revenue` sitt kortere alias `driftsinntekter` og ble ført som omsetning — også i rapporterte regnskaper, ikke bare i demoen. Aliaset har fått sin `o`-tvilling, og `canonical-taxonomy.test.ts` krever nå at enhver translitterert skrivemåte har en tvilling i den formen normalisereren faktisk produserer. Retningen er fremover: allerede lagrede `metricKey`-verdier settes ved ingest og endres ikke av dette.

**Utenfor FI-SIM, men funnet underveis:** `npm run db:check-migrations` feiler mot utviklingsdatabasen. Fire migrasjoner fra 6. august (`connect_company_map_reported_financials`, `audit_company_map_financial_exclusions`, `preserve_map_financial_provenance`, `fold_provenance_into_financial_live_view`) er kjørt mot databasen uten å finnes i repoet — de kommer fra worktreet `.codex-worktrees/company-map-publication`. Sjekksummer og indekser stemmer. Uavhengig av dette arbeidet, men porten er rød til noen rydder.

**Runtime-principalen, sagt tydelig:** privilegier binder til en tilkobling, ikke til en kommentar. Finansielle lesninger går derfor på sin egen tilkobling — `financialRuntimePrisma()` — som autentiseres som et medlem av `fjord_financial_runtime` når `FJORD_FINANCIAL_RUNTIME_DATABASE_URL` er satt. Alt annet beholder den delte klienten, fordi det med rette skriver og med rette leser tabeller runtime-rollen aldri skal se.

I vanlig rapportert utvikling faller finanslesning tilbake til den delte tilkoblingen når variabelen ikke er satt. Når både miljøet er eksakt `investor-demo` og simulering er aktivert, finnes ingen slik fallback: manglende `FJORD_FINANCIAL_RUNTIME_DATABASE_URL` gir en kontrollert feil før finansdata leses. Demoen kan dermed ikke se isolert ut uten at databaseprivilegiene faktisk håndheves.

**Provisjonering per miljø** (fullført lokalt; gjentas ved en eventuell delt demo-host):

```sql
CREATE ROLE fjord_runtime LOGIN PASSWORD '<hemmelighet>' IN ROLE fjord_financial_runtime;
GRANT CONNECT ON DATABASE <db> TO fjord_runtime;
```

Sett så `FJORD_FINANCIAL_RUNTIME_DATABASE_URL` til den brukeren. `npm run financials:verify-runtime-principal` gjør det samme i en engangsdatabase og beviser at tilkoblingen leser de versjonerte finans- og company-map-live-viewene og blir nektet hver kildetabell, hver simuleringstabell, de publiserte kart-snapshotene, revisjonsloggen og enhver skriving.

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
npm run financials:verify-runtime-principal
npm run fi-sim:generate -- --dry-run --limit 50 --years 5 --report tmp/dryrun.md
npm run fi-sim:generate -- --limit 50 --years 5 --dataset-version <versjon>
npm run fi-sim:map -- --dataset <versjon> --report tmp/mapping.md
npm run fi-sim:activation -- --action status
npm run fi-sim:activation -- --action activate --dataset <versjon> --actor <bruker> --reason "<hvorfor>"
npm run fi-sim:activation -- --action rollback --actor <bruker> --reason "<hvorfor>"
npm run fi-sim:activation -- --action deactivate --actor <bruker> --reason "<hvorfor>"
npm run fi-sim:rehearse-teardown
```

`fi-sim:rehearse-teardown` nekter å kjøre mot annet enn en database som heter `gl_511_rehearsal_*`.

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

**Bevis (10. august 2026)**

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
| Runtime-rollen ser ingen kildetabell | `verify-fi-sim-foundation.ts` sjekker `has_table_privilege`. `verify-financial-runtime-principal.ts` går lenger og *kobler til* som et medlem av rollen: en rettighetssjekk som aldri åpner en sesjon kan ikke skille en riktig begrenset rolle fra en rolle ingen bruker. | Innfridd i kode og bevist på tilkoblingsnivå; gjenstår å provisjonere rollen per miljø |
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

**Bevis (9. august 2026)**

| Port | Hvor den holdes | Status |
|---|---|---|
| Begge modi dekket | `financial-time-series-table.test.ts` (banner og markering, med og uten simulering), `raw-financials-reader.test.ts` (uttrekk i begge modi), `estimate-group-financials.test.ts` og `build-mna-pro-forma.test.ts` (Njord i begge modi), `watchlist-financials-service.test.ts`, `dd-financial-evidence-reader.test.ts`, `distress-repository.test.ts`. | Innfridd for tabell, uttrekk og Njord |
| Markering ikke bare farge | Markøren er en tekstforkortelse med `sr-only`-setning bak og `data-value-origin="synthetic"`. Testen sjekker teksten, ikke klassenavnet. | Innfridd |
| Ingen nedgradert proveniens | `raw-financials-reader.test.ts` går gjennom hver syntetiske linje og krever FI-SIM-kilde, ingen `reportedFinancialLineItemId`, ingen sidereferanse, ingen publiseringsdato og en `simulated:`-datasettversjon. | Innfridd |

**Fullført 10. august:** grafer og nøkkeltall viderefører datasettversjon og viser egen visuell markering. Selskapsoversikt, dashboard, overvåkning, regnskap og nøkkeltall bruker den samme sentraliserte ordlyden og SIM-markøren; nettleserprøven verifiserer at grafkilden ikke feilaktig oppgis som BRREG i simulert modus.

**Merk om verifisering i nettleser:** regnskapsfanen ligger bak innlogging, så rendringen er verifisert med komponenttester og en 200-respons fra dev-serveren uten server- eller konsollfeil, ikke ved å se på fanen.

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

**Bevis (9. august 2026)**

| Port | Hvor den holdes | Status |
|---|---|---|
| Ingen material residual aktivert | Rapporten for det aktive datasettet: 3 281 avrundingsdifferanser, **0** ufordelte til manuell kontroll. 18 perioder med `MANUAL_REVIEW` ble ikke skrevet og står i manifestet. | Innfridd |
| Alle selskaper validert eller listet | 9 004 selskaper har perioder; 1 839 har ingen publiserbar periode. Hver avvisning har kode og årsak i rapporten og manifestet. | Innfridd |
| Alle statements og linjer merket | Kontraktstestene i F9 og nettleserprøven viser banner, datasettversjon og SIM-markører på regnskap, nøkkeltall, dashboard og grafer. Rapporterte ankerceller er uten SIM-merke. | Innfridd |
| Aktivering, versjonsbytte og rollback | `verify-fi-sim-foundation.ts`: to genererte datasett aktiveres etter hverandre, rulles tilbake til det første og skrus av — fire distinkte datasettversjoner, revidert i rekkefølge, og produktet ender tilbake på rapporterte tall. | Innfridd, øvd i engangsdatabase |

**Tørrkjøringen fant tre reelle feil i generatoren**, som alle er rettet: en oppdiktet selskapskapital ved siden av rapportert egenkapital og rapportert opptjent resultat (som fikk to konsistente tall til å se motstridende ut), en rapportert deltotal uten noen tillatt linje å sitte på, og bare ett residual per statement når ekte regnskaper er rundet i to poster samtidig.

**Brukerreiser gjennomført:** registrering/onboarding, dashboard, selskapssøk, selskapsoversikt, regnskap og nøkkeltall er kjørt gjennom den aktive LIVE-lesestien i en ekte nettleser uten konsollfeil.

**Merk om selskapsmengden:** datasettet forsøker hele den lokale selskapsbasen på 10 843 selskaper. 9 004 har minst én publiserbar periode. Et aktivert datasett endres fortsatt aldri; nye kilder eller selskaper krever en ny datasetversjon.

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

**Bevis (9. august 2026)**

| Port | Hvor den holdes | Status |
|---|---|---|
| Kjører uten simuleringstabeller | `rehearse-gl-511-teardown.ts` slipper 20 databaseobjekter og krever deretter identisk svar fra fire repository-metoder. | Innfridd for databasen |
| Kjører uten `FI-SIM`-filer | `fi-sim-teardown-surface.test.ts`: ingen fil utenfor `server/financials/fi-sim/` importerer derfra bortsett fra fem jobber, og ingen kjøretidsfil rører en simulert Prisma-modell utenom `mapping-store.ts`. | **Bevist ved inventar, ikke ved å slette** |
| Ingen referanse til en simulert datasettversjon | 14 versjonskolonner funnet gjennom `information_schema` og sjekket. Skriptet feiler også hvis det finner null kolonner, slik at sjekken ikke kan bli tom i det stille. | Innfridd |
| Samme output, ærlig tomtilstand | Byte-sammenligning før og etter, med et selskap uten tall med i øvingen. | Innfridd |

**Øvingen fant en fallgruve som bare en øving finner:** når et view redefineres, svarer Postgres neste spørring på samme tilkobling med `cached plan must not change result type` i stedet for å planlegge på nytt. Under en kjørende applikasjon ser fjerningen ut som om den ødela produktet. Applikasjonen må restartes etter migrasjonen; det er steg 8 i sjekklisten.

**Teardown-SQL-en ligger bevisst utenfor `prisma/migrations/`.** En forberedt migrasjon som lå i kjeden ville sluppet simuleringstabellene neste gang noen kjørte `migrate deploy` — det motsatte av en øving.

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
