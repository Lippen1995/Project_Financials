# Sprint 3 – analysegrunnlag og Njord-kontroller

**Status:** K0 teknisk fullført – formell sprintlukking avventer CEO/G1

**Startet:** 27. juli 2026

**Kostnadsnivå:** K0 – ingen modellnøkkel eller ny betalt tjeneste er aktivert

Sprint 3 bygger det felles, etterprøvbare analyselaget for M&A-screening,
kunde-/leverandørsourcing og konkurrent-/bransjeanalyse. Leveransen er startet
på grenen `codex/sprint-3-njord-analysis`. Dette dokumentet er et teknisk
K0-kontrollpunkt, ikke en godkjenning av betalt modellbruk, hosting eller G1.

## Første vertikale leveranse

| ID | Teknisk status | Bevis |
| --- | --- | --- |
| GL-301 | Implementert som fundament | `LlmClient` holder produktlogikken leverandøruavhengig; betalt runtime har eksplisitt provider-/pris-preflight |
| GL-302 | Implementert som fundament | Alle Njord-verktøy har versjon, resultatklasse og godkjente datadomener; nytt `screen_company_universe` bruker bare intern tjeneste |
| GL-303 | Implementert v1 på K0 | Verktøyresultater gir modellen eksplisitte sitat-ID-er. API og UI kobler hver sitert påstand til konkret femfeltsproveniens og eventuell offisiell URL; faktasvar uten gyldig påstandskilde vises ikke |
| GL-304 | Implementert i kjernen | Manglende finans- og rangeringsdata forblir nullable og vises som datagap; de blir aldri nullstilt |
| GL-305 | Implementert i kjernen | Sikker systeminstruks og server-side avvisning stopper hemmelighetsuthenting og forsøk på å omgå tilgang |
| GL-306 | Delvis: én appinstans | Burstgrense, dagstak og forespørselsbudsjett finnes; modelladapteren reduserer providerens maksimale output innenfor restbudsjettet, mens delt limiter avventer G1-host |
| GL-307 | Implementert som K0-fundament | Tokens, estimert NOK-kostnad, responstid og modellfeil lagres; hele forespørselsbudsjettet reserveres atomisk mot et globalt kalendermånedstak før modellkall, og aktivering blokkeres uten verifiserte priser |
| GL-308 | Implementert v1 på K0 | 50 lagrede evalueringsspørsmål dekker fakta, beregning, offisiell kunnskap, tomtilstand og sikkerhet. 28 forventede fakta er verifisert mot Brreg-speilet for fire reelle virksomheter med komplett kildegrunnlag |
| GL-309 | Implementert som K0-runner | Runneren måler verktøybruk, faktaverdi, påstandskilde, sikkerhet og resultatkontrakt uten modellkostnad. Sammenligning av minst to aktuelle modeller er eksplisitt G1-arbeid |
| GL-310 | Implementert v1 | Innlogget bruker kan markere hvert faktisk Njord-svar som `Nyttig` eller `Feil`; beslutningen lagres idempotent |
| GL-311 | Implementert | Modellfeil gir kontrollert 503 og ærlig melding; selskapsopplevelsen fortsetter |
| GL-312 | Implementert v1 | Tilgangsstyrt `Analysis` kan opprettes, listes og gjenopptas; formål, kriterier, univers, beregningsoppsett, konklusjon, oppfølging, status og offisielt kildegrunnlag kan lagres med optimistisk låsing. Njord-endepunktet mottar bare eksplisitt, tilgangskontrollert og størrelsesbegrenset analysekontekst |
| GL-313 | Implementert v1 | UI-API og Njord-verktøy bruker samme `company-universe-v1`, screening og manglende-data-policy. Arbeidslister fra universmotoren lagrer kjøringsversjoner og -tellinger atomisk sammen med inkluderte kandidater, datagap og hele eksklusjonssettet; eksklusjonsårsaker og kildebevis kan inspiseres paginert i arbeidsflyt-UI |
| GL-314 | Implementert v1 | Periode, retning, vekter, normalisering, dekningsprosent og beregningsspor er deterministiske i `company-ranking-v1`; UI lagrer den validerte rangeringskontrakten før kjøring |
| GL-315 | Implementert v1 | Longlist, shortlist, sourcingliste og peer-sett kan opprettes direkte fra lagret univers eller batchlagres fra reelle organisasjonsnumre, vises og omrekkefølges; selskaper kan promoteres mellom lister uten å endre lagret inklusjonsgrunn, datagap eller kildebevis |

## K0-sikker aktivering

`AI_SEARCH_BILLING_ENABLED` er fortsatt `false` som standard. En betalt modell
kan ikke aktiveres før provider, nøkkel, verifiserte NOK-priser, dagstak,
forespørselstak og månedstak er konfigurert. Standard prisfelter er bevisst
nullstilt i `.env.example`; de skal ikke fylles med gamle eller antatte priser.

Ingen språkmodell ble kalt under denne leveransen.

## Datakontrakter

- `company-universe-v1`: offisielt registerunivers, eksakte filtre,
  finansperiode, resultatgrense og eksplisitt manglende-data-policy.
- `company-screening-v1`: inklusjon, eksklusjon og datagap.
- `company-ranking-v1`: vekter, retning, normalisert delscore, dekningsprosent,
  periode og deterministisk tie-break på organisasjonsnummer.
- `njord-eval-v1`: 50 representative spørsmål og 28 verifiserte Brreg-fakta
  for fire reelle virksomheter. Fakta brukes bare som evalueringsfasit, aldri
  som produktdata eller fallback.

Universet bruker `RegistryEntity` fra Brreg som selskapsmaster. Finansielle
filtre og beregninger bruker bare tilgjengelige `FinancialStatement`-rader med
`sourceSystem = BRREG`. Manglende finansposter påvirker ikke rangeringen som
null; de vises som utilgjengelige og følger valgt policy.

## Verifikasjon

```text
npm run db:generate
npm run db:migrate:deploy
npm run typecheck
npm run test
npm run njord:evaluate
```

Migrasjonene `20260727143000_add_sprint3_analysis_foundation`,
`20260727173000_add_njord_cost_reservations` og
`20260727221000_add_analysis_worklist_exclusions` er brukt på lokal
utviklingsdatabase. En produksjonslik read-only universkjøring avdekket at et
bredt univers kunne bli avkortet før rangering. Tjenesten avviser nå slike
forespørsler med `REFINE_REQUIRED` og uten en misvisende delrangering.
Regresjonstesten låser denne adferden.

K0 har i tillegg en deterministisk ende-til-ende-kontrakttest for hver av de
tre arbeidsflytene. Testen går gjennom formål, lagret `company-universe-v1`,
`company-ranking-v1`, arbeidsliste med inklusjons-/eksklusjonsbevis og gjenlest
konklusjon via de offentlige analysegrensene. Den bruker en lokal testadapter;
innlogging, staging-host og ekte modell bevises først i Sprint 4 etter G1.

Sluttverifisering 28. juli 2026:

- `npm test`: 292 testfiler bestått, 2 hoppet over; 1 985 tester bestått,
  12 hoppet over.
- `npm run build` og `npm run typecheck`: bestått.
- `npm run lint`: 0 feil; 18 eksisterende varsler, hvorav 3 i hovedtreet.
- API-inventaret: 144 ruter kontrollert uten manglende valideringsbevis.
- Miljø-/hemmelighetskontrollen: 1 564 sporede filer kontrollert uten funn.
- `npm run njord:evaluate`: 50 tilfeller og 28 kildeverifiserte fakta lastes
  deterministisk uten modellkall eller modellkostnad.

## Åpent etter K0

1. Evalueringssettet må kjøres mot minst to aktuelle modeller etter G1, med
   verifiserte priser og ingen svakere sikkerhetsport.
2. Njord-konteksten må bevises ende-til-ende mot modellene som eventuelt
   godkjennes i G1; ingen modell ble kalt i K0-leveransen.
3. Delt rate limiter, host-adferd og hard NOK-stopp må bevises på valgt
   plattform i G1/G2.
4. Sprinten kan først lukkes formelt med eksplisitt CEO-godkjenning. K0-
   ferdigstillelsen godkjenner ikke modell, host, kostnader eller offentlig beta.
