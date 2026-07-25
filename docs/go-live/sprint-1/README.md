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
| GL-102 | Avhengighetskontroll | Teknisk lukket | Simen Lippestad | Første leveranse gikk fra 23 funn til 0. Den nye `brace-expansion`-advisoryen 25. juli ble lukket uten hovedversjonsløft: sårbare legacy-konsumenter rutes gjennom en lokal CommonJS-kompatibilitetsadapter til den offisielt patchede `brace-expansion@5.0.8`. Ren `npm ci`, kompatibilitetstest, lint og `npm audit --audit-level=high` er grønne med 0 funn. |
| GL-103 | Tilgangskontroll | Teknisk lukket | Simen Lippestad | Alle 56 `app/api/admin`-ruter bruker `requireAdmin` eller `requireFinancialReviewer`, som verifiserer rollen i databasen. Alle 12 interne ruter bruker reviewer-rolle eller tjenestehemmelighet. Produksjon feiler lukket uten `AUTH_SECRET`. |
| GL-104 | Inputvalidering | Teknisk lukket | Simen Lippestad | Den automatiske porten inventerer 136 API-rutefiler: 80 muterende og 91 med GET (noen filer har begge), med 60 body-, 71 path- og 51 query-flater uten manglende valideringsbevis. Direkte organisasjonsnummerfelt bruker én MOD11-kontrakt. Selskapsreferanser normaliseres og valideres gjennom en delt path-kontrakt, mens år, tidspunkt og øvrige GET-parametere har eksplisitte skjemaer. Atferdstester dekker de kritiske offentlige søke-, selskapsprofil-, nyhets-, konsernstruktur-, person-, profil- og underenhetsgrensene samt intern årsrapportoversikt. |
| GL-105 | Misbruksvern | Beta-baseline levert | Simen Lippestad | Prosesslokal rate limiting: credentials 10/15 min per IP+e-post, LinkedIn 20/15 min per identitet, primærsøk 60/min og forslag 120/min per IP, Njord søk 10/5 min per bruker, Njord distress 30/min per bruker. Delt lager er obligatorisk før mer enn én appinstans. |
| GL-106 | Nettlesersikkerhet | Beta-baseline levert | Simen Lippestad | En håndhevet CSP er testet mot produksjonsbygget, Next.js-runtime, login, søk/Njord-flaten og kartet med begge eksterne tilekilder. Auth.js krever sikre cookies og en eksplisitt kanonisk HTTPS-origin i produksjon; produksjonsresponsen viser `__Host`/`__Secure`, `HttpOnly`, `Secure` og `SameSite=Lax`. HSTS og øvrige globale hoder er aktive, og `X-Powered-By` er fjernet. Faktisk TLS, HTTP-redirect og trygg `Host`-header verifiseres på valgt host ved G1. |
| GL-107 | Databaseendringer | Teknisk lukket | Simen Lippestad | CI og dokumentert oppstart bruker `prisma migrate deploy`; `db push` er ikke del av releasebanen. |
| GL-108 | Releaseoppskrift | Kandidat levert | Simen Lippestad | [Release- og rollbackoppskriften](./release-and-rollback.md) dekker K0-verifikasjon og den senere hostede releasebanen. Leverandørspesifikke deploy-/backupkommandoer fylles inn ved G1. |
| GL-109 | Automatiske porter | Teknisk levert | Simen Lippestad | CI kjører låst installasjon, Git-/hemmelighetskontroll, API-inputinventar, dependency audit, migrasjoner, typekontroll, tester, lint og produksjonsbygg. Full lokal port kjøres før Sprint 1-lukking. |

## Beslutninger tatt ved oppstart

1. Sårbare pakker oppgraderes innen kompatible hovedversjoner; ingen kritiske advisories aksepteres.
2. Den sårbare og urettede `xlsx`-pakken fjernes. SODIR-kildelenken beholdes, mens arkfaner er ærlig utilgjengelige.
3. Produksjonsskjema endres kun gjennom versjonerte migrasjoner.
4. Rate limiting lagrer kun hash av limiter-identiteten, ikke rå e-postadresse eller IP i lageret.
5. CSP aktiveres først etter test mot innlogging, kart, Next.js-runtime og Njord. Den statiske beta-policyen er nå håndhevet; en nonce-policy vurderes senere hvis kravet forsvarer at alle sider gjøres dynamiske.
6. `unsafe-inline` og brede HTTPS-bilder er en eksplisitt gjenværende CSP-risiko. Den må enten fjernes med nonce/bildeproxy eller godkjennes som tidsavgrenset risiko før offentlig beta.

## Åpne Sprint 1-oppgaver

- verifiser gyldig TLS, tvungen HTTP-til-HTTPS og at reverse proxy avviser ukjente `Host`-verdier på valgt host ved G1;
- erstatt prosesslokal limiter med delt lager dersom deploytopologien får flere instanser;
- kjør full test-, lint- og byggport etter alle endringer;
- gjennomfør kodegjennomgang og CEO-godkjenning av Sprint 1.

## Godkjenningsregel

Sprint 1 kan først lukkes når:

- alle GL-101–GL-109 enten er lukket med bevis eller har en eksplisitt CEO-godkjent risikoaksept;
- full CI-lik port er grønn fra en ren installasjon;
- en annen utvikler kan følge releaseoppskriften uten muntlige spesialinstruksjoner;
- ingen K1-kostnad er aktivert uten separat G1-beslutning.
