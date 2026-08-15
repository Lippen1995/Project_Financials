# G1-bevis: forespørselsveien leser lokalt

**Status:** Teknisk lukket 15. august 2026
**Regel:** GL-A01 / R-020

## Resultat

De registrerte produktleseflatene starter ikke lenger eksterne kilde- eller
modellkall. Forespørselsveien leser database/lokal persistens, kan opprette en
avgrenset kørecord og viser en ærlig ventetilstand. Eksterne kall ligger i
hemmelighetsbeskyttede, leasede bakgrunnsjobber. En repository-vid kontroll
oppdager nye direkte kilde-/modell-signaler i aktive app-, komponent-, lib- og
serverfiler; blandede moduler har egne funksjonsnivåkontroller.

| Domene | Forespørselsvei | Bakgrunnspopulering | Manglende data |
| --- | --- | --- | --- |
| Strukturert Brreg-regnskap | Offentlig financials-repository | `structured-financials-queue-service` | `PENDING` / ikke lastet ennå |
| Brreg-kunngjøringer | `company-announcement-read-service` + `SourceDocument` | `company-announcement-sync-service` hvert femte minutt | Oppretter `CompanyAnnouncementFetchState(PENDING)` |
| SSB Klass | `SsbClassificationRepository` | Leaset `ssb-classification-sync-service` daglig | Tomt lokalt treff; et tomt kildesvar erstatter aldri siste gode speil |
| Premium AI-søk | `AiSearchJob` opprettes og poller resultat | Leaset `ai-search-job-service` hvert minutt | Køstatus, backoff/retry eller kontrollert terminal jobbfeil |
| Søkeintensjon/scope | Deterministisk databasesøk | Samme asynkrone premiumflyt | Ordinært søk mens AI-jobben kjører |
| Aksjonærer, konsernansatte, Statnett og IP | Lagrede databasedata; IP/Statnett er tomme inntil read models finnes | Eksisterende import- og syncflyter; nye speil må bygges før tomme flater aktiveres | Ærlig tomtilstand |
| Nyheter og distress | Lagrede `NewsArticle`, `SourceDocument`, `CompanyEvent` og distress-tabeller | Planlagte event-, news- og distress-jobber | Ingen request-time warmup eller discovery |

## Premiumverdien

AI-søk er fortsatt en rettighet for abonnement som støtter det. Forskjellen er
regnskapsmessig og driftsmessig: sidekallet bestiller analysen; worker-kallet
pådrar kostnaden. Worker-kallet gjenbruker den eksisterende sikkerhetsprompten,
injeksjonskontrollen, abonnementskontrollen, tokenreservasjonen og faktisk
forbruksføring. Gratisbrukere kan ikke opprette jobben.

## Automatiske kontroller

- `lib/request-path-network-inventory.test.ts` oppdager alle offentlige app-
  entrypoints og nye kilde-/modell-signaler i det aktive kildetreet, kontrollerer
  de registrerte leseflatene og skiller den interne AI-executoren fra den
  offentlige handleren.
- Brreg- og SSB-testene blokkerer/utelater nettverk og leser kun de lokale
  repositoryene.
- AI-rutetesten beviser `202 PENDING` uten modellkall eller tokenreservasjon i
  brukerforespørselen; worker-testen beviser at utførelsen skjer separat.
- Den maskinlesbare oversikten ligger i
  `lib/request-path-network-inventory.ts`.

## Operativ rest før G1-signering

Migrasjonen må deployes, de tre nye cronrutene må få gyldig `CRON_SECRET`, og
første vellykkede SSB-/kunngjøringskjøring samt en premium AI-jobb må observeres
i produksjonslik staging. Dette er runtime-bevis, ikke gjenstående read-through-
kode.
