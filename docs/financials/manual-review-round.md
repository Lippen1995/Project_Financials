# Manuell review-runde for gold-set shadow batch

Denne siden beskriver PR76: hvordan vi bygger en manuell review-runde fra persisted gold-set shadow batch, hvordan kandidater velges ut, og hvordan resultatet brukes videre i PR77, PR78 og PR79.

## Hva er dette?

PR76 lager en egen review-runde for gold-set shadow batch. Den er laget for evaluering og læring, ikke for å endre produksjonsrouting eller publish-adferd.

Viktige sikkerhetsregler:

- Legacy er fortsatt publish-safe source of truth.
- Unified er fortsatt shadow/evaluation-only.
- PR76 endrer ikke confidence thresholds.
- PR76 endrer ikke ekstraksjonslogikk.
- PR76 kjører ingen batchjobber fra admin-UI.

## Hvordan generere eller velge review-runde

1. Kjør eller bruk en persisted gold-set shadow batch.
2. Bygg review-runden fra siste run:

```bash
npm run financials:generate-manual-review-round
```

3. For en bestemt run:

```bash
npm run financials:generate-manual-review-round -- --run-id=<run-id>
```

Output skrives til:

- `output/benchmarks/annual-report-manual-review-rounds/latest.json`
- `output/benchmarks/annual-report-manual-review-rounds/latest.md`
- `output/benchmarks/annual-report-manual-review-rounds/<run-id>.json`
- `output/benchmarks/annual-report-manual-review-rounds/<run-id>.md`

Reviewer-beslutninger lagres i:

- `output/benchmarks/annual-report-manual-review-rounds/<run-id>.decisions.json`

## Hvordan kandidater velges

En filing blir kandidat for manuell review hvis én eller flere av disse er sanne:

- confidence gate er `FAIL`
- confidence gate er `WARN` eller tilsvarende review-signal
- shadow comparison har mismatch
- legacy-resultat mangler
- unified-resultat mangler
- kjøringen ble hoppet over eller stoppet på grunn av artifact/runtime/parser-problem
- strukturert dokument-artifact mangler
- enhetsskala er uklar eller tvetydig
- relativt avvik er stort
- viktig norsk regnskapslinje mangler eller er i konflikt
- narrative seksjoner matcher dårlig
- gold-set-taggen tilsier at saken bør reviewes manuelt

## Hvordan severity settes

Severity er konservativ og brukes for prioritering:

- `HIGH`
  - confidence gate `FAIL`
  - manglende legacy-resultat
  - parser/runtime/artifact-blocker
  - stort relativt avvik
  - konflikt i viktige norske regnskapslinjer
  - manglende kritiske artifacts
- `MEDIUM`
  - confidence gate `WARN`
  - mismatch uten tydelig blokkering
  - narrative mismatch
  - tag-baserte review-kandidater
- `LOW`
  - review anbefales, men uten sterke faresignaler i tilgjengelige data

Reviewer kan overstyre severity når det er godt begrunnet.

## Hvordan reviewer bør jobbe

1. Åpne `/admin/annual-report-reviews`.
2. Start med `HIGH` severity.
3. Åpne kandidaten og les:
   - review reasons
   - issue classes
   - artifact references
   - financial comparison table
   - narrative comparison table
4. Sammenlign mot PDF og artifacts som faktisk finnes.
5. Lagre én filing-beslutning.
6. Skriv korte reviewer-notater som er nyttige for neste runde.

## Betydning av beslutningsverdier

- `LEGACY_CORRECT`
  - Legacy stemmer best og bør brukes som fasit i denne saken.
- `UNIFIED_CORRECT`
  - Unified stemmer best i denne saken, men dette betyr ikke at unified er aktivert for publisering.
- `BOTH_CORRECT`
  - Begge løsninger virker riktige nok for denne kandidaten.
- `BOTH_WRONG`
  - Begge løsninger ser feil ut eller mangler for mye til å stoles på.
- `AMBIGUOUS`
  - Tilgjengelig grunnlag er for uklart til å konkludere sikkert.
- `NEEDS_EXTRACTION_FIX`
  - Saken peker på et konkret forbedringsbehov i ekstraksjonen.
- `BLOCK_PUBLISH`
  - Kandidaten avdekker et så alvorlig problem at denne typen resultat ikke bør slippe videre uten streng blokkering.

## Hvordan output brukes videre

PR76 skal gi strukturert input til:

- PR77 kalibrering
  - hvilke confidence-gate-signaler ga for mange eller for få review-saker
- PR78 failure taxonomy
  - hvilke issue classes går igjen og bør bli egne feilklasser
- PR79 extraction fixes
  - hvilke canonical keys, artifact-mangler eller parserfeil bør prioriteres først

JSON- og Markdown-output inneholder:

- summary
- kandidater
- reviewer-beslutninger
- issue class breakdown
- top failing canonical keys
- representative examples
- anbefalte neste steg for PR77, PR78 og PR79

## Hva PR76 bevisst ikke gjør

- endrer ikke production routing
- endrer ikke publish behavior
- aktiverer ikke unified i produksjon
- endrer ikke terskler
- retter ikke ekstraksjonslogikk
- bygger ikke et bredt korrektursystem for alle filings
- gjør ikke gold-set review om til en publiseringsmekanisme

