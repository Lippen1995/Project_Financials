# ProjectX

ProjectX er et MVP for selskapsinformasjon og innsikt bygget med Next.js, TypeScript, Tailwind, Prisma, PostgreSQL og NextAuth. Repoet følger en streng regel: ingen mock data, ingen seed-data og ingen syntetisk utfylling av virksomhetsinformasjon.

## Stack

- Next.js App Router
- TypeScript + React
- Tailwind CSS
- Prisma + PostgreSQL
- NextAuth Credentials + Prisma Adapter
- Docker Compose for lokal PostgreSQL

## Hva som er implementert

- Globalt søk mot Brønnøysundregistrene
- AI-assistert fritekstsøk som tolker spørringer som aktivitet + geografi før kandidater rangeres
- Selskapsprofil med virksomhetsdata fra Brønnøysundregistrene
- Roller og styre når de er tilgjengelige fra Brønnøysundregistrene
- Årsbundet selskapsstruktur basert på importerte aksjonærregisterdata fra Skatteetaten når snapshot er tilgjengelig
- Faner for Oversikt, Regnskap, Nøkkeltall, Organisasjon og Kunngjøringer
- Dynamisk fane for "Immaterielle rettigheter" (patent, varemerke, design) når selskapet har treff hos Patentstyret
- Næringskodeberiking fra SSB Klass
- Filtrering på sentrale virksomhetsfelt
- Innlogging, registrering og enkel feature gating
- Workspace-basert kontooversikt med personlig workspace, team-workspaces og invitasjoner
- DD-rom med mandat, workflow, funn, evidens, beslutningshistorikk og frie romposter
- Kommentartråder på oppgaver, funn, kunngjøringer og regnskap i riktig DD-romkontekst
- Workspace-abonnementer, inbox-varsler og distress-monitorer
- Markedsanalysemodul for olje og gass på `/market/oil-gas` med SODIR-masterdata, kartlag, produksjonsserier, reserver og investeringsoversikt
- Distress-modul med todelt flyt:
  - oversikt på `/workspaces/[workspaceId]/distress`
  - screener på `/workspaces/[workspaceId]/distress/search`
- Lokal cache/persistens av hentede records med sporbarhet

## Datakilder

### Brønnøysundregistrene

Brukes som source of truth for:

- organisasjonsnummer
- virksomhetsnavn
- organisasjonsform
- registreringsstatus
- adresser
- registrert næringskode
- roller i virksomheten

ProjectX bruker åpne Brreg-endepunkter under `data.brreg.no/enhetsregisteret/api`.
Registrert næringskode beholdes med Brreg som kildesporing i domenemodellen; SSB brukes bare til beskrivelse og kodeverksberiking.
For regnskap bruker ProjectX Brregs offisielle PDF-kopier av årsregnskap under `data.brreg.no/regnskapsregisteret/regnskap/aarsregnskap/kopi/...`.
Historikk bygges ved lokal OCR-parsing og normalisering av disse PDF-ene.

### SSB Klass

Brukes som source of truth for:

- beskrivelse av næringskoder
- kodeverksberiking

ProjectX bruker SSB Klass API under `data.ssb.no/api/klass/v1`.

### Finanstilsynet

Ikke aktivert i denne iterasjonen. ProjectX viser derfor ingen regulatorisk overlay i stedet for å anta eller simulere tilsynsstatus.

### Skatteetatens aksjonærregister

Brukes som source of truth for:

- aksjonærer per selskap og år
- antall aksjer per aksjonær
- beregning av direkte eierandel når totalt antall aksjer finnes i leveransen

ProjectX støtter import av reelle aksjonærregisteruttrekk fra Skatteetatens leveranseformat som CSV per selskap/år. Data er årsbundet og vises aldri som live-data.

ProjectX kan også hente aksjonærdata direkte fra Skatteetatens `Aksjonær i virksomhet API` når Maskinporten-tilgang, rettighetspakke og bearer-token er konfigurert lokalt. Live API prioriteres foran importerte snapshots.

### Sokkeldirektoratet, Havtil og Gassco

Brukes i olje- og gassmodulen slik:

- Sokkeldirektoratet (SODIR) er master for felt, funn, lisenser, innretninger, TUF/hovedrørledninger, survey, produksjonsserier, reserver og forventede investeringer
- Havtil brukes som regulatorisk event-overlay for tilsynsrapporter, samtykker, samsvarsuttalelser og granskingsrapporter
- Gassco brukes nå til sanntidsnomineringer via den offentlige `realTimeAtom.xml`-feed-en, mens generell UMM-feed fortsatt behandles konservativt fordi eventinnholdet kan være tomt eller variere over tid

Frontend i `/market/oil-gas` bruker kun normaliserte ProjectX-API-er under `app/api/market/oil-gas/*`, aldri rå SODIR-, Havtil- eller Gassco-responser.

### Patentstyret

Brukes som kilde for:

- patent-, varemerke- og designportefølje på selskapsprofil
- detaljoppslag per IP-sak

ProjectX bruker Patentstyrets Open Data-endepunkter med organisasjonsnummer som primær identifikator for portefølje.

## Viktige begrensninger

- ProjectX viser regnskap fra Brregs offisielle PDF-kopier av årsregnskap.
- Flerårshistorikk bygges fra OCR-parsing og normalisering av disse PDF-ene.
- OCR-basert historikk er best effort og kan ha enkelte feil på vanskelig leste linjer; note-rader og summer valideres derfor defensivt, og ProjectX fyller fortsatt ikke hull med syntetiske tall.
- Regulatorisk overlay fra Finanstilsynet er ikke aktivert ennå.
- Aksjonærdata krever et reelt Skatteetaten-uttrekk for aktuelt selskap og år. Hvis snapshot mangler, viser ProjectX en tydelig tomtilstand i stedet for en plassholdergraf.
- Eierandeler beregnes bare når totalt antall aksjer finnes og er konsistent i den importerte leveransen.
- Filtrering skjer i MVP-et gjennom åpne søkekall og etterbehandling i ProjectX, så presisjonen er best når filtre kombineres med navn eller organisasjonsnummer.
- AI-søk bruker OpenAI kun til å tolke søketeksten til strukturert intensjon. Kandidater hentes fortsatt fra Brreg, næringskoder berikes fra SSB, og sortering på størrelse bruker bare reelle inntektstall som finnes i lokal lagring/importerte regnskap.
- Hvis `OPENAI_API_KEY` mangler, faller søket tilbake til en enklere regelbasert tolkning og UI-et markerer dette tydelig.
- Distress-monitorer matcher bare selskaper som allerede finnes i ProjectX-lageret lokalt. ProjectX hevder ikke full nasjonal dekning dersom selskapet ikke er hentet eller lagret ennå.
- Distress-tidslinjen på oversiktssiden bruker `lastAnnouncementPublishedAt` (siste registrerte kunngjøringsdato per profil), ikke full historikk av alle kunngjøringer.
- Distress-KPI for regnskapsdekning teller profiler med dataCoverage `FINANCIALS_AVAILABLE` eller `FINANCIALS_PARTIAL`.
- Første sync for regnskapsvarsler etablerer en baseline for lagret watch for å unngå falske historiske "nye regnskap"-varsler.
- DD-kommentarer på selskapsprofilen vises bare når profilen er åpnet fra et gyldig DD-rom med `ddRoom` i URL-en.
- Gassco-integrasjonen i olje- og gassmodulen bruker ekte sanntidsnomineringer fra offentlig Atom-feed. ProjectX lover fortsatt ikke full Gassco-eventdekning dersom den generelle UMM-feed-en er tom eller ikke kan verifiseres i siste sync.
- Havtil-hendelser normaliseres fra åpne listesider og brukes som event-overlay, ikke som master for sokkelobjekter.

## Arkitektur

- `integrations/`: provider-lag for Brreg og SSB
- `server/`: mapping, persistens og service-lag
- `server/shareholdings/`: importpipeline, normalisering, entity resolution og graph-transform for aksjonærdata
- `app/`: Next.js UI og API-ruter
- `prisma/`: datamodell

Frontend konsumerer kun normaliserte interne objekter, aldri rå ekstern API-respons.

## Lokal oppstart

1. Kopier `.env.example` til `.env`
2. Start PostgreSQL:

```bash
docker compose up -d
```

3. Installer avhengigheter:

```bash
npm install
```

4. Push schema til databasen:

```bash
npm run db:push
```

5. Hvis databasen allerede har brukere, backfill workspace-tilstand:

```bash
npm run backfill:workspaces
```

6. Start appen:

```bash
npm run dev
```

7. Hvis du vil synkronisere workspace-varsler manuelt lokalt:

```bash
npm run sync:workspace-notifications
```

Appen kjører da på [http://localhost:3000](http://localhost:3000).

## Auth

Det finnes ingen seedede demo-brukere. Opprett en konto i UI for lokal bruk.

Hver bruker får automatisk en personlig workspace ved registrering eller første innlogging etter schema-oppdateringen. Team-workspaces og medlemsinvitasjoner administreres fra dashboardet.

Aktive workspaces kan, avhengig av tilgangsnivå, eie DD-rom, watches, inbox-varsler og distress-monitorer. Disse objektene er workspace-scopet, ikke bruker-scopet.

Subscription-modellen finnes i databasen og brukes til enkel feature gating i produktet. Betalingsflyt er ikke ferdigstilt i denne iterasjonen.

## Import av årsrapporter

ProjectX har en første importjobb som kan hente og lagre regnskap for konkrete virksomheter i databasen:

```bash
npm run import:annual-reports -- 928846466
```

Dette vil:

- hente virksomheten fra Brreg
- hente tilgjengelige årsrapporter
- parse regnskapstall fra offisielle Brreg-PDF-er
- skrive normaliserte `FinancialStatement`-rader til PostgreSQL

## Import av aksjonærdata

ProjectX har en egen importjobb for aksjonærregisterdata fra Skatteetaten:

```bash
npm run import:shareholding -- 928846466 2024 ./data/aksjonaerer-928846466-2024.csv
```

Dette vil:

- lese inn rå CSV-leveranse for valgt selskap og år
- lagre råkilden separat fra normaliserte data
- normalisere aksjonærer og direkte eierskap
- forsøke konservativ kobling av selskapsaksjonærer mot Brreg
- beregne direkte eierandel når total shares finnes
- persistere et graph-ready snapshot for UI-et

## Miljøvariabler

- `DATABASE_URL`: PostgreSQL-tilkobling
- `NEXTAUTH_SECRET`: secret for auth-sesjoner
- `NEXTAUTH_URL`: lokal base-URL
- `BRREG_BASE_URL`: base-URL for Brreg virksomhetsdata
- `BRREG_ROLES_BASE_URL`: base-URL for Brreg roller
- `BRREG_COMPANY_LOOKUP_BASE_URL`: base-URL for Brreg virksomhetsoppslag brukt til åpne årsregnskapsmetadata
- `BRREG_ANNOUNCEMENTS_BASE_URL`: base-URL for Brreg kunngjøringer
- `BRREG_FINANCIALS_BASE_URL`: base-URL for Brreg Regnskapsregisterets åpne regnskaps-API
- `PATENTSTYRET_BASE_URL`: base-URL for Patentstyrets Open Data API
- `PATENTSTYRET_SUBSCRIPTION_KEY`: subscription key for Patentstyret (sendes kun server-side)
- `PATENTSTYRET_ORGNUMBER_PARAM`: query-parameter brukt i `/register/v1/IprCasesByCompany` (standard `orgNumber`)
- `SKATTEETATEN_SHAREHOLDING_BASE_URL`: base-URL for Skatteetatens Aksjonær i virksomhet API
- `SKATTEETATEN_SHAREHOLDING_PACKAGE`: rettighetspakke for datasettet
- `SKATTEETATEN_SHAREHOLDING_TOKEN`: bearer-token med scope `skatteetaten:aksjonaer`
- `SSB_KLASS_BASE_URL`: base-URL for SSB Klass
- `SSB_INDUSTRY_CLASSIFICATION_ID`: klassifikasjons-ID for næringskodeverket
- `PROJECTX_CACHE_HOURS`: antall timer før cache oppfriskes
- `OPENAI_API_KEY`: API-nøkkel brukt til å tolke fritekstsøk
- `OPENAI_SEARCH_MODEL`: modellnavn for søketolkning, standard `gpt-5-mini`
- `WORKSPACE_SYNC_SECRET`: delt secret for intern workspace-sync-endepunkt i produksjon

## Workspace-sync

ProjectX kan synkronisere watches og distress-monitorer til workspace-inboxen via:

```bash
npm run sync:workspace-notifications
```

I produksjon er internruten `/api/internal/workspace-sync` satt opp for timebasert cron via [vercel.json](./vercel.json). Sett `WORKSPACE_SYNC_SECRET` i miljøet og kall ruten med `Authorization: Bearer <secret>` eller `x-workspace-sync-secret`.

## Provider-oversikt

- `BrregCompanyProvider`: søker og henter virksomheter
- `BrregRolesProvider`: henter roller/styre
- `BrregFinancialsProvider`: bygger regnskapstall fra offisielle PDF-kopier av årsregnskap og normaliserer dem for visning/import
- `SsbIndustryCodeProvider`: beriker næringskode med SSB-beskrivelse

## Kjørbart resultat

ProjectX kan kjøres lokalt, registrere brukere, søke i reelle virksomheter og vise profiler/roller med sporbarhet til offisielle kilder, uten syntetisk innhold.
