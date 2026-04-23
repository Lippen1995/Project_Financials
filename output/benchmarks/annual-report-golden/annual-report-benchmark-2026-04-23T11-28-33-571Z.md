# Annual-report benchmark

Generated at: 2026-04-23T11:28:33.571Z

## Runtime

- OpenDataLoader package: 2.2.1
- Java version: 17.0.18
- Local OpenDataLoader ready: yes
- Local readiness reason: Java 17.0.18 is compatible with local OpenDataLoader execution.
- Live local benchmark ready: yes (Environment is ready for live local OpenDataLoader benchmark cases.)
- Live hybrid benchmark ready: no (OPENDATALOADER_HYBRID_URL is not configured.)

## Summary

- Cases: 4/6 completed
- Skipped cases: 0
- Differential cases: 1
- Material disagreements: 1
- Publish-decision mismatches: 0
- Evidence counts: legacy-only=5, captured-fixture=1, live-local-odl=0, live-hybrid-odl=0
- Legacy average runtime (ms): 106.25
- OpenDataLoader average runtime (ms): 5

## Recommendation

- keep legacy as default, OpenDataLoader shadow-only
- Reason: Benchmarken har ingen live OpenDataLoader-PDF-kjoringer ennå. Captured-fixtures er nyttige for regresjon, men ikke sterke nok til å promotere engine-en.

## Cases

### manual-review-ambiguous

- Status: completed
- Mode: expected
- Evidence: legacy-only
- Legacy: MANUAL_REVIEW, runtime 405 ms

### paired-digital-happy-path

- Status: completed
- Mode: expected_and_differential
- Evidence: captured-fixture
- Legacy: PUBLISHED, runtime 6 ms
- OpenDataLoader: PUBLISHED, runtime 5 ms, source captured_normalized_json
- Comparison: disagreement=true, publishMismatch=false
- Comparison assessment: known_evidence_gap (The captured OpenDataLoader fixture omits the note-level declaration line 'Alle tall i notene er NOK 1.000 ...' that exists in the legacy inline PDF page, so the remaining note-page unit-scale disagreement is evidence-limited rather than a proven parser bug.)
- Known evidence limitations: The captured OpenDataLoader fixture omits the note-level declaration line 'Alle tall i notene er NOK 1.000 ...' that exists in the legacy inline PDF page, so the remaining note-page unit-scale disagreement is evidence-limited rather than a proven parser bug.

### paired-digital-live-local

- Status: error
- Mode: expected_and_differential
- Evidence: legacy-only
- Legacy: PUBLISHED, runtime 6 ms
- Errors: OpenDataLoader returned no normalized pages for this filing.

### published-happy-path-live-local

- Status: error
- Mode: expected_and_differential
- Evidence: legacy-only
- Legacy: PUBLISHED, runtime 10 ms
- Errors: OpenDataLoader returned no normalized pages for this filing.

### published-happy-path

- Status: completed
- Mode: expected
- Evidence: legacy-only
- Legacy: PUBLISHED, runtime 10 ms

### scan-like-duplicate-sections

- Status: completed
- Mode: expected
- Evidence: legacy-only
- Legacy: PUBLISHED, runtime 4 ms
