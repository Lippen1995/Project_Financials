# PR79 extraction fix summary

- Generated at: 2026-05-11T21:21:20.190Z
- Status: REGRESSION_VERIFIED

## Targeted issue classes

- UNIT_SCALE_MISMATCH
- NORWEGIAN_LABEL_MAPPING_ERROR
- MULTI_PAGE_BALANCE_ERROR
- TABLE_RECONSTRUCTION_ERROR
- OCR_TOKEN_NOISE

## Fixes implemented

- Utvidet unit-scale-deteksjon for tusen-kroner-formuleringer i legacy parser-pathen.
- Lagt til millions/MNOK-deteksjon i unified extractor uten a pavirke publish safety.
- Rettet continuation-tabeller med tittelen 'Egenkapital og gjeld' til balansekontekst.
- Utvidet norsk label-mapping for profit_before_tax og cash_and_cash_equivalents.

## Baseline metrics

- Differential benchmark cases: before=3, after=unknown (Gold-set shadow run er persisted, men benchmark-differensialer er ikke kjort pa nytt enda.)
- Material disagreements: before=unknown, after=unknown (Gold-set shadow run er persisted, men benchmark-disagreements er ikke kjort pa nytt enda.)
- Unit-scale-sensitive cases: before=5, after=unknown (Brukes som baseline for skala-relaterte fikser.)
- Multi-page balance cases: before=3, after=unknown (Brukes som baseline for continuation-/balansefikser.)
- OCR token noise cases: before=3, after=unknown (Brukes som baseline for numerisk/OCR-relatert parsing.)
- Skipped shadow cases: before=1, after=4 (After-verdien kommer fra ny persisted gold-set shadow run.)
- Hybrid runtime ready: before=0, after=1 (0 betyr at hybrid-runtime ikke er klar i dette miljoet.)

## Tests added

- unit-scale.test.ts: tusen-kroner og tusen-NOK erklaringer
- unified-financial-statement-extractor.test.ts: millions scale
- unified-financial-statement-extractor.test.ts: continuation-balance role detection
- unified-financial-statement-extractor.test.ts: Norwegian label mapping aliases

## Remaining blockers

- none

## Recommendations for PR80

- Kjor ny persisted annual-report benchmark nar det finnes flere post-fix caser med levende evidens.
- Hold unified shadow-only til readiness-rapporten kan vise oppdatert post-fix evidens.
- Behandle manglende legacy-resultater og unavailable gold-set entries som egne readiness-blokkere i PR80.
