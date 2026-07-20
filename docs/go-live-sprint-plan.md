# Fjord Insight – slagplan for beta og go-live

**Status:** Aktiv arbeidsplan

**Nåværende fase:** Sprint 0 startet 20. juli 2026. Se [Sprint 0-kontrollsenteret](./go-live/README.md).

**Opprettet:** 20. juli 2026

**Planansvarlig:** CEO / produkteier

**Teknisk ansvarlig:** Avklares

**Måldato for lukket beta:** 31. august 2026, dersom lanseringskriteriene er oppfylt

## 1. Formål

Planen fører Fjord Insight fra dagens løsning til en liten, kontrollert beta som er tilgjengelig hele døgnet. Vi gjør først alt arbeid som ikke medfører nye eksterne kostnader. Betalte tjenester aktiveres først etter en eksplisitt budsjettbeslutning.

Betaen skal gi 10–20 inviterte brukere en reell selskapsopplevelse med offisielle data og Njord som et viktig verdiforslag. Datoen er et mål, ikke en grunn til å lansere en løsning som ikke er trygg eller stabil.

## 2. Besluttede premisser

- Njord skal være med i beta og bruke en reell språkmodell. En regelbasert demonstrasjon alene er ikke tilstrekkelig.
- Njord skal svare med kontrollerte verktøy og data Fjord Insight faktisk har hentet. Den skal ikke dikte opp selskaper, personer eller regnskapstall.
- OCR tas ut av den produksjonskritiske dataflyten. Regnskap skal hentes som strukturerte data fra Brønnøysundregistrene (Brreg).
- Åpent Brreg-API brukes som standard så langt det gir tilstrekkelige data. Et betalt abonnement på komplette årsregnskap er en separat investeringsbeslutning.
- Produksjon skal ikke være avhengig av en Raspberry Pi eller utstyr på et privat nettverk. Slikt utstyr kan brukes til utvikling, men ikke som et kritisk ledd i en tjeneste som skal være tilgjengelig 24/7.
- Ingen mockdata, seed-data eller syntetiske selskapsdata skal brukes.

## 3. Kostnadsnivåer og fullmakter

| Nivå | Betydning | Beslutning |
| --- | --- | --- |
| K0 | Ingen nye eksterne kostnader. Arbeid utføres lokalt med eksisterende verktøy og åpne datakilder. | Kan startes nå. |
| K1 | Begrenset betakostnad for skydrift og AI. Foreløpig ramme: USD 35–60 per måned for drift og normalt USD 25, maksimalt USD 50 per måned for AI. | Krever godkjenning i port G1. |
| K2 | Betalt Brreg-leveranse av komplette årsregnskapsdata. Sist kjente listepris må verifiseres før kjøp; arbeidsestimat NOK 480 000 per år. | Separat CEO-/styrebeslutning. Skal ikke forsinke K0. |

Alle beløp skal verifiseres mot gjeldende leverandørpriser før bestilling. Ingen skal kunne utløse K1 eller K2 som en teknisk detalj uten uttrykkelig godkjenning.

## 4. Sprintoversikt

| Sprint | Periode | Kostnad | Forretningsresultat |
| --- | --- | --- | --- |
| Sprint 0 | 20.–26. juli | K0 | Omfang, ansvar og beslutninger er låst. |
| Sprint 1 | 27. juli–2. august | K0 | Minimum sikkerhet og en repeterbar releaseprosess. |
| Sprint 2 | 3.–9. august | K0 | Strukturert Brreg-data erstatter OCR i produksjonsplanen. |
| Sprint 3 | 10.–16. august | K0 | Njord er teknisk og økonomisk klargjort for ekte AI. |
| Port G1 | 16. august | Beslutning | CEO godkjenner eller avviser første eksterne kostnader. |
| Sprint 4 | 17.–23. august | K1 ved godkjenning | Staging og produksjon aktiveres; Njord testes med ekte modell. |
| Sprint 5 | 24.–30. august | K1 ved godkjenning | Lanseringsøvelse, feiltester og endelig go/no-go. |
| Lukket beta | 31. august | K1 | 10–20 inviterte brukere får tilgang dersom port G2 er bestått. |

## 5. Sprint 0 – lås omfang og styring

**Mål:** Alle skal vite hva betaen er, hva den ikke er, hvem som bestemmer og hvordan fremdrift måles.

| ID | Leveranse | Eier | Ferdig når |
| --- | --- | --- | --- |
| GL-001 | Bekreft betamål og 10–20 målbrukere. | CEO | Målgruppe og rekrutteringsansvarlig er dokumentert. |
| GL-002 | Lås funksjonsomfanget. | Produkt | Søk, profil, roller, tilgjengelig regnskap, innlogging, feature gating og Njord er enten med eller tydelig utsatt. |
| GL-003 | Utpek teknisk eier og lanseringsmyndighet. | CEO | Navn er ført inn i planen. |
| GL-004 | Opprett risikologg. | Produkt/teknisk | Hver risiko har eier, sannsynlighet, konsekvens og tiltak. |
| GL-005 | Lag datakildekart. | Teknisk | Hvert felt er koblet til Brreg, SSB eller Finanstilsynet og har sporbarhetskrav. |
| GL-006 | Definer beta-KPI-er. | CEO/produkt | Aktivitet, nytte, datakvalitet, Njord-kvalitet, oppetid og kostnad kan måles. |
| GL-007 | Avklar personvern og datalagring. | CEO | Behandlingsgrunnlag, lagringstid og kontaktpunkt er dokumentert. |
| GL-008 | Lag kostnadsregister. | CEO/teknisk | Leverandører, frinivåer, variabel pris og kostnadstak er synlige. |
| GL-009 | Bekreft at OCR ikke er produksjonsavhengighet. | Teknisk | Arkitektur og backlog viser strukturert Brreg-data som hovedløp. |

**Godkjenningskriterium:** Ingen kritisk beslutning kan skyves videre uten navngitt eier og dato.

### Sprint 0-status

Sprinten er startet på K0-nivå. Charter og styringsregistre er opprettet, men sprinten er ikke godkjent: personnavn, formelle beslutninger, personverngrunnlag og bevis for et OCR-uavhengig betaforløp mangler fortsatt. Løpende status og bevis føres i [Sprint 0-kontrollsenteret](./go-live/README.md).

## 6. Sprint 1 – sikkerhet og release uten nye kostnader

**Mål:** Redusere sannsynligheten for datalekkasjer og mislykkede deployer før vi kjøper drift.

| ID | Leveranse | Ferdig når |
| --- | --- | --- |
| GL-101 | Hemmeligheter og nøkler | Ingen hemmeligheter ligger i Git; nødvendige miljøvariabler er dokumentert. |
| GL-102 | Avhengighetskontroll | Kritiske sårbarheter er lukket eller har godkjent risikovurdering. |
| GL-103 | Tilgangskontroll | Ikke-offentlige ruter krever innlogging; administratorfunksjoner er beskyttet. |
| GL-104 | Inputvalidering | Søk, organisasjonsnummer, URL-parametere og API-kall valideres. |
| GL-105 | Misbruksvern | Rate limiting finnes på innlogging, søk og Njord-endepunkter. |
| GL-106 | Nettlesersikkerhet | HTTPS-forutsetning, sikre cookies, CSP og sikkerhetshoder er konfigurert. |
| GL-107 | Databaseendringer | Produksjon bruker migrasjoner, ikke utviklerkommandoer som overskriver skjema. |
| GL-108 | Releaseoppskrift | Bygg, test, migrering, deploy, kontroll og rollback er dokumentert trinn for trinn. |
| GL-109 | Automatiske porter | Typekontroll, tester og produksjonsbygg må passere før release. |

**Godkjenningskriterium:** En annen utvikler kan følge releaseoppskriften uten muntlige spesialinstruksjoner.

## 7. Sprint 2 – strukturert Brreg-data, uten OCR

**Mål:** Bevise at betaen kan levere regnskapsinformasjon fra en offisiell, strukturert kilde og være ærlig om det som mangler.

| ID | Leveranse | Ferdig når |
| --- | --- | --- |
| GL-201 | `BrregFinancialsProvider`-kontrakt | Frontend og domenelag er skjermet fra rå Brreg-respons. |
| GL-202 | Åpent Brreg-API | Reelle tilgjengelige regnskapsdata kan hentes for et gyldig organisasjonsnummer. |
| GL-203 | Normalisering | Eksterne felt mappes til en intern, versjonert modell med tydelige enheter og perioder. |
| GL-204 | Sporbarhet | Alle poster har `sourceSystem`, `sourceEntityType`, `sourceId`, `fetchedAt` og `normalizedAt`. |
| GL-205 | Cache og oppdatering | Gjentatte hentinger er kontrollerte, idempotente og belaster ikke kilden unødig. |
| GL-206 | Tomtilstand | Selskaper uten tilgjengelig regnskap viser «ikke tilgjengelig», aldri konstruerte tall. |
| GL-207 | Feilhåndtering | Nedetid og endret Brreg-respons gir kontrollert feil og logging. |
| GL-208 | Integrasjonstester | Kontrakt, mapping, tomtilstand og feiltilstand er testet. |
| GL-209 | OCR-frakobling | Ingen betafunksjon eller deploy er avhengig av OCR eller PDF-tolkning. |
| GL-210 | Datadekningsrapport | CEO får en enkel oversikt over hvilke regnskapsfelt åpen kilde faktisk dekker. |

**Godkjenningskriterium:** En bruker kan se reelle nøkkeltall med kilde og dato, eller en ærlig tomtilstand.

## 8. Sprint 3 – klargjør Njord uten å kjøpe modellbruk

**Mål:** Bygge kontrollmekanismene før en betalt modellnøkkel aktiveres.

| ID | Leveranse | Ferdig når |
| --- | --- | --- |
| GL-301 | Modelladapter | Modellleverandør kan byttes uten å skrive om produktlogikken. |
| GL-302 | Godkjente verktøy | Njord kan bare hente data gjennom definerte interne tjenester. |
| GL-303 | Kildegrunnlag | Svar skiller mellom dokumentert fakta, beregning og forklaring. |
| GL-304 | Anti-hallusinasjon | Manglende data gir «vet ikke / ikke tilgjengelig», ikke gjetning. |
| GL-305 | Sikker systeminstruks | Njord avviser forsøk på å hente hemmeligheter eller omgå tilgangskontroll. |
| GL-306 | Bruksgrenser | Grense per bruker, dag og forespørsel er klar før modellen slås på. |
| GL-307 | Kostnadskontroll | Tokens, anslått kostnad, responstid og feil kan måles; hard månedsgrense er definert. |
| GL-308 | Evalueringssett | Minst 50 representative spørsmål med forventede fakta, avslag og tomtilstander er lagret. |
| GL-309 | Evaluering | Faktastøtte, kildebruk, sikkerhet og svarformat kan sammenlignes mellom modeller. |
| GL-310 | Brukerfeedback | Betabrukeren kan markere svar som nyttig eller feil. |
| GL-311 | Kontrollert fallback | Modellfeil tar ikke ned selskapsopplevelsen; Njord viser en ærlig feilmelding. |

**Godkjenningskriterium:** Njord kan kobles til en ekte modell uten ukontrollert tilgang til data eller budsjett.

## 9. Port G1 – godkjenning av første betalte kostnader

Porten gjennomføres 16. august. Hvis den ikke godkjennes, fortsetter K0-forbedringer, men produksjon og ekte modellbruk aktiveres ikke.

CEO skal få:

1. Resultater fra sprint 0–3 og åpne kritiske risikoer.
2. Konkret månedsbudsjett for hosting, database, lagring, overvåking, e-post og AI.
3. Sammenligning av minst to driftsalternativer, inkludert AWS dersom det er økonomisk rasjonelt.
4. Estimert kostnad per aktiv betabruker og per Njord-samtale.
5. Datadekning fra åpent Brreg-API og gapet til betalt leveranse.
6. Anbefaling om domene, databehandleravtaler og personvernbehov.

**Beslutninger:** Godkjenn K1-ramme, velg hosting, velg språkmodell og fastsett hard kostnadsgrense. K2 behandles separat.

## 10. Sprint 4 – aktiver staging, produksjon og ekte Njord

**Forutsetning:** Port G1 er godkjent.

| ID | Leveranse | Ferdig når |
| --- | --- | --- |
| GL-401 | Isolerte miljøer | Utvikling, staging og produksjon har separate data og hemmeligheter. |
| GL-402 | Drift 24/7 | Plattformen har helsecheck, automatisk restart, TLS og dokumentert ansvar. |
| GL-403 | Produksjonsdatabase | Sikkerhetskopi, kryptering og gjenoppretting er konfigurert. |
| GL-404 | Overvåking | Oppetid, feilrate, responstid og kostnad varsler navngitt ansvarlig. |
| GL-405 | Ekte Njord | Modellen er aktiv i staging med bruksgrenser og minimale datatilganger. |
| GL-406 | Modell-evaluering | Evalueringssettet består avtalte terskler før produksjon. |
| GL-407 | Ende-til-ende-test | Innlogging, søk, profil, roller, regnskap, gating og Njord fungerer i staging. |
| GL-408 | Backupøvelse | En databasekopi er faktisk gjenopprettet og kontrollert. |
| GL-409 | Kostnadsvarsler | Varsel ved 50, 75 og 90 prosent av månedstaket er testet. |
| GL-410 | K2-isolasjon | Betalt Brreg-integrasjon aktiveres bare ved egen godkjenning. |

## 11. Sprint 5 – lanseringsøvelse og go/no-go

| ID | Leveranse | Ferdig når |
| --- | --- | --- |
| GL-501 | Funksjonsfrys | Bare feilrettinger som er nødvendige for beta tas inn. |
| GL-502 | Juridiske flater | Personvern, vilkår, datakilder og AI-forbehold er synlige. |
| GL-503 | Lasttest | Forventet betatrafikk og avtalt topp tåles innen kostnadsrammen. |
| GL-504 | Feiløvelser | Brreg-, modell-, database- og innloggingsfeil gir kontrollert oppførsel. |
| GL-505 | Deployøvelse | Teamet gjennomfører full release til staging etter oppskriften. |
| GL-506 | Rollbackøvelse | Forrige fungerende versjon kan gjenopprettes innen avtalt tid. |
| GL-507 | Hendelsesplan | Kontaktliste, alvorlighetsgrader, kommunikasjonsmal og ansvar er dokumentert. |
| GL-508 | Betastøtte | Én kanal og én ansvarlig for tilbakemeldinger er etablert. |
| GL-509 | Invitasjoner | Bare godkjente brukere får tilgang; invitasjon kan trekkes tilbake. |
| GL-510 | Go/no-go-møte | Hvert kriterium i G2 har eier, bevis og status. |

## 12. Port G2 – absolutte lanseringskriterier

Beta kan åpnes bare når alle punktene er grønne eller har skriftlig risikoaksept fra CEO:

- Ingen kjente kritiske sikkerhetsfeil.
- Innlogging og feature gating kan ikke omgås i testene.
- Ingen mockdata eller konstruerte regnskapstall vises.
- Selskapsdata og regnskap har kilde og hentetidspunkt.
- Njord består kvalitets- og sikkerhetstester og kan slås av uten å ta ned resten av produktet.
- AI- og driftskostnader har fungerende grenser og varsler.
- Backup er gjenopprettet i en øvelse.
- Overvåking og hendelsesansvar er aktivt.
- Personverninformasjon, vilkår og supportkanal er publisert.
- Release- og rollbackøvelse er fullført.

Hvis ett absolutt kriterium ikke er oppfylt, flyttes lanseringen. Datoen er underordnet tillit, datasikkerhet og økonomisk kontroll.

## 13. Første fire uker etter betaåpning

Rapporteres ukentlig:

- Inviterte, aktiverte og ukentlig aktive brukere.
- Brukere som gjennomfører søk, åpner profil og bruker Njord.
- Andel Njord-svar merket nyttig, feil eller uten tilstrekkelig data.
- Datafeil fordelt på kilde og alvorlighetsgrad.
- Oppetid, feilrate og alvorlige hendelser.
- Faktisk hostingkostnad, AI-kostnad og kostnad per aktiv bruker.
- Etterspurte data som ikke dekkes av åpen Brreg-kilde.

Etter fire uker besluttes om betaen skal utvides, om Njord-budsjettet skal endres, og om datagapet forsvarer investering i komplett Brreg-leveranse.

## 14. Åpne beslutningskort

### D1 – Åpent eller betalt Brreg-grunnlag

- **Standard:** Start med åpent API.
- **Trigger for K2:** Dokumentert kundebehov og betalingsvilje for data som åpen kilde ikke dekker.
- **Eier:** CEO.
- **Frist:** Etter datadekningsrapporten, uten å blokkere K0.

### D2 – Driftsplattform

- **Valg:** AWS eller et enklere administrert alternativ.
- **Kriterier:** Total månedskostnad, driftsarbeid, sikkerhet, backup, skalering og flyttbarhet.
- **Standard:** Velg laveste totale kostnad for en liten beta, ikke laveste listepris på én server.
- **Eier:** CEO og teknisk ansvarlig.
- **Frist:** Port G1.

### D3 – Njord-modell og budsjett

- **Kriterier:** Faktakvalitet, norsk språk, verktøystøtte, responstid, personvern og kostnad per samtale.
- **Eier:** Produkt og teknisk ansvarlig; budsjett godkjennes av CEO.
- **Frist:** Port G1.

### D4 – Betagruppe

- **Kriterier:** Reelt problembehov, vilje til å gi strukturert feedback og lav regulatorisk risiko.
- **Eier:** CEO / salg.
- **Frist:** Før sprint 5.

## 15. Prioritering og endringskontroll

Arbeidet prioriteres slik:

1. Sikkerhet, datakorrekthet og kostnadskontroll.
2. Kritisk brukerreise: innlogging → søk → profil → innsikt → Njord.
3. Drift, overvåking og gjenoppretting.
4. Forbedringer som øker læring fra betaen.
5. Kosmetikk og funksjoner som ikke påvirker lanseringskriteriene.

Nye ønsker legges ikke direkte inn i en aktiv sprint. De registreres og tas inn bare hvis de erstatter arbeid med lavere verdi eller håndterer en kritisk risiko.

## 16. Relaterte dokumenter

- [Overordnet plan](../PLAN.md)
- [Arbeidsplaner og konvensjoner](../PLANS.md)
- [Datakilder](./DATA_SOURCES.md)
- [Regnskapsuttrekk](./ANNUAL_REPORT_EXTRACTION.md)
