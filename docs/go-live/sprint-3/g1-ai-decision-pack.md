# AI-delunderlag til G1: Njord-modell og kostnad

**Status:** Utkast til AI-delbeslutning – ikke komplett G1-underlag; ingen modell eller kostnad er godkjent

**Utarbeidet:** 29. juli 2026

**Beslutningseier:** Simen Lippestad (CEO)

## Beslutningen som foreslås

Det foreslås at AI-delen av G1 behandles i to kontrollerte beslutningstrinn:

1. **G1-A – evaluering:** Godkjenn OpenAI som evalueringsleverandør og et
   midlertidig AI-tak på NOK 225 eks. mva. for å sammenligne
   `gpt-5.6-terra` og `gpt-5.6-luna` på `njord-eval-v1`. Bare adminbrukere får
   tilgang til konfigurasjonen; bare interne admin-/kontrollørroller får
   modellkvote. Kundebruk forblir stengt.
2. **G1-B – betamodell:** Velg betamodell først etter at evalueringsrapport,
   faktisk tokenbruk, kostnad og responstid er registrert. Dersom porten
   godkjennes, kan AI-rammen økes til det allerede vedtatte harde maksimumet
   på NOK 2 500 eks. mva. per kalendermåned.

Dette skiller tillatelsen til å skaffe beslutningsbevis fra tillatelsen til
ordinær betabruk. `G1-A` og `G1-B` er arbeidsnavn i dette forslaget, ikke nye
godkjente porter eller en endring av den autoritative sprintplanen. CEO må
eksplisitt godkjenne selve todelingen i G1. G1-A er ikke en
forhåndsgodkjenning av G1-B.

Dette dokumentet dekker bare AI. Full G1 krever i tillegg konkret budsjett og
leverandørvalg for hosting, database, lagring, overvåking og e-post;
sammenligning av minst to driftsalternativer inkludert AWS når rasjonelt;
Brreg-dekning, domene, databehandleravtaler og personvernunderlag. Disse
kravene står fortsatt åpne i den samlede sprintplanen.

## Anbefaling

**Primær kandidat:** `gpt-5.6-terra`

**Kostnadsutfordrer:** `gpt-5.6-luna`

**Ekskludert fra G1-evalueringen:** `gpt-5.6-sol`

Terra er beste utgangspunkt fordi OpenAI beskriver modellen som balansen mellom
intelligens og kostnad. Sol har dobbelt tokenpris av Terra, og CEO har derfor
avvist Sol som for dyr for denne evalueringen. Dette er en
kandidatvurdering, ikke et endelig modellvalg. Fjord Insights eget evalsett er
den bindende beslutningskilden.

Luna er billigst og brukes som kostnadsutfordrer, men leverandørens
finansbenchmark ligger vesentlig lavere enn Terra. Luna kan derfor bare velges
hvis Fjord Insights egne absolutte kvalitetsporter består. Sol kan vurderes
på nytt senere bare ved en ny eksplisitt CEO-beslutning.

## Datert pris- og kapabilitetsbevis

Kildene ble kontrollert 29. juli 2026. Prisene er standard API-priser i USD per
én million tokens, eksklusive eventuell MVA, avgifter og betalte verktøy.

| Modell | Input | Cachet input | Output | Leverandørposisjon | Big Finance Bench |
| --- | ---: | ---: | ---: | --- | ---: |
| `gpt-5.6-sol` | USD 5,00 | USD 0,50 | USD 30,00 | Ekskludert fra G1-evalueringen på kostnad | 53 % |
| `gpt-5.6-terra` | USD 2,50 | USD 0,25 | USD 15,00 | Balanse mellom intelligens og kostnad | 51 % |
| `gpt-5.6-luna` | USD 1,00 | USD 0,10 | USD 6,00 | Kostnadssensitivt høyt volum | 36 % |

Kilder:

- [OpenAI – modellveiledning for GPT-5.6](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI – sammenligning, priser og støttede endepunkter](https://developers.openai.com/api/docs/models/compare)
- [OpenAI – GPT-5.6-resultater, inkludert Big Finance Bench](https://openai.com/index/gpt-5-6/)

Alle tre modellene støtter eksisterende Chat Completions-endepunkt,
Responses API, funksjonskall og strukturerte svar. OpenAI anbefaler Responses
API for nye, verktøytunge resonneringsflyter. Sprint 3-adapteren bruker i dag
Chat Completions. Før G1-B skal det derfor tas en eksplisitt teknisk beslutning
om å beholde den dokumenterte adapteren for beta eller migrere til Responses
API i Sprint 4. Et API-bytte skal ikke blandes inn i den første
modell-til-modell-sammenligningen.

Pris og tilgjengelighet skal kontrolleres på nytt samme dag som G1-A aktiveres.
En endret pris eller modellversjon gjør dette prisbeviset utdatert.

## Valuta og kostnadsmodell

Norges Banks USD/NOK-midtkurs var **9,6643** den 29. juli 2026. Norges Bank
opplyser at kursene er indikative midtkurser og publiseres omtrent kl. 16.00.
Kursen er derfor et datert referansepunkt, ikke leverandørens faktiske
oppgjørskurs.

Kilder:

- [Norges Bank – USD/NOK og forklaring av valutakursene](https://www.norges-bank.no/tema/Statistikk/Valutakurser/?id=USD)
- [Norges Bank API – USD/NOK 28.–29. juli 2026](https://data.norges-bank.no/api/data/EXR/B.USD.NOK.SP?format=sdmx-json&startPeriod=2026-07-28&endPeriod=2026-07-29)

Foreslått G1-konfigurasjon er siste publiserte USD/NOK-kurs på
aktiveringsdagen og **15 prosent valutarisikobuffer**. Bufferen er en
budsjettmekanisme, ikke en påstand om forventet valutabevegelse.

```text
leverandørkost_USD =
  (inputtokens × inputpris
   + cachede_inputtokens × cachepris
   + outputtokens × outputpris) / 1 000 000

estimert_kost_NOK = leverandørkost_USD × USD/NOK

risikobudsjettert_kost_NOK =
  estimert_kost_NOK × (1 + valutabuffer)
```

### Scenarioer per Njord-samtale

Scenarioene er planleggingskonvolutter, ikke observert eller syntetisk
produktbruk. Outputforutsetningen er samlet fakturerbar output, inkludert
eventuelle resonneringstokens som leverandøren rapporterer som fakturerbar
output. De inkluderer ikke retries, MVA, eventuelle betalte
leverandørverktøy eller langkontekstprising. Tabellen bruker kurs 9,6643 og
15 prosent buffer. Første G1-A-kall må bekrefte at providerens usage-felt og
Fjord Insights lagrede outputtokens dekker samme fakturerbare mengde.

| Profil | Tokenforutsetning | Luna | Terra | Sol |
| --- | --- | ---: | ---: | ---: |
| Lett | 10 000 input + 2 000 output | NOK 0,24 | NOK 0,61 | NOK 1,22 |
| Basis | 25 000 input + 5 000 output | NOK 0,61 | NOK 1,53 | NOK 3,06 |
| Tung | 60 000 input + 12 000 output | NOK 1,47 | NOK 3,67 | NOK 7,34 |

Ved basisprofilen tilsvarer AI-taket på NOK 2 500 omtrent 1 635
Terra-samtaler eller 4 089 Luna-samtaler. Dette er en matematisk
kapasitetsindikasjon, ikke et løfte om volum. Faktisk kapasitet skal beregnes
fra registrert tokenbruk etter G1-A.

### Kostnad per aktiv betabruker

Tabellen bruker basisprofilen og viser modellkost før MVA per aktiv bruker per
måned. En aktiv bruker følger KPI-registerets definisjon; samtaleantallet er
bare et transparent volumscenario.

| Samtaler per aktiv bruker / måned | Terra | Luna |
| ---: | ---: | ---: |
| 5 | NOK 7,64 | NOK 3,06 |
| 10 | NOK 15,28 | NOK 6,11 |
| 20 | NOK 30,56 | NOK 12,23 |

Forventet betavolum kan ikke låses før antall inviterte og faktisk bruk er
bekreftet. Verstefall er uansett det harde AI-taket på NOK 2 500, og
kontrollgrensen på NOK 400 per aktiv bruker utløser gjennomgang før den kan
bli en tillatelse til mer bruk. Retries og modellfeil skal inngå i faktisk
kostnad, ikke behandles som gratis trafikk.

### Evalueringsbudsjett

En full 50-case kjøring med basisprofilen er risikobudsjettert til omtrent:

- Terra: NOK 77;
- Luna: NOK 31;
- én ekstra Terra-konfigurasjon eller omkjøring: NOK 77.

NOK 225 gir dermed rom for hovedsammenligningen og én kontrollert omkjøring.
G1-A skal bruke:

- globalt månedsbudsjett: NOK 225;
- maks kostnad per kall: NOK 5;
- modelltilgang: interne admin-/kontrollørroller;
- kundebruk og aktive kundeplaner: av;
- valutabuffer: 1 500 basispunkter;
- pris, kurs, modell-ID og tidspunkt registrert før første kall.

Estimatet på NOK 185 for tre basisprofil-kjøringer gir NOK 40 reserve innen
evaltaket. En tung profil for alle 150 cases ville kostet omtrent NOK 441 og
skal derfor stoppes av NOK 225-taket; ved høyere observert tokenbruk skal
antall omkjøringer reduseres, ikke budsjettet økes automatisk.

## Evalueringsdesign og beslutningsregel

`njord-eval-v1` inneholder 50 tilfeller fordelt likt på fakta, beregning,
offisiell kunnskap, tomtilstand og sikkerhet. Det inneholder 28
kildeverifiserte Brreg-fakta. Runneren vurderer rått verktøyspor og
påstandskilder; modellen får ikke rapportere sin egen fasit.

`npm run njord:evaluate` leser observasjonsfiler og kaller bevisst ingen
modell. Før G1-A må en separat observasjonsinnsamler gjennomgås. Den skal bruke
samme servergrense, tilgangskontroll og kostnadsreservasjon som produktet,
skrive det rå kontraktsformatet som runneren validerer, og være teknisk
umulig å starte uten den eksplisitte G1-A-konfigurasjonen. Evalsett, fasit og
porter skal ikke endres etter at modellresultatene er sett.

Minstekjøring:

| Kjøring | Formål |
| --- | --- |
| Terra, standard adapterkonfigurasjon | Primær kandidat |
| Luna, identisk adapterkonfigurasjon | Kostnadsutfordrer |
| Terra, én kontrollert omkjøring | Måle stabilitet der første kjøring feiler eller er tvetydig |

Begge modeller må bruke identisk prompt, verktøy, datagrunnlag,
outputgrense og runtime. Modell-ID er den eneste variabelen i
hovedsammenligningen.

### Absolutte porter

En modell kan ikke velges dersom ett av disse kravene feiler:

- 10 av 10 sikkerhetstilfeller består, uten verktøykall eller lekkasje;
- 10 av 10 tomtilstander består uten å gjøre manglende data til null eller
  oppdiktet fakta;
- alle 28 forventede Brreg-fakta har riktig kildegrunnlag;
- ingen synlig påstand har ugyldig eller manglende kilde;
- ingen forespørsel passerer NOK 5, og samlet G1-A-kostnad passerer ikke
  NOK 225;
- modellfeil gir kontrollert fallback og frigjør eller sluttfører
  kostnadsreservasjonen korrekt.

### Rangering mellom modeller

Blant modeller som består de absolutte portene velges modellen slik:

1. Dersom bare én modell består, er den eneste valgbare kandidaten.
2. Dersom begge består, velges Luna når
   `Luna beståtte cases >= Terra beståtte cases - 1`; ellers velges Terra.
3. Median og p95-responstid rapporteres som en operasjonell kontroll. Et
   uakseptabelt stabilitets- eller latensavvik sendes tilbake til CEO i stedet
   for å overstyre kvalitetsporten automatisk.

Terra er anbefalt utgangspunkt, mens Luna kan vinne på kostnad ved tilnærmet
likt resultat etter regelen over. Hvis ingen består, legges resultatene tilbake
til CEO; Sol skal ikke aktiveres automatisk som fallback.

## Aktiveringsrekkefølge

1. Kontroller pris, modelltilgang, vilkår, databehandlergrunnlag og
   overføringsvurdering samme dag.
2. Registrer Terras USD-priser, Norges Bank-kurs og 1 500 bp buffer i
   `/admin/ai-economics`, og noter innstillingsversjonen.
3. Sett midlertidig månedsbudsjett til NOK 225, kallgrense til NOK 5 og
   intern kvote til evalueringsbehovet. Kundeplaner forblir av.
4. Sett `OPENAI_SEARCH_MODEL` til første kandidat, `NJORD_PROVIDER=openai`,
   legg nøkkelen i valgt secret store og åpne miljøets hovedbryter bare i
   evalueringsmiljøet.
5. Kjør Terra og eksporter rå observasjoner. Steng deretter adminbryteren,
   registrer Lunas lavere USD-priser som en ny auditert innstillingsversjon,
   bytt modell-ID/restart evalueringsmiljøet, og åpne bryteren igjen. Modell,
   prisversjon og brukshendelser skal kunne avstemmes én-til-én. Kjør Luna og
   sammenlign:

   ```text
   npm run njord:evaluate terra-observations.json luna-observations.json
   ```

6. Kontroller rapporten mot absolutte porter og avstem dashboardkostnaden mot
   leverandørens usage-/fakturagrunnlag.
7. Steng hovedbryteren etter G1-A. Dokumenter G1-B-beslutningen før eventuell
   kundebruk eller økning til NOK 2 500.

## Operasjonell kontrollflate

Adminflaten `/admin/ai-economics` er beslutningens tekniske kontrollpunkt. Den
viser og styrer:

- estimert, risikobudsjettert, reservert og prognostisert AI-kostnad;
- splitt per vanlig bruker, admin/kontrollør, approlle, abonnement og modell;
- kostnad per bruker, kall, feil og tokens;
- fakturavaluta, kurs, valutabuffer og leverandørens tokenpriser;
- globalt månedsbudsjett, grense per kall, dagsgrense og intern tokenkvote;
- abonnementspris i NOK, inkludert AI-kost/tokens og AI-inntektsallokering;
- kost pluss påslag, fast NOK per abonnent eller prosent av
  abonnementsinntekt;
- versjon og endringslogg for økonomikonfigurasjonen.

Abonnementsinntekt er foreløpig modellert fra aktive abonnement og lagret
månedspris. Dashboardet summerer nå modellert abonnementsinntekt, allokert
AI-inntekt, AI-bidrag og realisert påslag på tvers av konfigurerte planer.
Tallene er ikke en avstemming mot innbetalt Stripe-inntekt.

## Åpne krav før AI-delen av G1 er aktiveringsklar

| Krav | Status 29. juli 2026 | Må lukkes med |
| --- | --- | --- |
| Varsler ved 50/75/90 prosent | Ikke implementert; dashboard og hard reservasjon finnes | Testet varsel til navngitt mottaker |
| Fakturaavstemming | Ikke implementert | Leverandørbruk mot lagret NOK-kost og avviksgrense |
| MVA, gebyrer og betalingsterm | Ikke verifisert for faktisk konto | Datert kontobevis; standard API antas ikke som bindende vilkår |
| Fakturaeier | Foreslått: Simen Lippestad | CEO-bekreftelse |
| Eier for kostnadsalarm | Foreslått: Simen Lippestad | CEO-bekreftelse og testvarsel |
| Eier for kostnadsavvik/nødstopp | Foreslått: Simen Lippestad | CEO-bekreftelse og runbook |
| Observasjonsinnsamler | Ikke implementert/gjennomgått | K0-kodegjennomgang uten modellkall |
| Responses API vs. Chat Completions | Åpen teknisk beslutning | Dokumentert Sprint 4-valg |

G1-A skal ikke aktiveres før disse kravene er lukket eller CEO eksplisitt
endrer det relevante kravet i kostnadsregisteret. Før kommersiell lansering
trengs også eksport per regnskapsperiode og avstemming mot faktisk
Stripe-inntekt.

## CEO-beslutninger

Bare CEO-beslutningen om å ekskludere Sol er registrert som besluttet.
Alle øvrige rader avventer eksplisitt behandling.

| Beslutning | Alternativer | Valg | Dato / besluttet av |
| --- | --- | --- | --- |
| G1-A evalueringsleverandør | OpenAI / avvis | Avventer | — |
| G1-A kostnadstak | NOK 225 / annet / avvis | Avventer | — |
| Ekskludert kandidat | Sol | Besluttet | 29. juli 2026 / Simen Lippestad, CEO |
| Kandidater for sammenligning | Terra + Luna / annet | Avventer | — |
| Valutabuffer | 15 % / annet | Avventer | — |
| G1-B betamodell | Terra / Luna / ingen | Avventer eval | — |
| G1-B AI-månedsgrense | Inntil NOK 2 500 / lavere / ingen | Avventer eval | — |
| Foreslått todeling av AI-beslutningen | Godkjenn / behold én G1-beslutning | Avventer | — |
