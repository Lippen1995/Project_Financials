# Sprint 1 – sikkerhetsbaseline

**Dato:** 24. juli 2026

**Eier:** Simen Lippestad

**Omfang:** Repository, avhengigheter, HTTP-ruter, innlogging, Njord, CI og databaseendringer

## Baseline og resultat

| Kontroll | Før | Etter Sprint 1-tiltak |
| --- | --- | --- |
| Dependency advisories | 23 totalt: 3 kritiske, 16 høye, 3 moderate, 1 lavt | 0. En ny advisory 25. juli åpnet 9 høye funn i ESLint-verktøykjeden; disse er lukket med en testet legacy-adapter til offisielt patchet `brace-expansion@5.0.8` |
| Git-sporede private miljøfiler | Ingen funnet | Automatisk blokkert i CI |
| Kjente nøkkel-/private-key-formater i sporede filer | Ingen funnet i 1 439 filer | Alle 1 494 sporede filer strøm-skannes; automatisk blokkert i CI |
| Adminruter | Guard fantes, men samlet bevis manglet | 56 av 56 verifisert med DB-basert rolleoppslag |
| Interne ruter | Spredte tjenestehemmeligheter/reviewer-guard | 12 av 12 verifisert beskyttet |
| Produksjon uten auth-hemmelighet | Avhengig av rammeverksfeil | Eksplisitt fail-closed |
| Rate limiting | Ikke felles kontroll | Credentials, LinkedIn, primærsøk, søkeforslag og Njord dekket |
| API-inputflater | Spredt validering uten samlet bevis | CI-porten inventerer 136 rutefiler: 80 muterende og 91 med GET, med 61 body-, 71 path- og 51 query-flater uten manglende valideringsbevis. Kritiske offentlige oppslagsgrenser og den begrensede CSV-importen har atferdstester |
| Sikkerhetshoder | Ikke konfigurert samlet | Global baseline med håndhevet CSP konfigurert og nettlesertestet |
| Database i CI | `prisma db push` | 37 versjonerte migrasjoner via `prisma migrate deploy`, verifisert fra tom database og full legacy-kopi |
| Automatiske porter | Type, test og lint | Hemmelighetskontroll, audit, migrasjon, type, test, lint og build; full lokal K0-port verifisert fra ren låst installasjon 25. juli |

## Avhengighetsbeslutninger

- Next.js, Auth.js, Prisma, Vitest, fast-xml-parser, PostCSS og Sharp ble løftet til sikre kompatible versjoner.
- Transitive PostCSS-, Sharp- og esbuild-versjoner er låst for å hindre at sårbare kopier installeres gjennom andre pakker.
- Legacy-konsumenter av `brace-expansion` i ESLint 9 / Next.js 15-verktøykjeden rutes gjennom en lokal CommonJS-adapter til offisielt patchet `brace-expansion@5.0.8`. Adapteren fjernes når hele lintgrafen støtter den patchede oppstrømskontrakten direkte.
- `xlsx@0.18.5` ble fjernet fordi advisories mangler en trygg npm-fiks. Funksjonen brukte pakken kun til å liste arkfaner i offisielle SODIR-regneark; kildelenken og resten av publikasjonen beholdes.

## Tilgangsmodell

- `requireAdmin` og `requireFinancialReviewer` leser rollen på nytt fra databasen og stoler ikke bare på JWT.
- Uautentiserte kall får 401; autentiserte brukere uten riktig rolle får 403.
- Interne jobb-endepunkter feiler lukket dersom riktig tjenestehemmelighet ikke er konfigurert.
- Tjenestehemmeligheter skal være separate per jobbdomene og roteres ved mistanke om eksponering.

## Nettlesersikkerhet

- Produksjonsbygget håndhever en statisk CSP. `object-src` og `frame-src` er stengt, `frame-ancestors` er `none`, og `base-uri` og `form-action` er begrenset til samme origin.
- Next.js-runtime og eksisterende inline-stiler krever foreløpig `unsafe-inline`. `unsafe-eval` er kun tillatt i utvikling og er ikke med i produksjonspolicyen.
- Nettleseren kan hente kartfliser fra Esri og OpenSeaMap, Material Symbols fra Google Fonts og HTTPS-bilder som kommer fra brukerprofil eller reelle nyhetskilder. Øvrige nettleserforbindelser er same-origin.
- Njord-kall går kun til same-origin API. Søk/Njord-flaten, login, forsiden og kartflaten er kjørt mot produksjonsbygget uten CSP-brudd. Kartet lastet reelle API-data og begge eksterne tilekildene med HTTP 200.
- Auth.js bruker eksplisitt sikre cookies i produksjon. Et kall mot produksjonsbyggets CSRF-endepunkt returnerte `__Host-authjs.csrf-token` og `__Secure-authjs.callback-url` med `Path=/`, `HttpOnly`, `Secure` og `SameSite=Lax`.
- Auth.js stoler bare på hosten når en eksplisitt kanonisk `AUTH_URL` eller `NEXTAUTH_URL` er konfigurert. Produksjon feiler lukket uten en gyldig HTTPS-origin; HTTP er kun tillatt for loopback under lokal verifikasjon. Valgt reverse proxy må i tillegg avvise ukjente hostnavn før trafikken når appen.

## Kjente begrensninger

- API-inventaret er en filnivå, statisk regresjonsport og kan ikke alene bevise at hver konsumert verdi valideres i riktig handler når en rutefil eksporterer flere metoder. Derfor suppleres porten med atferdstester på de kritiske offentlige søke-, selskaps-, person-, profil- og underenhetsgrensene samt intern årsrapportoversikt.
- Limiteren er prosesslokal. Den gir reelt vern på én beta-instans, men kan omgås på tvers av flere instanser. Produksjon med horisontal skalering krever delt atomisk lager.
- Klient-IP er basert på reverse-proxy-hoder. Valgt host må dokumentere at klienten ikke kan overstyre det betrodde headerfeltet.
- Den statiske CSP-en tillater fortsatt `unsafe-inline` for skript og stil for å støtte Next.js 15 uten å gjøre alle sider dynamiske. En streng nonce-policy vil fjerne dette unntaket, men slår samtidig av statisk optimalisering og må besluttes som et eget ytelses-/kostnadsvalg.
- `img-src https:` støtter dynamiske profil- og kildebilder, men kan også brukes som en utgående kanal dersom HTML eller stil kan injiseres. Før offentlig beta må denne restrisikoen enten godkjennes eksplisitt eller reduseres med en kildeallowlist/same-origin bildeproxy sammen med nonce-CSP.
- Lokal produksjonsverifikasjon beviser policy, runtime og cookie-attributter, men ikke TLS-terminering, HTTP-redirect eller HSTS-effekt. Disse kontrollene forblir en obligatorisk G1-port på valgt host.
- Den automatiske hemmelighetskontrollen dekker private miljøfiler og kjente credential-formater i alle sporede filer, men erstatter ikke leverandørens secret scanning eller manuell nøkkelrotasjon.
- Legacy-adopsjonen skriver proveniens til 6,73 millioner registry-rader og holdt en migrasjonstransaksjon i 344,5 sekunder i fullvolum-rehearsal. Den krever vedlikeholdsvindu, verifisert backup og overvåking av låser/WAL.

## Lokal K0-port for GL-109

Porten ble kjørt 25. juli 2026 fra en ren `npm ci` og passerte:

- låst installasjon av 544 pakker og eksplisitt dependency audit med 0 advisories;
- miljøfilnavn og kjente credential-formater kontrollert i alle 1 494 Git-sporede filer uten funn;
- API-inputinventar av 136 rutefiler og 61 body-flater uten manglende valideringsbevis;
- eksplisitt Prisma-generering;
- TypeScript-kontroll og full Vitest-suite med 1 879 beståtte og 12 hoppet over;
- ESLint med 0 feil. De 18 advarslene gjelder eksisterende font-/bildebruk, hvor 15 ligger i lokale hjelpe-worktrees som ikke finnes i CI-checkouten;
- produksjonsbygg med fullført generering av 102 av 102 sider uten feil;
- 37 migrasjoner fra tom database, repair/deploy fra full legacy-kopi og tom schema-diff mellom sluttresultatene;
- fullvolum-backfill med 6 729 616 bevarte rader og 0 manglende obligatoriske proveniensfelt.

Kjøringen dekker releasekandidat `50c39f3dcd34bc3563ae151123295b315aae48fb` og lukker det tekniske GL-109-kriteriet. Formell Sprint 1-lukking krever fortsatt CEO-godkjenning.
