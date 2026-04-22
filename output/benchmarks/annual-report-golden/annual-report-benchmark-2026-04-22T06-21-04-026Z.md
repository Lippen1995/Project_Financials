# Annual-report benchmark

Generated at: 2026-04-22T06:21:04.026Z

## Runtime

- OpenDataLoader package: 2.2.1
- Java version: 1.8.0_241
- Local OpenDataLoader ready: no
- Local readiness reason: Detected Java 1.8.0_241, but local OpenDataLoader requires Java 11+.
- Live local benchmark ready: no (Detected Java 1.8.0_241, but local OpenDataLoader requires Java 11+.)
- Live hybrid benchmark ready: no (OPENDATALOADER_HYBRID_URL is not configured.)

## Summary

- Cases: 4/6 completed
- Skipped cases: 2
- Differential cases: 1
- Material disagreements: 1
- Publish-decision mismatches: 0
- Evidence counts: legacy-only=5, captured-fixture=1, live-local-odl=0, live-hybrid-odl=0
- Legacy average runtime (ms): 166.75
- OpenDataLoader average runtime (ms): 10

## Recommendation

- keep legacy as default, OpenDataLoader shadow-only
- Reason: Repoet har ikke bekreftet lokal OpenDataLoader-runtime i dette miljoet. Java 11+ er ikke klart, sa rollout bor ikke skje utover fixture/shadow-evaluering.

## Cases

### manual-review-ambiguous

- Status: completed
- Mode: expected
- Evidence: legacy-only
- Legacy: MANUAL_REVIEW, runtime 627 ms

### paired-digital-happy-path

- Status: completed
- Mode: expected_and_differential
- Evidence: captured-fixture
- Legacy: PUBLISHED, runtime 11 ms
- OpenDataLoader: PUBLISHED, runtime 10 ms, source captured_normalized_json
- Comparison: disagreement=true, publishMismatch=false
- Comparison assessment: known_evidence_gap (The captured OpenDataLoader fixture omits the note-level declaration line 'Alle tall i notene er NOK 1.000 ...' that exists in the legacy inline PDF page, so the remaining note-page unit-scale disagreement is evidence-limited rather than a proven parser bug.)
- Known evidence limitations: The captured OpenDataLoader fixture omits the note-level declaration line 'Alle tall i notene er NOK 1.000 ...' that exists in the legacy inline PDF page, so the remaining note-page unit-scale disagreement is evidence-limited rather than a proven parser bug.

### paired-digital-live-local

- Status: skipped
- Mode: expected_and_differential
- Evidence: legacy-only
- Legacy: PUBLISHED, runtime 13 ms
- Errors: Live local benchmark is not ready: Detected Java 1.8.0_241, but local OpenDataLoader requires Java 11+.

### published-happy-path-live-local

- Status: skipped
- Mode: expected_and_differential
- Evidence: legacy-only
- Legacy: PUBLISHED, runtime 16 ms
- Errors: Live local benchmark is not ready: Detected Java 1.8.0_241, but local OpenDataLoader requires Java 11+.

### published-happy-path

- Status: completed
- Mode: expected
- Evidence: legacy-only
- Legacy: PUBLISHED, runtime 20 ms

### scan-like-duplicate-sections

- Status: completed
- Mode: expected
- Evidence: legacy-only
- Legacy: PUBLISHED, runtime 9 ms
