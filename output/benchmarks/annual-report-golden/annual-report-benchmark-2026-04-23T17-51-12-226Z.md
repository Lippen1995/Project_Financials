# Annual-report benchmark

Generated at: 2026-04-23T17:51:12.226Z

## Runtime

- OpenDataLoader package: 2.2.1
- Java version: 1.8.0_241
- Local OpenDataLoader ready: no
- Local readiness reason: Detected Java 1.8.0_241, but local OpenDataLoader requires Java 11+.
- Live local benchmark ready: no (Detected Java 1.8.0_241, but local OpenDataLoader requires Java 11+.)
- Live hybrid benchmark ready: no (OPENDATALOADER_HYBRID_URL is not configured.)

## Summary

- Cases: 7/7 completed
- Skipped cases: 0
- Differential cases: 3
- Material disagreements: 1
- Publish-decision mismatches: 0
- Evidence counts: legacy-only=4, captured-fixture=3, live-local-odl=0, live-hybrid-odl=0
- Comparison assessments: no-disagreement=2, known-evidence-gap=1, likely-issue=0
- Divergence stages: none=2, unit_scale=1
- Legacy average runtime (ms): 60.42857142857143
- OpenDataLoader average runtime (ms): 3.6666666666666665

## Document Classes

- blank_cells: cases=2, differential=1, live=0, publishParity=1, materialDisagreement=0, knownEvidenceGaps=0, likelyIssues=0
- captured_fixture: cases=1, differential=1, live=0, publishParity=1, materialDisagreement=1, knownEvidenceGaps=1, likelyIssues=0
- column_swap: cases=1, differential=0, live=0, publishParity=n/a, materialDisagreement=n/a, knownEvidenceGaps=0, likelyIssues=0
- continuation_complex: cases=3, differential=1, live=0, publishParity=1, materialDisagreement=0, knownEvidenceGaps=0, likelyIssues=0
- degraded_ambiguous: cases=2, differential=1, live=0, publishParity=1, materialDisagreement=0, knownEvidenceGaps=0, likelyIssues=0
- digital_note_heavy: cases=3, differential=2, live=0, publishParity=1, materialDisagreement=0.5, knownEvidenceGaps=1, likelyIssues=0
- digital_simple: cases=2, differential=1, live=0, publishParity=1, materialDisagreement=1, knownEvidenceGaps=1, likelyIssues=0
- formatting_edge: cases=2, differential=1, live=0, publishParity=1, materialDisagreement=0, knownEvidenceGaps=0, likelyIssues=0
- manual_review_expected: cases=3, differential=1, live=0, publishParity=1, materialDisagreement=0, knownEvidenceGaps=0, likelyIssues=0
- multi_page_balance: cases=3, differential=1, live=0, publishParity=1, materialDisagreement=0, knownEvidenceGaps=0, likelyIssues=0
- negative_numbers: cases=2, differential=1, live=0, publishParity=1, materialDisagreement=0, knownEvidenceGaps=0, likelyIssues=0
- ocr_token_noise: cases=3, differential=2, live=0, publishParity=1, materialDisagreement=0, knownEvidenceGaps=0, likelyIssues=0
- scan_or_ocr: cases=4, differential=2, live=0, publishParity=1, materialDisagreement=0, knownEvidenceGaps=0, likelyIssues=0
- supplementary_present: cases=3, differential=1, live=0, publishParity=1, materialDisagreement=0, knownEvidenceGaps=0, likelyIssues=0
- unit_scale_sensitive: cases=5, differential=2, live=0, publishParity=1, materialDisagreement=0.5, knownEvidenceGaps=1, likelyIssues=0

## Shadow Evidence By Class

- blank_cells: status=fixture_only, differential=1, live=0, evidence=legacy-only:0/captured:1/live-local:0/live-hybrid:0, publishMismatch=0, materialDisagreement=0, usableOdlStructure=1, manualReviewSafety=1
  reason: Dokumentklassen har bare fixture-/captured-baserte shadow-caser og mangler live ODL-evidens.
  firstDivergence: none=1; odlBlocking: none
- captured_fixture: status=fixture_only, differential=1, live=0, evidence=legacy-only:0/captured:1/live-local:0/live-hybrid:0, publishMismatch=0, materialDisagreement=1, usableOdlStructure=1, manualReviewSafety=0
  reason: Dokumentklassen har bare fixture-/captured-baserte shadow-caser og mangler live ODL-evidens.
  firstDivergence: unit_scale=1; odlBlocking: none
- continuation_complex: status=fixture_only, differential=1, live=0, evidence=legacy-only:0/captured:1/live-local:0/live-hybrid:0, publishMismatch=0, materialDisagreement=0, usableOdlStructure=1, manualReviewSafety=0
  reason: Dokumentklassen har bare fixture-/captured-baserte shadow-caser og mangler live ODL-evidens.
  firstDivergence: none=1; odlBlocking: none
- degraded_ambiguous: status=fixture_only, differential=1, live=0, evidence=legacy-only:0/captured:1/live-local:0/live-hybrid:0, publishMismatch=0, materialDisagreement=0, usableOdlStructure=1, manualReviewSafety=1
  reason: Dokumentklassen har bare fixture-/captured-baserte shadow-caser og mangler live ODL-evidens.
  firstDivergence: none=1; odlBlocking: none
- digital_note_heavy: status=fixture_only, differential=2, live=0, evidence=legacy-only:0/captured:2/live-local:0/live-hybrid:0, publishMismatch=0, materialDisagreement=1, usableOdlStructure=2, manualReviewSafety=0
  reason: Dokumentklassen har bare fixture-/captured-baserte shadow-caser og mangler live ODL-evidens.
  firstDivergence: none=1, unit_scale=1; odlBlocking: none
- digital_simple: status=fixture_only, differential=1, live=0, evidence=legacy-only:0/captured:1/live-local:0/live-hybrid:0, publishMismatch=0, materialDisagreement=1, usableOdlStructure=1, manualReviewSafety=0
  reason: Dokumentklassen har bare fixture-/captured-baserte shadow-caser og mangler live ODL-evidens.
  firstDivergence: unit_scale=1; odlBlocking: none
- formatting_edge: status=fixture_only, differential=1, live=0, evidence=legacy-only:0/captured:1/live-local:0/live-hybrid:0, publishMismatch=0, materialDisagreement=0, usableOdlStructure=1, manualReviewSafety=1
  reason: Dokumentklassen har bare fixture-/captured-baserte shadow-caser og mangler live ODL-evidens.
  firstDivergence: none=1; odlBlocking: none
- manual_review_expected: status=fixture_only, differential=1, live=0, evidence=legacy-only:0/captured:1/live-local:0/live-hybrid:0, publishMismatch=0, materialDisagreement=0, usableOdlStructure=1, manualReviewSafety=1
  reason: Dokumentklassen har bare fixture-/captured-baserte shadow-caser og mangler live ODL-evidens.
  firstDivergence: none=1; odlBlocking: none
- multi_page_balance: status=fixture_only, differential=1, live=0, evidence=legacy-only:0/captured:1/live-local:0/live-hybrid:0, publishMismatch=0, materialDisagreement=0, usableOdlStructure=1, manualReviewSafety=0
  reason: Dokumentklassen har bare fixture-/captured-baserte shadow-caser og mangler live ODL-evidens.
  firstDivergence: none=1; odlBlocking: none
- negative_numbers: status=fixture_only, differential=1, live=0, evidence=legacy-only:0/captured:1/live-local:0/live-hybrid:0, publishMismatch=0, materialDisagreement=0, usableOdlStructure=1, manualReviewSafety=1
  reason: Dokumentklassen har bare fixture-/captured-baserte shadow-caser og mangler live ODL-evidens.
  firstDivergence: none=1; odlBlocking: none
- ocr_token_noise: status=fixture_only, differential=2, live=0, evidence=legacy-only:0/captured:2/live-local:0/live-hybrid:0, publishMismatch=0, materialDisagreement=0, usableOdlStructure=2, manualReviewSafety=1
  reason: Dokumentklassen har bare fixture-/captured-baserte shadow-caser og mangler live ODL-evidens.
  firstDivergence: none=2; odlBlocking: none
- scan_or_ocr: status=fixture_only, differential=2, live=0, evidence=legacy-only:0/captured:2/live-local:0/live-hybrid:0, publishMismatch=0, materialDisagreement=0, usableOdlStructure=2, manualReviewSafety=1
  reason: Dokumentklassen har bare fixture-/captured-baserte shadow-caser og mangler live ODL-evidens.
  firstDivergence: none=2; odlBlocking: none
- supplementary_present: status=fixture_only, differential=1, live=0, evidence=legacy-only:0/captured:1/live-local:0/live-hybrid:0, publishMismatch=0, materialDisagreement=0, usableOdlStructure=1, manualReviewSafety=0
  reason: Dokumentklassen har bare fixture-/captured-baserte shadow-caser og mangler live ODL-evidens.
  firstDivergence: none=1; odlBlocking: none
- unit_scale_sensitive: status=fixture_only, differential=2, live=0, evidence=legacy-only:0/captured:2/live-local:0/live-hybrid:0, publishMismatch=0, materialDisagreement=1, usableOdlStructure=2, manualReviewSafety=0
  reason: Dokumentklassen har bare fixture-/captured-baserte shadow-caser og mangler live ODL-evidens.
  firstDivergence: none=1, unit_scale=1; odlBlocking: none

## ODL Shadow Signals

- ODL-only blocking reasons: none
- Missing ODL canonical facts: none

## Recommendation

- keep legacy as default, OpenDataLoader shadow-only
- Reason: Repoet har ikke bekreftet lokal OpenDataLoader-runtime i dette miljoet. Java 11+ er ikke klart, sa rollout bor ikke skje utover fixture/shadow-evaluering.

## Cases

### formatting-edge-manual-review-shadow

- Status: completed
- Mode: expected_and_differential
- Evidence: captured-fixture
- Tags: scan_or_ocr, ocr_token_noise, formatting_edge, manual_review_expected, negative_numbers, blank_cells, degraded_ambiguous
- Legacy: MANUAL_REVIEW, runtime 6 ms
- OpenDataLoader: MANUAL_REVIEW, runtime 1 ms, source ocr_fixture
- Comparison: disagreement=false, publishMismatch=false
- Comparison assessment: no_material_disagreement (No material disagreement was detected between legacy and OpenDataLoader for this case.)
- Known evidence limitations: The OpenDataLoader side for this case uses the repo OCR regression fixture as a captured stand-in for degraded OCR/hybrid output, not a live local or live hybrid ODL parse.

### formatting-edge-manual-review

- Status: completed
- Mode: expected
- Evidence: legacy-only
- Tags: scan_or_ocr, formatting_edge, manual_review_expected, negative_numbers, blank_cells
- Legacy: MANUAL_REVIEW, runtime 2 ms

### manual-review-ambiguous

- Status: completed
- Mode: expected
- Evidence: legacy-only
- Tags: digital_simple, unit_scale_sensitive, manual_review_expected, degraded_ambiguous, column_swap
- Legacy: MANUAL_REVIEW, runtime 388 ms

### paired-digital-happy-path

- Status: completed
- Mode: expected_and_differential
- Evidence: captured-fixture
- Tags: digital_simple, digital_note_heavy, unit_scale_sensitive, captured_fixture
- Legacy: PUBLISHED, runtime 6 ms
- OpenDataLoader: PUBLISHED, runtime 6 ms, source captured_normalized_json
- Comparison: disagreement=true, publishMismatch=false
- Comparison assessment: known_evidence_gap (The captured OpenDataLoader fixture omits the note-level declaration line 'Alle tall i notene er NOK 1.000 ...' that exists in the legacy inline PDF page, so the remaining note-page unit-scale disagreement is evidence-limited rather than a proven parser bug.)
- First divergence: unit_scale
- Divergence summary: Unit-scale decisions differ before normalization.
- Statement pages: legacy=2:STATUTORY_INCOME, 3:STATUTORY_BALANCE; opendataloader=2:STATUTORY_INCOME, 3:STATUTORY_BALANCE
- Note pages: legacy=4; opendataloader=4
- Page classification/unit diffs: page 4 legacy=NOTE/scale=1000 opendataloader=NOTE/scale=unknown (OpenDataLoader had fewer numeric row signals than legacy on this page.)
- Known evidence limitations: The captured OpenDataLoader fixture omits the note-level declaration line 'Alle tall i notene er NOK 1.000 ...' that exists in the legacy inline PDF page, so the remaining note-page unit-scale disagreement is evidence-limited rather than a proven parser bug.

### published-happy-path

- Status: completed
- Mode: expected
- Evidence: legacy-only
- Tags: digital_note_heavy, multi_page_balance, supplementary_present, unit_scale_sensitive, continuation_complex
- Legacy: PUBLISHED, runtime 13 ms

### scan-like-duplicate-sections-shadow

- Status: completed
- Mode: expected_and_differential
- Evidence: captured-fixture
- Tags: scan_or_ocr, ocr_token_noise, multi_page_balance, supplementary_present, unit_scale_sensitive, continuation_complex, digital_note_heavy
- Legacy: PUBLISHED, runtime 4 ms
- OpenDataLoader: PUBLISHED, runtime 4 ms, source ocr_fixture
- Comparison: disagreement=false, publishMismatch=false
- Comparison assessment: no_material_disagreement (No material disagreement was detected between legacy and OpenDataLoader for this case.)
- Known evidence limitations: The OpenDataLoader side for this case uses the repo OCR regression fixture as a captured stand-in for degraded OCR/hybrid output, not a live local or live hybrid ODL parse.

### scan-like-duplicate-sections

- Status: completed
- Mode: expected
- Evidence: legacy-only
- Tags: scan_or_ocr, ocr_token_noise, multi_page_balance, supplementary_present, unit_scale_sensitive, continuation_complex
- Legacy: PUBLISHED, runtime 4 ms
