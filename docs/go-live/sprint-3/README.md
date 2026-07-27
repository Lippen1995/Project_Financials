# Sprint 3 – analysegrunnlag og Njord-kontroller

**Status:** Aktiv teknisk leveranse på K0

**Startet:** 27. juli 2026

**Kostnadsnivå:** K0 – ingen modellnøkkel eller ny betalt tjeneste er aktivert

Sprint 3 bygger det felles, etterprøvbare analyselaget for M&A-screening,
kunde-/leverandørsourcing og konkurrent-/bransjeanalyse. Leveransen er startet
på grenen `codex/sprint-3-njord-analysis`. Dette dokumentet er et teknisk
kontrollpunkt, ikke en formell sprintlukking eller G1-godkjenning.

## Første vertikale leveranse

| ID | Teknisk status | Bevis |
| --- | --- | --- |
| GL-301 | Implementert som fundament | `LlmClient` holder produktlogikken leverandøruavhengig; betalt runtime har eksplisitt provider-/pris-preflight |
| GL-302 | Implementert som fundament | Alle Njord-verktøy har versjon, resultatklasse og godkjente datadomener; nytt `screen_company_universe` bruker bare intern tjeneste |
| GL-303 | Delvis: responskontrakt | API-et skiller `DOCUMENTED_FACT`, `CALCULATION` og `EXPLANATION` per verktøyresultat; kobling fra enkeltpåstand til konkret kilde og UI-visning gjenstår |
| GL-304 | Implementert i kjernen | Manglende finans- og rangeringsdata forblir nullable og vises som datagap; de blir aldri nullstilt |
| GL-305 | Implementert i kjernen | Sikker systeminstruks og server-side avvisning stopper hemmelighetsuthenting og forsøk på å omgå tilgang |
| GL-306 | Delvis: én appinstans | Burstgrense, dagstak og forespørselsbudsjett finnes; modelladapteren reduserer providerens maksimale output innenfor restbudsjettet, mens delt limiter avventer G1-host |
| GL-307 | Implementert som K0-fundament | Tokens, estimert NOK-kostnad, responstid og modellfeil lagres; hele forespørselsbudsjettet reserveres atomisk mot et globalt kalendermånedstak før modellkall, og aktivering blokkeres uten verifiserte priser |
| GL-308 | Delvis: kontraktsett v1 | 50 lagrede evalueringsspørsmål dekker fakta, beregning, offisiell kunnskap, tomtilstand og sikkerhet; konkrete forventede fakta for representative reelle virksomheter gjenstår |
| GL-309 | Delvis: deterministisk runner | Runneren måler verktøybruk, kilder, sikkerhet og resultatkontrakt uten modellkostnad; faktisk faktastøtte og sammenligning av minst to modeller krever G1 |
| GL-310 | Implementert v1 | Innlogget bruker kan markere hvert faktisk Njord-svar som `Nyttig` eller `Feil`; beslutningen lagres idempotent |
| GL-311 | Implementert | Modellfeil gir kontrollert 503 og ærlig melding; selskapsopplevelsen fortsetter |
| GL-312 | Delvis: backend-fundament | Tilgangsstyrt `Analysis` kan opprettes og få en kildeverifisert konklusjon med optimistisk versjonering; les/gjenoppta-flyt og Njord-kontekst er ikke koblet på |
| GL-313 | Backend-fundament implementert | UI-API og Njord-verktøy bruker samme `company-universe-v1`, screening og manglende-data-policy |
| GL-314 | Backend-fundament implementert | Periode, vekter, normalisering, dekningsprosent og beregningsspor er deterministiske i `company-ranking-v1` |
| GL-315 | Delvis: create-API | Longlist, shortlist, sourcingliste og peer-sett kan batchlagres med inklusjonsgrunn, datagap, rekkefølge og offisielt utledede kilder; lesing, omrekkefølge og videreføring gjenstår |

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
- `njord-eval-v1`: 50 representative spørsmål uten syntetiske selskapsfakta.

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

Migrasjonene `20260727143000_add_sprint3_analysis_foundation` og
`20260727173000_add_njord_cost_reservations` er brukt på lokal
utviklingsdatabase. En produksjonslik read-only universkjøring avdekket at et
bredt univers kunne bli avkortet før rangering. Tjenesten avviser nå slike
forespørsler med `REFINE_REQUIRED` og uten en misvisende delrangering.
Regresjonstesten låser denne adferden.

## Åpent før formell lukking

1. Full analyse-/arbeidsliste-UI for de tre arbeidsflytene må bygges over de nye
   API-ene.
2. Evalueringssettet må kjøres mot minst to aktuelle modeller etter G1, med
   verifiserte priser og ingen svakere sikkerhetsport.
3. Evalueringssettet må få forventede reelle fakta og påstand-til-kilde-bevis,
   ikke bare resultat- og sikkerhetskontrakter.
4. Analyseobjektet må kunne leses/gjenopptas og kobles inn som eksplisitt
   Njord-kontekst.
5. Delt rate limiter, host-adferd og hard NOK-stopp må bevises på valgt
   plattform i G1/G2.
6. Ende-til-ende-test må bevise formål → univers → rangering → lagret
   arbeidsliste → konklusjon for alle tre arbeidsflytene.
7. Sprinten kan først lukkes etter samlet review, full suite og eksplisitt
   CEO-godkjenning.
