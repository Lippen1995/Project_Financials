# Annual-report benchmark

Generated at: 2026-04-23T12:05:41.407Z

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
- Material disagreements: 1
- Publish-decision mismatches: 0
- Evidence counts: legacy-only=4, captured-fixture=1, live-local-odl=3, live-hybrid-odl=0
- Comparison assessments: no-disagreement=3, known-evidence-gap=1, likely-issue=0
- Divergence stages: none=3, unit_scale=1
- Legacy average runtime (ms): 58.25
- OpenDataLoader average runtime (ms): 836.5

## Document Classes

- blank_cells: cases=1, differential=0, live=0, publishParity=n/a, materialDisagreement=n/a, knownEvidenceGaps=0, likelyIssues=0
- captured_fixture: cases=1, differential=1, live=0, publishParity=1, materialDisagreement=1, knownEvidenceGaps=1, likelyIssues=0
- column_swap: cases=2, differential=1, live=1, publishParity=1, materialDisagreement=0, knownEvidenceGaps=0, likelyIssues=0
- continuation_complex: cases=3, differential=1, live=1, publishParity=1, materialDisagreement=0, knownEvidenceGaps=0, likelyIssues=0
- degraded_ambiguous: cases=2, differential=1, live=1, publishParity=1, materialDisagreement=0, knownEvidenceGaps=0, likelyIssues=0
- digital_note_heavy: cases=4, differential=3, live=2, publishParity=1, materialDisagreement=0.3333333333333333, knownEvidenceGaps=1, likelyIssues=0
- digital_simple: cases=4, differential=3, live=2, publishParity=1, materialDisagreement=0.3333333333333333, knownEvidenceGaps=1, likelyIssues=0
- formatting_edge: cases=1, differential=0, live=0, publishParity=n/a, materialDisagreement=n/a, knownEvidenceGaps=0, likelyIssues=0
- live_local: cases=3, differential=3, live=3, publishParity=1, materialDisagreement=0, knownEvidenceGaps=0, likelyIssues=0
- manual_review_expected: cases=3, differential=1, live=1, publishParity=1, materialDisagreement=0, knownEvidenceGaps=0, likelyIssues=0
- multi_page_balance: cases=3, differential=1, live=1, publishParity=1, materialDisagreement=0, knownEvidenceGaps=0, likelyIssues=0
- negative_numbers: cases=1, differential=0, live=0, publishParity=n/a, materialDisagreement=n/a, knownEvidenceGaps=0, likelyIssues=0
- ocr_token_noise: cases=1, differential=0, live=0, publishParity=n/a, materialDisagreement=n/a, knownEvidenceGaps=0, likelyIssues=0
- scan_or_ocr: cases=2, differential=0, live=0, publishParity=n/a, materialDisagreement=n/a, knownEvidenceGaps=0, likelyIssues=0
- supplementary_present: cases=3, differential=1, live=1, publishParity=1, materialDisagreement=0, knownEvidenceGaps=0, likelyIssues=0
- unit_scale_sensitive: cases=7, differential=4, live=3, publishParity=1, materialDisagreement=0.25, knownEvidenceGaps=1, likelyIssues=0

## ODL Shadow Signals

- ODL-only blocking reasons: none
- Missing ODL canonical facts: none

## Recommendation

- keep legacy as default, OpenDataLoader shadow-only
- Reason: Live benchmark-kjøringene er rene, og gjenværende uenigheter er forklart av captured-fixture-begrensninger. Evidensgrunnlaget er fortsatt for smalt til å endre rollout-postur, så OpenDataLoader forblir shadow-only.

## Cases

### formatting-edge-manual-review

- Status: completed
- Mode: expected
- Evidence: legacy-only
- Tags: scan_or_ocr, formatting_edge, manual_review_expected, negative_numbers, blank_cells
- Legacy: MANUAL_REVIEW, runtime 8 ms

### manual-review-ambiguous-live-local

- Status: completed
- Mode: expected_and_differential
- Evidence: live-local-odl
- Tags: digital_simple, unit_scale_sensitive, manual_review_expected, degraded_ambiguous, column_swap, live_local
- Legacy: MANUAL_REVIEW, runtime 420 ms
- OpenDataLoader: MANUAL_REVIEW, runtime 1089 ms, source live_pdf
- Comparison: disagreement=false, publishMismatch=false
- Comparison assessment: no_material_disagreement (No material disagreement was detected between legacy and OpenDataLoader for this case.)

### manual-review-ambiguous

- Status: completed
- Mode: expected
- Evidence: legacy-only
- Tags: digital_simple, unit_scale_sensitive, manual_review_expected, degraded_ambiguous, column_swap
- Legacy: MANUAL_REVIEW, runtime 6 ms

### paired-digital-happy-path

- Status: completed
- Mode: expected_and_differential
- Evidence: captured-fixture
- Tags: digital_simple, digital_note_heavy, unit_scale_sensitive, captured_fixture
- Legacy: PUBLISHED, runtime 5 ms
- OpenDataLoader: PUBLISHED, runtime 3 ms, source captured_normalized_json
- Comparison: disagreement=true, publishMismatch=false
- Comparison assessment: known_evidence_gap (The captured OpenDataLoader fixture omits the note-level declaration line 'Alle tall i notene er NOK 1.000 ...' that exists in the legacy inline PDF page, so the remaining note-page unit-scale disagreement is evidence-limited rather than a proven parser bug.)
- First divergence: unit_scale
- Divergence summary: Unit-scale decisions differ before normalization.
- Statement pages: legacy=2:STATUTORY_INCOME, 3:STATUTORY_BALANCE; opendataloader=2:STATUTORY_INCOME, 3:STATUTORY_BALANCE
- Note pages: legacy=4; opendataloader=4
- Page classification/unit diffs: page 4 legacy=NOTE/scale=1000 opendataloader=NOTE/scale=unknown (OpenDataLoader had fewer numeric row signals than legacy on this page.)
- Known evidence limitations: The captured OpenDataLoader fixture omits the note-level declaration line 'Alle tall i notene er NOK 1.000 ...' that exists in the legacy inline PDF page, so the remaining note-page unit-scale disagreement is evidence-limited rather than a proven parser bug.

### paired-digital-live-local

- Status: completed
- Mode: expected_and_differential
- Evidence: live-local-odl
- Tags: digital_simple, digital_note_heavy, unit_scale_sensitive, live_local
- Legacy: PUBLISHED, runtime 5 ms
- OpenDataLoader: PUBLISHED, runtime 1014 ms, source live_pdf
- Comparison: disagreement=false, publishMismatch=false
- Comparison assessment: no_material_disagreement (No material disagreement was detected between legacy and OpenDataLoader for this case.)

### published-happy-path-live-local

- Status: completed
- Mode: expected_and_differential
- Evidence: live-local-odl
- Tags: digital_note_heavy, multi_page_balance, supplementary_present, unit_scale_sensitive, continuation_complex, live_local
- Legacy: PUBLISHED, runtime 8 ms
- OpenDataLoader: PUBLISHED, runtime 1240 ms, source live_pdf
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
- Legacy: PUBLISHED, runtime 4 ms
