# Datakildekart for beta

**Status:** Første tekniske kartlegging

**Krav:** Eksterne records skal ha `sourceSystem`, `sourceEntityType`, `sourceId`, `fetchedAt` og `normalizedAt`. Frontend skal bare konsumere normaliserte interne objekter.

## Kjernefelt

| Domene / felt | Source of truth | Provider / intern flyt | Betaadferd ved mangler | Proveniensstatus |
| --- | --- | --- | --- | --- |
| Organisasjonsnummer, navn, organisasjonsform, status, registreringsdato, ansatte | Brreg Enhetsregisteret | `BrregCompanyProvider` → Brreg-mapper → company service/repository | Ikke vis selskap eller felt dersom kilden ikke leverer det | Implementert i normalisert selskapsmodell; ende-til-ende-audit gjenstår |
| Forretnings- og postadresse | Brreg Enhetsregisteret | `BrregCompanyProvider` → `mapBrregCompany` → adresser | Tom adresse, aldri geokodet eller konstruert adresse | Implementert; audit gjenstår |
| Registrert næringskode | Brreg Enhetsregisteret | Selskapsprovider og company repository | Vis registrert kode uten lokal overstyring | Implementert |
| Navn, beskrivelse og hierarki for næringskode | SSB Klass | `SsbIndustryCodeProvider` → normalisert industry code | Vis bare Brreg-koden dersom SSB-oppslag feiler | Implementert; cache-/versjonsstrategi må godkjennes |
| Rolle, rolletype og registrert rolleinnehaver | Brreg Roller | `BrregRolesProvider` → `mapBrregRole` → repository/API | Tydelig tomtilstand | Implementert; dataminimering og oppdateringsfrekvens må godkjennes |
| Signatur og prokura | Brreg | `BrregAuthorityProvider` | Skjult dersom ikke verifisert eller ikke tilgjengelig | Finnes i kode, men er ikke godkjent som nødvendig betafelt |
| Siste strukturerte regnskapsår og hovedtall | Brreg Regnskapsregisteret, strukturert JSON | `BrregFinancialsProvider.fetchStructuredAnnualAccounts` → `structured-financials-service` → `FinancialStatement` | «Ikke tilgjengelig» for manglende filing eller ikke støttet oppstillingsplan | Provider, mapper, persistence og test finnes; betaens automatiske ingest/leseflyt må bevises |
| Historiske tall, konserntall og detaljlinjer fra årsrapport | Brreg PDF | Annual-report/PDF-ekstraksjon | Ikke del av betakravet; skjules dersom strukturert og kontrollert tall ikke finnes | Eksisterer, men er eksplisitt ikke tillatt som produksjonskritisk betaavhengighet |
| Regulatorisk status / konsesjon | Finanstilsynet | Ingen provider funnet i kartleggingen | Seksjonen skjules eller merkes ikke tilgjengelig | Ikke implementert; utenfor betaomfanget |

## Produkt- og brukerdata

| Data | Autoritativ kilde | Intern lagring | Betaadferd |
| --- | --- | --- | --- |
| Konto, sesjon og profil | Brukeren / eventuell LinkedIn OIDC | NextAuth/Auth.js og Prisma `User`, `Account`, `Session`, `UserProfile` | Kun nødvendige felt; personvernvalg og sletting må avklares |
| Abonnementsstatus / feature gating | Fjord Insight og eventuell Stripe-hendelse | `Subscription` | Eksisterende status kan gate funksjoner; selvbetalt kjøpsflyt er ikke et betakrav |
| Søk og søkefiltre | Brukeraktivitet | `CompanySearchEvent` | 30 dagers rullerende lagring som implementert |
| AI-forbruk | Modellrespons / Fjord Insight | `AiSearchUsageEvent` | 30 dagers rullerende lagring; modellbruk holdes av til godkjenning |
| Njord-svar og feedback | Godkjente interne tjenester + valgt modell | Ikke komplett kartlagt | Deaktivert til datakontrakt, lagring og evalueringsbevis finnes |

## Regler for konflikt og mangler

1. Brreg overstyrer andre kilder for norske virksomheters kjernefelter.
2. SSB beskriver og grupperer næringskoden, men endrer ikke virksomhetens registrerte kode.
3. Finanstilsynet kan bare bli et regulatorisk overlay.
4. Betaflaten skal bare lese regnskap med `sourceEntityType=structuredAnnualAccounts`. Eksisterende maskin-, OCR- eller reviewer-publiserte PDF-tall blir ikke beta-godkjent av at de finnes i `FinancialStatement`; denne avgrensningen er påkrevd, men ikke bevist ennå.
5. Manglende eller mislykket kilde gir tomtilstand eller kontrollert feil, aldri fallback til mock, seed eller syntetiske verdier.

## Audit som må fullføres i Sprint 0

- Bekreft proveniensfeltene gjennom API-respons og UI for hvert kjerneområde.
- Dokumenter om og når rå `rawPayload` slettes eller minimeres.
- Bevis at betaflaten ikke leser OCR-avhengige historiske tall.
- Avklar om signatur/prokura er nødvendig for beta; ellers skjul feltet.
- Opprett konkret gapoppgave for Finanstilsynet først etter at regulatorisk overlay prioriteres.
