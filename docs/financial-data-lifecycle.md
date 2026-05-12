# Financial Data Lifecycle

Denne flyten beskriver hvordan årsrapportdata går fra maskinell innlesing til publiserte regnskapstall i Project_Financials.

## Hovedprinsipp

- Vi publiserer beste tilgjengelige regnskapstall tidlig når uttrekket er brukbart.
- Vi holder tilbake publisering bare når uttrekket er katastrofalt eller åpenbart utrygt.
- Vi bruker manuell review som en forbedringssløyfe etter publisering, ikke som standard erstatning for publisering.
- Intern kvalitet, confidence og review-status er kun for admin-flater.

## To publish-gates

### 1. Provisional publish gate

`canPublishProvisionally(...)` er minimumssikkerheten for publisering.

Denne blokkerer bare når uttrekket ikke er kommersielt brukbart eller virker direkte feil, for eksempel:

- ingen valgte facts
- manglende eller ugyldig regnskapsår
- alle nøkkeltall mangler
- enhetsskala kan ikke fastslås trygt
- verdier er ikke numeriske eller åpenbart absurde
- dokument-/parserflyten har feilet tydelig
- sterk indikasjon på feil selskap, feil år eller feil filing

### 2. Strict trust / skip-review gate

`canPublishAutomatically(...)` er fortsatt den strenge tillitsgaten.

Denne avgjør om en publisert snapshot kan stå uten intern oppfølging, eller om saken skal inn i review-kø.

## Publish-first lifecycle

1. Årsrapport-PDF hentes fra Brreg.
2. Ekstraksjon kjøres og maskinfacts lagres som `FinancialFact`.
3. Provisional publish gate avgjør om snapshot er brukbart nok til å publiseres.
4. Hvis ja, publiseres `FinancialStatement` umiddelbart.
5. Strict trust gate avgjør om saken kan stå uten review.
6. Hvis strict trust gate feiler, opprettes eller oppdateres `AnnualReportReview`.
7. Public UI viser fortsatt bare publiserte regnskapstall.
8. Admin ser quality, validation issues, provenance, artifacts og reviewhistorikk.
9. Når reviewer godkjenner eller korrigerer tallene, lagres `AnnualReportReviewedFact`.
10. `FinancialStatement` oppdateres automatisk fra reviewed facts.

## Reviewed values overstyrer machine values

Publiserte statements følger disse erstatningsreglene:

- reviewed statements overstyrer machine statements
- senere machine-runs kan ikke overskrive reviewed statements som standard
- reviewed statement fra samme filing/review kan oppdatere tidligere reviewed snapshot
- machine statements kan erstatte eldre machine statements når filing- eller kvalitetssignaler tilsier det

Dette bevarer audit trail og hindrer at svakere senere maskinkjøringer tar over etter menneskelig kontroll.

## Public vs internal contracts

Public/company-flater får bare public-safe felt som:

- `fiscalYear`
- `currency`
- `revenue`
- `operatingProfit`
- `netIncome`
- `equity`
- `assets`

Public output skal ikke vise:

- quality status
- quality score
- review status
- extraction run id
- parser route
- confidence
- internal validation flags
- machine-vs-reviewed provenance

Admin/review-flater beholder disse feltene fordi de trengs for oppfølging og feilsøking.

## Manual review improvement loop

- Usikre, ufullstendige eller avvikende saker havner i review-kø internt.
- Reviewer kan godkjenne maskinverdier eller korrigere dem.
- Reviewed facts publiseres automatisk til aktivt regnskapssnapshot.
- Originale `FinancialFact` beholdes i historikken.

## Catastrophic failure behavior

Når provisional publish gate feiler:

- `FinancialStatement` publiseres ikke
- machine facts, issues og artifacts lagres fortsatt når de finnes
- filing markeres for review eller failure internt
- public UI ser ingen publisert financial statement for den filingen

## Hvorfor confidence er intern-only

Confidence, validation og review-status brukes til intern kvalitetssikring og prioritering. De er ikke ment som brukerkommunikasjon, og de skal ikke lekke til public UI eller public API.
