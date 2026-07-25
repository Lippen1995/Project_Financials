# Sprint 1 – beslutningsgrunnlag

**Dato:** 25. juli 2026

**Teknisk releasekandidat:** `50c39f3dcd34bc3563ae151123295b315aae48fb`

**Anbefaling:** Godkjenn Sprint 1 som teknisk lukket på K0. Flytt
leverandørspesifikk backup/restore, TLS, proxy- og deployverifikasjon til G1, der
de kan bevises mot valgt host. Dette er ikke en godkjenning av offentlig beta
eller aktivering av K1-kostnader.

## Resultat

| Område | Vurdering | Bevis |
| --- | --- | --- |
| GL-101–GL-104 | Lukket | Full filskann, 0 kjente credentials, autorisert write-route, 61 validerte body-flater og begrenset CSV-import |
| GL-105 | Beta-baseline | Reelt vern på én instans; delt lager kreves før horisontal skalering |
| GL-106 | Beta-baseline | Håndhevet CSP, sikre auth-cookies og fail-closed origin; hostkontroller gjenstår til G1 |
| GL-107 | Lukket | 37 migrasjoner passerer clean replay og full legacy-adopsjon med identisk sluttskjema |
| GL-108 | K0 lukket | Repeterbar lokal release-, migrasjons-, smoke- og rollbackoppskrift; hostappendiks fylles ved G1 |
| GL-109 | Lukket | Ren installasjon, sikkerhetsporter, 1 879 tester, typecheck, lint, build og begge migrasjonsstier grønne |

To uavhengige sluttreviewer fant ingen gjenværende P0–P3-funn etter rettingene.

## Viktige rettinger i closeout

- En uautorisert skrivende oil-and-gas-rute krever nå administrator.
- Aksjonærregister-import validerer administrator, MIME, filnavn, deklarert og
  faktisk størrelse samt offisiell CSV-header før filen beholdes.
- Hemmelighetsskanningen leser hele sporede filer strømmet; to HAR-filer med
  lokale Auth.js callback-/CSRF-cookieverdier er fjernet og HAR-output ignoreres.
- Migrasjonshistorikken er gjort repeterbar uten å endre den allerede anvendte
  `20260714184500`-migrasjonen.
- Registry-speilene har obligatorisk `sourceSystem`, `sourceEntityType`,
  `sourceId`, `fetchedAt` og `normalizedAt`, også for legacy-data.
- Auth-hostvalideringen er deterministisk og feiler lukket i produksjon.

## Migrasjonsbevis

- Clean replay: 37/37 migrasjoner, status oppdatert.
- Full legacy-kopi: 1 167 785 entities, 848 396 subunits, 1 319 132 personer og
  3 394 303 rolleoppføringer.
- Repair + deploy på legacy-kopien: 344,5 sekunder.
- Lokal adopsjon: 385,2 sekunder.
- Etter begge kjøringer: alle 6 729 616 rader bevart, 0 ugyldige
  proveniensrader og tom Prisma schema-diff mot clean replay.

Dette krever et kontrollert vedlikeholdsvindu ved første legacy-adopsjon.

## Restrisiko og senere porter

1. G1 må velge host og fylle inn eksakte backup-, restore-, deploy-, health- og
   rollbackkommandoer samt bevise TLS, HTTP-redirect og avvisning av ukjent
   `Host`.
2. Kjør maksimalt én appinstans inntil rate limiter har delt atomisk lager.
3. Før offentlig beta må `unsafe-inline` og bred `img-src https:` enten reduseres
   eller få en uttrykkelig, tidsavgrenset CEO-risikoaksept.
4. Produksjonshemmeligheter skal opprettes/roteres ved G1. De fjernede HAR-filene
   inneholdt lokale callback-/CSRF-cookieverdier, ikke en dokumentert
   produksjonssesjon.
5. Ingen K1-kostnad er aktivert i Sprint 1.

## CEO-beslutning

| Beslutning | Valg | Dato / signatur |
| --- | --- | --- |
| Godkjenn Sprint 1 som teknisk lukket på K0 | Avventer | |
| Flytt host-spesifikk releaseappendiks og nettverksbevis til G1 | Avventer | |
| Bekreft én appinstans frem til delt limiter | Avventer | |

En godkjenning her åpner neste planlagte arbeid, men åpner ikke offentlig beta
og gir ikke fullmakt til K1-kostnader.
