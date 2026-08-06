# ADR-0002: Isoler simulerte regnskap bak én live-leseflate

**Status:** Akseptert

**Dato:** 5. august 2026

**Forfatter og godkjenner:** Simen Lippestad (CEO)

## Kontekst

Fjord Insight skal demonstreres for investorer før dekningen av rapporterte regnskap er tilstrekkelig til å vise den tiltenkte produktopplevelsen for alle relevante selskaper. Investor-demoen trenger derfor simulerte resultatregnskap og balanser. Der rapporterte verdier finnes, skal de forbli immutable ankere som den simulerte detaljeringen bygges rundt.

Dette er et tidsavgrenset unntak fra prosjektets normale forbud mot syntetiske selskapsdata. Brønnøysundregistrene forblir source of truth, og simuleringen må ikke kunne forurense rapporterte data eller overleve ubemerket når produktet går over til bare reelle regnskap.

Finansdata brukes av flere konsumenter enn selskapsprofilen: API-er, grafer, metrics, filtre, rangeringer, eksporter, bakgrunnsjobber og Njord. Hvis hver konsument velger datakilde selv, kan de vise ulike datasett eller beholde syntetiske resultater etter et kildeskifte. Systemet trenger derfor én autoritativ leseflate og et atomisk, versjonert skifte mellom datasett.

## Beslutning

Fjord Insight skal ha to isolerte persistenslag og én stabil live-leseflate:

1. Rapporterte statements og linjer lagres i egne source-of-truth-tabeller.
2. Simulerte statements og linjebindinger lagres i egne tabeller. Simuleringslaget kan referere til rapporterte ankere, men rapporterte tabeller skal aldri referere til simuleringslaget. Et rapportert anker refereres og løses av Live Table; verdien dupliseres ikke som en uavhengig kopi i simuleringslaget.
3. En versjonert database-view, omtalt som Live Table, er eneste leseflate for finansielle statements og linjer i produktet. Live Table er ikke en konvensjonell tabell som tømmes og fylles på nytt.
4. En atomisk dataset-peker velger aktivt, immutable dataset og har minst modus, datasetversjon, aktiveringstid og aktør. Skiftet mellom simulert og rapportert datasett skjer ved å bytte pekeren i én transaksjon.
5. Alle produktkonsumenter bruker ett `FinancialsRepository` mot Live Table. Direkte lesing fra rapporterte eller simulerte kildetabeller er forbudt i runtime-kode.
6. Runtime-databaserollen får lesetilgang til Live Table, men ikke direkte lesetilgang til kildetabellene. Ingest-, simulerings- og migrasjonsjobber får separate, minste nødvendige rettigheter.
7. Hver finanslinje bærer `valueOrigin` som minst skiller `reported` og `synthetic`. Statementet bærer `reported`, `hybrid` eller `simulated`. Merking følger dataene gjennom UI og eksport.
8. Cache, beregninger, søkeindekser, analyser, eksporter og bakgrunnsjobber som avhenger av finansdata bærer `financialDatasetVersion`. Et resultat kan bare publiseres eller gjenbrukes når versjonen er aktiv.
9. Simuleringen er deterministisk og versjonert. Rapporterte ankere endres aldri. Inkonsistente eller overbestemte ankere gir en eksplisitt residual eller kontrollert feil.
10. Før lukket beta eller produksjon erstattes Live Table med en rapportert-only definisjon. Deretter verifiseres null syntetiske records i aktive leseflater, avhengigheter og cache fjernes, simuleringstabellene droppes gjennom migrasjon, og rapporterte regnskap regresjonstestes uavhengig.

Det detaljerte skjemaet, kontraktene, switching-protokollen og testkravene beskrives i [teknisk design for investor-demoens simulerte regnskap](../financials/simulated-financials-investor-demo-design.md).

## Konsekvenser

### Positive

- Grafer, metrics, rangeringer og Njord kan demonstrere hele produktflyten med samme aktive datasett.
- Ett atomisk kildeskifte reduserer risikoen for at ulike konsumenter viser forskjellige datasett.
- Rapporterte data forblir fysisk og logisk isolert fra simuleringen.
- Datasetversjon gjør cachede og asynkrone resultater sporbare og mulig å invalidere sikkert.
- Simuleringslaget kan fjernes uten å endre produktets permanente lesekontrakt.

### Negative

- Live-view, dataset-peker, separate databaseroller og versjonering gir mer kompleksitet enn direkte tabellspørringer.
- Alle eksisterende finansielle konsumenter må kartlegges og flyttes til samme repository.
- Datasetbytte krever koordinert cache-, indeks- og jobbinvalidering.
- Database-view kan kreve særskilt mapping dersom ORM-verktøyet ikke støtter viewet som en vanlig read model.

### Nøytrale

- Investor-demoen kan vise syntetiske verdier i grafer og beregninger; disse er forventet funksjonalitet så lenge dataset- og opprinnelsesmerking følger resultatet.
- Når simuleringen fjernes, vil selskaper uten tilstrekkelig rapportert regnskap vise en ærlig tomtilstand.
- En materialisert, immutable snapshot-projeksjon kan senere erstatte viewet dersom dokumentert ytelsesbehov krever det, men den må fortsatt velges gjennom en atomisk dataset-peker.

## Alternativer som er vurdert

### En konvensjonell Live Table som tømmes og fylles fra valgt kildetabell

Avvist fordi kopierte records kan bli utdaterte, et bytte kan eksponere tomme eller blandede data, og syntetiske records kan bli liggende igjen etter at kildetabellen er slettet. Hvis en fysisk read model senere blir nødvendig, skal immutable snapshot-versjoner bygges ferdig før pekeren byttes atomisk.

### La hver konsument velge mellom rapportert og simulert tabell

Avvist fordi API-er, grafer, metrics, eksporter og Njord da kan velge ulik kilde eller implementere fallback forskjellig. Det gjør et sikkert go-live-skifte vanskelig å bevise.

### Lagre rapporterte og simulerte linjer i samme tabell med en kildekolonne

Avvist fordi det svekker den fysiske isolasjonen, gjør sletting av hele simuleringslaget vanskeligere og øker risikoen for at en manglende filterbetingelse viser syntetiske records som rapporterte.

### Route datakilden bare i applikasjonskode

Avvist som eneste kontroll fordi rå SQL, nye verktøy eller fremtidige tjenester kan omgå rutingen. Repository-grensen beholdes, men støttes av database-view og databaseprivilegier.

## Referanser

- [Go-live-plan og GL-511](../go-live-sprint-plan.md)
- [Teknisk design for investor-demoens simulerte regnskap](../financials/simulated-financials-investor-demo-design.md)
- [FI-SIM-2026.1: normativ spesifikasjon](../financials/fi-sim-2026.1-spec.md)
- [Implementasjonsplan for det isolerte FI-SIM-datasettet](../financials/fi-sim-implementation-plan.md)
- [ADR-0001: Njord velger dynamisk blant alle autoriserte datadomener](./ADR-0001-njord-dynamic-authorized-data-access.md)
