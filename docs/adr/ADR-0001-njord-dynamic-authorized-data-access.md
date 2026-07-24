# ADR-0001: Njord velger dynamisk blant alle autoriserte datadomener

**Status:** Akseptert

**Dato:** 22. juli 2026

**Forfatter og godkjenner:** Simen Lippestad (CEO)

## Kontekst

Fjord Insight skal løse varierende analyseoppgaver innen M&A, sourcing, leverandørvalidering og konkurrent-/bransjeanalyse. Det er ikke mulig å forhåndsbestemme ett fast datasett eller én fast verktøysekvens som er riktig for alle oppgaver. Njord skal bruke sin analytiske kunnskap til å velge hvilke selskaps-, person-, finans-, eierskaps-, rolle-, geografi-, dokument-, hendelses- og markedsdata som er relevante.

Dagens Njord har en eksplisitt verktøyliste, men mangler en felles univers-/screeningtjeneste, varig analysekontekst, batchverktøy og tilgang til flere datadomener. Hvert spørsmål sendes i dag uten tidligere samtale-/analysekontekst.

Kravet om bred analytisk frihet må balanseres mot tilgangskontroll, tenant-isolasjon, datakvalitet, etterprøvbarhet, kostnad og forbudet mot syntetiske selskapsfakta.

## Beslutning

Njord skal fungere som en dynamisk analyseplanlegger over alle normaliserte Fjord Insight-datadomener som den aktuelle brukeren har rett til å se.

1. LLM-en velger selv relevante datadomener, verktøy og rekkefølge ut fra brukerens mål.
2. Tilgang skjer bare gjennom versjonerte, typede og godkjente interne verktøy. LLM-en får ikke direkte database-, filsystem-, nettverks-, miljøvariabel- eller hemmelighetstilgang.
3. Hvert verktøy håndhever autentisering, workspace-/tenant-avgrensning, abonnement/entitlement, inputvalidering, resultatgrenser og datakvalitetsregler.
4. Filtrering, beregning, aggregering og rangering utføres deterministisk i verktøylaget. LLM-en kan velge metode, vekter og kriterier når oppgaven krever det, men valgene og beregningsversjonen skal lagres og vises.
5. Njord kan bruke alle tilgjengelige datadomener, men manglende eller utilgjengelige data skal forbli nullable og skal ikke behandles som et negativt faktum.
6. Resultatet skal skille offisielle fakta, andre kildebaserte opplysninger, deterministiske beregninger og analytiske hypoteser.
7. Analyseplan, kriterier, verktøykall, kildeutfall, beregningsgrunnlag, usikkerhet og konklusjon lagres i et tilgangsstyrt analyseobjekt.
8. Kilde- og beregningsspor skal være synlig i brukerresultatet. Et svar med ugrunnede selskapsfakta eller tall kan ikke presenteres som ferdig analyse.
9. Verktøyfeil skal gi avgrenset delresultat eller tydelig utilgjengelighet. LLM-en skal ikke kompensere med gjetning.
10. Batchgrenser, timeout, kansellering, rate limit, dagstak, månedstak og kostnadsmåling skal håndheves utenfor modellen.
11. Nye datadomener blir ikke automatisk tilgjengelige fordi en tabell eller integrasjon finnes. De må ha godkjent kilde, normalisering, proveniens, tilgangsregel, tomtilstand og verktøykontrakt.

Simen Lippestad er ansvarlig for produkt-, data-, sikkerhets- og kostnadsgodkjenning frem til rollene delegeres.

## Skala- og kapasitetsvurdering

- Betaen har 12 primærbrukere og inntil 8 reserver.
- Universspørringer kan dekke det norske virksomhetsregisteret, men hvert verktøy skal bruke indekserte kriterier, sideinndeling, eksplisitte maksimum og batchoperasjoner; LLM-en skal ikke iterere selskap for selskap over hele registeret.
- Ved 10 ganger betavolum blir asynkrone analyser, resultatcache og jobb-/kostnadskø nødvendig for brede universanalyser.
- Ved 100 ganger betavolum må analysearbeid skilles fra webrequesten og kjøres i en dedikert jobb-/analyseplattform med egne kapasitetsgrenser.
- Interaktive enkeltverktøy bør normalt svare innen tre sekunder. Flertrinnsanalyser skal vise fremdrift og gå over til asynkron jobb når de ikke kan fullføres innen en kontrollert requestgrense.

## Sikkerhet og pålitelighet

- Alle verktøy tar bruker-/workspace-kontekst fra den autentiserte serverkonteksten, aldri fra en ubekreftet modellparameter.
- Tenant-/ressurstilgang kontrolleres i service-/query-laget for hvert kall.
- Prompt- og verktøyinput valideres; verktøyresultater behandles som data, ikke som nye systeminstrukser.
- Persondata, analysefritekst og Njord-spor følger egne retensjons- og slettingsregler.
- Alle vesentlige tilgangs- og beregningsvalg skal kunne auditeres.
- Feil i én kilde eller ett verktøy skal ikke ta ned resten av analysen eller føre til syntetisk fallback.

## Konsekvenser

### Positive

- Njord kan tilpasse analysen til brukerens reelle formål i stedet for faste skjermbilder og feltlister.
- Nye datadomener kan legges til gjennom verktøykontrakter uten å skrive om hele agenten.
- Beregninger og rangering forblir reproduserbare selv om LLM-en velger analysetilnærmingen.
- Tilgang, kilder og usikkerhet kan dokumenteres per analyse.

### Negative

- Omfanget er større enn en fast trestegs chatbot og krever analysepersistens, bredere verktøydekning og evalueringsinfrastruktur.
- Kostnad og responstid varierer mer og krever harde grenser og asynkron kjøring.
- Verktøyregisteret og autorisasjonslaget får høy sikkerhetsmessig betydning og må testes systematisk.
- En språkmodell kan velge irrelevante eller ineffektive verktøy; evalueringssettet må derfor måle både plan, datavalg og konklusjon.

### Nøytrale

- Arbeidsflytene beholder egne UI-er og deterministiske read-models, men Njord kan bruke de samme tjenestene dynamisk.
- Ikke alle tilgjengelige data brukes i hver analyse; «all data» betyr tilgjengelig for relevant, autorisert verktøybruk, ikke at alt alltid lastes inn i modellkonteksten.

## Alternativer som er vurdert

### Direkte databaseadgang for LLM-en

Avvist fordi det gir for stor angrepsflate, svak tenant-isolasjon, uforutsigbar kostnad og manglende kontroll over rådata, hemmeligheter og spørringer.

### Fast dataliste og fast verktøysekvens per arbeidsflyt

Avvist fordi ulike M&A-, sourcing- og bransjeoppgaver trenger forskjellige signaler. Det ville gjøre Njord til en forhåndsprogrammert veiviser i stedet for en digital analytiker.

### LLM-genererte beregninger og rangeringer uten deterministiske verktøy

Avvist fordi resultatene ikke blir reproduserbare, testbare eller tilstrekkelig kildeforankret.

## Referanser

- [Styrende produktposisjonering](../go-live/product-positioning.md)
- [GL-011 arbeidsflyt-/datagapanalyse](../go-live/workflow-data-gap-analysis.md)
- [Beta-charter](../go-live/beta-charter.md)
- [Personvern- og retensjonsregister](../go-live/privacy-and-retention.md)
