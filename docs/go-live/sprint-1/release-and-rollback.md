# Release- og rollbackoppskrift

**Status:** Teknisk godkjent på K0 27. juli 2026. Host-spesifikke felter lukkes ved G1.

**Eier og lanseringsmyndighet:** Simen Lippestad

## 1. Forutsetninger

- CEO har godkjent commit-ID og releasevindu.
- Release går fra en ren, gjennomgått commit; lokale ucommittede filer inngår ikke.
- Produksjonsmiljøet har separat database og separate hemmeligheter.
- `AUTH_SECRET`, `DATABASE_URL` og aktuelle jobbhemmeligheter er konfigurert i hostens secret store.
- `AUTH_URL` eller `NEXTAUTH_URL` er satt til den kanoniske offentlige HTTPS-origin-en; appen feiler lukket uten denne.
- Reverse proxy setter én kanonisk `Host`/`X-Forwarded-Host` og avviser ukjente hostnavn før trafikken når Auth.js.
- En gjenopprettbar databasebackup er fullført og kontrollert.
- Forrige fungerende deploy-/artifact-ID er notert som `ROLLBACK_RELEASE`.

## 2. Lokal releaseport

Kjør fra repository-roten:

```bash
npm ci
npm run security:check-env-files
npm run security:check-api-inputs
npm run security:audit
npm run db:generate
npm run typecheck
npm test
npm run lint
npm run build
```

Ingen steg kan ignoreres. En feil stopper releasen.

## 3. Migrasjonskontroll

Mot en ikke-produksjonsdatabase med samme skjema:

```bash
npm run db:migrate:status
npm run db:migrate:deploy
npm run db:migrate:status
```

Kontroller at alle migrasjoner er additive eller har en særskilt, skriftlig rollbackplan. `prisma db push` er forbudt i releasebanen.

### Engangsadopsjon av db-push-era database

En database som har den feilede migrasjonen
`20260721123000_add_offline_business_knowledge` må repareres før vanlig deploy.
Bekreft først at det er akkurat denne migrasjonen som står som feilet. Ta og
verifiser backup, sett vedlikeholdsmodus og kjør deretter:

```bash
npx prisma migrate resolve --rolled-back 20260721123000_add_offline_business_knowledge
npm run db:migrate:deploy
npm run db:migrate:status
```

Ikke bruk `migrate resolve` for andre migrasjoner uten en separat gjennomgang.
Fullvolum-rehearsal med 6 729 616 registry-rader tok 344,5 sekunder, bevarte alle
rader og ga 0 manglende proveniensfelt. Sett av minst 10 minutters
vedlikeholdsvindu med margin, og overvåk låser, WAL og ledig disk gjennom kjøringen.

## 4. Deployrekkefølge

1. Sett release til vedlikeholdsmodus dersom migrasjonen ikke er bakoverkompatibel.
2. Ta databasebackup og noter backup-ID.
3. Deploy den godkjente commit-en som en ny, uforanderlig release.
4. Kjør `npm run db:migrate:deploy` én gang fra releasejobben.
5. Start applikasjonen og vent på at hostens health check er grønn.
6. Kjør kontrollene under.
7. Fjern vedlikeholdsmodus.
8. CEO registrerer deploy-ID, commit-ID, migrasjoner, tidspunkt og resultat.

Host ved G1 må fylle inn:

- kommando/handling for databasebackup og hvordan restore testes;
- deploykommando eller pipeline;
- health-check-URL;
- handling for å flytte trafikk tilbake til `ROLLBACK_RELEASE`;
- hvor release- og hendelsesloggen lagres.

## 5. Smoke-kontroller

- HTTPS videresender all HTTP-trafikk og sertifikatet er gyldig.
- `Content-Security-Policy`, HSTS, nosniff, frame-deny, referrer-, permissions- og cross-origin-hodene er til stede; `X-Powered-By` mangler.
- Auth-endepunktet setter produksjonscookies med `__Host`/`__Secure`, `HttpOnly`, `Secure`, `SameSite=Lax` og `Path=/`.
- En request med et ukjent `Host`-navn avvises av reverse proxy.
- Ny bruker kan åpne login og autentisere.
- Uautentisert bruker får 401 på beskyttet API.
- Vanlig bruker får 403 på administratorhandling.
- Selskapsøk returnerer reelle Brreg-data eller kontrollert tom-/feiltilstand.
- Selskapsprofil viser kilde og hentetid.
- Njord er deaktivert uten godkjent modell-/kostnadsaktivering, eller gir kildebasert svar når aktivert.
- Offentlig beta viser ikke OCR-/PDF-avledede regnskapstall.
- En opprettet arbeidsliste kan leses igjen av samme bruker og ikke av en annen bruker.

## 6. Rollback

Rollback utløses ved datalekkasje, feil tilgangskontroll, mislykket migrasjon, vedvarende 5xx, uriktige offentlige data eller brudd på OCR-/kostnadsporten.

1. Stopp ny trafikk eller sett vedlikeholdsmodus.
2. Roter berørte hemmeligheter umiddelbart ved mulig eksponering.
3. Flytt applikasjonstrafikken til `ROLLBACK_RELEASE`.
4. Ikke kjør automatisk nedmigrasjon. Vurder først om forrige release tåler det nye skjemaet.
5. Ved ikke-bakoverkompatibel eller korrumperende migrasjon: stopp skriverne og gjenopprett den godkjente backupen etter eksplisitt CEO-beslutning.
6. Kjør smoke-kontrollene mot rollback-releasen.
7. Registrer hendelse, omfang, dataeffekt, beslutning og korrigerende tiltak.

## 7. Releasejournal

Hver release skal minst registrere:

- dato og klokkeslett;
- ansvarlig og godkjenner;
- commit-ID og deploy-/artifact-ID;
- databasebackup-ID;
- migrasjoner som ble kjørt;
- resultat fra automatiske porter og smoke-kontroller;
- eventuelle avvik eller risikoaksepter;
- rollback-release og faktisk rollbackresultat dersom brukt.
