# Rettsforhold og betalingsanmerkninger — beslutnings- og implementeringsplan

> Status: plan og beslutningskart, 14. juli 2026. Ingen ny datakilde eller produktflate er
> godkjent for produksjon. Planen krever reelle kilder, dokumenterte bruksrettigheter og
> beståtte kvalitets-/personvernporter før noe vises som faktisk selskapsinformasjon.

## 1. Konklusjon og anbefalt retning

Bygg dette som et eget domene, **Rettsforhold**, med to strengt adskilte produkter:

1. **Rettsaker**: verifiserte norske domstolssaker der selskapet er en navngitt, formell
   part. Pågående og historiske saker vises bare innenfor dokumentert kildedekning.
2. **Kredittopplysninger**: betalingsanmerkninger hentes på forespørsel fra et godkjent
   kredittopplysningsforetak og bare når tilgang, formål og lisens tillater det.

Anbefalt MVP-rekkefølge:

- Lever først kildeavklaring, domene-/providerkontrakter og en intern kvalitetsprosess.
- Pilotér rettssaker for **juridiske personer**, med høy presisjon og tydelig
  dekningsinformasjon. Ikke lov «alle rettssaker».
- Hold ENK og andre personrelaterte foretak utenfor første lansering.
- Legg betalingsanmerkninger bak en separat juridisk og kommersiell go/no-go-port.
- Hent aldri betalingsanmerkninger automatisk ved profilvisning, søk eller batchjobber.
- Dersom full betalingsanmerkningsdekning ikke kan lisensieres, kan registrerte
  utleggspant vurderes som et eget offentlig signal. Det må hete **registrerte
  utleggspant**, aldri betalingsanmerkninger.

Dette passer eksisterende arkitektur: en ny, kanonisk rettsmodul eier sakene;
`CompanyEvent` brukes kun til varsling og feed, mens eksisterende Brreg-distress fortsatt
eier konkurs, rekonstruksjon og tvangsoppløsning.

## 2. Hvorfor kildeavklaring må komme først

### 2.1 Rettsaker

Domstolenes åpne berammingslister gir tid og sted for rettsmøter. For sivile saker kan
partsinformasjon være tilgjengelig, men enkelte sakstyper skjuler navn. Pressetjenesten har
større dekning, men er en særskilt tjeneste for pressen. Den åpne Lovdata-samlingen dekker
alle begrunnede Høyesterettsavgjørelser, men bare et **utvalg** fra ting- og
lagmannsrettene. Det betyr at ingen av disse flatene alene dokumenterer en komplett
historikk over alle saker for et selskap.

Domstoladministrasjonens rapport fra 2025 anbefaler en fremtidig gratis løsning med
metadata/fulltekst, API og webklient. Det er et viktig mulig fremtidsspor, men planen må
ikke anta at anbefalingen allerede er en stabil produksjonskontrakt.

Konsekvens: første leveranse må være en source-discovery/RFI, ikke en scraper. Vi skal få
skriftlig avklart maskinell tilgang, lisens, oppdateringsmekanisme, sletting, historisk
dekning og tillatt republisering før provider aktiveres.

### 2.2 Betalingsanmerkninger

Brønnøysundregistrene opplyser uttrykkelig at de bare registrerer enkelte typer
anmerkninger, og at full oversikt må hentes fra et kredittopplysningsbyrå. Et utleggspant
kan være et alvorlig betalingssignal, men er ikke synonymt med en betalingsanmerkning.

Kredittopplysningsloven regulerer innsamling, strukturering, bruk og utlevering av
kredittopplysninger om både fysiske og juridiske personer. Kredittopplysninger kan bare
utleveres ved saklig behov knyttet til vurdering av kredittevne. ENK skal behandles som
fysiske personer. Opplysninger skal som hovedregel ikke brukes i mer enn fire år, og skal
rettes eller slettes når kilden gjør det; oppgjorte krav skal ikke fortsette å fremstå som
aktive betalingsanmerkninger.

Konsekvens: Fjord Insight må avklare både rollen som mottaker/videreformidler og om den
planlagte produktformen selv er kredittopplysningsvirksomhet. Dette skal vurderes av norsk
juridisk rådgiver og den aktuelle leverandøren før kode som henter data slås på.

## 3. Produktomfang

### 3.1 Inkludert i rettssaks-MVP

- Norske juridiske personer med gyldig organisasjonsnummer.
- Selskapet er formell part, ikke bare omtalt, vitne, rådgiver eller konsernrelasjon.
- Sivile saker, skjønn/jordskifte og straffesaker mot foretak bare der publisering og
  identifikasjon uttrykkelig er tillatt.
- Planlagte rettsmøter, avsagte avgjørelser og senere anketrinn når kilden støtter dem.
- Saksnummer, domstol, instans, sakstype, rettsmøtedatoer, partsrolle når tilgjengelig,
  status, avgjørelsestype/-dato, rettskraftstatus når den er eksplisitt oppgitt, kildelenke
  og dekningsmetadata.
- Historikk som en tidslinje av kildeobserverte hendelser, ikke en ubegrunnet slutning om
  alt som har skjedd i saken.

### 3.2 Ikke inkludert i første versjon

- «Komplett rettshistorikk» eller et grønt «ingen rettssaker»-stempel.
- Saker der selskapet bare er nevnt i fritekst.
- Forliksråd, voldgift, klagenemnder og utenlandske domstoler. Disse er egne fremtidige
  kilde-/domeneutvidelser.
- Automatisk juridisk risikoscore, sannsynlig utfall eller skyldvurdering.
- Generative sammendrag uten eksplisitt, setningsnær evidens og egen godkjenning.
- Lagring eller republisering av fulltekst/PDF før rettigheter og referatforbud er avklart.
- Masseeksport av partsdata.

### 3.3 Betalingsanmerkninger i første mulige versjon

Kun dersom juridisk og kommersiell port består:

- Juridiske personer, med eksplisitt blokkering av ENK i første lansering.
- On-demand kredittsjekk initiert av en autentisert og autorisert bruker.
- Registrering av formål/saklig behov før oppslag.
- Minimalt resultat: `harAktiveAnmerkninger`, antall, samlet beløp og eldste/nyeste dato
  bare i den grad leverandøravtalen og regelverket tillater hvert felt.
- Kildens «sist kontrollert», gyldighet og begrensninger.
- Ingen historisk tidslinje over slettede eller oppgjorte betalingsanmerkninger i
  sluttbrukerproduktet.

## 4. Domene og presis terminologi

### 4.1 Kanoniske begreper

| Begrep | Betydning |
|---|---|
| Rettsforhold | Produktområdet som samler rettssaker og eventuelle kredittsignaler, uten å blande datatypene. |
| Rettssak | Kanonisk sak i en norsk domstol, identifisert primært ved domstol + saksnummer. |
| Sakstrinn | Behandling i én instans. En anke er et nytt trinn knyttet til samme sakskompleks når koblingen er verifisert. |
| Sakspart | Formell part i saken. Kobles til `Company` bare etter bestått identitetsregel. |
| Sakshendelse | Kildeobservert endring, for eksempel berammet, utsatt, avgjort, anket eller rettskraftig. |
| Kildeobservasjon | Uforanderlig registrering av hva en bestemt kilde oppga på et bestemt tidspunkt. |
| Gjeldende saksstatus | Avledet status fra siste gyldige observasjon, med regelversjon og confidence. |
| Historisk sak | Sakstrinn som ikke lenger har en fremtidig/aktiv rettshendelse, eller som eksplisitt er avsluttet. Det betyr ikke nødvendigvis rettskraftig. |
| Betalingsanmerkning | Kredittopplysning levert som betalingsanmerkning av godkjent kilde; aldri et egenberegnet synonym for pant, inkasso eller konkurs. |
| Utleggspant | Offentlig registrert tvangspant. Et separat signal, ikke automatisk en betalingsanmerkning. |
| Dekningsvindu | Perioden og domstolene/kildene løsningen faktisk har kontrollert. |

### 4.2 Statusmodell for rettssaker

Bruk en konservativ statusmodell som kan uttrykke usikkerhet:

- `SCHEDULED`: fremtidig rettsmøte er eksplisitt publisert.
- `IN_PROGRESS`: kilden sier at behandling pågår; skal ikke utledes bare fordi startdato
  er passert.
- `AWAITING_DECISION`: eksplisitt avsluttet forhandling uten publisert avgjørelse.
- `DECIDED_NOT_FINAL`: avgjørelse finnes, men rettskraft er ikke bekreftet.
- `APPEAL_PENDING`: anke eller ankebehandling er eksplisitt bekreftet.
- `FINAL`: rettskraft er eksplisitt bekreftet av tillatt kilde.
- `CLOSED`: saken er eksplisitt avsluttet/hevet/avvist uten at `FINAL` er riktig.
- `UNKNOWN`: kilden har ikke nok informasjon. Dette er en gyldig og synlig status.

Produktgrupperingen «Pågående» inkluderer bare eksplisitte aktive statuser. En sak blir
ikke automatisk «historisk» fordi en berammingsdato har passert; den blir `UNKNOWN` inntil
ny observasjon gir grunnlag for noe annet.

## 5. Kilde- og providerstrategi

### 5.1 Kildehierarki for rettssaker

1. **Domstolene/Domstoladministrasjonen**: source of truth for beramming, instans,
   saksnummer, hendelser, avgjørelser og publiseringsbegrensninger når maskinell tilgang er
   avtalt.
2. **Offisiell publisert rettsavgjørelse**: source of truth for avgjørelsens faktiske
   metadata og resultat innenfor tillatt gjenbruk.
3. **Lovdata eller annen lisensiert rettskildedistributør**: distribusjons-/berikelseslag
   etter avtale; aldri beskrevet som komplett hvis dekningen ikke er komplett.
4. **Selskapets børsmelding/årsrapport**: egenrapportert tvist, lagret som
   `LITIGATION_DISCLOSURE`, ikke automatisk som verifisert `CourtCase`.
5. **Redaksjonelle medier**: evidens-/oppdagelsessignal i `CompanyEvent`, ikke autoritativ
   saksstatus.

Brreg forblir source of truth for selskapsidentiteten. Brreg-kunngjøringer for konkurs og
rekonstruksjon beholdes i distress-domenet og dupliseres ikke som ordinære rettssaker.

### 5.2 Nye providers

```ts
interface CourtCaseProvider {
  capabilities(): Promise<CourtSourceCapabilities>;
  listChanges(cursor?: string): Promise<CourtCaseChangePage>;
  getCase(sourceCaseId: string): Promise<NormalizedCourtCase | null>;
  searchParty?(query: CourtPartyQuery): Promise<CourtPartySearchResult[]>;
}

interface CreditRemarkProvider {
  capabilities(): Promise<CreditSourceCapabilities>;
  checkCompany(input: {
    orgNumber: string;
    purposeCode: string;
    requestedBy: string;
  }): Promise<NormalizedCreditCheck>;
}
```

Planlagte implementasjoner/navn:

- `DomstolCourtCaseProvider` bare hvis Domstoladministrasjonen tilbyr eller godkjenner en
  stabil kontrakt.
- `LicensedCourtCaseProvider` ved kommersiell, dokumentert videredistribusjon.
- `LicensedCreditRemarkProvider` for betalingsanmerkninger.
- Ingen mock provider og ingen fallback som konstruerer sak eller betalingsstatus fra
  nyhetsfritekst.

`capabilities()` må oppgi domstoler, sakstyper, historisk startdato, oppdateringsfrekvens,
partsidentifikatorer, rettskraftstøtte, dokumentrettigheter, slettingsfeed og lisensversjon.

### 5.3 Obligatorisk RFI/source spike

Send samme kravmatrise til Domstoladministrasjonen, Lovdata/relevant distributør og minst
to kredittopplysningsforetak:

- Finnes API, feed, bulkeksport eller webhook?
- Er organisasjonsnummer tilgjengelig på part, eller bare navn?
- Hvilke domstoler, instanser og sakstyper dekkes?
- Hvor langt går historikken, og hvor komplett er den per år/instans?
- Hvordan formidles avlysninger, rettelser, anker og rettskraft?
- Finnes eksplisitte publiserings-/referatbegrensninger per dokument/sak?
- Kan metadata og dokumentlenker republiseres til betalende B2B-kunder?
- Kan rådata lagres, hvor lenge, og kan de eksporteres?
- Hvordan leveres retting/sletting og leverandørens egne innsigelser?
- Rate limits, SLA, pris per oppslag/batch, testmiljø og revisjonskrav.
- For kreditt: hvilke formålskoder, dokumentasjon av saklig behov, gjenpart, ENK-regler,
  caching, videreformidling og sletting gjelder?

Leveransen fra spiken er en signert capability-matrise og én anbefalt kilde per modul.
Manglende svar betyr `NO_GO`, ikke en teknisk antakelse.

## 6. Datamodell og lagdeling

### 6.1 Rettsmodul

Anbefalte Prisma-entiteter:

```text
CourtCase
  id, jurisdictionCountry, canonicalCaseKey, title, caseCategory
  currentStatus, statusRuleVersion, coverageFrom, coverageTo
  createdAt, updatedAt

CourtCaseInstance
  id, courtCaseId, courtCode, courtName, instanceLevel
  sourceCaseNumber, openedAt?, closedAt?, decisionAt?
  sourceSystem, sourceEntityType, sourceId, fetchedAt, normalizedAt

CourtCaseParty
  id, caseInstanceId, displayName, partyRole?
  companyId?, orgNumberAtMatch?, matchStatus, matchMethod, matchConfidence
  sourceSystem, sourceEntityType, sourceId, fetchedAt, normalizedAt

CourtCaseEvent
  id, caseInstanceId, eventType, occurredAt?, effectiveFrom?, effectiveTo?
  sourceSystem, sourceEntityType, sourceId, fetchedAt, normalizedAt

CourtCaseDocument
  id, caseInstanceId, documentType, sourceUrl, publishedAt?
  redistributionAllowed, publicationRestriction, contentHash?
  sourceSystem, sourceEntityType, sourceId, fetchedAt, normalizedAt

CourtCaseObservation
  id, caseInstanceId?, providerKey, externalVersion, observedAt
  payloadHash, rawPayload? (kun dersom avtale og regelverk tillater det)

CourtPartyMatchReview
  id, partyId, proposedCompanyId, state, reasonCodes, reviewedBy?, reviewedAt?
  resolverVersion, evidenceJson
```

Viktige constraints/indekser:

- unik `(sourceSystem, sourceEntityType, sourceId)` per kildeobjekt;
- unik `canonicalCaseKey` når kobling mellom instanser er verifisert;
- indeks på `(companyId, currentStatus)` via partkobling/read model;
- indeks på `sourceCaseNumber`, `courtCode`, `occurredAt` og `fetchedAt`;
- append-only observasjoner, men korrigerbare normaliserte read models;
- `rawPayload` krypteres eller utelates etter kildeklassifisering;
- alle rader følger AGENTS.md-feltene for sporbarhet.

### 6.2 Kredittmodul

Hold kredittopplysninger utenfor `CourtCase` og distress:

```text
CompanyCreditCheck
  id, companyId, providerKey, purposeCode, requestedByUserId, workspaceId
  requestedAt, sourceAsOf, expiresAt, status
  hasActiveRemarks?, remarkCount?, totalAmount?
  sourceSystem, sourceEntityType, sourceId, fetchedAt, normalizedAt

CreditCheckAccessLog
  id, creditCheckId?, companyId, userId, workspaceId
  action, purposeCode, occurredAt, outcome, policyVersion
```

- Krypter resultatfelt i databasen.
- Lagre ikke leverandørens rårespons med mindre det er nødvendig og eksplisitt tillatt.
- Ved retting/oppgjør/sletting fjernes resultatinnhold; behold bare et minimalt auditspor
  som ikke fortsatt røper den slettede anmerkningen.
- Ikke materialiser betalingsdata i global Company-tabell, søkeindeks, analytics eller
  `CompanyEvent` uten særskilt godkjenning.
- TTL bestemmes av lov, kildekontrakt og risikovurdering; den korteste grensen vinner.

### 6.3 Read models og tjenestelag

- `CompanyLegalProfile`: summering av verifiserte aktive/historiske saker og dekning.
- `CompanyCourtCaseTimeline`: paginert tidslinje med hendelser og evidens.
- `CourtCaseCoverage`: forklarer hva som faktisk er kontrollert.
- `CreditCheckView`: kortlivet, autorisasjonssjekket visning uten deling til øvrige lag.
- `server/legal/court-case-service.ts`: eneste lese-/skriveinngang for rettssaker.
- `server/legal/company-court-case-resolver.ts`: konservativ identitetskobling.
- `server/credit/company-credit-service.ts`: policy, leverandørkall, TTL og audit.

Frontend skal aldri lese provider-responser direkte.

## 7. Identitetskobling og datakvalitet

Dette er den største tekniske risikoen. Rettskilder bruker ofte partsnavn, mens Fjord
Insight bruker organisasjonsnummer.

### 7.1 Automatiske koblingsregler

Koble automatisk bare ved én av følgende:

1. eksakt, kildeoppgitt organisasjonsnummer som finnes i Brreg-speilet;
2. eksakt juridisk navn + unik Brreg-kandidat + støttende adresse/poststed;
3. dokumentert historisk navn + unik kandidat + tidsmessig overlapp og ekstra evidens.

Navn alene gir aldri automatisk produksjonskobling. Konsernnavn kobles ikke til alle
datterselskaper. Fusjon, fisjon, navnebytte og slettet foretak må vurderes mot hendelsens
dato; dagens navn kan ikke uten videre brukes bakover.

### 7.2 Matchtilstander

- `VERIFIED_SOURCE_ID`: orgnr fra kilden.
- `VERIFIED_COMPOSITE`: sterk sammensatt match.
- `REVIEW_REQUIRED`: plausibel, men utilstrekkelig.
- `REJECTED`: motsigende identitet.
- `UNRESOLVED`: ingen trygg kandidat.

Bare de to verifiserte tilstandene kan vises som «selskapet er part». Review-køen viser
kildeevidens og krever to-personers godkjenning for høyrisikosaker.

## 8. API, tilgang og produktflate

### 8.1 API

- `GET /api/companies/[slug]/legal-cases?status=&from=&to=&cursor=`
- `GET /api/legal-cases/[id]`
- `POST /api/companies/[slug]/credit-check` med `purposeCode` og idempotency key
- `GET /api/companies/[slug]/credit-check/[id]` kun for autorisert bruker/workspace og
  innen TTL
- admin-endepunkter for match-review, source coverage og retting/sletting

Alle endepunkter bruker Zod-validering, workspace-/entitlement-policy, rate limiting og
strukturert audit. Kredittendepunktet må avvise ENK og ukjente organisasjonsformer før
provider kalles.

### 8.2 UI på selskapsprofilen

Ny fane: **Rettsforhold**.

Øverst:

- antall verifiserte pågående saker;
- antall verifiserte historiske saker innenfor dekningsvinduet;
- «Kilder sist kontrollert»;
- permanent dekningsforklaring: «Ingen treff» er ikke det samme som «ingen saker».

Rettsakskort/tidslinje:

- statusbadge, domstol, instans, saksnummer, sakskategori og partsrolle;
- neste eksplisitt publiserte hendelse;
- avgjørelsesmetadata og direkte kildelenke når tillatt;
- en tydelig «kilde og dekning»-seksjon;
- aldri spekulativt utfall, skyld eller økonomisk konsekvens.

Tilstander som må skilles i UI:

- `AVAILABLE_WITH_RESULTS`: vis data.
- `AVAILABLE_NO_RESULTS`: «Ingen verifiserte treff i oppgitt dekning.»
- `PARTIAL_COVERAGE`: vis treff + tydelig begrensning.
- `NOT_SUPPORTED`: seksjonen er deaktivert og forklarer hvorfor.
- `SOURCE_UNAVAILABLE`: midlertidig feil; ikke konverter til tomt resultat.
- `REVIEW_PENDING`: skjules for sluttbruker.

Betalingsanmerkninger vises som et separat kort:

- bak premium entitlement og særskilt kreditt-policy;
- knapp «Hent kredittopplysninger», ikke automatisk last;
- formålsdialog før oppslag;
- kildens dato/gyldighet og tydelig varsling om at opplysninger kan endres;
- ingen deling til kommentarer, PDF-eksport eller generativ AI i første versjon;
- ENK viser «Ikke støttet i denne tjenesten», uten å røpe om data finnes.

Følg `DESIGN.md`: ytre kort `rounded-2xl`, indre bokser/inputs `rounded-xl`, badges og
knapper `rounded-full`, eksisterende tokens og ingen nye hardkodede farger.

### 8.3 Filtrering og varsling

Etter at profilvisningen er validert:

- søkefilter: verifisert pågående sak, domstol, sakskategori, instans og hendelsesdato;
- ikke filtrer på «ingen saker» før dekningen er tilstrekkelig til å støtte utsagnet;
- watchlist-varsel ved ny beramming, avlysning, avgjørelse, anke eller rettskraft;
- rettshendelsen kan projiseres til `CompanyEvent` med kildeevidens og dedupe på
  `caseInstanceId:eventType:externalVersion`;
- betalingsanmerkninger skal ikke bli generelle feed-/watchlist-varsler uten en ny
  juridisk vurdering og eksplisitt brukerformål.

## 9. Iterativ implementerings- og evalueringsprosess

Hver iterasjon følger samme sløyfe:

1. **Hypotese**: hva tror vi kilden/regelen/UI-en kan levere?
2. **Evidens**: kontrakt, offisiell dokumentasjon og et avgrenset uttrekk med reelle data.
3. **Implementasjon i shadow mode**: persister og evaluer internt, ikke vis til kunder.
4. **Manuell fasit**: to personer vurderer et stratifisert utvalg.
5. **Måling**: presisjon, dekning, friskhet, korreksjoner, personvern og operasjonell feil.
6. **Feilanalyse**: grupper feil etter kilde, identitet, status, dokumentrettighet og UI.
7. **Revisjon**: endre kontrakt/regelversjon, reprocessér og sammenlign med forrige runde.
8. **Port**: gå videre, begrens omfanget eller stopp. Ingen «best effort»-lansering.

### Fase 0 — juridisk og kommersiell avklaring (1–3 uker)

Leveranser:

- skriftlig juridisk vurdering av domstolsmetadata, dokumentgjengivelse, GDPR,
  kredittopplysningsloven, ENK og Fjord Insights rolle;
- ferdig RFI/capability-matrise;
- dokumentert behandlingsgrunnlag, formål, dataminimering, sletting og innsigelsesprosess;
- leverandør-shortlist med total kostnad, dekning og videredistribusjonsrett;
- DPIA-screening; full DPIA hvis screeningen tilsier høy risiko;
- go/no-go separat for rettssaker og betalingsanmerkninger.

Port 0:

- maskinell bruk og kundevendt visning er skriftlig tillatt;
- retting/sletting og kildedekning er kontraktfestet;
- juridisk rådgiver godkjenner MVP-omfanget;
- ellers stopper den aktuelle modulen og dokumenteres som utilgjengelig.

### Fase 1 — source spike og kontrakttester (1–2 uker)

Leveranser:

- ekte, avgrenset provider-spike uten kundevendt UI;
- capability snapshot og skjemaobservasjoner;
- rate-limit/retry/ETag/cursor-prototype;
- kontrakttester basert på tillatte, redigerte kildeartefakter; ingen mock provider;
- måling av faktisk andel med orgnr, partsrolle, status, rettskraft og dokumentlenke.

Port 1:

- stabil identifikator og inkrementell oppdatering finnes;
- minst 95 % av spike-responsene kan normaliseres uten ukjent feltbrudd;
- rådata kan håndteres i tråd med kontrakt og personvern;
- dekningen er verdifull nok til et ærlig produktløfte.

### Fase 2 — domene, migrasjon og shadow ingestion (2–3 uker)

Leveranser:

- Prisma-migrasjonene i kapittel 6;
- provider, mapper, repository, sync state og job-run telemetry;
- idempotent backfill + inkrementell jobb;
- statusmotor med versjonerte regler;
- dekningsread model og admin-observability;
- ingen eksponering i selskapsprofilen ennå.

Port 2:

- re-run skaper ingen dubletter;
- rettelser, avlysninger og sletting propagateres;
- alle records har full provenance;
- feil i kilden blir `SOURCE_UNAVAILABLE/PARTIAL`, aldri falskt tomt resultat.

### Fase 3 — identitetsresolver og gold set (2–4 uker)

Bygg et manuelt kontrollert datasett av reelle, lovlig brukbare saker, stratifisert etter:

- domstol og instans;
- sakstype og år;
- selskapsform;
- navn med AS/ASA-suffiks, navnebytte, fusjon/fisjon, korte navn og navnekollisjon;
- positiv match, negativ nærmatch og uløst tilfelle;
- pågående, avgjort, anket, avlyst og ukjent status.

Ingen sensitive rådokumenter eller persondata sjekkes inn i git. Gold set lagres i
tilgangskontrollert lagring med kilde-ID/hash og fasitlabels.

Port 3:

- automatisk selskapskobling: minst 99,5 % presisjon på gold set;
- 100 % presisjon på eksplisitt orgnr-match;
- null automatisk kobling på navn alene;
- alle uenigheter havner i review, ikke i produktet;
- statuspresisjon minst 98 % på felter kilden hevder å støtte.

Recall rapporteres, men aldri forbedres ved å senke presisjon under terskelen.

### Fase 4 — intern UI og usability-evaluering (2 uker)

Leveranser:

- `Rettsforhold`-fane bak intern feature flag;
- detaljvisning, tidslinje, source badges og alle availability states;
- admin review-/coverage-side;
- instrumentering av misforståelser og kildeklikk;
- tilgjengelighetstest for tastatur, skjermleser, kontrast og smale skjermer.

Evaluer med 5–8 interne brukere på reelle selskaper og oppgaver:

- kan de skille pågående fra avgjort og rettskraftig?
- forstår de at «ingen treff» ikke betyr «ingen saker»?
- finner de kilde og dekningsvindu?
- oppfatter de selskapet som part, ikke nødvendigvis ansvarlig/skyldig?

Port 4: minst 90 % korrekt oppgaveforståelse og ingen kritisk misforståelse av ansvar,
status eller dekning.

### Fase 5 — begrenset rettssakspilot (2–4 uker)

- 1–3 pilotworkspaces, juridiske personer, read-only;
- daglig kvalitetsgjennomgang første uke, deretter ukentlig;
- kundefeedback kobles til konkrete sak-/kilde-ID-er;
- rettelses-SLA og kill switch testes;
- ingen bulkeksport eller generative sammendrag.

Port 5:

- ingen bekreftet feil selskap–sak-kobling;
- minst 99 % pipeline-suksess og avtalt friskhet;
- kritiske rettelser skjules innen 1 time og korrigeres innen avtalt SLA;
- support og juridisk eier godkjenner bredere utrulling.

### Fase 6 — betalingsanmerkning pilot (separat spor, 2–4 uker)

Starter bare etter egen Port 0.

- server-side leverandørintegrasjon og secrets;
- policy-engine for selskapsform, rolle, entitlement, purpose og rate limit;
- on-demand UI, kryptert korttidslagring og komplett access audit;
- test av retting/sletting, leverandørfeil, timeouts, kredittsperre og tvetydig identitet;
- ingen ENK og ingen prefetch.

Port 6:

- 100 % av oppslag har autorisert bruker, workspace, orgnr og purpose;
- 100 % av ENK-forsøk blokkeres før leverandørkall;
- 100 % av slettings-/rettingshendelser består SLA-test;
- ingen data lekker til logger, analytics, cache, AI eller eksport;
- leverandør og juridisk eier signerer produksjonsklarhet.

### Fase 7 — varsling, filtrering og skala (etter dokumentert drift)

- legg rettshendelser til watchlist og `CompanyEvent`;
- legg til konservative søkefiltre;
- daglig incremental sync, ukentlig reconciliation og målrettet re-fetch rundt
  rettsmøter/avgjørelser;
- kapasitetstest med hele lisensierte dekningsområdet;
- kvartalsvis re-evaluering av gold set og leverandørdekning.

## 10. Test- og kvalitetsstrategi

### 10.1 Tester

- Mapper-/kontrakttester for ekte provider-formater.
- Idempotens- og cursor-tester.
- Status state-machine: avlyst, utsatt, anket, rettskraftig, manglende oppdatering.
- Entity resolution: orgnr, navnebytte, kollisjon, slettet foretak og konsernforveksling.
- Autorisasjon: workspace-isolasjon, feature gating, formål og ENK-blokkering.
- Sletting/retting: aktivt resultat fjernes og cache invalidiseres.
- API: Zod, paginering, rate limits og availability/error semantics.
- UI: loading/error/empty/partial states og designreglene i AGENTS.md.
- E2E mot sandbox eller eksplisitt godkjent testkonto; aldri skjulte mockdata i produktet.

### 10.2 Produksjonsmålinger

- source lag og siste vellykkede cursor;
- antall opprettet/endret/slettet/avvist per kjøring;
- auto-match/review/reject/unresolved-rate;
- matchpresisjon fra løpende stikkprøver;
- statusfordeling og uvanlige hopp;
- source schema drift;
- antall kunderapporterte feil og tid til skjuling/retting;
- kredittoppslag per purpose/workspace og policy-avvisninger;
- TTL-/slettingsbrudd (mål: null);
- andel profiler i `AVAILABLE`, `PARTIAL`, `NOT_SUPPORTED` og `SOURCE_UNAVAILABLE`.

## 11. Drift, sikkerhet og retting

- Egen kill switch per provider og per produktflate.
- Circuit breaker gjør seksjonen utilgjengelig; den viser aldri gammel data som fersk.
- Jobbtelemetri følger mønsteret i `docs/24-7-data-refresh-runbook.md`.
- Planlagt sync: leverandørens change feed minst daglig, oftere rundt aktive saker hvis
  avtalen tillater det; ukentlig full reconciliation.
- Kredittoppslag er ikke batch-sync og skal ikke inn i generell profil-refresh.
- Kryptering i transit/at rest, secrets i secret manager, feltredigering i logger.
- Tilgangslogg er append-only og søkbar for intern revisjon.
- Offentlig retteskjema: orgnr, sak-ID/kilde, feiltype og dokumentasjon.
- Kritisk feil (feil selskap, referatforbud, slettet kredittopplysning): skjul umiddelbart,
  undersøk deretter.
- Korrigering propagateres til read models, cache, søk, event feed og varsler.

## 12. Arbeidspakker og avhengigheter

| ID | Arbeidspakke | Blokkert av | Resultat |
|---|---|---|---|
| WP-01 | Juridisk vurdering og DPIA-screening | – | Signert scope/go-no-go |
| WP-02 | Court-source RFI og capability-matrise | – | Valgt kilde eller NO_GO |
| WP-03 | Credit-provider RFI/anskaffelse | – | Valgt leverandør eller NO_GO |
| WP-04 | Domene, ADR og providerkontrakter | WP-01, WP-02 | Stabil intern kontrakt |
| WP-05 | Court source spike | WP-02, WP-04 | Kontrakttester og dekningsmåling |
| WP-06 | Prisma/persistence/sync | WP-05 | Shadow database |
| WP-07 | Resolver og gold set | WP-05, WP-06 | Målte matchterskler |
| WP-08 | Legal service/API | WP-06, WP-07 | Sikre read models/endepunkter |
| WP-09 | Intern UI/admin review | WP-08 | Evaluerbar feature flag |
| WP-10 | Pilot og runbook | WP-09 | Go/no-go for rettssaker |
| WP-11 | Credit policy/integrasjon | WP-01, WP-03 | Shadow/on-demand kredittsjekk |
| WP-12 | Credit UI og pilot | WP-11 | Separat go/no-go |
| WP-13 | Varsling/filtrering | WP-10 | Skalert produktfunksjon |

Kritisk sti for rettssaker: `WP-02 → WP-04 → WP-05 → WP-06 → WP-07 → WP-08 → WP-09 → WP-10`.
Kredittsporet kan gå parallelt organisatorisk, men ikke gjenbruke rettssaksmodellen.

## 13. Estimat og bemanning

Et realistisk estimat etter source approval:

- rettssaks-MVP til begrenset pilot: 10–16 utvikleruker;
- betalingsanmerkning on-demand pilot: 4–8 utvikleruker i tillegg;
- juridisk/anskaffelse: kalenderløp 2–8+ uker, ofte den reelle kritiske stien.

Minimum roller:

- teknisk lead/backend;
- frontend/product engineer;
- data quality/reviewer;
- norsk personvern-/kredittopplysningsjurist;
- produkteier;
- sikkerhet/operations deltid.

Estimatet inkluderer ikke leverandørens onboardingtid, pris eller eventuell utvikling av
egen dataleveranse.

## 14. Risikoer og mottiltak

| Risiko | Konsekvens | Mottiltak |
|---|---|---|
| Ufullstendig domstolsdekning | Falsk trygghet | Dekningsvindu, aldri «ingen saker», kildeport |
| Feil selskap pga. navn | Alvorlig omdømmetap | Orgnr/komposittmatch, 99,5 % presisjon, review |
| Beramming endres/forsvinner | Feil «pågående» status | Eventhistorikk, change feed, `UNKNOWN`, reconciliation |
| Avgjørelse er ikke rettskraftig | Feil konklusjon | Egen `DECIDED_NOT_FINAL`; `FINAL` krever eksplisitt evidens |
| Referatforbud/personvern | Ulovlig publisering | Metadata-first, restriction-felt, juridisk port, kill switch |
| Kredittdata brukes uten saklig behov | Regelbrudd | On-demand, purpose, RBAC, audit, ingen prefetch |
| ENK behandles som selskap | Personvernbrudd | Blokker i MVP før provider-kall |
| Oppgjort anmerkning henger igjen | Feil og regelbrudd | Kort TTL, deletion feed, hard invalidation, SLA-test |
| Leverandørlås | Kost/operasjonell risiko | Providerkontrakt + capabilitymodell + eksport-/exit-krav |
| Nyhetsomtale blir «rettssak» | Feilklassifisering | Disclosure/event separat fra verifisert court case |

## 15. Definition of done

### Rettsaker

- valgt kilde og bruk er skriftlig godkjent;
- alle viste saker har verifisert selskapspart, saks-ID, kilde og dekningsmetadata;
- pågående/historisk/rettskraftig brukes kun etter eksplisitte statusregler;
- gold-set-tersklene er bestått og publisert internt;
- alle availability states, retting, sletting, kill switch og runbook er testet;
- UI og README beskriver begrensningene ærlig;
- ingen mock-/seed-/syntetiske selskaps- eller saksdata finnes i produktet.

### Betalingsanmerkninger

- egen juridisk og leverandørmessig go/no-go er signert;
- oppslag skjer bare on-demand med saklig behov og audit;
- ENK er blokkert i MVP;
- data følger kontraktfestet TTL, retting og sletting;
- ingen kredittdata finnes i logger, analytics, AI, globalt søk eller eksport;
- dersom porten ikke består, vises funksjonen som utilgjengelig og ingen data simuleres.

## 16. Beslutningskart for neste iterasjoner

## #1: Hvilken rettskilde kan støtte produksjonsbruk?

Blocked by: ingen

Type: Research

### Question

Kan Domstoladministrasjonen eller en lisensiert distributør levere lovlig, maskinlesbar,
oppdaterbar parts- og saksmetadata med tilstrekkelig dekning og videredistribusjonsrett?

### Answer

Åpen dokumentasjon viser relevante dataflater, men ikke en bekreftet komplett
produksjonskontrakt for Fjord Insight. Løs WP-02 og dokumenter capability-matrisen.

## #2: Kan Fjord Insight vise betalingsanmerkninger?

Blocked by: ingen

Type: Research

### Question

Tillater kredittopplysningsregelverket og leverandøravtalen den konkrete B2B-flaten,
feltene, kundetilgangen og lagringstiden?

### Answer

Ikke avgjort. Full dekning krever kredittopplysningsforetak, og formål/rolle må vurderes.
Løs WP-01 og WP-03 før implementasjon aktiveres.

## #3: Hvilket lanseringsomfang gir forsvarlig identitetskobling?

Blocked by: #1

Type: Research

### Question

Hvor stor andel av kilden har orgnr eller tilstrekkelige støttefelt, og hvilke
selskapsformer/sakstyper må utelates for å nå 99,5 % presisjon?

### Answer

Avgjøres av source spike og gold set i WP-05/WP-07.

## #4: Hvilke metadata/fulltekster kan vises og lagres?

Blocked by: #1

Type: Research

### Question

Hva kan republiseres, hvor lenge, og hvordan uttrykkes referatforbud, anonymisering,
retting og sletting maskinelt?

### Answer

Metadata-first er anbefalt default. Endelig svar må inn i provider capability og ADR.

## #5: Skal offentlige utleggspant tilbys hvis kredittsporet får NO_GO?

Blocked by: #2

Type: Discuss

### Question

Gir et separat, korrekt merket utleggspant-signal nok kundeverdi uten å skape inntrykk av
full betalingsanmerkningsdekning?

### Answer

Ta beslutningen først etter at kredittprovider er avklart. Ikke bruk utleggspant som
stille fallback.

## #6: Når kan generative sammendrag vurderes?

Blocked by: #3, #4

Type: Prototype

### Question

Kan et evidensbundet sammendrag unngå feil om partsrolle, prosessfase, skyld og
rettskraft?

### Answer

Ikke del av MVP. Krever egen gold set, setningsnære sitater og menneskelig evaluering
etter at strukturerte data har stabil produksjonskvalitet.

## 17. Offisielle kilder brukt i planen

- [Domstolenes åpne berammingslister og offentlighetsinformasjon](https://www.domstol.no/no/for-journalister/offentlighetsregler-for-pressen/)
- [Brukerveiledning for Pressetjenesten](https://www.domstol.no/no/for-journalister/brukerveiledning-for-pressetjenesten/)
- [Domstoladministrasjonens rapport om allmenn offentliggjøring](https://www.domstol.no/contentassets/dcff5744d62d4d849496664e4ead0bf5/allmenn-offentliggjoring-av-rettsavgjorelser.pdf)
- [Lovdatas dekningsbeskrivelse for rettsavgjørelser](https://lovdata.no/register/avgj%C3%B8relser?dir=desc&offset=0&sort=alpha)
- [Lovdata API — tilgjengelige maskinlesbare data](https://lovdata.no/info/api)
- [Forskrift om offentlighet i rettspleien](https://lovdata.no/nav/forskrift/2001-07-06-757)
- [Domstolloven § 130 om offentlig gjengivelse](https://lovdata.no/dokument/NL/lov/1915-08-13-5/%C2%A7119)
- [Brønnøysundregistrene om betalingsanmerkninger](https://www.brreg.no/tinglysing/tinglysing-i-losoreregisteret/betalingsanmerkninger/)
- [Brønnøysundregistrene om utleggspant](https://www.brreg.no/tinglysing/tinglysing-i-losoreregisteret/utleggspant/)
- [Kredittopplysningsloven](https://lovdata.no/dokument/NL/lov/2019-12-20-109)
- [Kredittopplysningsforskriften](https://lovdata.no/SF/forskrift/2022-05-20-883)
- [Datatilsynets veiledning for kredittopplysningsvirksomhet](https://www.datatilsynet.no/personvern-pa-ulike-omrader/kredittvurdering/regler-for-kredittopplysningsvirksomhet/)
- [Datatilsynets oversikt over kredittopplysningsforetak](https://www.datatilsynet.no/personvern-pa-ulike-omrader/kredittvurdering/virksomheter-som-kredittvurderer/)
