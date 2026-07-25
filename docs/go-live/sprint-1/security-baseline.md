# Sprint 1 – sikkerhetsbaseline

**Dato:** 24. juli 2026

**Eier:** Simen Lippestad

**Omfang:** Repository, avhengigheter, HTTP-ruter, innlogging, Njord, CI og databaseendringer

## Baseline og resultat

| Kontroll | Før | Etter første leveranse |
| --- | --- | --- |
| Dependency advisories | 23 totalt: 3 kritiske, 16 høye, 3 moderate, 1 lavt | 0 etter første leveranse; 9 høye i ESLint-verktøykjeden etter ny `brace-expansion`-advisory 25. juli |
| Git-sporede private miljøfiler | Ingen funnet | Automatisk blokkert i CI |
| Kjente nøkkel-/private-key-formater i sporede filer | Ingen funnet i 1 439 filer | Automatisk blokkert i CI |
| Adminruter | Guard fantes, men samlet bevis manglet | 56 av 56 verifisert med DB-basert rolleoppslag |
| Interne ruter | Spredte tjenestehemmeligheter/reviewer-guard | 12 av 12 verifisert beskyttet |
| Produksjon uten auth-hemmelighet | Avhengig av rammeverksfeil | Eksplisitt fail-closed |
| Rate limiting | Ikke felles kontroll | Credentials, LinkedIn, primærsøk, søkeforslag og Njord dekket |
| API-inputflater | Spredt validering uten samlet bevis | CI-porten inventerer 136 rutefiler: 80 muterende og 91 med GET, med 60 body-, 71 path- og 51 query-flater uten manglende valideringsbevis. Kritiske offentlige oppslagsgrenser har atferdstester; organisasjonsnummer, selskapsreferanse, år og tidspunkt bruker delte semantiske kontrakter |
| Sikkerhetshoder | Ikke konfigurert samlet | Global baseline konfigurert |
| Database i CI | `prisma db push` | `prisma migrate deploy` |
| Automatiske porter | Type, test og lint | Hemmelighetskontroll, audit, migrasjon, type, test, lint og build |

## Avhengighetsbeslutninger

- Next.js, Auth.js, Prisma, Vitest, fast-xml-parser, PostCSS og Sharp ble løftet til sikre kompatible versjoner.
- Transitive PostCSS-, Sharp- og esbuild-versjoner er låst for å hindre at sårbare kopier installeres gjennom andre pakker.
- `xlsx@0.18.5` ble fjernet fordi advisories mangler en trygg npm-fiks. Funksjonen brukte pakken kun til å liste arkfaner i offisielle SODIR-regneark; kildelenken og resten av publikasjonen beholdes.

## Tilgangsmodell

- `requireAdmin` og `requireFinancialReviewer` leser rollen på nytt fra databasen og stoler ikke bare på JWT.
- Uautentiserte kall får 401; autentiserte brukere uten riktig rolle får 403.
- Interne jobb-endepunkter feiler lukket dersom riktig tjenestehemmelighet ikke er konfigurert.
- Tjenestehemmeligheter skal være separate per jobbdomene og roteres ved mistanke om eksponering.

## Kjente begrensninger

- `npm audit` er på nytt rød etter at en ny `brace-expansion`-advisory ble publisert. Funnene ligger i utviklingsverktøy via ESLint/minimatch; npm foreslår ESLint 10 som en breaking change. Sprint 1-porten forblir rød til kompatibilitet er bevist eller risiko er eksplisitt akseptert.
- API-inventaret er en filnivå, statisk regresjonsport og kan ikke alene bevise at hver konsumert verdi valideres i riktig handler når en rutefil eksporterer flere metoder. Derfor suppleres porten med atferdstester på de kritiske offentlige søke-, selskaps-, person-, profil- og underenhetsgrensene samt intern årsrapportoversikt.
- Limiteren er prosesslokal. Den gir reelt vern på én beta-instans, men kan omgås på tvers av flere instanser. Produksjon med horisontal skalering krever delt atomisk lager.
- Klient-IP er basert på reverse-proxy-hoder. Valgt host må dokumentere at klienten ikke kan overstyre det betrodde headerfeltet.
- CSP er ikke håndhevet ennå fordi innlogging, Next.js-inlinekode, kart og eksterne ressurser må testes samlet. De øvrige sikkerhetshodene er aktive.
- Den automatiske hemmelighetskontrollen dekker private miljøfiler og kjente credential-formater, men erstatter ikke leverandørens secret scanning eller manuell nøkkelrotasjon.
