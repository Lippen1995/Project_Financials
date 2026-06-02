# Plan: Publiser fulle reviewed linjeposter til selskapssiden

Branch: `fix/publish-reviewed-line-items`
Status: Analyse ferdig, arkitektur besluttet, implementering ikke startet (økt avbrutt pga. ustabilt verktøy).

## Bakgrunn / bekreftet diagnose

Canica 2024 review (`reviewId=cmpoooqpt004qvmw4y84iik4e`, filing `cmpf7rzpu0005vmus8st1n2l7`,
org 938701237) er ACCEPTED med 70 reviewedFacts, men tallene ble **aldri publisert**.

Bekreftet dataflyt:
- **`FinancialStatement`** (5 sammendragstall: revenue, operatingProfit, netIncome, equity,
  assets; `@@unique([companyId, fiscalYear, statementScope])`) = **det selskapssiden leser**
  (`server/persistence/company-repository.ts:417`, `getLatestFinancialsForCompanies`;
  `KeyFiguresGrid` viser revenue/operatingProfit/equity/assets).
- **`FinancialFact`** (1315 rader for filingen, 13 extractionRuns) = intern rå-ekstraksjon.
  Mater IKKE selskapssiden direkte. Har INGEN `@@unique` (kun `@@index`) → duplikater på
  tvers av runs. Å legge til unique krever dedup først.
- **Publisering** (`publishReviewedAnnualReportFacts` → `publishFinancialStatementSnapshot`,
  `server/services/annual-report-review-service.ts:837-986`) skriver bare 5-talls-sammendraget
  til FinancialStatement. Lagrer IKKE fulle linjeposter.

### Bug-kjede (hvorfor ingenting ble publisert)
1. De 70 lagrede `AnnualReportReviewedFact` har blandet `unitScale` (1 og 1000) — lagret av
   ELDRE kode. Dagens `correctAnnualReportReview` normaliserer allerede til 1 (linjer 546, 578).
2. `validateReviewedFacts` → `UNIT_SCALE_INCONSISTENCY` (blocking). Bekreftet ved kjøring:
   `passed:false, validationScore:0.78, blocking: UNIT_SCALE_INCONSISTENCY: 1, 1000`.
3. `correctAnnualReportReview` committer reviewen ACCEPTED i sin transaksjon, og kaller SÅ
   `finalizeAnnualReportReviewAndPublish` (linje 593) som kaster ved valideringsfeil. Resultat:
   review = ACCEPTED i basen, men FinancialStatement aldri skrevet. POST /correct returnerte 500.
4. UI viser "Publiser"-knapp bare når `validationResult?.passed === true` (ReviewWorkspace:1261),
   og «publisert»-teksten (linje 1799-1805) er ubetinget av faktisk publisering = kosmetisk løgn.

### Ytterligere funn
- 2023 (komparativår) lagres ALDRI: klienten sender ikke prior-year facts; publisering gjør bare
  `review.fiscalYear`. Verdiene finnes i `clientDraft.rowEdits[*].priorValue` + `priorYearEdits`.
- `AnnualReportReviewedFact` har noen balanseposter feilkategorisert som INCOME_STATEMENT
  (bond_loans, deferred_tax_liability) — separat lagringsbug i statementType-mapping.
- Schema-drift: `FinancialFact` mangler `@@unique` som koden ellers ville trengt; kan ikke legges
  til uten dedup av de 1315 radene først.

## Brukerbeslutninger (bekreftet)
- **Visning:** Fulle linjeposter (alle ~40 rader per scope/år) skal være søkbare/vises.
- **2023:** Publiser begge år; fiks også 2023-filingen sine egne tall.
- **Opprydding FinancialFact:** Behold nyeste run per (filing, fiscalYear), slett resten —
  MEN ny extraction-run skal ALDRI overskrive publisert manuell review-data.
- **OCR-arkitektur (separat hovedspor, etter dette):** evaluer RapidOCR + PaddleOCR vs Tesseract;
  erstatt dual-run med Docling-lokaliserer → crop+OCR (Del 2) / fullside-OCR (Del 1, se memory).

## Arkitektur-beslutning
**Dedikert tabell `PublishedFinancialLineItem`** (ren separasjon; ekstraksjon rører den aldri →
publisert manuell data er strukturelt beskyttet mot reprocess).

Foreslåtte felter:
```
model PublishedFinancialLineItem {
  id              String   @id @default(cuid())
  companyId       String
  filingId        String                 // provenance (filingen reviewen kom fra)
  fiscalYear      Int                     // ÅRET for verdien (2024-review skriver 2024 OG 2023)
  statementType   FinancialFactStatementType
  statementScope  StatementScope          @default(COMPANY)
  metricKey       String
  rawLabel        String?
  value           BigInt?
  currency        String   @default("NOK")
  unitScale       Int      @default(1)
  sourcePage      Int?
  sortOrder       Int      @default(0)    // bevarer rekkefølge for «som rapportert»-visning
  reviewId        String?
  reviewerUserId  String?
  publishedAt     DateTime @default(now())
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  company Company @relation(...)
  filing  AnnualReportFiling @relation(...)
  @@unique([companyId, fiscalYear, statementScope, metricKey, sortOrder])
  @@index([companyId, fiscalYear, statementScope])
  @@index([filingId])
}
```
(Vurder om `metricKey` kan gjenta seg innen statement → unique må inkludere `sortOrder`/rad-id.)

## Implementeringsplan (rekkefølge)
1. **Schema:** legg til `PublishedFinancialLineItem` + relasjoner på Company/AnnualReportFiling.
   IKKE rør FinancialFact sin manglende unique ennå (krever dedup).
2. **Migrasjon:** `prisma migrate dev --name add_published_financial_line_item` (additivt, trygt).
3. **Klient (`ReviewWorkspace.tsx`):** send prior-year (2023) facts i correct-payload
   (`buildReviewedFactsPayload` bygger i dag kun mainYear; inkluder priorValue → egne fakta med
   fiscalYear=priorYear). Behold unitScale=1.
4. **Persist 2023 reviewed facts:** `correctAnnualReportReview` lagrer både år i
   AnnualReportReviewedFact. Fiks også statementType via `getStatementTypeForMetricKey` korrekt.
5. **Publiseringssti (`publishReviewedAnnualReportFacts`):**
   - Skriv fulle linjeposter (begge år, begge scope) til `PublishedFinancialLineItem` (upsert).
   - Behold/oppdater 5-talls `FinancialStatement`-sammendrag per (company, år, scope).
   - For 2023: oppdater også 2023-filingens FinancialStatement-rad (samme unique-nøkkel).
6. **Fiks stille feil:** `correctAnnualReportReview` skal ikke etterlate ACCEPTED+«publisert»
   når publisering feiler. Skill «lagre review» fra «publiser»; returner publiseringsstatus.
7. **Selskapssiden:** lese-sti for fulle publiserte linjeposter (ny komponent/seksjon), behold
   KeyFiguresGrid for nøkkeltall.
8. **UI-ærlighet:** vis blocking valideringsfeil ved Valider; «publisert»-tekst betinget av
   `filing.publishedSnapshotAt`.
9. **Engangsfiks Canica:** normaliser de 70 eksisterende reviewedFacts (unitScale=1, korriger
   statementType), kjør publish → verifiser rader i PublishedFinancialLineItem + FinancialStatement.
10. **Opprydding FinancialFact (destruktivt — DRY-RUN først):** behold nyeste extractionRun per
    (filing, fiscalYear), slett resten. Vis hva som slettes før kjøring. Sørg for at ekstraksjons-
    pipelinen aldri rører PublishedFinancialLineItem.

## VIKTIG verktøy-advarsel for neste økt
Denne økten fikk korrupt Read-output (fabrikkerte gjentatte linjer i schema.prisma rundt
linje 853+). Verifiser at Read gir rent innhold før du gjør Edit på schema.prisma /
annual-report-review-service.ts / ReviewWorkspace.tsx. Start gjerne fersk økt.

## Nøkkelfiler
- `prisma/schema.prisma` — FinancialStatement (821-855), FinancialFact (952-982),
  AnnualReportReviewedFact (1365-1392), enums (StatementScope, FinancialFactStatementType,
  ReviewedFactCorrectionSource har allerede `PUBLISHED_AT_REVIEW`).
- `server/services/annual-report-review-service.ts` — correctAnnualReportReview (402-597),
  validate (788-831), publish (837-986), finalize (988-1007).
- `server/services/annual-report-review-mapping.ts` — reviewedFactToCandidate,
  buildNormalizedFinancialPayload, getStatementTypeForMetricKey, reviewScopeFromFacts.
- `server/persistence/financial-statement-repository.ts` — publishFinancialStatementSnapshot.
- `server/persistence/company-repository.ts:417` — getLatestFinancialsForCompanies (lesesti).
- `app/(app)/admin/annual-report-reviews/[reviewId]/ReviewWorkspace.tsx` — getRowId (323),
  buildReviewedFactsPayload (~884), canPublish (1261), publisert-tekst (1799-1805).
- `app/api/admin/annual-report-reviews/[reviewId]/{correct,publish-reviewed-facts,validate-reviewed-facts}/route.ts`
