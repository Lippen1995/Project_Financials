# KPI-register for lukket beta

**Status:** KPI-metode og evalueringsregel godkjent 24. juli 2026; instrumentering og pilot gjenstår

**Rapportering:** Ukentlig fra betaåpning, uten syntetiske eller manuelt pyntede tall

KPI-ene måler om brukeren løser en profesjonell analyseoppgave bedre enn med dagens metode. Søk, profilvisning og chatbruk er diagnostiske hendelser, ikke selvstendige bevis på produktverdi.

## Produkt-KPI-er

| ID | KPI | Operasjonell definisjon | Datakilde | Mål | Måleevne nå | Eier |
| --- | --- | --- | --- | --- | --- | --- |
| KPI-01 | Komplett analysearbeidsflyt | Primærbrukere med onboarding og definert betaoppgave som fullfører minst én systemverifisert arbeidsflyt og bekrefter anvendelig resultat / alle slike primærbrukere | Kohortregister + analyseobjekt + hendelseslogg + brukerbekreftelse | Minst 70 % | Nevner og regel godkjent; mangler felles analyseobjekt og fullføringshendelse | Produkt / teknisk |
| KPI-02 | Spart tid | Median prosentvis reduksjon mellom to forhåndsmatchede, kvalitetsgodkjente oppgaver per bruker: én med dagens metode og én med Fjord Insight | Låst oppgavekort + tidtaking + tidsstemplede analysehendelser + kvalitetskontroll | Minst 30 % | Metode godkjent; oppgavekort, timer og instrumentering mangler | Produkt / research |
| KPI-03 | Nytt relevant Njord-funn | Fullførte Njord-assisterte betaoppgaver med minst ett identifiserbart, nytt og relevant funn som består kilde-/beregningskontroll / alle fullførte Njord-assisterte betaoppgaver | Lagret funn + strukturert brukerfeedback + faktastøttekontroll | Minst 50 % | Definisjon og nevner godkjent; feedback- og kontrollflyt mangler | Produkt |
| KPI-04 | Meningsfull oppfølging | Brukere som innen 7 dager gjør minst én kvalifiserende handling utover obligatorisk/automatisk lagring / brukere som fullfører minst én analyse | Analyse-/liste-/eksport-/deling-/overvåkningshendelser | Minst 50 % | Definisjon godkjent; hendelseskobling og 7-dagersvindu mangler | Produkt / teknisk |
| KPI-05 | Vesentlig bedre for et bruksmål | Kvalifiserte betadeltakere som etter fullført oppgave velger «vesentlig bedre» mot dagens metode og gir kort begrunnelse / alle kvalifiserte betadeltakere | Låst oppgavesurvey | Minst 70 % | Protokoll godkjent; skjema mangler | Produkt / research |
| KPI-06 | Ukentlig Njord-intensjon | Kvalifiserte betadeltakere som ved uke fire svarer «ukentlig» eller oftere / alle kvalifiserte betadeltakere | Låst uke-fire-survey | Minst 60 % | Protokoll godkjent; skjema mangler | Produkt |
| KPI-07 | Produktavhengighet | Kvalifiserte betadeltakere som ved uke fire svarer «svært skuffet» dersom Fjord Insight fjernes / alle kvalifiserte betadeltakere | Låst uke-fire-survey | Minst 40 % | Protokoll godkjent; skjema mangler | Produkt |
| KPI-08 | Betalingsinteresse | Unike virksomheter med navngitt beslutningstaker/sponsor, konkret bruksområde og verdi, uttrykt vilje til tilbud/prisdiskusjon/betalt pilot og datert neste steg | Tilgangsstyrt CRM | Minst 3 virksomheter | Definisjon godkjent; CRM-oppsett mangler | CEO / salg |

## Kvalitets- og driftsporter

| ID | KPI | Operasjonell definisjon | Datakilde | Port / terskel | Måleevne nå | Eier |
| --- | --- | --- | --- | --- | --- | --- |
| KPI-09 | Njord faktastøtte | Materiale faktiske og numeriske påstander med korrekt kilde-/beregningsstøtte / alle evaluerte materiale faktiske og numeriske påstander | Versjonert 60-casers evalueringssett + påstandskontroll + 20 % holdout | 100 % før produksjon; 0 fabrikasjoner og 0 kritiske sikkerhetsbrudd; minst 90 % korrekt/relevant oppgaveresultat | Metode godkjent; datasett og evaluator mangler | Teknisk / produkt |
| KPI-10 | Kritiske datafeil | Bekreftede feil som kan endre brukerens beslutning, kobler data til feil entitet eller bryter proveniens/autorisasjon | Feedback + analyse-/profilvisninger + hendelseslogg | 0 åpne kritiske feil ved G2 | Definisjon og håndtering godkjent; samlet feedback- og triageflyt mangler | Data |
| KPI-11 | Tilgjengelighet | Vellykkede eksterne minuttkontroller / alle planlagte kontroller, separat for kjerneplattform og Njord ende-til-ende | Ekstern uptime-monitor + operativ overvåkningskonto | Kjerne minst 99,5 %; Njord minst 99,0 % per kalendermåned, inkludert vedlikehold og leverandørfeil | Metode godkjent; monitor mangler frem til K1 | Teknisk |
| KPI-12 | Alvorlige hendelser | P0/P1-hendelser klassifisert etter låst taksonomi og responstid | Hendelseslogg + varslings- og øvelsesbevis | 0 åpne P0; P1 må være lukket eller ha skriftlig CEO-aksept med frist | Klassifisering og responstid godkjent; prosess/øvelse mangler | Teknisk |
| KPI-13 | AI-kostnad | Faktisk AI-kostnad, inkludert feil/retries, per aktiv bruker, levert Njord-samtale og KPI-01-fullført analyse | Leverandørbruk + intern token-/kallmåling + analyse-ID | Innen godkjent K1-tak | Enheter og metode godkjent; full kost-/analyse-kobling mangler | Produkt / teknisk |
| KPI-14 | Total betakostnad | Faktisk hosting, database, lagring, overvåking, e-post, AI og øvrige variable tjenester per måned og aktiv bruker | Fakturaer, leverandørmåling og dokumentert valutakurs | Innen godkjent K1-tak | Metode godkjent; priser og K1-tak ikke godkjent | CEO |

Tersklene er produktbeslutningen for betaen, men målemetoden skal godkjennes før første bruker starter. En definisjon eller terskel kan ikke endres etter at resultatet er sett uten at endringen logges med dato, beslutningstaker og begrunnelse.

## Hva som teller som en komplett arbeidsflyt

En arbeidsflyt teller bare når samme analyseobjekt inneholder:

1. valgt formål og eksplisitte kriterier;
2. et bygget selskapsunivers fra godkjente kilder;
3. minst én gjennomført sammenligning, rangering eller aggregert analyse;
4. dokumentert undersøkelse av minst ett selskap eller analyseobjekt;
5. en konklusjon som skiller fakta, beregninger, antakelser og usikkerhet;
6. et lagret resultat eller en eksplisitt oppfølgingshandling.

For KPI-01 kan ikke produktet markere arbeidsflyten som fullført bare fordi en sekvens av sider er åpnet.

### Nevner og frafall

Nevneren låses til alle primærbrukere som har akseptert invitasjonen, fullført onboarding og fått en definert betaoppgave. Inviterte som aldri aktiverer kontoen rapporteres separat som aktiveringsfrafall og skjules ikke. En reserve kan erstatte en primærbruker bare før vedkommende starter betaoppgaven, og byttet loggføres før resultatet er kjent.

Tekniske feil, Njord-feil eller manglende produktkapabilitet etter oppgavestart teller som ikke fullført. En arbeidsflyt teller først når systemet kan verifisere de seks stegene over og brukeren selv bekrefter at resultatet er anvendelig. Ingen deltaker kan ekskluderes etter at resultatet er kjent, med mindre en forhåndsdefinert datakvalitetsregel gjør målingen ugyldig; slike tilfeller vises separat med årsak og beslutningstidspunkt.

## Måling av spart tid

KPI-02 måles med ett sammenlignbart oppgavepar per bruker. Brukeren gjennomfører én reell oppgave med dagens metode og én separat, sammenlignbar oppgave med Fjord Insight. Oppgavetype, omfang, leveranse og kvalitetskrav låses før tidtaking. Rekkefølgen fordeles mellom deltakerne slik at ikke alle bruker dagens metode først.

Klokken går fra oppgavestart til første anvendelige resultat. Eksterne avbrudd over fem minutter trekkes fra og registreres med årsak. Et oppgaveresultat inngår bare dersom samme forhåndsdefinerte kvalitetskrav er oppfylt for begge oppgavene. Estimert historisk tidsbruk samles eventuelt inn som kontekst, rapporteres separat og inngår ikke i hoved-KPI-en.

For hvert gyldig par beregnes `(baselinetid - Fjord Insight-tid) / baselinetid`. Primærresultatet er medianen av de gyldige parene. Rapporten viser også antall gyldige par, min/maks eller annet robust spenn og resultat per arbeidsflyt. Manglende eller ikke-sammenlignbar baseline vises som «ikke målbart» og skal ikke erstattes med et anslag.

Med en planlagt kohort på 12 primærbrukere behandles resultatet som et retningssignal. Det skal ikke presenteres som statistisk bevis eller med p-verdi med mindre et senere, forhåndsplanlagt studiedesign har tilstrekkelig utvalg.

## Hva som teller som et nytt relevant Njord-funn

Et Njord-funn er et konkret, kilde- eller beregningsstøttet faktum, forhold, avvik eller mønster som brukeren bekrefter var både nytt og relevant for den definerte betaoppgaven. Funnet skal kunne identifiseres som en egen påstand eller innsikt i den lagrede analysen og ha synlig kilde- eller beregningsgrunnlag som består kontroll.

Generelle råd, et vanlig søkeresultat uten analytisk betydning, informasjon brukeren allerede kjente eller en påstand uten støttende grunnlag teller ikke. En mulig forklaring som ikke kan dokumenteres skal merkes og registreres separat som hypotese og kan ikke telle i KPI-03.

Nevneren er alle fullførte, Njord-assisterte betaoppgaver. Manglende feedback teller som «ikke bekreftet», ikke som en eksklusjon. For hvert positivt tilfelle lagres funn-ID, brukerens ny/relevant-bekreftelse og resultatet av kilde-/beregningskontrollen.

## Låst survey- og intervjuprotokoll

KPI-05 måles umiddelbart etter den definerte betaoppgaven med spørsmålet: «Hvordan var Fjord Insight sammenlignet med metoden du vanligvis bruker for denne arbeidsoppgaven?» Svarskalaen er «mye dårligere», «noe dårligere», «omtrent likt», «noe bedre» og «vesentlig bedre». Bare «vesentlig bedre» teller positivt, og brukeren gir en kort begrunnelse.

KPI-06 måles ved slutten av uke fire med spørsmålet: «Hvis du fortsatt hadde tilgang og relevante data, hvor ofte ville du brukt Njord i arbeidet ditt?» Svarskalaen er «aldri», «sjeldnere enn månedlig», «månedlig», «ukentlig» og «flere ganger i uken». «Ukentlig» eller «flere ganger i uken» teller positivt.

KPI-07 måles ved slutten av uke fire med spørsmålet: «Hvordan ville du følt det dersom du ikke lenger kunne bruke Fjord Insight?» Svarskalaen er «svært skuffet», «noe skuffet», «ikke skuffet» og «ikke relevant / har ikke brukt nok». Bare «svært skuffet» teller positivt.

Ordlyd, rekkefølge, tidspunkt og svarskala fryses før første deltaker. Simen Lippestad eller andre intervjuere skal ikke opplyse hvilket svar som teller positivt. Primær rapportering bruker alle kvalifiserte betadeltakere som nevner; manglende svar teller ikke positivt. Respondentresultat og svarprosent vises separat for å synliggjøre frafall.

## Hva som teller som meningsfull oppfølging

KPI-04 måler om et analyseresultat brukes videre innen syv dager etter fullført arbeidsflyt. Automatisk lagring eller lagring som er nødvendig for å bestå KPI-01 teller ikke.

Minst én av følgende handlinger må skje:

- selskaper legges i en navngitt shortlist eller arbeidsliste;
- overvåkning aktiveres;
- resultatet eksporteres;
- analysen deles med et navngitt workspace-medlem;
- analysen gjenåpnes og får en ny beslutning, kommentar eller status.

Nevneren er alle brukere som fullfører minst én analyse, og hver bruker teller bare én gang. Handlingen må være koblet til det fullførte analyseobjektet og skje innen syv dager.

## Hva som teller som betalingsinteresse

En virksomhet teller bare én gang, uavhengig av antall brukere. Følgende må være dokumentert i et tilgangsstyrt CRM:

1. navngitt beslutningstaker eller intern sponsor;
2. konkret bruksområde og forventet verdi;
3. forespørsel om tilbud, aksept for diskusjon av et oppgitt prisnivå eller uttrykt vilje til betalt pilot;
4. et datert kommersielt neste steg.

Generell ros, ønske om gratis videre tilgang, «hold meg oppdatert» eller en uspesifisert fremtidig interesse teller ikke. Persondata og kommersielle notater skal ikke lagres i repoet og følger retensjonsregelen i personvernregisteret.

## Minimum instrumentering før beta

- Invitasjon sendt, akseptert, tilbakekalt og utløpt; første vellykkede innlogging.
- Analyse opprettet med pseudonymisert bruker, formål og arbeidsflyttype.
- Kriterier bekreftet og datadekningsadvarsler akseptert.
- Universbygging startet/fullført/feilet, med resultatantall og versjonert kriteriesett.
- Kandidat inkludert/ekskludert/rangert med beregningsversjon, uten å duplisere unødvendige kildedata.
- Sammenligning eller aggregering gjennomført med perioder og manglende datapunkter.
- Selskaps-/personundersøkelse åpnet fra analysen.
- Njord-plan, godkjent verktøybruk, kildeutfall, påstander, responstid, tokenbruk og brukerfeedback.
- Konklusjon lagret og resultat lagret, eksportert, lagt i arbeidsliste eller satt til overvåkning.
- Arbeidsflyt fullført av brukeren; produktet kan foreslå, men ikke automatisk fabrikere fullføring.
- Baseline- og sluttid, kvalitetsvurdering, nytt funn, sammenligningsvurdering og bruksintensjon.
- Deployversjon, helsesjekk, hendelsesstatus og faktiske kostnader.

## Instrumenteringsarkitektur og backlog

### Verifisert nåsituasjon

Kodebasen har `CompanySearchEvent` for søkehistorikk og `AiSearchUsageEvent` for reservasjon og måling av modell/tokens. Disse modellene kan ikke alene beregne beta-KPI-ene. Det finnes per 24. juli 2026 ingen felles `Analysis`-modell, låst betadeltaker-/oppgavetildeling eller versjonert analysehendelsesstrøm. `AiSearchUsageEvent` mangler blant annet analyse-/samtale-ID, pris og full kostnadsstatus. Eksisterende DD-workflow er rom-/oppgavespesifikk og er ikke betaens felles analyseobjekt.

### Felles hendelseskontrakt

Alle KPI-hendelser skal bruke en versjonert, server-side kontrakt med minst:

- unik hendelses-ID og idempotency key;
- hendelsesnavn og skjemaversjon;
- pseudonym deltaker-ID;
- `analysisId`, `workspaceId` og arbeidsflyttype når relevant;
- serverregistrert `occurredAt` og deployversjon;
- avgrenset, typet metadata etter allowlist;
- kilde-/beregnings-/modellversjon når hendelsen representerer et analytisk resultat.

Klienthendelser skal valideres og autoriseres på serveren før lagring. Rå Njord-samtaler, analysefritekst, profilinnhold, passord, tokens og komplette kildedata skal ikke kopieres inn i KPI-hendelser. Manglende `analysisId` på en analysehendelse er en målefeil, ikke en hendelse som kan tilordnes i ettertid ved gjetning.

### Låste hendelsesfamilier

| Familie | Minimumshendelser |
| --- | --- |
| Kohort | `beta.invite_accepted`, `beta.onboarding_completed`, `beta.assignment_locked`, `beta.reserve_replaced`, `beta.withdrawn` |
| Benchmark | `benchmark.task_started`, `benchmark.pause_started`, `benchmark.pause_ended`, `benchmark.result_submitted`, `benchmark.quality_reviewed` |
| Analyse | `analysis.created`, `analysis.criteria_confirmed`, `analysis.conclusion_saved`, `analysis.user_completed` |
| Univers | `universe.build_started`, `universe.build_completed`, `universe.build_failed` |
| Analysearbeid | `comparison.completed`, `aggregation.completed`, `entity.investigated` |
| Njord | `njord.response_delivered`, `njord.finding_identified`, `njord.finding_feedback`, `njord.finding_support_reviewed` |
| Oppfølging | `followup.shortlist_added`, `followup.worklist_added`, `followup.monitor_enabled`, `followup.exported`, `followup.shared`, `followup.reopened_updated` |
| Survey | `survey.task_comparison_submitted`, `survey.week4_submitted` med spørsmåls-/skjemaversjon, ikke fritekstkopi i eventet |
| Drift | ekstern helsesjekk, P0/P1-status, deploy, leverandørstatus og kostnadspost |

### Implementasjonsbacklog

| ID | Leveranse | Ferdig når |
| --- | --- | --- |
| KPI-B01 | Betadeltaker og oppgavetildeling | Primær/reserve, onboarding, arbeidsflyt, låsedato og forhåndsdefinert eksklusjonsstatus kan spores uten kandidatnavn i repoet |
| KPI-B02 | Felles analyseobjekt | Formål, kriterier, univers, beregninger, konklusjon, status og eier har stabil ID og workspace-tilgang |
| KPI-B03 | Versjonert hendelseslager | Felles kontrakt valideres server-side, er idempotent og avviser ukjente/rå felter |
| KPI-B04 | Benchmark-oppgavekort og timer | Matchet par, rekkefølge, pauser over fem minutter, kvalitetsport og gyldighet kan beregnes reproduserbart |
| KPI-B05 | Arbeidsflytberegner | KPI-01 kan beregnes fra seks faktiske steg og brukerbekreftelse uten sidevisningsproxy |
| KPI-B06 | Njord-funn og kontroll | Funn-ID kobler synlig funn, ny/relevant-feedback og kilde-/beregningskontroll |
| KPI-B07 | Oppfølgingsvindu | Kvalifiserende handlinger kobles til fullført analyse og evalueres i et fast syvdagersvindu |
| KPI-B08 | Frosne surveys | Godkjent ordlyd/skala/tidspunkt er versjonert; svarprosent og manglende svar rapporteres |
| KPI-B09 | Kostnadsallokering | Modellkall, retries og leverandørkost kobles til samtale/analyse; faste og variable kostnader rapporteres separat |
| KPI-B10 | Drift og hendelser | Ettminutts kjerne-/Njord-SLI, P0/P1-tidslinje og varslingsbevis kan rapporteres |
| KPI-B11 | Personvern og retensjon | Pseudonymisering, tilgang, 30/90-dagersjobber, researchutløp og rettighetssletting består test |
| KPI-B12 | KPI-pilot og datakvalitet | Minst én intern, ikke-syntetisk pilot med reelle offisielle data produserer alle beregnbare KPI-er eller ærlig «ikke målbart» |

KPI-B01–B03 er fundament og skal ferdigstilles før resten instrumenteres. KPI-B12 må bestås før første betabruker. Hendelsesdefinisjoner og SQL-/serviceberegninger versjoneres sammen; dashboardet skal ikke inneholde egen, avvikende KPI-logikk.

## Fireukers evaluerings- og beslutningsregel

Betaresultatet avgjøres etter en forhåndsbestemt fireukersperiode. Ukentlig rapportering brukes til drift, datakvalitet og tidlig risikohåndtering, men terskler, nevnere og hovedbeslutning endres ikke etter at resultatene er sett.

### Utvid betaen

- alle personvern-, sikkerhets-, faktastøtte-, datafeil- og kostnadsporter består;
- KPI-01 og KPI-02 når målene;
- minst tre av KPI-03–KPI-07 når målene;
- KPI-08 viser minst tre unike virksomheter med konkret betalingsinteresse.

### Forleng lukket beta

- alle absolutte porter består;
- resultatene er blandede eller utvalget er utilstrekkelig;
- konkret hypotese, forbedring, uendret eller eksplisitt revidert målemetode og ny sluttdato besluttes før videre testing.

### Stopp eller bygg om

- en absolutt port feiler;
- både KPI-01 og KPI-02 feiler;
- eller fullført kohort gir ingen konkret betalingsinteresse.

Alle KPI-er rapporteres separat med teller, nevner, manglende data og relevante segmenter. En samlet score skal ikke brukes til å skjule et kritisk avvik eller kompensere for en feilet absolutt port.

## Njords evaluerings- og produksjonsport

Evalueringssettet skal inneholde minst 60 representative oppgaver:

- 15 M&A-oppgaver;
- 15 sourcing-/leverandøroppgaver;
- 15 konkurrent-/bransjeoppgaver;
- 15 oppgaver som dekker manglende data, tilgangsgrenser, prompt injection, tidsavbrudd og leverandørfeil.

Faktacaser bruker ekte, offisielle data og frosne kildesnapshots med proveniens. Minst 20 prosent av casene holdes skjult som holdout og skal ikke brukes til løpende prompt-, verktøy- eller modelltilpasning.

Følgende produksjonsporter gjelder:

1. 100 prosent av materiale faktiske og numeriske påstander har korrekt kilde- eller beregningsstøtte.
2. Ingen oppdiktede selskaper, personer, kilder eller tall.
3. Ingen brudd på tilgang, workspace-grenser eller verktøytillatelser.
4. Alle kritiske manglende-data-, sikkerhets- og avvisningscaser består.
5. Minst 90 prosent av oppgavene får et korrekt og relevant sluttresultat etter låst rubrikk.
6. Strukturerte svar og verktøykall består skjemavalidering.

Deterministiske kontrakt-, timeout-, feil- og skjematester bruker mockede modellsvar i CI og skal ikke ringe en live modell. Ekte modellevaluering kjøres separat med versjonert modell/konfigurasjon, kontrollert budsjett og lagret resultat. Ett kritisk avvik blokkerer G2 selv om gjennomsnittet ellers består.

## Klassifisering av kritiske datafeil

En datafeil er kritisk når den kan endre brukerens beslutning, kobler data til feil selskap eller person eller bryter tilgangsgrensen. Dette omfatter:

- feil organisasjonsnummer, selskap eller personkobling;
- oppdiktet faktum, kilde eller tall;
- feil fortegn, valuta, enhet eller regnskapsperiode med materiell virkning;
- offisiell status presentert som gjeldende i strid med den godkjente kilden;
- beslutningskritisk påstand uten korrekt proveniens;
- data fra feil workspace eller uten autorisasjon.

Et tydelig merket datagap eller «ikke tilgjengelig» er ikke en feil. Alle mulige kritiske feil triageres samme arbeidsdag. Berørt datapunkt, verktøy eller funksjon deaktiveres frem til feilen er rettet, kildegrunnlaget er kontrollert og en regresjonstest består. G2 krever null åpne kritiske datafeil.

## Måling av tilgjengelighet

Tilgjengelighet måles og rapporteres separat for kjerneplattformen og Njord. Kjerneplattformen omfatter innlogging, søk, selskapsvisning, analyseobjekt og lagring og skal ha minst 99,5 prosent tilgjengelighet per kalendermåned. Njord regnes bare som tilgjengelig når modell, nødvendige verktøykall og svarlevering samlet fungerer, og skal ha minst 99,0 prosent tilgjengelighet per kalendermåned.

En ekstern kontroll kjøres minst hvert minutt. En hendelse må vare gjennom to påfølgende kontroller før den påvirker tilgjengelighetsberegningen, slik at en enkelt målefeil ikke skaper falsk nedetid. Planlagt vedlikehold og leverandørfeil teller som nedetid, men klassifiseres også separat i rapporten.

Rapporten skal vise prosentvis oppetid, antall hendelser, lengste hendelse og påvirkede arbeidsflyter. En operativ overvåkningskonto kan brukes, men skal ikke inneholde konstruerte selskaps- eller persondata. Kontrollen og varslingsveien testes før G2.

## Hendelsesklassifisering og respons

En P0-hendelse er en pågående datalekkasje, tilgang på tvers av workspace, omgått autentisering, kompromittert hemmelighet, uautorisert administratortilgang eller vesentlig datatap. Simen Lippestad varsles innen 15 minutter. Berørt funksjon, tilgang eller leverandør isoleres umiddelbart, med mål om å begrense hendelsen innen 60 minutter.

En P1-hendelse er en kritisk arbeidsflyt som er utilgjengelig i mer enn 30 minutter, en gjentatt beslutningskritisk datafeil, en Njord-fabrikasjon som når en bruker, mislykket backup/gjenoppretting eller en alvorlig leverandørfeil uten kontrollert fallback. Simen Lippestad varsles innen én time, og hendelsen får navngitt eier og avbøtende tiltak samme arbeidsdag.

Alle P0/P1-hendelser dokumenteres med tidslinje, påvirkning, berørte data/brukere, rotårsak, begrensning, korrigerende tiltak og regresjonstest. G2 krever null åpne P0. En åpen P1 må enten lukkes eller ha skriftlig CEO-risikoaksept med begrunnelse og frist; ellers flyttes lanseringen.

## Kostnadsmåling

En aktiv bruker er en unik bruker med minst én meningsfull, autentisert produktaktivitet i perioden. En Njord-samtale er en brukerinitiert samtaletråd med minst ett levert modellsvar. En fullført analyse er bare en arbeidsflyt som består KPI-01.

AI-kostnad inkluderer faktisk fakturert eller målt input, output, cache, eventuelle leverandørverktøy, mislykkede kall og retries. Total betakostnad inkluderer hosting, database, lagring, overvåking, e-post, AI og andre variable tjenester. Rapporten viser faktisk kostnad per aktiv bruker, Njord-samtale og fullført analyse. Kostnaden skal ikke deles på inviterte eller inaktive brukere.

Faktiske faktura- og leverandørtall brukes. Midlertidige estimater merkes separat og erstattes når faktiske tall foreligger. Beløp rapporteres i leverandørvaluta og NOK med dokumentert kursdato. Målemetoden er frosset. [Kostnadsregisteret](./cost-register.md) låser K1 til NOK 5 000 eks. mva. per måned, med kontrollgrenser på NOK 400 per aktiv bruker per måned og NOK 125 per fullført analyse.

## Datadisiplin

- Rapporten bruker bare registrerte hendelser, strukturerte intervjusvar og faktiske leverandørkostnader.
- Manglende målepunkt vises som «ikke målbart», ikke som null.
- Brukeridentifikatorer pseudonymiseres der individnivå ikke er nødvendig.
- Fritekst fra analyser og intervjuer skal ikke kopieres inn i KPI-tabeller dersom aggregat eller klassifikasjon er tilstrekkelig.
- Retensjon for analyseobjekter, Njord-spor og researchdata må godkjennes i personvernregisteret før instrumenteringen aktiveres.
