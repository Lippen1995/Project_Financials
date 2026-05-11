# Unified confidence calibration

- Generated at: 2026-05-11T16:29:55.958Z
- Source run: gold-set-2026-05-11T16-29-43-822Z
- Manual review candidates: 5
- Reviewed candidates: 0
- Calibration status: INSUFFICIENT_EVIDENCE

## Metrics

- Total reviewed cases: 0
- Auto-pass candidates: 0
- Review candidates: 0
- Blocked candidates: 0
- False pass count: 0
- False review count: 0
- False block count: 0
- High severity miss count: 0
- Manual review rate: unknown

## Threshold behavior

- Before: PASS=0, WARN=0, FAIL=0, INSUFFICIENT_DATA=0
- After: PASS=0, WARN=0, FAIL=0, INSUFFICIENT_DATA=0

## Adjustments

- minComparisonMatchRateForPass: KEEP (0.8 -> 0.8) — Calibrated from reviewed PASS cases versus unsafe outcomes.
- majorMismatchDeviationThreshold: KEEP (0.5 -> 0.5) — Calibrated from reviewed conflicting-value deviations.
- missingSourcePdfDecision: KEEP (WARN -> WARN) — Structural calibration for missingSourcePdfDecision.
- missingStructuredDocumentDecision: KEEP (WARN -> WARN) — Structural calibration for missingStructuredDocumentDecision.
- parserRuntimeUnavailableDecision: KEEP (WARN -> WARN) — Structural calibration for parserRuntimeUnavailableDecision.
- unitScaleAmbiguityDecision: KEEP (FAIL -> FAIL) — Structural calibration for unitScaleAmbiguityDecision.
- missingPrimaryStatementDecision: KEEP (WARN -> WARN) — Structural calibration for missingPrimaryStatementDecision.
- narrativeMismatchDecision: KEEP (WARN -> WARN) — Structural calibration for narrativeMismatchDecision.
- highSeverityCandidateDecision: KEEP (WARN -> WARN) — Structural calibration for highSeverityCandidateDecision.

## PR78 recommendations

- Calibration did not surface a dominant reviewed unsafe issue class yet.
- Unit-scale ambiguity was not a dominant reviewed pattern in this sample.

## PR79 recommendations

- Calibration did not surface a single dominant canonical key mismatch yet.
- No reviewed HIGH-severity PASS misses were found in this calibration sample.
