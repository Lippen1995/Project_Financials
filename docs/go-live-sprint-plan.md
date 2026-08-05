# Fjord Insight – slagplan for beta og go-live

**Status:** Aktiv arbeidsplan

**Nåværende fase:** Sprint 0 ble formelt godkjent 24. juli 2026. Sprint 1 og Sprint 2 ble formelt godkjent av CEO 27. juli 2026. Sprint 3 er teknisk fullført på K0, men er fortsatt formelt åpen inntil CEO har behandlet [closeout review](./go-live/sprint-3/closeout-review.md). Host-, modell- og kostnadsbeslutninger forblir i G1. Se [Sprint 1-signeringen](./go-live/sprint-1/closeout-review.md) og [Sprint 2-signeringen](./go-live/sprint-2/closeout-review.md).

**Opprettet:** 20. juli 2026

**Planansvarlig:** Simen Lippestad (CEO / produkteier)

**Teknisk ansvarlig:** Simen Lippestad (CEO)

**Måldato for lukket beta:** 30. september 2026, dersom lanseringskriteriene er oppfylt

**Kapasitetsbaseline:** 70 effektive utviklingstimer per uke i minst to koordinerte arbeidsstrømmer. CEO reviderer datoen dersom kapasiteten er under 60 effektive timer i to sammenhengende uker.

## 1. Formål

Planen fører Fjord Insight fra dagens løsning til en liten, kontrollert beta som er tilgjengelig hele døgnet. Vi gjør først alt arbeid som ikke medfører nye eksterne kostnader. Betalte tjenester aktiveres først etter en eksplisitt budsjettbeslutning.

Betaen skal gi 10–20 inviterte profesjonelle brukere minst tre komplette, formålsbaserte analysearbeidsflyter med offisielle data og Njord som integrert digital analytiker. Den skal teste om produktet reduserer tid, kompleksitet og manuelt arbeid og gir et bedre dokumentert resultat enn brukerens eksisterende metode. [Produktposisjoneringen](./go-live/product-positioning.md) er styrende. Datoen er et mål, ikke en grunn til å lansere en utrygg, ustabil eller produktmessig misvisende beta.

## 2. Besluttede premisser

- Njord er en kjernekomponent i betaen og skal bruke en reell språkmodell. En regelbasert demonstrasjon eller løs chatflate alene er ikke tilstrekkelig.
- Njord skal svare med kontrollerte verktøy og data Fjord Insight faktisk har hentet. Den skal ikke dikte opp selskaper, personer eller regnskapstall.
- Betaen skal minst dekke M&A-screening, kunde-/leverandørsourcing og konkurrent-/bransjeanalyse fra formål til lagret resultat.
- Søk og selskapsprofil er nødvendige byggeklosser, men er ikke alene en validering av verdiforslaget.
- Historikk, eierskap, konsern, person-, dokument- og markedsdata tas bare i bruk når reell kilde, datakontrakt, proveniens, dekning og mangelhåndtering er dokumentert.
- OCR tas ut av den produksjonskritiske dataflyten. Regnskap skal hentes som strukturerte data fra Brønnøysundregistrene (Brreg).
- Brukerforespørsler skal ikke kalle eksterne API-er. API-kall populerer databasen i bakgrunnsjobber, og applikasjonen leser databasen. Manglende data legges i kø og vises som ærlig «ikke lastet», aldri som en blokkerende henting i forespørselsveien.
- Alle modellkall skal gå gjennom den felles modelladapteren med sikker systeminstruks, injeksjonsinspeksjon, eksplisitt budsjett og forbruksregistrering. Et modellkall utenfor adapteren er en avvikssak, ikke en implementasjonsdetalj.
- Åpent Brreg-API brukes som standard så langt det gir tilstrekkelige data. Et betalt abonnement på komplette årsregnskap er en separat investeringsbeslutning.
- Produksjon skal ikke være avhengig av en Raspberry Pi eller utstyr på et privat nettverk. Slikt utstyr kan brukes til utvikling, men ikke som et kritisk ledd i en tjeneste som skal være tilgjengelig 24/7.
- Ingen mockdata, seed-data eller syntetiske selskapsdata skal brukes.

## 3. Kostnadsnivåer og fullmakter

| Nivå | Betydning | Beslutning |
| --- | --- | --- |
| K0 | Ingen nye eksterne kostnader. Arbeid utføres lokalt med eksisterende verktøy og åpne datakilder. | Kan startes nå. |
| K1 | Begrenset betakostnad, maksimalt NOK 5 000 eks. mva. per måned: AI NOK 2 500, drift/database NOK 2 000 og e-post/overvåking NOK 500. | Rammen er godkjent 24. juli; leverandører og aktivering krever ny godkjenning i port G1. |
| K2 | Betalt Brreg-leveranse av komplette årsregnskapsdata. Sist kjente listepris må verifiseres før kjøp; arbeidsestimat NOK 480 000 per år. | Separat CEO-/styrebeslutning. Skal ikke forsinke K0. |

Alle beløp skal verifiseres mot gjeldende leverandørpriser før bestilling. Ingen skal kunne utløse K1 eller K2 som en teknisk detalj uten uttrykkelig godkjenning.

## 4. Sprintoversikt

| Sprint | Periode | Kostnad | Forretningsresultat |
| --- | --- | --- | --- |
| Sprint 0 | 20.–26. juli | K0 | Produktposisjon, arbeidsflyter, datakrav, ansvar og revidert leveranseplan er låst. |
| Sprint 1 | 24. juli–9. august | K0 | Minimum sikkerhet, analysefundament og en repeterbar releaseprosess. |
| Sprint 2 | 10.–23. august | K0 | Strukturert Brreg-data, datakatalog, universspørring og proveniensgrunnlag erstatter OCR-avhengighet. |
| Sprint 3 | 24. august–6. september | K0 | Analyseobjekt, beregning, arbeidslister, verktøykontrakter og Njord-kontroller klargjør de tre arbeidsflytene. |
| Port G1 | 6. september | Beslutning | CEO godkjenner eller avviser første eksterne kostnader. |
| Sprint 4 | 7.–20. september | K1 ved godkjenning | De tre arbeidsflytene og ekte Njord testes ende-til-ende i staging. |
| Sprint 5 | 21.–29. september | K1 ved godkjenning | Evaluering, bruksmålsøvelse, feiltester, OCR-bevis og endelig go/no-go. |
| Lukket beta | 30. september | K1 | 12 primærbrukere og eventuelle reserver får tilgang dersom port G2 er bestått. |

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
| GL-010 | Lås produktposisjon og kritisk brukerreise. | CEO/produkt | [Produktposisjoneringen](./go-live/product-positioning.md) og revidert beta-charter er formelt godkjent. |
| GL-011 | Kartlegg arbeidsflyt mot data og eksisterende kode. | Produkt/teknisk/data | Hvert steg i de tre arbeidsflytene har støttet data, gap, eier, estimat og ærlig betaadferd. |
| GL-012 | Rebaseliner dato og sprintomfang. | Lanseringsmyndighet | Måldatoen er bekreftet eller flyttet etter gjennomførbarhetsvurdering; omfanget reduseres ikke til et oppslag for å beholde datoen. |

**Godkjenningskriterium:** Ingen kritisk beslutning kan skyves videre uten navngitt eier og dato.

### Sprint 0-status

Sprint 0 ble formelt godkjent av Simen Lippestad (CEO) 24. juli 2026. Produktretning, roller, kohort, arbeidsflyt-/datagapanalyse, måldato, personvernramme, KPI-metode, risikostyring, kostnadsramme og OCR-uavhengig offentlig betaflate er lukket som beslutninger, planleggingsgrunnlag eller Sprint 0-bevis. Implementasjon og senere bevis følges i Sprint 1–5 samt G1/G2. Se [kontrollsenteret](./go-live/README.md) og [signeringen](./go-live/sprint-0-signoff.md).

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

### Sprint 1-status

Sprint 1 ble formelt godkjent av Simen Lippestad (CEO) 27. juli 2026. GL-101–GL-109
er teknisk lukket på K0. Host-spesifikke backup-, restore-, TLS-, proxy- og
deploybevis følger G1. Deploy er begrenset til én appinstans frem til delt
rate-limiter finnes. Godkjenningen åpner ikke offentlig beta og aktiverer ingen
K1-kostnader. Se [signeringen](./go-live/sprint-1/closeout-review.md).

## 7. Sprint 2 – strukturert Brreg-data, uten OCR

**Mål:** Bevise at betaen kan levere regnskapsinformasjon fra en offisiell, strukturert kilde og være ærlig om det som mangler.

| ID | Leveranse | Ferdig når |
| --- | --- | --- |
| GL-201 | `BrregFinancialsProvider`-kontrakt | Frontend og domenelag er skjermet fra rå Brreg-respons. |
| GL-202 | Åpent Brreg-API | Reelle tilgjengelige regnskapsdata kan hentes for et gyldig organisasjonsnummer. |
| GL-203 | Normalisering | Eksterne felt mappes til en intern, versjonert modell med tydelige enheter og perioder. |
| GL-204 | Sporbarhet | Alle poster har `sourceSystem`, `sourceEntityType`, `sourceId`, `fetchedAt` og `normalizedAt`. |
| GL-205 | Cache og oppdatering | Gjentatte hentinger er kontrollerte, idempotente og belaster ikke kilden unødig. Revidert 5. august 2026: read-through i forespørselsveien er erstattet av databaselesing med kø, jf. GL-A01. |
| GL-206 | Tomtilstand | Selskaper uten tilgjengelig regnskap viser «ikke tilgjengelig», aldri konstruerte tall. |
| GL-207 | Feilhåndtering | Nedetid og endret Brreg-respons gir kontrollert feil og logging. |
| GL-208 | Integrasjonstester | Kontrakt, mapping, tomtilstand og feiltilstand er testet. |
| GL-209 | OCR-frakobling | Ingen betafunksjon eller deploy er avhengig av OCR eller PDF-tolkning. |
| GL-210 | Datadekningsrapport | CEO får en enkel oversikt over hvilke regnskapsfelt åpen kilde faktisk dekker. |

**Godkjenningskriterium:** En bruker kan se reelle nøkkeltall med kilde og dato, eller en ærlig tomtilstand.

### Sprint 2-status

Sprint 2 ble startet og formelt godkjent av Simen Lippestad (CEO) 27. juli
2026 på K0. Den tekniske leveransen dekker
versjonert provider-/normaliseringskontrakt, proveniens, idempotent read-through,
cachede tom- og feiltilstander, OCR-fri offentlig visning samt en deterministisk
dekningsrapport med snapshot-fingeravtrykk. Et stratifisert utvalg på 149 reelle virksomheter ga 95
tilgjengelige statements, 54 ærlige tomtilstander og 0 kilde-/kontraktfeil.
Produksjonslik lokal read-through og anti-fallback er verifisert. Godkjenningen
åpner Sprint 3, men ikke offentlig beta eller K1-/K2-kostnader. Se
[signeringen](./go-live/sprint-2/closeout-review.md).

## 8. Sprint 3 – analysegrunnlag og Njord uten å kjøpe modellbruk

**Mål:** Bygge analyseobjektet, de kontrollerte verktøyene og kontrollmekanismene som de tre arbeidsflytene trenger før en betalt modellnøkkel aktiveres.

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
| GL-312 | Analyseobjekt | Formål, kriterier, univers, beregninger, kilder, konklusjon og oppfølging kan lagres med tilgangskontroll. |
| GL-313 | Universbygging | Njord og UI bruker samme versjonerte filter-/screening-tjeneste og kan forklare inklusjon, eksklusjon og datagap. |
| GL-314 | Sammenligning og rangering | Beregninger, perioder, vekting og manglende data er deterministiske og etterprøvbare uten språkmodellen. |
| GL-315 | Arbeidslister | Longlist, shortlist og sourcing-/analyseutvalg kan lagres og videreføres. |

**Godkjenningskriterium:** Njord kan kobles til en ekte modell uten ukontrollert tilgang til data eller budsjett, og de tre arbeidsflytene kan gjennomføres deterministisk via de samme godkjente verktøyene.

### Sprint 3-status

Sprint 3 ble startet teknisk 27. juli 2026 på K0. Første vertikale leveranse
etablerer versjonert analyse-/arbeidslistepersistens, felles deterministisk
univers og rangering for UI/Njord, godkjente verktøykontrakter, sikkerhets- og
kostnadskontroll, et 50-case kontraktsett, kontrollert modellfallback,
brukerfeedback og en tilgangsstyrt flate for å opprette, redigere og gjenoppta
analyser samt lagre, omrekkefølge og promotere dokumenterte arbeidslisteelementer.
Analyse-ID kan følge Njord-forespørselen som eksplisitt, tilgangskontrollert og
størrelsesbegrenset kontekst. Ingen modellbruk eller K1-/K2-kostnad er aktivert.
Den tilgangsstyrte arbeidsflyten støtter nå også validert beregningsoppsett,
direkte univers-/rangeringskjøring til arbeidsliste og lagring av status,
konklusjon, oppfølging og offisielt kildegrunnlag. K0-arbeidet er teknisk
fullført: Njord-svar har påstand-til-kilde-kontrakt og inspeksjonsflate,
evalsettet har 28 verifiserte Brreg-fakta for fire reelle virksomheter, og alle
tre arbeidsflytene har en deterministisk kontrakttest fra formål via univers og
rangering til gjenlest arbeidsliste og konklusjon. Modell-sammenligning,
modellbasert kontekstbevis og flerinstansgrenser avventer G1/valgt host.
Arbeidslister fra universmotoren lagrer også kjøringsversjoner,
tellinger og hele eksklusjonssettet atomisk; årsaker og kildebevis kan
inspiseres paginert i arbeidsflyt-UI. Se
[Sprint 3-kontrollpunktet](./go-live/sprint-3/README.md). Adminflaten for
AI-økonomi viser og styrer valuta, risikobuffer, leverandørpriser, globale og
per-bruker-grenser, kostnad per bruker/rolle/abonnement/modell samt
abonnementspris og AI-inntektsallokering. Et datert
[G1-beslutningsunderlag](./go-live/sprint-3/g1-ai-decision-pack.md) anbefaler
en separat evalueringsramme før betamodellen velges. Ingen modell eller
K1-kostnad er godkjent gjennom anbefalingen.

## 8.1 Arkitekturregler som følges løpende

Disse reglene ble besluttet 5. august 2026 etter en full gjennomgang av koden mot
strategien. De gjelder på tvers av sprintene, kontrolleres ved hver leveranse og
rapporteres ved G1. De erstatter ikke sprintleveransene, men et brudd på dem er
en avvikssak uavhengig av hvilken sprint arbeidet hører til.

| ID | Regel | Ferdig når | Kontrolleres |
| --- | --- | --- | --- |
| GL-A01 | Forespørselsveien leser bare databasen | Ingen brukerforespørsel gjør et eksternt API-kall; manglende data legges i kø og vises som «ikke lastet» | Regresjonstest som feiler ved utgående HTTP i forespørselsveien |
| GL-A02 | Populering skjer i bakgrunnsjobb med kø | Kø, kjøring, feil og etterslep kan ses i adminflaten og kjøres på plan | Kødybde, feiltelling og siste kjøring i kontrollsenteret |
| GL-A03 | Ett modellkallsted | Alle modellkall går gjennom modelladapteren med sikker systeminstruks, injeksjonsinspeksjon, budsjett, reservasjon og forbruksregistrering | Inventar over modellkallsteder; fail-closed-tester for kallsteder som ikke er koblet på ennå |
| GL-A04 | OCR-flatene er ikke tilgjengelige | Ingen OCR-/PDF-flate, jobb eller adminside kan nås fra applikasjonen; koden er i karantene, ikke slettet | Rutetest og adminflate uten lenker til pensjonerte OCR-flater |
| GL-A05 | Migrasjonshistorikken er trygg | Ingen sjekksumavvik, og indekser som bare finnes i rå SQL kan ikke forsvinne ubemerket | `npm run db:check-migrations` i CI etter `migrate deploy` |

### Status 5. august 2026

- GL-A01 er implementert for strukturert regnskap: selskapssiden og
  `GET /api/companies/[slug]/financials` leser databasen, legger ukjente
  virksomheter i kø og viser en ærlig ventetilstand. Verifisert uten utgående
  HTTP i forespørselsveien. Kunngjøringer fra Brreg, SSB Klass-oppslag og
  søkeintensjon gjenstår.
- GL-A02 er implementert som `financials:drain-queue` og en hemmelighetsbeskyttet
  planlagt rute; kø, etterslep og feil vises i kontrollsenteret.
- GL-A03 er delvis: Njord bruker adapteren, mens søkeintensjonen kaller
  leverandøren direkte. Scope-klassifisereren for søk er gjort fail-closed og
  kan ikke kalle modellen uten eksplisitt tokenbudsjett og aktiv betalt
  AI-bryter. Samling av kallstedene er G1-arbeid.
- GL-A04 er ikke startet. Kontrollsenteret er bygget om til Brreg-henting og
  lenker ikke lenger til OCR-flater, men flatene finnes fortsatt på direkte URL.
- GL-A05 er implementert. To feil er lukket. `core.autocrlf` skrev om
  linjeskiftene i migrasjonsfilene, slik at 23 av 45 registrerte migrasjoner
  fremsto som endret og `prisma migrate dev` tilbød å nullstille
  utviklingsdatabasen med reelle data. `.gitattributes` låser nå filene til LF,
  sjekksummene er reparert, og kontrollen kjører i CI. I tillegg foreslo
  `prisma migrate diff` å slette tre indekser den ikke kjenner. Én er nå
  deklarert i skjemaet; de to siste kan ikke uttrykkes i Prisma, er dokumentert
  på modellene og overvåkes av kontrollen.

## 9. Port G1 – godkjenning av første betalte kostnader

Porten gjennomføres 6. september. Hvis den ikke godkjennes, fortsetter K0-forbedringer, men produksjon og ekte modellbruk aktiveres ikke.

CEO skal få:

1. Resultater fra sprint 0–3 og åpne kritiske risikoer.
2. Konkret månedsbudsjett for hosting, database, lagring, overvåking, e-post og AI.
3. Sammenligning av minst to driftsalternativer, inkludert AWS dersom det er økonomisk rasjonelt.
4. Estimert kostnad per aktiv betabruker og per Njord-samtale.
5. Datadekning fra åpent Brreg-API og gapet til betalt leveranse.
6. Anbefaling om domene, databehandleravtaler og personvernbehov.
7. Status på arkitekturreglene GL-A01–GL-A04, med inventar over modellkallsteder og gjenstående eksterne kall i forespørselsveien.

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
| GL-407 | Ende-til-ende-test | Hver av de tre arbeidsflytene fungerer fra definert formål til lagret resultat med innlogging, gating og Njord i staging. |
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
- M&A-screening, sourcing og konkurrent-/bransjeanalyse kan fullføres med reelle data, dokumenterte begrensninger og lagret resultat.
- Njord er integrert i arbeidsflytene og skiller dokumenterte fakta, beregninger, antakelser og hypoteser.
- AI- og driftskostnader har fungerende grenser og varsler.
- Backup er gjenopprettet i en øvelse.
- Overvåking og hendelsesansvar er aktivt.
- Personverninformasjon, vilkår og supportkanal er publisert.
- Release- og rollbackøvelse er fullført.

Hvis ett absolutt kriterium ikke er oppfylt, flyttes lanseringen. Datoen er underordnet tillit, datasikkerhet og økonomisk kontroll.

## 13. Første fire uker etter betaåpning

Rapporteres ukentlig:

- Inviterte, aktiverte og ukentlig aktive brukere.
- Brukere som fullfører minst én av de tre analysearbeidsflytene.
- Median spart tid mot brukerens dokumenterte eksisterende metode.
- Analyser med et relevant nytt Njord-funn og korrekt faktastøtte.
- Brukere som lagrer, eksporterer eller følger opp resultatet.
- Relativ verdi mot Proff.no for minst ett bruksmål, ukentlig Njord-intensjon og produktavhengighet.
- Virksomheter med konkret betalingsinteresse.
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
2. Kritisk brukerreise: definer formål → bygg univers med søk/Njord → analyser og sammenlign → undersøk → dokumenter → lagre eller overvåk.
3. Drift, overvåking og gjenoppretting.
4. Forbedringer som øker læring fra betaen.
5. Kosmetikk og funksjoner som ikke påvirker lanseringskriteriene.

Nye ønsker legges ikke direkte inn i en aktiv sprint. De registreres og tas inn bare hvis de erstatter arbeid med lavere verdi eller håndterer en kritisk risiko.

## 16. Relaterte dokumenter

- [Overordnet plan](../PLAN.md)
- [Arbeidsplaner og konvensjoner](../PLANS.md)
- [Styrende produktposisjonering](./go-live/product-positioning.md)
- [Beta-charter](./go-live/beta-charter.md)
- [Beta-KPI-er](./go-live/beta-kpis.md)
- [Datakildekart for beta](./go-live/data-source-map.md)
- [Livsløp for finansielle data](./financial-data-lifecycle.md)
