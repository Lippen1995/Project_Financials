# Sprint 1 – kontrollsenter

**Status:** Pågår

**Sprintperiode:** 24. juli–9. august 2026

**Startbeslutning:** CEO Simen Lippestad ba om umiddelbar oppstart 24. juli 2026, tre dager før opprinnelig plan.

**Kostnadsnivå:** K0 – ingen nye løpende eksterne kostnader

**Mål:** Minimum sikkerhet, et etterprøvbart analysefundament og en repeterbar releaseprosess før K1 kan vurderes.

## Status

| ID | Leveranse | Status | Eier | Bevis / neste port |
| --- | --- | --- | --- | --- |
| GL-101 | Hemmeligheter og nøkler | Teknisk lukket | Simen Lippestad | `.env` er ignorert. Automatisk kontroll av alle Git-sporede filer blokkerer private miljøfiler og kjente nøkkelformater. Faktiske produksjonshemmeligheter opprettes først ved G1. |
| GL-102 | Avhengighetskontroll | Teknisk lukket | Simen Lippestad | `npm audit` gikk fra 23 funn (3 kritiske, 16 høye, 3 moderate, 1 lavt) til 0. Minimumsversjoner og transitive overrides er låst i `package.json`/lockfil. |
| GL-103 | Tilgangskontroll | Teknisk lukket | Simen Lippestad | Alle 56 `app/api/admin`-ruter bruker `requireAdmin` eller `requireFinancialReviewer`, som verifiserer rollen i databasen. Alle 12 interne ruter bruker reviewer-rolle eller tjenestehemmelighet. Produksjon feiler lukket uten `AUTH_SECRET`. |
| GL-104 | Inputvalidering | Pågår | Simen Lippestad | Innlogging, globalt søk og Njord har eksplisitt type-, format- og lengdevalidering. Resterende muterende API-ruter skal maskinelt inventeres før lukking. |
| GL-105 | Misbruksvern | Beta-baseline levert | Simen Lippestad | Prosesslokal rate limiting: credentials 10/15 min per IP+e-post, LinkedIn 20/15 min per identitet, primærsøk 60/min og forslag 120/min per IP, Njord søk 10/5 min per bruker, Njord distress 30/min per bruker. Delt lager er obligatorisk før mer enn én appinstans. |
| GL-106 | Nettlesersikkerhet | Delvis levert | Simen Lippestad | HSTS, frame-deny, nosniff, referrer-, permissions- og cross-origin-hoder er satt globalt; `X-Powered-By` er fjernet. HTTPS-verifisering, cookie-bevis og testet CSP gjenstår på valgt host. |
| GL-107 | Databaseendringer | Teknisk lukket | Simen Lippestad | CI og dokumentert oppstart bruker `prisma migrate deploy`; `db push` er ikke del av releasebanen. |
| GL-108 | Releaseoppskrift | Kandidat levert | Simen Lippestad | [Release- og rollbackoppskriften](./release-and-rollback.md) dekker K0-verifikasjon og den senere hostede releasebanen. Leverandørspesifikke deploy-/backupkommandoer fylles inn ved G1. |
| GL-109 | Automatiske porter | Teknisk levert | Simen Lippestad | CI kjører låst installasjon, Git-/hemmelighetskontroll, dependency audit, migrasjoner, typekontroll, tester, lint og produksjonsbygg. Full lokal port kjøres før Sprint 1-lukking. |

## Beslutninger tatt ved oppstart

1. Sårbare pakker oppgraderes innen kompatible hovedversjoner; ingen kritiske advisories aksepteres.
2. Den sårbare og urettede `xlsx`-pakken fjernes. SODIR-kildelenken beholdes, mens arkfaner er ærlig utilgjengelige.
3. Produksjonsskjema endres kun gjennom versjonerte migrasjoner.
4. Rate limiting lagrer kun hash av limiter-identiteten, ikke rå e-postadresse eller IP i lageret.
5. CSP aktiveres ikke uprøvd. Den må testes mot innlogging, kart, Next.js-runtime og Njord før håndheving.

## Åpne Sprint 1-oppgaver

- fullfør maskinell inputvalideringsinventering og lukk GL-104;
- velg/test CSP-policy og dokumenter auth-cookie-attributter på produksjonslik host;
- erstatt prosesslokal limiter med delt lager dersom deploytopologien får flere instanser;
- kjør full test-, lint- og byggport etter alle endringer;
- gjennomfør kodegjennomgang og CEO-godkjenning av Sprint 1.

## Godkjenningsregel

Sprint 1 kan først lukkes når:

- alle GL-101–GL-109 enten er lukket med bevis eller har en eksplisitt CEO-godkjent risikoaksept;
- full CI-lik port er grønn fra en ren installasjon;
- en annen utvikler kan følge releaseoppskriften uten muntlige spesialinstruksjoner;
- ingen K1-kostnad er aktivert uten separat G1-beslutning.
