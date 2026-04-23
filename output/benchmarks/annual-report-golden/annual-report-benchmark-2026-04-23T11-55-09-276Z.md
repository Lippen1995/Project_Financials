# Annual-report benchmark

Generated at: 2026-04-23T11:55:09.276Z

## Runtime

- OpenDataLoader package: 2.2.1
- Java version: 17.0.18
- Local OpenDataLoader ready: yes
- Local readiness reason: Java 17.0.18 is compatible with local OpenDataLoader execution.
- Live local benchmark ready: yes (Environment is ready for live local OpenDataLoader benchmark cases.)
- Live hybrid benchmark ready: no (OPENDATALOADER_HYBRID_URL is not configured.)

## Summary

- Cases: 8/8 completed
- Skipped cases: 0
- Differential cases: 4
- Material disagreements: 2
- Publish-decision mismatches: 0
- Evidence counts: legacy-only=4, captured-fixture=1, live-local-odl=3, live-hybrid-odl=0
- Comparison assessments: no-disagreement=2, known-evidence-gap=1, likely-issue=1
- Divergence stages: none=2, page_classification=1, unit_scale=1
- Legacy average runtime (ms): 58.25
- OpenDataLoader average runtime (ms): 862.25

## Document Classes

- blank_cells: cases=1, differential=0, live=0, publishParity=n/a, materialDisagreement=n/a, knownEvidenceGaps=0, likelyIssues=0
- captured_fixture: cases=1, differential=1, live=0, publishParity=1, materialDisagreement=1, knownEvidenceGaps=1, likelyIssues=0
- column_swap: cases=2, differential=1, live=1, publishParity=1, materialDisagreement=1, knownEvidenceGaps=0, likelyIssues=1
- continuation_complex: cases=3, differential=1, live=1, publishParity=1, materialDisagreement=0, knownEvidenceGaps=0, likelyIssues=0
- degraded_ambiguous: cases=2, differential=1, live=1, publishParity=1, materialDisagreement=1, knownEvidenceGaps=0, likelyIssues=1
- digital_note_heavy: cases=4, differential=3, live=2, publishParity=1, materialDisagreement=0.3333333333333333, knownEvidenceGaps=1, likelyIssues=0
- digital_simple: cases=4, differential=3, live=2, publishParity=1, materialDisagreement=0.6666666666666666, knownEvidenceGaps=1, likelyIssues=1
- formatting_edge: cases=1, differential=0, live=0, publishParity=n/a, materialDisagreement=n/a, knownEvidenceGaps=0, likelyIssues=0
- live_local: cases=3, differential=3, live=3, publishParity=1, materialDisagreement=0.3333333333333333, knownEvidenceGaps=0, likelyIssues=1
- manual_review_expected: cases=3, differential=1, live=1, publishParity=1, materialDisagreement=1, knownEvidenceGaps=0, likelyIssues=1
- multi_page_balance: cases=3, differential=1, live=1, publishParity=1, materialDisagreement=0, knownEvidenceGaps=0, likelyIssues=0
- negative_numbers: cases=1, differential=0, live=0, publishParity=n/a, materialDisagreement=n/a, knownEvidenceGaps=0, likelyIssues=0
- ocr_token_noise: cases=1, differential=0, live=0, publishParity=n/a, materialDisagreement=n/a, knownEvidenceGaps=0, likelyIssues=0
- scan_or_ocr: cases=2, differential=0, live=0, publishParity=n/a, materialDisagreement=n/a, knownEvidenceGaps=0, likelyIssues=0
- supplementary_present: cases=3, differential=1, live=1, publishParity=1, materialDisagreement=0, knownEvidenceGaps=0, likelyIssues=0
- unit_scale_sensitive: cases=7, differential=4, live=3, publishParity=1, materialDisagreement=0.5, knownEvidenceGaps=1, likelyIssues=1

## ODL Shadow Signals

- ODL-only blocking reasons: PRIMARY_BALANCE_PAGE_MISSING=1, PRIMARY_INCOME_PAGE_MISSING=1, REQUIRED_PRIMARY_METRICS_MISSING=1, SCALE_CONFLICT_ON_PAGE=1
- Missing ODL canonical facts: cash_and_cash_equivalents=1, net_income=1, operating_profit=1, revenue=1, total_assets=1, total_operating_expenses=1, total_operating_income=1, trade_receivables=1

## Recommendation

- keep legacy as default, OpenDataLoader shadow-only
- Reason: Det finnes materielle uenigheter i live OpenDataLoader-kjøringer. Inntil disse er forklart, bør OpenDataLoader ikke få publiseringsansvar.

## Cases

### formatting-edge-manual-review

- Status: completed
- Mode: expected
- Evidence: legacy-only
- Tags: scan_or_ocr, formatting_edge, manual_review_expected, negative_numbers, blank_cells
- Legacy: MANUAL_REVIEW, runtime 9 ms

### manual-review-ambiguous-live-local

- Status: completed
- Mode: expected_and_differential
- Evidence: live-local-odl
- Tags: digital_simple, unit_scale_sensitive, manual_review_expected, degraded_ambiguous, column_swap, live_local
- Legacy: MANUAL_REVIEW, runtime 415 ms
- OpenDataLoader: MANUAL_REVIEW, runtime 1205 ms, source live_pdf
- Comparison: disagreement=true, publishMismatch=false
- Comparison assessment: likely_code_or_logic_issue (A material disagreement remains without a declared evidence limitation, so this case still looks like a parser or pipeline issue.)
- First divergence: page_classification
- Divergence summary: Statement page selection differs before row reconstruction.
- Statement pages: legacy=2:STATUTORY_INCOME, 3:STATUTORY_BALANCE; opendataloader=none
- Note pages: legacy=none; opendataloader=2
- Missing ODL facts: cash_and_cash_equivalents, net_income, operating_profit, revenue, total_assets, total_operating_expenses, total_operating_income, trade_receivables
- Issues only on ODL: PRIMARY_BALANCE_PAGE_MISSING, PRIMARY_INCOME_PAGE_MISSING
- ODL blocking reasons: PRIMARY_BALANCE_PAGE_MISSING, PRIMARY_INCOME_PAGE_MISSING, REQUIRED_PRIMARY_METRICS_MISSING, SCALE_CONFLICT_ON_PAGE

### manual-review-ambiguous

- Status: completed
- Mode: expected
- Evidence: legacy-only
- Tags: digital_simple, unit_scale_sensitive, manual_review_expected, degraded_ambiguous, column_swap
- Legacy: MANUAL_REVIEW, runtime 5 ms

### paired-digital-happy-path

- Status: completed
- Mode: expected_and_differential
- Evidence: captured-fixture
- Tags: digital_simple, digital_note_heavy, unit_scale_sensitive, captured_fixture
- Legacy: PUBLISHED, runtime 5 ms
- OpenDataLoader: PUBLISHED, runtime 4 ms, source captured_normalized_json
- Comparison: disagreement=true, publishMismatch=false
- Comparison assessment: known_evidence_gap (The captured OpenDataLoader fixture omits the note-level declaration line 'Alle tall i notene er NOK 1.000 ...' that exists in the legacy inline PDF page, so the remaining note-page unit-scale disagreement is evidence-limited rather than a proven parser bug.)
- First divergence: unit_scale
- Divergence summary: Unit-scale decisions differ before normalization.
- Statement pages: legacy=2:STATUTORY_INCOME, 3:STATUTORY_BALANCE; opendataloader=2:STATUTORY_INCOME, 3:STATUTORY_BALANCE
- Note pages: legacy=4; opendataloader=4
- Known evidence limitations: The captured OpenDataLoader fixture omits the note-level declaration line 'Alle tall i notene er NOK 1.000 ...' that exists in the legacy inline PDF page, so the remaining note-page unit-scale disagreement is evidence-limited rather than a proven parser bug.

### paired-digital-live-local

- Status: completed
- Mode: expected_and_differential
- Evidence: live-local-odl
- Tags: digital_simple, digital_note_heavy, unit_scale_sensitive, live_local
- Legacy: PUBLISHED, runtime 5 ms
- OpenDataLoader: PUBLISHED, runtime 1029 ms, source live_pdf
- Comparison: disagreement=false, publishMismatch=false
- Comparison assessment: no_material_disagreement (No material disagreement was detected between legacy and OpenDataLoader for this case.)

### published-happy-path-live-local

- Status: completed
- Mode: expected_and_differential
- Evidence: live-local-odl
- Tags: digital_note_heavy, multi_page_balance, supplementary_present, unit_scale_sensitive, continuation_complex, live_local
- Legacy: PUBLISHED, runtime 10 ms
- OpenDataLoader: PUBLISHED, runtime 1211 ms, source live_pdf
- Comparison: disagreement=false, publishMismatch=false
- Comparison assessment: no_material_disagreement (No material disagreement was detected between legacy and OpenDataLoader for this case.)

### published-happy-path

- Status: completed
- Mode: expected
- Evidence: legacy-only
- Tags: digital_note_heavy, multi_page_balance, supplementary_present, unit_scale_sensitive, continuation_complex
- Legacy: PUBLISHED, runtime 10 ms

### scan-like-duplicate-sections

- Status: completed
- Mode: expected
- Evidence: legacy-only
- Tags: scan_or_ocr, ocr_token_noise, multi_page_balance, supplementary_present, unit_scale_sensitive, continuation_complex
- Legacy: PUBLISHED, runtime 7 ms
