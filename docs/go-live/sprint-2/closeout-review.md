# Sprint 2 – teknisk beslutningsgrunnlag

**Beslutningsgrunnlag ferdigstilt:** 27. juli 2026

**Kostnadsnivå:** K0 – ingen nye eksterne kostnader aktivert

**Status:** Klar for CEO-beslutning; ikke formelt godkjent

**Beslutningsforslag:** Lukk Sprint 2 teknisk på K0. Den åpne strukturerte
Brreg-kilden er egnet for siste nøkkeltall for AS i betaen, med tydelig
tomtilstand for organisasjonsformer og oppstillingsplaner som ikke dekkes.
Historikk, fullstendige detaljlinjer og konserndekning skal ikke loves.

## Resultat mot GL-201–GL-210

| Leveranse | Vurdering | Bevis |
| --- | --- | --- |
| GL-201–GL-204 | Teknisk lukket | Providergrense, versjonert normalisering og femfelts proveniens fra offisiell kilde til offentlig DTO |
| GL-205 | Teknisk lukket på én appinstans | Persistente cacheutfall, idempotent upsert, prosesslokal single-flight og kontrollert retry |
| GL-206–GL-207 | Teknisk lukket | Tomtilstand, timeout, kontraktfeil, logging og synlig `STALE` uten syntetisk fallback |
| GL-208 | Teknisk lukket lokalt | Integrasjonstest dekker provider → mapping → ingest → offentlig kildepolicy for tilgjengelig, tomt og endret kontraktsvar; full suite passerte 1 906 tester, med 12 eksplisitt hoppet over |
| GL-209 | Teknisk lukket | Offentlig beta viser bare strukturerte Brreg-statements; PDF, OCR, dokumenter, detaljlinjer og rå payload fjernes |
| GL-210 | Teknisk lukket | Deterministisk, stratifisert [closeout-rapport](./structured-financial-coverage-closeout.md) med pool-/utvalgsfingeravtrykk, kompletthetsport, kildekontrollvindu og maskinlesbart JSON-format |

## Datadekning

Det deterministiske utvalget hadde mål 150 og valgte 149 virksomheter. Ett
stratum manglet én virksomhet fordi lokalbasen bare inneholdt fire ikke-aktive
ASA. Avviket er beholdt synlig; det er ikke fylt med en vilkårlig virksomhet.
Profilen er deterministisk for den registrerte databasesnapshoten. Rapportens
pool- og utvalgsfingeravtrykk gjør senere endringer synlige; rapportkommandoen
feiler dersom ett valgt selskap mangler en kildekontroll.

| Måling | Resultat |
| --- | ---: |
| Kontrollerte virksomheter | 149 |
| Strukturert regnskap tilgjengelig | 95 (63,8 %) |
| Ærlig tomtilstand | 54 (36,2 %) |
| Kilde-/kontraktfeil | 0 |
| AS-dekning | 87 / 90 (96,7 %) |
| Driftsinntekter blant tilgjengelige statements | 87 / 95 (91,6 %) |
| Driftsresultat blant tilgjengelige statements | 93 / 95 (97,9 %) |
| Årsresultat, egenkapital og sum eiendeler | 95 / 95 (100 %) |

Den samlede prosentandelen er ikke et estimat for hele Norge. Utvalget er
bevisst stratifisert for å teste positive og negative kildeutfall. Resultatet
viser særlig at ENK, ANS og DA ikke skal forventes å ha strukturerte
årsregnskapstall i denne åpne flyten, mens AS-dekningen i utvalget er høy.

## Produksjonslik lokal verifikasjon

`npm run financials:verify-structured-closeout` verifiserte alle 149
kildekontroller og kjørte både et tilgjengelig og utilgjengelig tilfelle gjennom
den offentlige tjenesteporten:

- begge read-through-oppslag brukte fersk cache;
- tilgjengelige tall hadde komplett proveniens og ingen rå payload;
- utilgjengelig tilfelle returnerte ingen statements, dokumenter eller
  detaljlinjer;
- ingen PDF-/OCR-fallback ble observert;
- 95 utfall var `AVAILABLE`, 54 var `UNAVAILABLE`, og 0 var `ERROR`.

Dette er produksjonslik applikasjonsadferd på lokal K0-infrastruktur. Faktisk
host, TLS, delt cache/lease og flerinstansadferd kan først bevises etter
plattformvalget i G1.

## Restrisiko og senere porter

1. Åpen kilde leverer et begrenset siste regnskapsgrunnlag; historikk og
   detaljerte årsrapportlinjer er ikke en del av den godkjente betaflyten.
2. Alle 95 tilgjengelige statements i utvalget brukte oppstillingsplan
   `store`. Andre oppstillingsplaner må fortsatt gi ærlig tomtilstand.
3. Single-flight er prosesslokal. Kjør én appinstans frem til delt atomisk
   lease/cache eventuelt innføres sammen med valgt drift.
4. Produksjonshost og nettverksfeil skal verifiseres på valgt plattform i G1/G2.
5. Resultatet begrunner ikke K2-kjøp. Betalt Brreg-data vurderes først mot
   dokumentert brukerbehov for historikk eller detaljdata.
6. Ingen K1- eller K2-kostnad er aktivert.

## CEO-beslutning

| Beslutning | Valg | Dato / signatur |
| --- | --- | --- |
| Godkjenn Sprint 2 som teknisk lukket på K0 | Avventer |  |
| Behold åpent Brreg-API som betastandard | Avventer |  |
| Flytt host-/flerinstansbevis til G1/G2 | Avventer |  |
| Ikke aktiver K2 uten nytt beslutningsgrunnlag | Avventer |  |

En godkjenning åpner planlagt Sprint 3-arbeid, men åpner ikke offentlig beta og
gir ikke fullmakt til K1- eller K2-kostnader.
