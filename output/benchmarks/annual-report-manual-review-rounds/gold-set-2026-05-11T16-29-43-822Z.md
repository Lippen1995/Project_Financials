# Manual review round

- Review round ID: gold-set-2026-05-11T16-29-43-822Z
- Source run ID: gold-set-2026-05-11T16-29-43-822Z
- Generated at: 2026-05-11T16:29:49.788Z
- Manifest: annual-report-go-live-gold-set

## Summary

- Total filings: 5
- Review candidates: 5
- Reviewed: 0
- Pending: 5
- Blocked: 0
- Severity HIGH/MEDIUM/LOW: 5/0/0

## Top issue classes

- missing_artifact:structured_document_json: 5
- missing_structured_document: 5
- artifact_or_runtime_blocker: 4
- missing_artifact:shadow_comparison_output: 4
- missing_artifact:unified_extraction: 4
- missing_legacy_result: 4
- missing_unified_result: 4
- tag:manual_review_expected: 4
- tag:ocr_token_noise: 3
- tag:scan_or_ocr: 3

## Recommended next actions

- PR77 calibration:
  - Vent med kalibrering til flere kandidater er ferdig manuelt vurdert, slik at terskeljusteringene får bedre fasitgrunnlag.
- PR78 failure taxonomy:
  - Bruk "missing_artifact:structured_document_json" som startpunkt for første failure-taxonomy-gruppering.
- PR79 extraction fixes:
  - Prioriter ekstraksjonsfeil for nøkkelen "cost_of_goods_sold" siden den går igjen oftest i review-runden.
  - Undersøk hvorfor strukturert dokument-artifact mangler for flere kandidater før nye ekstraksjonsendringer vurderes.

## Representative candidates

- PROFF AS (918298037)
  - Filing: cmobtujsi000dvmvoroqrrdwe
  - Severity: HIGH
  - Status: PENDING
  - Reasons: Legacy-resultat mangler for denne rapporten.; Unified-resultat mangler eller kunne ikke leses.; Kjøringen ble hoppet over eller stoppet på grunn av artifact/runtime/parser-problem.
- PROFF AS (918298037)
  - Filing: cmobtujqo0001vmvoz4tcie6q
  - Severity: HIGH
  - Status: PENDING
  - Reasons: Confidence gate vurderte rapporten som FAIL.; Strukturert dokument-artifact mangler.; Viktige norske regnskapslinjer mangler eller er i konflikt.
- PROFF AS (918298037)
  - Filing: cmobtujr90003vmvorzjg483p
  - Severity: HIGH
  - Status: PENDING
  - Reasons: Legacy-resultat mangler for denne rapporten.; Unified-resultat mangler eller kunne ikke leses.; Kjøringen ble hoppet over eller stoppet på grunn av artifact/runtime/parser-problem.
- PROFF AS (918298037)
  - Filing: cmobtujrj0005vmvopubneto4
  - Severity: HIGH
  - Status: PENDING
  - Reasons: Legacy-resultat mangler for denne rapporten.; Unified-resultat mangler eller kunne ikke leses.; Kjøringen ble hoppet over eller stoppet på grunn av artifact/runtime/parser-problem.
- PROFF AS (918298037)
  - Filing: cmobtujrs0007vmvos2b14yat
  - Severity: HIGH
  - Status: PENDING
  - Reasons: Legacy-resultat mangler for denne rapporten.; Unified-resultat mangler eller kunne ikke leses.; Kjøringen ble hoppet over eller stoppet på grunn av artifact/runtime/parser-problem.
