# Fjord Insight Skills

Dette dokumentet beskriver hvilke arbeidsmoduser ("skills") som er relevante
for Fjord Insight, når de skal brukes, og hvilke prosjektregler som alltid har
forrang.

Dokumentet er inspirert av den selvstendige skill-pakken i
[alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills)
og repoets
[CLAUDE.md](https://github.com/alirezarezvani/claude-skills/blob/main/CLAUDE.md).
Det installerer ikke tredjepartskode og gir ikke eksterne skills myndighet til
å overstyre `AGENTS.md`, `DESIGN.md`, eksisterende kode eller offisielle
datakilder.

## Prioritetsrekkefølge

Ved konflikt gjelder denne rekkefølgen:

1. `AGENTS.md`
2. `DESIGN.md`
3. Eksisterende arkitektur, domeneinvarianter og tester
4. Oppgavespesifikke instrukser
5. Retningslinjene i dette dokumentet
6. Generelle råd fra eksterne skills

## Felles regler for alle skills

- Bruk bare reelle data fra dokumenterte, offisielle kilder.
- Ikke legg til mockdata, seed-data eller syntetiske virksomheter, personer,
  roller, eiere eller regnskapstall.
- Bevar kildehierarkiet: Brreg er virksomhetsmaster, SSB forklarer kodeverk, og
  Finanstilsynet er kun et regulatorisk overlay.
- Frontend skal konsumere normaliserte interne modeller, aldri rå
  provider-responser.
- Alle eksterne records skal kunne spores med `sourceSystem`,
  `sourceEntityType`, `sourceId`, `fetchedAt` og `normalizedAt`.
- Valider data ved systemgrenser. Ukjente eller manglende data skal bli
  eksplisitte tomtilstander, ikke antakelser.
- Følg eksisterende TypeScript-, Next.js-, Prisma-, Vitest- og Tailwind-mønstre.
- Følg designsystemet i `DESIGN.md` for tokens, radius, typografi og spacing.
- Hold endringer små og målrettede. Ikke refaktorer uvedkommende kode.
- Oppdater README når datadekning, kildebruk eller produktbegrensninger endres.

## Kjerne-skills

### 1. Senior Fullstack

**Bruk når:** En oppgave går gjennom flere lag, for eksempel provider,
normalisering, persistens, service/API og UI.

**Arbeidsflyt:**

1. Spor eksisterende dataflyt fra ekstern kilde til frontend.
2. Definer eller gjenbruk en intern domenemodell.
3. Implementer hvert lag uten at rå provider-typer lekker oppover.
4. Legg til inputvalidering og loading-, error- og empty states.
5. Verifiser med fokuserte tester, typecheck og relevant UI-flyt.

**Referanse:** [senior-fullstack](https://github.com/alirezarezvani/claude-skills/tree/main/engineering-team/skills/senior-fullstack)

### 2. Senior Backend

**Bruk når:** Oppgaven gjelder providers, mapping, services, API-ruter,
bakgrunnsjobber, caching eller persistens.

**Krav:**

- Providers skal være kildeavgrensede og returnere tydelige resultater.
- Mapping og normalisering skal være deterministisk og testbar.
- Nettverksfeil, rate limits, tomme svar og endrede payloads skal håndteres.
- Upserts og synkronisering skal være idempotente der samme data kan hentes
  flere ganger.
- Kildeproveniens skal bevares gjennom hele dataflyten.

**Referanse:** [senior-backend](https://github.com/alirezarezvani/claude-skills/tree/main/engineering-team/skills/senior-backend)

### 3. Senior Frontend

**Bruk når:** Oppgaven gjelder React-komponenter, App Router-sider,
interaksjoner, responsive flater eller visuell kvalitet.

**Krav:**

- Server Components er standard; bruk Client Components bare ved reelt behov.
- Gjenbruk eksisterende komponenter og mønstre før nye abstraksjoner opprettes.
- Implementer loading-, error-, empty- og unavailable states eksplisitt.
- Ikke vis data med høyere sikkerhet eller aktualitet enn kilden støtter.
- Verifiser sentrale flater i nettleser på relevante viewport-størrelser.

**Referanse:** [senior-frontend](https://github.com/alirezarezvani/claude-skills/tree/main/engineering-team/skills/senior-frontend)

### 4. API Design Reviewer

**Bruk når:** En intern eller ekstern API-kontrakt opprettes eller endres.

**Sjekkliste:**

- Er input validert med tydelige feilresponser?
- Er auth, workspace-tilgang og feature gating håndhevet server-side?
- Returnerer API-et normaliserte Fjord Insight-modeller?
- Er pagination, caching og idempotens vurdert?
- Lekker responsen secrets, rå payloads eller unødvendige personopplysninger?
- Er kontraktsendringen bakoverkompatibel, eller tydelig migrert?

**Referanse:** [api-design-reviewer](https://github.com/alirezarezvani/claude-skills/tree/main/engineering/skills/api-design-reviewer)

### 5. Database Schema Designer

**Bruk når:** `prisma/schema.prisma`, relasjoner, indekser, constraints eller
datamigreringer berøres.

**Krav:**

- Modellér virksomhetsdata separat fra kildeartefakter og ingest-status.
- Bevar historikk når kildedata kan endres over tid.
- Bruk unike constraints for naturlig idempotens.
- Indekser faktiske query-mønstre, ikke hypotetiske behov.
- Unngå destruktive migreringer uten eksplisitt plan for eksisterende data.
- Verifiser Prisma-generering og relevante databasekall.

**Referanse:** [database-schema-designer](https://github.com/alirezarezvani/claude-skills/tree/main/engineering/skills/database-schema-designer)

### 6. Data Quality Auditor

**Bruk når:** Oppgaven gjelder regnskap, PDF-ekstraksjon, næringskoder,
aksjonærdata, selskapsmatching, nyhetsrelevans eller annen datakvalitet.

**Sjekkliste:**

- Proveniens: Kan verdien spores til kilde og artifact?
- Gyldighet: Oppfyller verdien domene- og formatregler?
- Fullstendighet: Er manglende felt målt og synliggjort?
- Konsistens: Stemmer summer, perioder, enheter og relasjoner?
- Aktualitet: Er `fetchedAt` og relevant gyldighetsperiode tydelig?
- Publiserbarhet: Skal resultatet publiseres, holdes tilbake eller sendes til
  manuell kontroll?

Usikre data skal aldri oppgraderes til publiserte fakta bare for å øke dekning.

**Referanse:** [data-quality-auditor](https://github.com/alirezarezvani/claude-skills/tree/main/engineering/data-quality-auditor)

### 7. Code Reviewer

**Bruk når:** En endring skal kvalitetssikres før merge eller når brukeren ber
om review.

**Review-rekkefølge:**

1. Feil som kan publisere uriktige data eller bryte kildehierarkiet
2. Auth-, tilgangs-, personvern- og secrets-problemer
3. Datatap, migreringsrisiko og manglende idempotens
4. Funksjonelle regresjoner og brutte kontrakter
5. Manglende tester for endret atferd
6. Vedlikeholdbarhet og designsystemavvik

Review skal vise konkrete fil- og linjereferanser. Stilpreferanser uten
praktisk konsekvens skal ikke dominere.

**Referanse:** [code-reviewer](https://github.com/alirezarezvani/claude-skills/tree/main/engineering-team/skills/code-reviewer)

### 8. API Test Suite Builder

**Bruk når:** Providers, services, actions eller API-ruter får ny atferd.

**Teststrategi:**

- Test normalisering og domeneinvarianter med små enhetstester.
- Test provider-feil med kontrollerte HTTP-fixtures, aldri oppdiktede
  forretningsrecords som presenteres som reelle.
- Test auth og workspace-tilgang på servergrensen.
- Test tomme, delvise, ugyldige og dupliserte kildesvar.
- Legg regresjonstester nær feilen som ble rettet.
- Kjør minste relevante suite først, deretter bredere validering ved høy risiko.

**Referanse:** [api-test-suite-builder](https://github.com/alirezarezvani/claude-skills/tree/main/engineering/skills/api-test-suite-builder)

### 9. Playwright Pro

**Bruk når:** En brukerflyt, UI-regresjon eller responsiv oppførsel må
verifiseres i en ekte nettleser.

**Prioriterte flyter:**

- søk til selskapsprofil
- selskapsfaner og tomtilstander
- innlogging og onboarding
- workspace-tilgang og DD-rom
- abonnement og feature gating
- admin-flyter for finansiell gjennomgang

Bruk stabile roller og labels som selektorer. Ikke gjør tester avhengige av at
en bestemt ekstern virksomhet alltid returnerer samme mutable data.

**Referanse:** [playwright-pro](https://github.com/alirezarezvani/claude-skills/tree/main/engineering-team/playwright-pro)

### 10. Security Guidance

**Bruk når:** Oppgaven berører auth, cookies, OAuth, API-nøkler, filopplasting,
ekstern HTML/PDF, admin-ruter eller workspace-data.

**Sjekkliste:**

- Håndhev tilgang server-side, ikke bare ved skjuling i UI.
- Hold provider-nøkler og tokens på serveren.
- Valider URL-er, filtyper, størrelser og eksternt innhold.
- Unngå secrets og persondata i logger, feilresponser og artifacts.
- Vurder SSRF, XSS, path traversal, injection og usikre redirects.
- Bruk minste nødvendige tilgang for admin- og workspace-operasjoner.

**Referanse:** [security-guidance](https://github.com/alirezarezvani/claude-skills/tree/main/engineering/security-guidance)

### 11. Stripe Integration Expert

**Bruk når:** Betalingsflyt, abonnement, webhook eller feature gating mot Stripe
implementeres.

**Krav:**

- Stripe-status skal synkroniseres via verifiserte webhooks.
- Webhooks skal være idempotente og tåle retry og feil rekkefølge.
- Feature gating skal håndheves server-side.
- Pris-ID-er og secrets skal komme fra miljøkonfigurasjon.
- Produktet skal vise ærlig status ved forsinket eller manglende synkronisering.

**Referanse:** [stripe-integration-expert](https://github.com/alirezarezvani/claude-skills/tree/main/engineering-team/skills/stripe-integration-expert)

## Sammensatte arbeidsflyter

### Ny offentlig datakilde

Bruk `Senior Backend` → `Data Quality Auditor` → `API Design Reviewer` →
`API Test Suite Builder` → `Senior Frontend`.

Leveransen skal minst inneholde provider, normalisering, intern modell,
persistens/cache ved behov, service/API, provenance, tomtilstand, tester og
README-dokumentasjon.

### Ny selskapsprofil-funksjon

Bruk `Senior Fullstack` med `Senior Frontend`, `Data Quality Auditor` og
`Playwright Pro`.

Start med å dokumentere hvilke ekte felt kilden faktisk støtter. Funksjonen
skal være skjult, deaktivert eller vise en tydelig tomtilstand når datagrunnlaget
mangler.

### Regnskaps- eller ekstraksjonsendring

Bruk `Data Quality Auditor` → `Senior Backend` → `API Test Suite Builder` →
`Code Reviewer`.

Regnskapsverdier skal ikke publiseres uten dokumentert artifact, enhet,
periode, validering og nødvendig confidence/review-gate.

### Auth, workspace eller abonnement

Bruk `Security Guidance` → `Senior Backend` → `API Design Reviewer` →
`API Test Suite Builder` → `Playwright Pro`. Legg til `Stripe Integration
Expert` når Stripe inngår.

## Ferdigkriterier

En oppgave er ikke ferdig før:

- implementasjonen følger `AGENTS.md` og `DESIGN.md`
- ingen syntetiske forretningsdata er introdusert
- kilde og provenance er bevart
- relevante loading-, error-, empty- og unavailable states finnes
- relevante tester passerer
- `npm run typecheck` passerer for TypeScript-endringer
- `npm run lint` eller en dokumentert, avgrenset lint-sjekk er kjørt
- brukerrettede UI-endringer er verifisert i nettleser
- README er oppdatert når datakilder eller begrensninger er endret

## Vedlikehold

Hold denne filen kuratert for Fjord Insight. Nye skills skal bare legges til når
de dekker et gjentakende arbeidsmønster i repoet. Eksterne skills er
referansemateriale; prosjektets egne regler og faktiske kodebase er alltid
source of truth.
