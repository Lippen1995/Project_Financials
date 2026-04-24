# Annual-report shadow batch

Generated at: 2026-04-24T06:49:26.735Z
Batch: baseline-shadow-batch-918298037-2020-2024
Entries: 5

## Summary

- Real filings evaluated: 5
- Completed comparisons: 0
- Skipped: 5
- Publish mismatches: 0
- Material disagreements: 0
- Evidence quality counts: live-local=0, live-hybrid=0, runtime-unavailable=5, missing-pdf=0
- Classes with zero live evidence: degraded_ambiguous, live_hybrid, manual_review_expected, ocr_token_noise, scan_or_ocr

## OCR / Degraded Visibility

- OCR/degraded cases: 5
- Live OCR/degraded cases: 0
- Runtime-unavailable OCR/degraded cases: 5
- OCR/degraded publish mismatches: 0
- OCR/degraded material disagreements: 0
- OCR/degraded safe manual-review outcomes: 0

## Baseline OCR Batch

- Default baseline org: 918298037
- Default baseline fiscal years: 2024, 2023, 2022, 2021, 2020
- Baseline filings present in manifest: 5

## Shadow Evidence By Class


## Recommendation

- keep legacy as default, OpenDataLoader shadow-only
- Reason: Repoet har ikke bekreftet lokal OpenDataLoader-runtime i dette miljoet. Java 11+ er ikke klart, sa rollout bor ikke skje utover fixture/shadow-evaluering.

## Cases

### cmobtujqo0001vmvoz4tcie6q

- Filing: cmobtujqo0001vmvoz4tcie6q (918298037 2024)
- Status: skipped
- Evidence quality: runtime-unavailable
- Tags: degraded_ambiguous, live_hybrid, manual_review_expected, ocr_token_noise, scan_or_ocr
- Route decision: hybrid (SCANNED_PDF), requires OCR
- Route reason: Preflight detected weak or missing text extraction, so hybrid/OCR routing was selected.
- OCR diagnostics: attempts=25, usable=0, tinySkipped=0, invalid=0, failures=0, pageFallbacks=25, manualReviewDueToOcrQuality=1
- OCR suppressed failures: OCR produced no usable lines for this page-level region. (25)
- Legacy outcome: MANUAL_REVIEW
- Errors: OpenDataLoader hybrid mode was selected, but OPENDATALOADER_HYBRID_URL is not configured.
- Evidence limitations: Real hybrid/OCR evidence could not be collected because hybrid runtime is not configured. Route SCANNED_PDF: Preflight detected weak or missing text extraction, so hybrid/OCR routing was selected.

### cmobtujr90003vmvorzjg483p

- Filing: cmobtujr90003vmvorzjg483p (918298037 2023)
- Status: skipped
- Evidence quality: runtime-unavailable
- Tags: degraded_ambiguous, live_hybrid, manual_review_expected, ocr_token_noise, scan_or_ocr
- Route decision: hybrid (SCANNED_PDF), requires OCR
- Route reason: Preflight detected weak or missing text extraction, so hybrid/OCR routing was selected.
- OCR diagnostics: attempts=26, usable=0, tinySkipped=0, invalid=0, failures=0, pageFallbacks=26, manualReviewDueToOcrQuality=1
- OCR suppressed failures: OCR produced no usable lines for this page-level region. (26)
- Legacy outcome: MANUAL_REVIEW
- Errors: OpenDataLoader hybrid mode was selected, but OPENDATALOADER_HYBRID_URL is not configured.
- Evidence limitations: Real hybrid/OCR evidence could not be collected because hybrid runtime is not configured. Route SCANNED_PDF: Preflight detected weak or missing text extraction, so hybrid/OCR routing was selected.

### cmobtujrj0005vmvopubneto4

- Filing: cmobtujrj0005vmvopubneto4 (918298037 2022)
- Status: skipped
- Evidence quality: runtime-unavailable
- Tags: degraded_ambiguous, live_hybrid, manual_review_expected, ocr_token_noise, scan_or_ocr
- Route decision: hybrid (SCANNED_PDF), requires OCR
- Route reason: Preflight detected weak or missing text extraction, so hybrid/OCR routing was selected.
- OCR diagnostics: attempts=26, usable=0, tinySkipped=0, invalid=0, failures=0, pageFallbacks=26, manualReviewDueToOcrQuality=1
- OCR suppressed failures: OCR produced no usable lines for this page-level region. (26)
- Legacy outcome: MANUAL_REVIEW
- Errors: OpenDataLoader hybrid mode was selected, but OPENDATALOADER_HYBRID_URL is not configured.
- Evidence limitations: Real hybrid/OCR evidence could not be collected because hybrid runtime is not configured. Route SCANNED_PDF: Preflight detected weak or missing text extraction, so hybrid/OCR routing was selected.

### cmobtujrs0007vmvos2b14yat

- Filing: cmobtujrs0007vmvos2b14yat (918298037 2021)
- Status: skipped
- Evidence quality: runtime-unavailable
- Tags: degraded_ambiguous, live_hybrid, manual_review_expected, ocr_token_noise, scan_or_ocr
- Route decision: hybrid (SCANNED_PDF), requires OCR
- Route reason: Preflight detected weak or missing text extraction, so hybrid/OCR routing was selected.
- OCR diagnostics: attempts=24, usable=0, tinySkipped=0, invalid=0, failures=0, pageFallbacks=24, manualReviewDueToOcrQuality=1
- OCR suppressed failures: OCR produced no usable lines for this page-level region. (24)
- Legacy outcome: MANUAL_REVIEW
- Errors: OpenDataLoader hybrid mode was selected, but OPENDATALOADER_HYBRID_URL is not configured.
- Evidence limitations: Real hybrid/OCR evidence could not be collected because hybrid runtime is not configured. Route SCANNED_PDF: Preflight detected weak or missing text extraction, so hybrid/OCR routing was selected.

### cmobtujs10009vmvogmdoowt3

- Filing: cmobtujs10009vmvogmdoowt3 (918298037 2020)
- Status: skipped
- Evidence quality: runtime-unavailable
- Tags: degraded_ambiguous, live_hybrid, manual_review_expected, ocr_token_noise, scan_or_ocr
- Route decision: hybrid (SCANNED_PDF), requires OCR
- Route reason: Preflight detected weak or missing text extraction, so hybrid/OCR routing was selected.
- OCR diagnostics: attempts=22, usable=0, tinySkipped=0, invalid=0, failures=0, pageFallbacks=22, manualReviewDueToOcrQuality=1
- OCR suppressed failures: OCR produced no usable lines for this page-level region. (22)
- Legacy outcome: MANUAL_REVIEW
- Errors: OpenDataLoader hybrid mode was selected, but OPENDATALOADER_HYBRID_URL is not configured.
- Evidence limitations: Real hybrid/OCR evidence could not be collected because hybrid runtime is not configured. Route SCANNED_PDF: Preflight detected weak or missing text extraction, so hybrid/OCR routing was selected.
