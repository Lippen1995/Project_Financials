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
- Selskapsprofil med virksomhetsdata fra Brønnøysundregistrene
- Roller og styre når de er tilgjengelige fra Brønnøysundregistrene
- Faner for Oversikt, Regnskap, Nøkkeltall, Organisasjon og Kunngjøringer
- Næringskodeberiking fra SSB Klass
- Filtrering på sentrale virksomhetsfelt
- Innlogging, registrering og enkel feature gating
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
For regnskap bruker ProjectX den åpne delen av Regnskapsregisterets API under `data.brreg.no/regnskapsregisteret/regnskap`, som ifølge Brregs OpenAPI publiserer nøkkeltall fra sist innsendte årsregnskap.

### SSB Klass

Brukes som source of truth for:

- beskrivelse av næringskoder
- kodeverksberiking

ProjectX bruker SSB Klass API under `data.ssb.no/api/klass/v1`.

### Finanstilsynet

Ikke aktivert i denne iterasjonen. ProjectX viser derfor ingen regulatorisk overlay i stedet for å anta eller simulere tilsynsstatus.

## Viktige begrensninger

- ProjectX viser åpne regnskapstall fra Brønnøysundregistrenes Regnskapsregister når de er tilgjengelige.
- Den åpne Brreg-regnskapskilden ser ut til å være knyttet til sist tilgjengelige årsregnskap. ProjectX viser derfor ikke syntetisk flerårshistorikk når slike tall ikke kommer fra åpen kilde.
- Regulatorisk overlay fra Finanstilsynet er ikke aktivert ennå.
- Filtrering skjer i MVP-et gjennom åpne søkekall og etterbehandling i ProjectX, så presisjonen er best når filtre kombineres med navn eller organisasjonsnummer.

## Arkitektur

- `integrations/`: provider-lag for Brreg og SSB
- `server/`: mapping, persistens og service-lag
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

5. Start appen:

```bash
npm run dev
```

Appen kjører da på [http://localhost:3000](http://localhost:3000).

## Auth

Det finnes ingen seedede demo-brukere. Opprett en konto i UI for lokal bruk.

Subscription-modellen finnes i databasen og brukes til enkel feature gating i produktet. Betalingsflyt er ikke ferdigstilt i denne iterasjonen.

## Miljøvariabler

- `DATABASE_URL`: PostgreSQL-tilkobling
- `NEXTAUTH_SECRET`: secret for auth-sesjoner
- `NEXTAUTH_URL`: lokal base-URL
- `BRREG_BASE_URL`: base-URL for Brreg virksomhetsdata
- `BRREG_ROLES_BASE_URL`: base-URL for Brreg roller
- `BRREG_COMPANY_LOOKUP_BASE_URL`: base-URL for Brreg virksomhetsoppslag brukt til åpne årsregnskapsmetadata
- `BRREG_FINANCIALS_BASE_URL`: base-URL for Brreg Regnskapsregisterets åpne regnskaps-API
- `SSB_KLASS_BASE_URL`: base-URL for SSB Klass
- `SSB_INDUSTRY_CLASSIFICATION_ID`: klassifikasjons-ID for næringskodeverket
- `PROJECTX_CACHE_HOURS`: antall timer før cache oppfriskes

## Provider-oversikt

- `BrregCompanyProvider`: søker og henter virksomheter
- `BrregRolesProvider`: henter roller/styre
- `BrregFinancialsProvider`: henter åpne regnskapstall fra Regnskapsregisterets API og årganger for kopi av årsregnskap
- `SsbIndustryCodeProvider`: beriker næringskode med SSB-beskrivelse

## Kjørbart resultat

ProjectX kan kjøres lokalt, registrere brukere, søke i reelle virksomheter og vise profiler/roller med sporbarhet til offisielle kilder, uten syntetisk innhold.
