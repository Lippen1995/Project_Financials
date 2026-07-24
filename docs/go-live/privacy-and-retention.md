# Personvern- og retensjonsregister

**Status:** Styringsramme godkjent 24. juli 2026 – leverandør-, DPIA- og implementasjonsbevis gjenstår; dette dokumentet er ikke juridisk rådgivning

**Blokkerer:** GL-007 og port G2 inntil ansvarlig, behandlingsgrunnlag, lagring og kontaktpunkt er besluttet

## Midlertidig behandlingsansvarlig

Maakeholmen AS, organisasjonsnummer 931 075 268, er midlertidig behandlingsansvarlig for Fjord Insight. Organisasjonsnavn, organisasjonsnummer og aktiv selskapsstatus ble kontrollert mot Brønnøysundregistrenes Enhetsregister 22. juli 2026. Beslutningen forutsetter at Maakeholmen AS i overgangsperioden faktisk bestemmer formålene med behandlingen og de avgjørende behandlingsmåtene.

Fjord Insight-selskapet er under dannelse. Når den nye juridiske enheten skal overta behandlingsansvaret, skal overføringen besluttes og dokumenteres før den gjennomføres. Behandlingsregister, personvernerklæring, databehandleravtaler, leverandørkontoer og relevant brukerinformasjon skal oppdateres samtidig. Selskapsstiftelse alene flytter ikke behandlingsansvaret automatisk.

Offentlig personvernkontakt er `personvern@fjordinsight.no`, overvåket av Simen Lippestad. Adressen skal være operativ og testet før første betainvitasjon. Den rollebaserte adressen videreføres ved bytte av behandlingsansvarlig virksomhet, med mindre en ny kontaktadresse varsles samtidig.

## Foreløpig datakart

| Datakategori | Eksempler | Formål | Nåværende lagring / atferd | Beslutning eller tiltak før beta | Status |
| --- | --- | --- | --- | --- | --- |
| Konto og autentisering | Navn, e-post, passordhash, OAuth-konto, sesjon | Tilgang til lukket beta | Prisma/Auth.js; passord hashes med bcrypt | Avtalegrunnlag og avslutningsretensjon godkjent; sesjonslevetid og slettetest gjenstår | Delvis |
| Frivillig brukerprofil | Arbeidsgiver, yrkesrolle, telefon, LinkedIn, utdanning, lokasjon og interesser | Personalisering, kohortforståelse og samarbeid | `UserProfile` har mange valgfrie personfelt | Progressiv profilering og samtykke godkjent; privat standard, feltvis sletting og UI-bevis gjenstår | Delvis |
| Workspace og samarbeid | Medlemskap, invitasjoner, kommentarer, DD-innhold | B2B-samarbeid | Lagres til raden slettes/arkiveres; helhetlig retensjon ikke definert | Avtalegrunnlag og avslutningsretensjon godkjent; tilgang og teknisk slettemekanisme gjenstår | Delvis |
| Søkehistorikk | Søkestreng, filtre, resultatantall, bruker | Historikk, kvote og produktmåling | 30 dager; daglig autentisert cleanup er implementert | 30 dager godkjent; verifiser cron og at rå analysefritekst ikke inngår | Delvis |
| AI-bruk | Modell, tokenbruk, kildeproveniens og eventuelt søkeinnhold | Kostnad, kvote, kvalitet og sikkerhet | `AiSearchUsageEvent`; 30 dagers cleanup | 90 dager godkjent for dataminimert bruksmetadata; leverandør, avtale, overføring og teknisk konfigurasjon avgjøres i G1 | Delvis |
| Analyseobjekt og arbeidslister | Brukerens formål, kriterier, selskaps-/personutvalg, vurderinger, konklusjon og oppfølging | Gjennomføre og videreføre profesjonelle analyser | Samlet betamodell og retensjon er ikke dokumentert | Avtalegrunnlag og avslutningsretensjon godkjent; tilgang, deling, eksport og teknisk sletting gjenstår | Delvis |
| Njord-analysespor | Oppfølgingsspørsmål, plan, verktøykall, kildeutfall, beregninger, påstander og feedback | Etterprøvbar analyse, kvalitet, sikkerhet og produktmåling | Ikke komplett kartlagt | Strukturert spor, tilgang, retensjon og sletting er besluttet; skjema og teknisk bevis gjenstår | Delvis |
| Betaresearch og baseline | Dagens arbeidsmetode, tidsbruk, oppgavekvalitet, intervjusvar, nytt funn og betalingsinteresse | Måle produktets effekt og styre betaen | Protokoll og godkjent system er ikke valgt | Protokoll, identitetsdeling og retensjon er besluttet; tilgangsstyrt system og praktisk test gjenstår | Delvis |
| Offentlige roller | Person-/virksomhetsnavn og registrert rolle | Vise og analysere offisiell selskapsinformasjon | Brreg-data normaliseres og caches | Berettiget interesse godkjent for nødvendige, nåværende næringslivsroller; interesseavveiing, informasjon, retting og oppdatering skal dokumenteres | Delvis |
| Årsrapport-artifacts | PDF, tekst, navn og mulige signaturer | Regnskapsuttrekk og kvalitet | Rå og avledede artifacts kan lagres lokalt/persistent | Forbudt i beta-produksjon; separat utviklings-/evalueringsmiljø krever egen tilgang og retensjon | Lukket for beta |
| Logger og monitorering | IP, user-agent, feil, request-id | Sikkerhet og drift | Avhenger av valgt K1-plattform | 90 dager godkjent for ordinære logger; isolert hendelsesbevis kan beholdes i 12 måneder etter lukking; tilgang og slettetest gjenstår | Delvis |
| Betaling | Stripe-kunde-/abonnements-ID | Abonnement | Felter finnes; kjøpsflyt er ikke betakrav | Ikke aktiver før personvern, webhook-sikkerhet og avtale er godkjent | Utsatt |

## Forbudt innhold i beta

Betavilkår og produktflater skal forby at brukere legger følgende inn i Njord, analyser, arbeidslister, kommentarer eller opplastinger:

- særlige kategorier personopplysninger etter personvernforordningen artikkel 9;
- opplysninger om straffedommer eller straffbare forhold;
- fødselsnummer eller tilsvarende nasjonale identifikatorer;
- private kontaktopplysninger som ikke er nødvendige for en godkjent arbeidsflyt;
- tredjepartsopplysninger eller dokumenter brukeren ikke har rett til å dele.

UI-et skal gi en tydelig advarsel før fritekst eller dokumenter sendes til Njord. Kjente høyrisikomønstre skal filtreres eller blokkeres der dette er praktisk og forholdsmessig. Utilsiktet innhold skal kunne isoleres og slettes raskt uten å bli gjenbrukt i evaluering, produktanalyse eller modelltrening. Hendelsen logges dataminimert for sikkerhetsoppfølging. Vanlige forretningsopplysninger kan behandles når de er relevante for tjenesten og brukeren har rett til å dele dem.

## Leverandørport for Njord

Ekte modellbruk skal være teknisk blokkert inntil CEO har godkjent AI-leverandøren i G1. Før aktivering skal følgende være dokumentert og verifisert:

- databehandleravtale som oppfyller kravene i personvernforordningen artikkel 28;
- fullstendig og varslet liste over relevante underdatabehandlere;
- avtalefestet forbud mot å bruke Fjord Insight-data, prompter, svar eller verktøyutfall til generell modelltrening eller leverandørens egne formål;
- kortest tilgjengelige leverandørretensjon og dokumentert sletting;
- behandlingsregion, supporttilgang og alle faktiske eller mulige overføringer;
- gyldig overføringsgrunnlag og nødvendig overføringsvurdering når data kan gjøres tilgjengelige utenfor EØS;
- krav til konfidensialitet, sikkerhet, avviksmelding, revisjonsinformasjon og bistand ved rettighetskrav;
- teknisk test som viser at valgt konfigurasjon samsvarer med avtalen.

Behandling i EØS foretrekkes, men er ikke et absolutt leverandørkrav dersom en annen løsning har lovlig og dokumentert overføringsgrunnlag og tilfredsstillende beskyttelse. Modellkvalitet eller pris kan ikke alene overstyre porten.

## Årsrapportfiler og OCR

Rå årsrapport-PDF-er, OCR-tekst og avledede OCR-artifacts skal ikke finnes i betaens produksjonsmiljø og skal ikke være fallback for en produksjonsflate. Regnskapsfunksjoner bruker strukturerte, offisielle data med synlig kilde og viser en ærlig tomtilstand når data mangler.

Ekte dokumenter kan brukes i et separat, tilgangsstyrt utviklings- eller evalueringsmiljø når kildebruk, tilgang, formål, lagringssted og retensjon er dokumentert. Slike artifacts skal ikke kopieres til produksjon. Produksjonsbasert dokumentanalyse krever en ny data-, personvern- og kostnadsport. [GL-009-beviset](./ocr-independence-evidence.md) dokumenterer kodeport og automatiske tester; faktisk deploykonfigurasjon og tom produksjonslagring kontrolleres på nytt før G2.

## Retensjonsbeslutninger

### Konto og brukerens arbeidsinnhold

Konto, workspace-medlemskap, analyser, arbeidslister og brukerens lagrede Njord-samtaler kan beholdes mens betaavtalen og det brukerinitierte arbeidsformålet er aktivt.

Ved ordinær avslutning varsles brukeren og får 30 dager til å eksportere sitt arbeidsinnhold. Deretter skal produksjonsdata slettes innen 7 dager. Ved et uttrykkelig og gyldig slettekrav stenges tilgangen umiddelbart, og produksjonsdata slettes innen 7 dager uten ordinær eksportventetid. Slettede data skal være ute av roterende sikkerhetskopier innen ytterligere 30 dager.

Bare reelt anonymisert statistikk kan beholdes etter sletting. Pseudonymiserte hendelser omfattes fortsatt av personvernregelverket og skal følge vedtatt retensjon. Hvis data må begrenses eller beholdes for en konkret lovpålagt plikt eller for å fastsette, gjøre gjeldende eller forsvare et rettskrav, skal kategori, grunnlag, tilgang og sluttdato dokumenteres særskilt. Automatisk sletting, eksport, gjenoppretting og backup-utløp skal testes før G2.

### Logger, bruksmetadata og KPI-hendelser

| Kategori | Retensjon | Regel |
| --- | --- | --- |
| Søkehistorikk | 30 dager | Automatisk sletting; rå analysefritekst skal ikke inngå |
| AI-bruksmetadata | 90 dager | Bare modell, tokenmengde, kostnad, responstid, status og nødvendige pseudonyme koblinger; ingen rå prompter eller svar |
| Pseudonyme beta-KPI-hendelser | Til 90 dager etter avsluttet betaevaluering | Deretter sletting eller reell anonymisering; koblingsnøkkel har strengere tilgang |
| Ordinære sikkerhets- og feillogger | 90 dager | Dataminimeres og slettes automatisk |
| Isolert bevis i bekreftet sikkerhetshendelse | Inntil 12 måneder etter at saken er lukket | Egen sak, særskilt tilgang, dokumentert begrunnelse og sluttdato |

Passord, autentiseringstokens, hemmeligheter, rå Njord-prompter, Njord-svar og analysefritekst skal ikke inngå i logg- eller måledatasettene. Filtrering, tilgang og automatisk sletting skal testes før G2.

## Prosess for registrertes rettigheter

Forespørsler om innsyn, retting, eksport, sletting, begrensning eller protest mottas via `personvern@fjordinsight.no` og senere gjennom kontoinnstillingene. Simen Lippestad er ansvarlig for saksbehandlingen. Mottak skal bekreftes innen tre arbeidsdager, og forespørselen skal ferdigbehandles uten ugrunnet opphold og senest innen 30 dager.

Identiteten skal verifiseres forholdsmessig. Fjord Insight skal først bruke eksisterende innlogget sesjon, bekreftet e-post eller annen allerede tilgjengelig informasjon og skal ikke rutinemessig kreve kopi av legitimasjon. Utlevering er kostnadsfri og skjer elektronisk i et vanlig, maskinlesbart format når det er relevant.

Et avslag, en begrensning eller lovlig utsatt sletting skal begrunnes skriftlig med informasjon om klagemulighet. Gjennomføringen loggføres dataminimert. Prosessen, inkludert søk på tvers av konto, profil, workspace, analyser, Njord-spor, måledata, leverandører og sikkerhetskopier, skal øves og dokumenteres før G2.

## Personverninformasjon og AI-forbehold

Fjord Insight skal publisere lagdelt og versjonert personverninformasjon før første betainvitasjon. Invitasjon og registrering skal forklare behandlingsansvarlig, kontaktpunkt, formål, behandlingsgrunnlag, datakategorier, mottakere, overføringer, retensjon, rettigheter og klagemulighet. Den valgfrie profilen skal forklare hvilke felt som er frivillige, samtykkegrunnlaget og hvordan samtykke trekkes tilbake.

Njord-flaten skal opplyse at innhold sendes til en godkjent AI-leverandør, at svar kan inneholde feil, at kilder og beregninger må kontrolleres, og hvilket innhold som er forbudt å sende inn. Sider med offentlige rolledata skal vise Brønnøysundregistrene som kilde, dataenes aktualitet og kontaktveien for retting eller protest.

Vesentlige endringer får ny versjon og varsles direkte til aktive betabrukere før de trer i kraft når endringen påvirker formål, grunnlag, mottakere, overføringer, retensjon eller rettigheter. Njord skal ikke brukes til helautomatiske avgjørelser som har rettslig eller tilsvarende betydelig virkning for enkeltpersoner i betaen.

## Tilgang og deling

Analyser, arbeidslister og Njord-samtaler er private for oppretteren som standard. Deling krever en eksplisitt handling og kan bare gis til navngitte medlemmer i samme workspace med avgrenset lese- eller redigeringstilgang. Offentlige lenker, anonym lenkedeling og deling på tvers av virksomheter er ikke tillatt i beta.

Workspace-administratorer kan administrere medlemskap og nødvendig administrativ metadata, men får ikke automatisk lesetilgang til privat analyseinnhold. Support har ingen stående innsynstilgang. Midlertidig support- eller sikkerhetstilgang krever dokumentert formål, minste privilegium, tidsavgrensning og revisjonslogg. Tilgangen skal tilbakekalles automatisk eller umiddelbart når formålet er oppfylt.

Eksport kan bare initieres av en autorisert bruker. UI-et skal opplyse om at en nedlastet fil ikke lenger beskyttes av Fjord Insights tilgangskontroll. Tilgangsmatrisen, avvisning på tvers av workspace og revisjonslogging skal testes før G2.

## Njords analysespor

Njord skal lagre et strukturert, etterprøvbart analysespor som del av analyseobjektet. Sporet skal inneholde brukerens synlige spørsmål og svar, formål, kriterier, strukturert analyseplan, verktøynavn, tidspunkt, avgrensede verktøyparametere, kilde-/snapshot-/record-ID-er, beregnings- og rangeringsversjon, modell- og konfigurasjonsversjon, uttrykt usikkerhet, sikkerhetsbeslutninger og eksplisitt brukerfeedback når dette finnes.

Sporet skal ikke lagre eller eksponere modellens skjulte tankerekke, systemhemmeligheter eller komplette duplikater av alle rå verktøyresultater. Etterprøvbarhet skal oppnås med strukturerte beslutninger, kildereferanser, beregningsgrunnlag og versjoner. Brukerens synlige samtale og analysespor følger analyseobjektets tilgang, retensjon og sletting. Separat AI-bruksmetadata følger 90-dagersregelen. Skjema, tilgang, eksport og kaskadesletting skal testes før G2.

## Vurdering av personvernkonsekvenser (DPIA)

En full DPIA er en absolutt aktiveringsport før ekte betabrukere og ekte modellbruk. Vurderingen skal minst beskrive behandlingene, formålene og berettigede interessene; vurdere nødvendighet og forholdsmessighet; identifisere risiko for brukere og personer omtalt i dataene; og dokumentere tiltak mot blant annet uautorisert tilgang, feilslutninger, diskriminering, datalekkasjer, leverandørbruk og tredjelandsoverføringer.

DPIA-en skal omfatte Njord, offentlige person-/rolledata, brukerlagrede analyser, frivillig profil, KPI-instrumentering, research og aktuelle databehandlere. Simen Lippestad godkjenner vurderingen og restrisikoen. Dersom høy restrisiko ikke kan reduseres til et akseptabelt nivå, skal behandlingen ikke aktiveres før eventuell forhåndsdrøftelse med Datatilsynet er avklart. DPIA-en revurderes ved vesentlig endring i formål, datadomener, personanalyse, automatiseringsgrad, leverandør eller skala.

## Besluttede behandlingsgrunnlag

### Kjernetjenesten – avtale

Hver betabruker skal personlig akseptere betavilkårene før kontoen aktiveres, også når brukeren er nominert av arbeidsgiveren. Behandling som faktisk er nødvendig for å opprette og sikre kontoen og levere den etterspurte Fjord Insight-tjenesten, baseres på personvernforordningen artikkel 6 nr. 1 bokstav b (avtale).

Dette omfatter nødvendige konto- og autentiseringsdata, workspace-medlemskap, brukeropprettede analyser og arbeidslister, samt Njord-input, -resultater og samtalekontekst som må behandles for å levere eller lagre analysen brukeren ber om. Bare felter og bruk som er objektivt nødvendige for tjenesten omfattes. Produktanalyse, generell modelltrening, markedsføring, offentlige rolledata og annen sekundær bruk kan ikke legges inn under avtalegrunnlaget bare ved å omtale dem i vilkårene; de krever egne dokumenterte vurderinger.

### Frivillig profil – samtykke

Registrering og innlogging skal bare kreve navn, e-post og nødvendige autentiseringsdata. Etter første innlogging kan brukeren frivillig fylle ut arbeidsgiver, yrkesrolle, telefon, LinkedIn, utdanning, lokasjon og interesser gjennom progressiv profilering. Hvert felt eller tydelig formålsgrupperte felt skal ha et konkret forklart formål, være tomt som standard og kunne hoppes over.

Behandlingen av disse valgfrie profilfeltene baseres på personvernforordningen artikkel 6 nr. 1 bokstav a (samtykke). Samtykket skal være adskilt fra betavilkårene, dokumenterbart og like enkelt å trekke tilbake som å gi. Brukeren skal kunne endre eller slette feltene uten å miste betatilgang. Profilen er privat som standard og kan ikke brukes til markedsføring, generell modelltrening, personrangering eller nye formål uten et eget gyldig grunnlag. Opplysningene følger kontoens vedtatte retensjon og slettes sammen med kontoen.

### Sikkerhet og drift – berettiget interesse

Nødvendige og dataminimerte sikkerhets-, feilsøkings- og misbrukslogger baseres på personvernforordningen artikkel 6 nr. 1 bokstav f (berettiget interesse). Formålene er sikker drift, tilgangskontroll, hendelseshåndtering, feilsøking og forebygging av misbruk. Maakeholmen AS skal dokumentere interesse, nødvendighet og interesseavveiing før produksjonslogging aktiveres.

Logger skal ikke gjenbrukes til markedsføring, generell brukerprofilering eller modelltrening. Passord, autentiseringstokens, hemmeligheter og komplette rå Njord-prompter skal filtreres bort. Tilgang og konkret retensjon besluttes separat før G2.

### Beta-KPI-er – berettiget interesse

Dataminimert måling av de vedtatte beta-KPI-ene baseres på personvernforordningen artikkel 6 nr. 1 bokstav f (berettiget interesse). Formålet er å vurdere om den lukkede betaen løser de avtalte arbeidsoppgavene, forbedre kjerneflytene og dokumentere kvalitet og feil. Maakeholmen AS skal dokumentere interesse, nødvendighet og interesseavveiing, og informere om retten til å protestere.

Instrumenteringen avgrenses til forhåndsdefinerte hendelser som arbeidsflyt startet/fullført, tidsbruk, lagring eller oppfølging, teknisk feil og eksplisitt Njord-feedback. Hendelser bruker pseudonym bruker-ID. Analyseverktøyet skal ikke motta rå Njord-samtaler, fritekst fra analyser, skjult sesjonsopptak eller data til annonseprofilering. Generell modelltrening er ikke et godkjent formål. Koblingsnøkkel, tilgang og konkret retensjon besluttes før instrumenteringen aktiveres.

### Betaintervjuer og research – berettiget interesse og eventuelt samtykke

Baseline, tidsmåling, strukturerte intervjunotater og feedback som er nødvendig for å evaluere den lukkede betaen behandles under den dokumenterte berettigede interessen for betaevaluering. Deltakeren skal informeres om formål, frivillighet der det er relevant, tilgang, retensjon og retten til å protestere.

Intervjuer tas ikke opp som lyd eller video som standard. Et eventuelt opptak krever separat, uttrykkelig og dokumenterbart samtykke med egen slettedato. Et avslag eller tilbaketrukket opptakssamtykke påvirker ikke tilgangen til betatjenesten.

Notater lagres med deltaker-ID i et tilgangsstyrt researchsystem. Koblingen mellom deltaker-ID og navn lagres separat og er bare tilgjengelig for Simen Lippestad. Rå intervjunotater slettes 90 dager etter avsluttet betaevaluering; reelt anonymiserte funn kan beholdes. Konkret betalingsinteresse overføres bare til et tilgangsstyrt CRM med eksplisitt salgsoppfølgingsformål og vurderes for sletting senest 12 måneder etter siste kontakt. Researchdata, identitetsnøkkel og kandidatnavn skal ikke lagres i repoet.

### Offisielle næringslivsroller – berettiget interesse

Visning og nødvendig analyse av personers offisielt registrerte næringslivsroller fra Brønnøysundregistrene baseres på personvernforordningen artikkel 6 nr. 1 bokstav f (berettiget interesse). Formålet er å gi profesjonelle brukere dokumentert selskaps-, rolle- og styringsinformasjon som er nødvendig i de godkjente arbeidsflytene. Maakeholmen AS skal dokumentere interesse, nødvendighet, rimelige forventninger og interesseavveiing.

Betaomfanget begrenses til nåværende, dokumenterte forretningsroller fra godkjent offentlig kilde. Kilde og aktualitet skal vises, Brreg-endringer skal oppdateres, og henvendelser om retting eller protest skal håndteres via `personvern@fjordinsight.no`. Historisk personprofilering, private kontaktopplysninger, nettverksbasert kandidatrangering og styre-/lederrekruttering omfattes ikke av denne beslutningen og krever en separat personvern- og dataport.

## Beslutninger som må tas

| ID | Beslutning | Eier | Frist | Status |
| --- | --- | --- | --- | --- |
| P-01 | Navngi behandlingsansvarlig virksomhet og personvernkontakt | CEO | 22. juli | Lukket: Maakeholmen AS, org.nr. 931 075 268; `personvern@fjordinsight.no`, overvåket av Simen Lippestad |
| P-02 | Dokumenter formål og behandlingsgrunnlag per kategori | Personvernansvarlig | 24. juli | Lukket for betaomfanget: avtale, samtykke og berettiget interesse er fordelt per kategori; nye formål krever endringskontroll |
| P-03 | Fastsett retensjon og slettemekanisme for konto, profil, workspace og logger | Personvern / teknisk | 24. juli | Lukket som beslutning: tider og utløser er fastsatt; automatisk sletting og backup-utløp skal bevises før G2 |
| P-04 | Definer prosess for innsyn, retting, eksport og sletting | Personvern / support | 24. juli | Lukket: kontakt, ansvar, identitetskontroll, 30-dagers frist, format og avslag er besluttet; implementasjon testes før G2 |
| P-05 | Avklar databehandlere, region og avtaler for K1-hosting, monitorering og AI | CEO / teknisk | Port G1 | Delvis: minimumsport for AI er godkjent; konkrete leverandører og avtaler gjenstår |
| P-06 | Bestem om årsrapport-artifacts skal finnes i beta-produksjon | Produkt / personvern | 25. juli | Lukket: rå PDF-er, OCR-tekst og OCR-artifacts forbys i beta-produksjon; separat evaluering krever egen kontroll |
| P-07 | Publiser personverninformasjon og AI-forbehold | Produkt / personvern | Før G2 | Lukket som beslutning: lagdelt, versjonert informasjon og forbud mot helautomatiske personavgjørelser er låst; publisering testes før G2 |
| P-08 | Fastsett tilgang, deling, eksport, retensjon og sletting for analyseobjekter og arbeidslister | Personvern / produkt / teknisk | Før implementering aktiveres | Lukket som beslutning: privat standard, navngitt workspace-deling, eksportregel, retensjon og sletting er låst; implementasjonsbevis kreves før G2 |
| P-09 | Fastsett hvilke Njord-spor som må lagres for etterprøvbarhet og hvilke rå prompt-/svarfelt som skal unngås | Personvern / teknisk | Før ekte modelltest | Lukket som beslutning: strukturert plan-, verktøy-, kilde-, beregnings- og versjonsspor lagres; skjult resonnering og rådataduplikater forbys |
| P-10 | Godkjenn protokoll og lagringssted for baseline-, intervju- og betalingsinteressedata | Personvern / produkt / salg | Før første betabruker | Lukket som beslutning: ingen opptak som standard, separat identitetsnøkkel, 90-dagers researchretensjon og 12-måneders CRM-gjennomgang |
| P-11 | Gjennomfør og godkjenn DPIA for betaens samlede behandling | CEO / personvern / teknisk | Før ekte betabruker og modellbruk | Obligatorisk port godkjent; selve DPIA-en og restrisikobeslutningen gjenstår før aktivering |

## Foreløpige sikkerhets- og minimeringsregler

- Ingen produksjonsdata, brukerdata eller hemmeligheter skal inn i repo, testfixture eller supportdokument.
- Ikke logg passord, tokens, komplette OAuth-profiler eller rå AI-prompter som standard.
- Betaen samler bare data som er nødvendig for tilgang, kjernefunksjon, sikkerhet og avtalte KPI-er.
- Tilgang til workspace-, review- og admininnhold følger minste privilegium og logges der endringen er sikkerhetsrelevant.
- Endring eller sletting i offisiell kilde skal ikke erstattes med gammel cache som om den fortsatt var gjeldende.
- Manglende juridisk beslutning gir deaktivert funksjon, ikke implisitt samtykke.

## Godkjenning

| Rolle | Person | Dato | Resultat |
| --- | --- | --- | --- |
| Behandlingsansvarlig / CEO | Maakeholmen AS, org.nr. 931 075 268 / Simen Lippestad | 24. juli 2026 | Styringsrammen godkjent for betaomfanget; ny juridisk enhet krever dokumentert overføring |
| Personvernansvarlig | Simen Lippestad | 24. juli 2026 | Formål, grunnlag, retensjon, rettigheter, tilgang, Njord-spor, research og DPIA-port godkjent |
| Teknisk eier | Simen Lippestad | 24. juli 2026 | Krav godkjent; leverandør-, DPIA-, slette-, tilgangs- og publiseringsbevis kreves før G1/G2 |
