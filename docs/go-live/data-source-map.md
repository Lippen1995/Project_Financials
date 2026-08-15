# Datakildekart for beta

**Status:** Godkjent Sprint 0-baseline; dekningsmåling og implementasjonsbevis følges i Sprint 1–2

**Krav:** Eksterne records skal ha `sourceSystem`, `sourceEntityType`, `sourceId`, `fetchedAt` og `normalizedAt`. Frontend skal bare konsumere normaliserte interne objekter.

Arbeidsflyt- og dekningsfunn er samlet i [GL-011-analysen](./workflow-data-gap-analysis.md).

## Kjernefelt

| Domene / felt | Source of truth | Provider / intern flyt | Betaadferd ved mangler | Proveniensstatus |
| --- | --- | --- | --- | --- |
| Organisasjonsnummer, navn, organisasjonsform, status, registreringsdato, ansatte | Brreg Enhetsregisteret | `BrregCompanyProvider` → Brreg-mapper → company service/repository | Ikke vis selskap eller felt dersom kilden ikke leverer det | Implementert i normalisert selskapsmodell; ende-til-ende-audit gjenstår |
| Forretnings- og postadresse | Brreg Enhetsregisteret | `BrregCompanyProvider` → `mapBrregCompany` → adresser | Tom adresse, aldri geokodet eller konstruert adresse | Implementert; audit gjenstår |
| Registrert næringskode | Brreg Enhetsregisteret | Selskapsprovider og company repository | Vis registrert kode uten lokal overstyring | Implementert |
| Navn, beskrivelse og hierarki for næringskode | SSB Klass | Bakgrunn: `SsbIndustryCodeProvider` → versjonert `SsbClassificationCode`. Forespørsel: `SsbClassificationRepository` | Vis bare Brreg-koden dersom det lokale SSB-speilet mangler treff | Implementert med daglig, atomisk sync og proveniens |
| Rolle, rolletype og registrert rolleinnehaver | Brreg Roller | `BrregRolesProvider` → `mapBrregRole` → repository/API | Tydelig tomtilstand | Implementert; dataminimering og oppdateringsfrekvens må godkjennes |
| Kunngjøringer | Brreg Kunngjøringer | Forespørsel: `SourceDocument` + `CompanyAnnouncementFetchState`. Bakgrunn: `company-announcement-sync-service` | «Ikke lastet ennå» mens virksomheten står i kø; tomt når Brreg er kontrollert uten treff | Implementert uten live fallback; worker lagrer liste og sanitert detalj med proveniens |
| Signatur og prokura | Brreg | `BrregAuthorityProvider` | Skjult dersom ikke verifisert eller ikke tilgjengelig | Finnes i kode, men er ikke godkjent som nødvendig betafelt |
| Siste strukturerte regnskapsår og hovedtall | Brreg Regnskapsregisteret, strukturert JSON | Bakgrunnsjobb: `BrregFinancialsProvider.fetchStructuredAnnualAccounts` → versjonert mapper → `structured-financials-service` → `FinancialStatement`. Forespørselsvei: database → offentlig kildeport. Ukjente virksomheter legges i kø av `structured-financials-queue-service` | «Ikke tilgjengelig» for manglende filing eller ikke støttet oppstillingsplan; «ikke lastet ennå» for virksomheter som står i kø; siste offisielle snapshot merkes utdatert ved midlertidig kildefeil | Provider, mapper, persistence, kø, proveniens og offentlig anti-fallback er implementert. Revidert 5. august 2026: read-through i forespørselsveien er fjernet til fordel for databaselesing med kø, jf. GL-A01. [Sprint 2-closeout](./sprint-2/structured-financial-coverage-closeout.md) målte 149 reelle virksomheter: 95 tilgjengelige, 54 tomtilstander, 0 feil; AS hadde 96,7 % dekning i det stratifiserte utvalget |
| Historiske tall, konserntall og detaljlinjer fra årsrapport | Brreg PDF | Annual-report/PDF-ekstraksjon | Ikke del av betakravet; skjules dersom strukturert og kontrollert tall ikke finnes | Eksisterer, men er eksplisitt ikke tillatt som produksjonskritisk betaavhengighet |
| Regulatorisk status / konsesjon | Finanstilsynet | Ingen provider funnet i kartleggingen | Seksjonen skjules eller merkes ikke tilgjengelig | Ikke implementert; utenfor betaomfanget |

## Produkt- og brukerdata

| Data | Autoritativ kilde | Intern lagring | Betaadferd |
| --- | --- | --- | --- |
| Konto, sesjon og profil | Brukeren / eventuell LinkedIn OIDC | NextAuth/Auth.js og Prisma `User`, `Account`, `Session`, `UserProfile` | Kun nødvendige felt; personvernvalg og sletting må avklares |
| Abonnementsstatus / feature gating | Fjord Insight og eventuell Stripe-hendelse | `Subscription` | Eksisterende status kan gate funksjoner; selvbetalt kjøpsflyt er ikke et betakrav |
| Søk og søkefiltre | Brukeraktivitet | `CompanySearchEvent` | 30 dagers rullerende lagring som implementert |
| AI-forbruk | Modellrespons / Fjord Insight | `AiSearchUsageEvent` | 30 dagers rullerende lagring; modellbruk holdes av til godkjenning |
| Njord-svar og feedback | Godkjente interne tjenester + valgt modell | `AiSearchJob`, `AiSearchUsageEvent` og feedback-lagring | Bare abonnement med Premium-rettighet kan opprette jobb; aktivering krever fortsatt evaluerings-/DPIA-port | Asynkron kø og polling implementert; modellkjøring skjer bare i cron-worker |
| Analyseobjekt | Brukerens formål + versjonerte interne beregninger | Ikke identifisert som samlet modell | Beta kan ikke telle en komplett arbeidsflyt før formål, kriterier, univers, grunnlag, konklusjon og oppfølging kan lagres |
| Longlist, shortlist og arbeidsliste | Brukerens eksplisitte valg + selskaps-ID-er fra normalisert selskapsmodell | Eksisterende listefunksjoner må auditeres | Ingen fritekst eller selskap kan konstrueres av modellen; tilgang og sletting følger brukerens analyseobjekt |
| Rangering og sammenligning | Versjonerte deterministiske interne beregninger over normaliserte data | Må kartlegges per arbeidsflyt | Vis formel, periode, vekting og manglende data; Njord kan forklare, men ikke finne på skårgrunnlaget |

## Datadomener som den reviderte betaen krever avklaring for

| Domene | Relevans | Godkjent kilde / status | Sprint 0-beslutning |
| --- | --- | --- | --- |
| Finansiell historikk | Vekst, margintrend, robusthet og peer-analyse | Åpen strukturert Brreg-kilde ser ut til å dekke begrenset filing/oppstillingsplan; PDF/OCR kan ikke være produksjonskrav | Dokumenter faktisk dekning og avgrens kriterier/perioder; vurder K2 separat |
| Eierskap og konsern | M&A-uavhengighet, konsernstøtte og motpartsavhengighet | Ingen komplett godkjent flyt dokumentert i dette kartet | Identifiser offisiell kilde og provider eller fjern kriteriet fra beta |
| Geografi | Regional sourcing og bransjeanalyse | Brreg-adresser finnes; normalisert region-/landsdelmapping er ikke dokumentert | Definer deterministisk mapping og versjonert kodeverk før rangering |
| Historiske roller og personer | Styresøk, nettverk og lederhistorikk | Brreg-roller dekker registrert tilstand; historikk og behandlingsgrunnlag er ikke dokumentert | Hold fjerde arbeidsflyt ute til kvalitet/personvernport er bestått |
| Kunngjøringer og selskapsendringer | Overvåkning og mulighetssignaler | Ikke dokumentert som godkjent betakilde her | Overvåkning kan lagre utvalg, men skal ikke love endringssignaler før provider finnes |
| Dokument- og markedsdata | Forklaringer, strategi og bred bransjeanalyse | Delvise kodeveier kan finnes, men kilde-/lisens- og normaliseringsstatus er ikke beta-godkjent | Skjul eller merk utilgjengelig til egen kildekontrakt er godkjent |

## Regler for konflikt og mangler

1. Brreg overstyrer andre kilder for norske virksomheters kjernefelter.
2. SSB beskriver og grupperer næringskoden, men endrer ikke virksomhetens registrerte kode.
3. Finanstilsynet kan bare bli et regulatorisk overlay.
4. Betaflaten leser bare regnskap med `sourceSystem=BRREG` og `sourceEntityType=structuredAnnualAccounts` når den sikre standarden `BETA_STRUCTURED_FINANCIALS_ONLY=true` er aktiv. Eksisterende maskin-, OCR- eller reviewer-publiserte PDF-tall blir ikke beta-godkjent av at de finnes i `FinancialStatement`.
5. Manglende eller mislykket kilde gir tomtilstand eller kontrollert feil, aldri fallback til mock, seed eller syntetiske verdier.
6. Brukerforespørsler leser bare databasen. Eksterne kilder kalles av bakgrunnsjobber; en virksomhet uten data legges i kø og vises som «ikke lastet ennå», som er en egen tilstand fra «ikke tilgjengelig» (kilden er spurt og har ingenting).
7. Tekniske feilmeldinger fra kilden er diagnostikk, ikke brukertekst. `unavailableReason` brukes i dekningsrapporten; brukerflaten viser bare formuleringer som faktisk forklarer noe for en bruker.

## Audit som må fullføres i Sprint 0

- Bekreft proveniensfeltene gjennom API-respons og UI for hvert kjerneområde.
- Dokumenter om og når rå `rawPayload` slettes eller minimeres.
- GL-009-beviset er fullført; gjenta kilde-, tomtilstands- og lagringskontrollen i produksjonslikt miljø før G2.
- Avklar om signatur/prokura er nødvendig for beta; ellers skjul feltet.
- Opprett konkret gapoppgave for Finanstilsynet først etter at regulatorisk overlay prioriteres.
- Lag en felt-/kriteriematrise for hver av de tre beta-arbeidsflytene med kilde, dekningsgrad, periode, oppdateringsfrekvens og ærlig mangelhåndtering.
- Auditér eksisterende modeller for analyse, lister, sammenligning og overvåkning før nye modeller opprettes.
