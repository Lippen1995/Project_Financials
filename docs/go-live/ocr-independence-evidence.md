# GL-009 – bevis for OCR-uavhengig betaflate

**Status:** Lukket som Sprint 0-bevis

**Beslutningseier:** Simen Lippestad (CEO / teknisk ansvarlig)

**Bevisdato:** 24. juli 2026

## Konklusjon

Betaens offentlige selskaps- og regnskapsflater har en eksplisitt kildeport som bare tillater finansielle poster med:

- `sourceSystem=BRREG`
- `sourceEntityType=structuredAnnualAccounts`

PDF-/OCR-avledede regnskapsposter, detaljlinjer og dokumentlenker kan fortsatt finnes i utviklings- og evalueringskode, men de blir filtrert bort fra betaflaten når `BETA_STRUCTURED_FINANCIALS_ONLY=true`. Innstillingen er `true` som sikker standard. Når strukturerte Brreg-tall mangler, returnerer tjenesten en ærlig tomtilstand og starter ikke et PDF- eller OCR-fallbackløp.

Dette lukker Sprint 0-kravet om dokumentert kode- og testbevis for at betaens brukerflate ikke er avhengig av OCR. Det beviser ikke at den strukturerte kilden har tilstrekkelig dekning for alle analysearbeidsflyter.

## Kontrollert dataflyt

```text
Selskapsprofil / offentlig finans-API
                ↓
getPublicCompanyFinancials
                ↓
Offentlig kildeport
                ↓
Kun BRREG + structuredAnnualAccounts
                ↓
Tall eller ærlig «ikke tilgjengelig»
```

Følgende flater går gjennom kildeporten:

- selskapsprofilens oppsummering;
- selskapsprofilens regnskapsfane;
- nøkkeltall på selskapsprofil;
- `GET /api/companies/[slug]/financials`.

`GET /api/companies/[slug]/raw-financials` leser nå bare den versjonerte live-flaten. Dermed returnerer den strukturerte Brreg-linjer eller tydelig merkede FI-SIM-linjer i investordemoen, aldri PDF-/OCR-avledede publikasjonsposter. Årsrapportlenker skjules når den offentlige tjenesten har filtrert dokumentene bort.

## Implementasjonsbevis

| Kontroll | Implementasjon | Resultat |
| --- | --- | --- |
| Sikker standard | `lib/env.ts` og `.env.example` | `BETA_STRUCTURED_FINANCIALS_ONLY=true` dersom variabelen ikke er satt |
| Offentlig kildeport | `server/services/public-financials-service.ts` | Bare strukturerte Brreg-poster beholdes |
| Profil og finans-API | `server/services/company-service.ts` | Både `summary` og `full` bruker offentlig kildeport |
| Detaljlinjer | `app/api/companies/[slug]/raw-financials/route.ts` | Leser bare live-viewet og returnerer datasetversjon samt statement- og linjeopprinnelse |
| Dokumenter | `app/(app)/companies/[slug]/page.tsx` | Dokumentflate rendres ikke uten godkjente offentlige dokumenter |
| Tomtilstand | selskapsprofil og regnskapstabell | Viser at regnskap ikke er tilgjengelig; ingen konstruerte tall |

## Testbevis

Historisk kjøring 24. juli 2026:

| Kommando / testgruppe | Resultat |
| --- | --- |
| `npm.cmd run test -- server/services/public-financials-service.test.ts app/api/companies/[slug]/raw-financials/route.test.ts components/company/financial-documents.test.tsx components/company/financial-time-series-table.test.tsx` | 4 testfiler, 10 tester bestått |
| `npm.cmd run test -- server/services/annual-report-financials-service.test.ts server/services/public-financials-service.test.ts components/company/financial-documents.test.tsx` | 3 testfiler, 31 tester bestått |
| `npm.cmd run typecheck` | Bestått |
| `npm.cmd run build` | Produksjonsbygg bestått; tre eksisterende, ikke-blokkerende lint-advarsler om font og `img` |

Oppdatert kontroll 7. august 2026:

| Kommando / testgruppe | Resultat |
| --- | --- |
| `npx vitest run app/api/companies/[slug]/raw-financials/route.test.ts server/financials/raw-financials-reader.test.ts` | 2 testfiler, 7 tester bestått |
| `npm run financials:check-source-access` | 17 registrerte kildelesere; 13 ikke-tillatte direkte runtime-lesere gjenstår som migrasjonsgjeld |
| `npm run typecheck` | Bestått |
| `npm run build` | Produksjonsbygg bestått; to eksisterende, ikke-blokkerende lint-advarsler om font og `img` |

Den historiske anti-fallback-kontrollen verifiserte at:

1. strukturerte Brreg-poster beholdes;
2. PDF-/OCR-avledede statements filtreres bort;
3. detaljlinjer og dokumenter fjernes;
4. bare OCR-/PDF-avledede data gir `available=false`.

Den oppdaterte rålinje-regresjonen verifiserer at:

1. API-et leser den versjonerte live-flaten og returnerer datasetversjon;
2. source-policyen filtrerer bort rapporterte PDF-/OCR-statements og tilhørende linjer;
3. FI-SIM-statements og syntetiske linjer beholder eksplisitt opprinnelsesmerking;
4. interne `rawPayload`-felt ikke eksponeres.

## Begrensninger og senere porter

Følgende er ikke godkjent som beta-produksjonsdata:

- flerårig historikk som bare finnes i PDF;
- konserntall som bare finnes i PDF;
- as-reported detaljlinjer;
- OCR-tekst, annoterte PDF-er eller andre ekstraksjonsartefakter.

Før G2 skal deploykontrollen i tillegg bevise:

- `BETA_STRUCTURED_FINANCIALS_ONLY=true` i produksjonsmiljøet;
- at PDF-/OCR-jobber ikke er konfigurert som produksjonsavhengighet;
- at produksjonsdatabasen og produksjonslagringen ikke inneholder rå PDF-er, OCR-tekst eller OCR-artifacts;
- at admin- og interne dokumentruter ikke er tilgjengelige for betabrukere;
- at en virksomhet uten strukturerte tall viser tomtilstand i faktisk staging/produksjonslikt miljø.

En fremtidig aktivering av PDF-/OCR-data krever ny data-, personvern-, kvalitet- og kostnadsport. Den kan ikke gjøres ved bare å sette miljøvariabelen til `false`.
