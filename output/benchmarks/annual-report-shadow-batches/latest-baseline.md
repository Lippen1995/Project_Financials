# Annual-report shadow batch

Generated at: 2026-04-25T08:10:29.391Z
Batch: baseline-shadow-batch-918298037-2024-2024
Entries: 1

## Summary

- Real filings evaluated: 1
- Completed comparisons: 1
- Skipped: 0
- Publish mismatches: 0
- Material disagreements: 1
- Evidence quality counts: live-local=0, live-hybrid=1, runtime-unavailable=0, missing-pdf=0
- Classes with zero live evidence: none

## OCR / Degraded Visibility

- OCR/degraded cases: 1
- Live OCR/degraded cases: 1
- Runtime-unavailable OCR/degraded cases: 0
- OCR/degraded publish mismatches: 0
- OCR/degraded material disagreements: 1
- OCR/degraded safe manual-review outcomes: 1

## Baseline OCR Batch

- Default baseline org: 918298037
- Default baseline fiscal years: 2024, 2023, 2022, 2021, 2020
- Baseline filings present in manifest: 1

## Shadow Evidence By Class

- degraded_ambiguous: status=live_weakness_observed, differential=1, live=1, publishMismatch=0, materialDisagreement=1, usableOdlStructure=0, manualReviewSafety=0
  reason: Minst én live ODL-case i denne dokumentklassen viser materiell uenighet eller publiseringssvikt.
- live_hybrid: status=live_weakness_observed, differential=1, live=1, publishMismatch=0, materialDisagreement=1, usableOdlStructure=0, manualReviewSafety=0
  reason: Minst én live ODL-case i denne dokumentklassen viser materiell uenighet eller publiseringssvikt.
- manual_review_expected: status=live_weakness_observed, differential=1, live=1, publishMismatch=0, materialDisagreement=1, usableOdlStructure=0, manualReviewSafety=0
  reason: Minst én live ODL-case i denne dokumentklassen viser materiell uenighet eller publiseringssvikt.
- ocr_token_noise: status=live_weakness_observed, differential=1, live=1, publishMismatch=0, materialDisagreement=1, usableOdlStructure=0, manualReviewSafety=0
  reason: Minst én live ODL-case i denne dokumentklassen viser materiell uenighet eller publiseringssvikt.
- scan_or_ocr: status=live_weakness_observed, differential=1, live=1, publishMismatch=0, materialDisagreement=1, usableOdlStructure=0, manualReviewSafety=0
  reason: Minst én live ODL-case i denne dokumentklassen viser materiell uenighet eller publiseringssvikt.

## Recommendation

- keep legacy as default, OpenDataLoader shadow-only
- Reason: Det finnes materielle uenigheter i live OpenDataLoader-kjøringer. Inntil disse er forklart, bør OpenDataLoader ikke få publiseringsansvar.

## Cases

### cmobtujqo0001vmvoz4tcie6q

- Filing: cmobtujqo0001vmvoz4tcie6q (918298037 2024)
- Status: completed
- Evidence quality: real-filing-live-hybrid
- Tags: degraded_ambiguous, live_hybrid, manual_review_expected, ocr_token_noise, scan_or_ocr
- Route decision: hybrid (FORCED_HYBRID), requires OCR
- Route reason: Hybrid mode selected explicitly by configuration.
- OCR diagnostics: attempts=25, usable=0, tinySkipped=0, invalid=0, failures=0, pageFallbacks=25, manualReviewDueToOcrQuality=1
- OCR suppressed failures: OCR produced no usable lines for this page-level region. (25)
- Legacy outcome: MANUAL_REVIEW
- ODL outcome: MANUAL_REVIEW (hybrid)
- ODL route reason: Hybrid mode selected explicitly by configuration.
- First divergence: none
- Divergence summary: No material divergence detected.
