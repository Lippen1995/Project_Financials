# PR79 extraction fix summary

- Generated at: 2026-05-11T15:57:17.769Z
- Status: POST_FIX_VALIDATION_PENDING

## Targeted issue classes

- UNIT_SCALE_MISMATCH
- NORWEGIAN_LABEL_MAPPING_ERROR
- MULTI_PAGE_BALANCE_ERROR
- TABLE_RECONSTRUCTION_ERROR
- OCR_TOKEN_NOISE

## Fixes implemented

- Utvidet unit-scale-deteksjon for tusen-kroner-formuleringer i legacy parser-pathen.
- Lagt til millions/MNOK-deteksjon i unified extractor uten å påvirke publish safety.
- Rettet continuation-tabeller med tittelen 'Egenkapital og gjeld' til balansekontekst.
- Utvidet norsk label-mapping for profit_before_tax og cash_and_cash_equivalents.

## Baseline metrics

- Differential benchmark cases: before=3, after=unknown (Post-fix benchmark rerun er ikke persisted lokalt ennå.)
- Material disagreements: before=unknown, after=unknown (Post-fix benchmark rerun er ikke persisted lokalt ennå.)
- Unit-scale-sensitive cases: before=5, after=unknown (Brukes som baseline for skala-relaterte fikser.)
- Multi-page balance cases: before=3, after=unknown (Brukes som baseline for continuation-/balansefikser.)
- OCR token noise cases: before=3, after=unknown (Brukes som baseline for numerisk/OCR-relatert parsing.)
- Skipped shadow cases: before=1, after=unknown (Skyldes fortsatt manglende hybrid-runtime lokalt.)
- Hybrid runtime ready: before=0, after=unknown (0 betyr at hybrid-runtime ikke er klar i dette miljøet.)

## Tests added

- unit-scale.test.ts: tusen-kroner og tusen-NOK erklæringer
- unified-financial-statement-extractor.test.ts: millions scale
- unified-financial-statement-extractor.test.ts: continuation-balance role detection
- unified-financial-statement-extractor.test.ts: Norwegian label mapping aliases

## Remaining blockers

- OPENDATALOADER_HYBRID_URL is not configured.
- Ingen persisted PR78 failure taxonomy-report ble funnet lokalt.
- Ingen persisted PR77 calibration-report ble funnet lokalt.

## Recommendations for PR80

- Kjør ny persisted gold-set/shadow-batch etter PR79 for å måle faktisk før/etter-effekt.
- Hold unified shadow-only til readiness-rapporten kan vise oppdatert post-fix evidens.
- Behandle manglende hybrid-runtime som egen readiness-blokkerer hvis den fortsatt mangler ved PR80.
