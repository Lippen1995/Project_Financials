# Unified failure taxonomy

Denne guiden beskriver hvordan PR78 klassifiserer feil i shadow-/review-løpet for årsrapporter.

## Formål

Failure taxonomy gjør review- og shadow-funn målbare og sammenlignbare. Målet er ikke å rette parseren direkte i PR78, men å gi et ryddig grunnlag for:

- PR79 extraction fixes
- senere readiness-vurderinger
- tydeligere admin-oppfølging

## Hvordan rapporten bygges

PR78 leser siste persisted manual review round fra PR76, eller bygger runden på nytt når persisted output mangler. Deretter mappes:

- review issue classes
- confidence gate checks
- manglende artifacts
- finansielle sammenligninger
- narrative sammenligninger
- gold-set tags
- tekstlige diagnostics

til stabile taxonomy-klasser.

Rapporten lagres under:

- `output/benchmarks/annual-report-unified-failure-taxonomy/latest.json`
- `output/benchmarks/annual-report-unified-failure-taxonomy/latest.md`

Du kan generere en ny rapport med:

```bash
npm run financials:generate-failure-taxonomy
```

Valgfritt:

```bash
npm run financials:generate-failure-taxonomy -- --run-id=<reviewRoundId> --json
```

## Taxonomy-klasser

### ARTIFACT_MISSING
Et nødvendig mellomresultat mangler.

Typiske årsaker:
- comparison artifact mangler
- unified artifact mangler
- confidence gate output mangler

Hva gjør admin?
- Bekreft at saken faktisk har nødvendig grunnlag før den brukes i analyse eller videre review.

### SOURCE_PDF_MISSING
Original PDF mangler.

Typiske årsaker:
- PDF ble ikke lastet ned eller lagret riktig
- artifact-peker er brutt

Hva gjør admin?
- Marker saken for ny innhenting eller teknisk oppfølging.

### STRUCTURED_DOCUMENT_MISSING
Strukturert dokument fra unified-løpet mangler.

Typiske årsaker:
- unified parser kjørte ikke ferdig
- artifact ble ikke persistert

Hva gjør admin?
- Ikke stol på unified-sammenligning alene. Saken må holdes i shadow/review.

### PREFLIGHT_UNAVAILABLE
PDF-kvalitetssjekken mangler.

Typiske årsaker:
- preflight artifact ble aldri generert
- tidligere kjøring stoppet for tidlig

Hva gjør admin?
- Vurder ny kjøring før du konkluderer om dokumentkvalitet.

### PARSER_RUNTIME_UNAVAILABLE
Parser- eller runtime-miljøet var utilgjengelig.

Typiske årsaker:
- OpenDataLoader ikke klar
- parser/runtime blokkert

Hva gjør admin?
- Be teknisk team kontrollere runtime før saken brukes i go-live-vurderinger.

### OCR_REQUIRED_OR_LOW_QUALITY_SCAN
PDF-en er skannet eller av for dårlig kvalitet.

Typiske årsaker:
- svak tekstlagdekning
- dårlig skann

Hva gjør admin?
- Forvent mer review og mindre automatisk tillit.

### OCR_TOKEN_NOISE
OCR lager støy i tekst og tall.

Typiske årsaker:
- splittede tall
- feil sammenslåtte tokens

Hva gjør admin?
- Kontroller nøkkeltall manuelt mot PDF-en.

### TABLE_RECONSTRUCTION_ERROR
Tabellen ble ikke rekonstruert riktig.

Typiske årsaker:
- rader og kolonner løsner fra hverandre
- totalsummer havner i feil struktur

Hva gjør admin?
- Sjekk særlig hovedtabeller i resultat og balanse.

### MULTI_PAGE_BALANCE_ERROR
Balansen er delt over flere sider på en måte som skaper feil.

Typiske årsaker:
- continuation-sider
- totalsummer ved sideskift

Hva gjør admin?
- Prioriter slike saker i review når balansen er viktig for publish-safe kontroll.

### COLUMN_ALIGNMENT_ERROR
Tall eller årskolonner er koblet til feil rad.

Typiske årsaker:
- tett tabell-layout
- OCR/tabell-parser flytter kolonner

Hva gjør admin?
- Sammenlign nøkkellinjer rad for rad.

### UNIT_SCALE_UNKNOWN
Systemet vet ikke om tallene er i kroner, tusen eller millioner.

Typiske årsaker:
- svake enhetsnoter
- manglende tolking av label som `Beløp i NOK 1 000`

Hva gjør admin?
- Ikke godkjenn slike saker uten eksplisitt kontroll.

### UNIT_SCALE_MISMATCH
Legacy og unified bruker ulik skala for samme tall.

Typiske årsaker:
- feil propagert unit scale
- mismatch mellom note og tabell

Hva gjør admin?
- Kontroller tallskala før videre vurdering.

### NEGATIVE_NUMBER_FORMAT_ERROR
Negative tall er tolket feil.

Typiske årsaker:
- parentesformat
- minus i OCR

Hva gjør admin?
- Sjekk om resultatlinjer og gjeldslinjer har riktig fortegn.

### NORWEGIAN_LABEL_MAPPING_ERROR
Norske regnskapslinjer er mappet feil.

Typiske årsaker:
- variantnavn på hovedlinjer
- label-normalisering er for svak

Hva gjør admin?
- Sjekk om canonical key faktisk tilsvarer linjen i PDF-en.

### PRIMARY_INCOME_STATEMENT_MISSING
Resultatregnskapet mangler eller er for svakt identifisert.

Hva gjør admin?
- Saken skal ikke regnes som trygg uten videre kontroll.

### PRIMARY_BALANCE_SHEET_MISSING
Balansen mangler eller er for svakt identifisert.

Hva gjør admin?
- Prioriter kontroll, siden dette ofte blokkerer trygg bruk av tallene.

### CASH_FLOW_MISSING
Kontantstrømopplysninger mangler.

Hva gjør admin?
- Viktig som supplement, men ikke alltid en kritisk blocker alene.

### CANONICAL_KEY_MISSING
Et sentralt nøkkelfelt mangler.

Typiske årsaker:
- `revenue`, `net_income`, `total_assets` eller andre kjernefelter er ikke funnet

Hva gjør admin?
- Kontroller om det manglende feltet burde vært til stede i dokumentet.

### LARGE_NUMERIC_DEVIATION
Tallene avviker for mye mellom legacy og unified.

Hva gjør admin?
- Kontroller beløpene manuelt før saken brukes som evidence for go-live.

### LEGACY_UNIFIED_MISMATCH
Legacy og unified er ikke enige.

Hva gjør admin?
- Bruk mismatchen som review-signal, ikke som publish-grunnlag.

### NARRATIVE_SECTION_MISSING
En narrativ seksjon mangler eller matcher for dårlig.

Hva gjør admin?
- Sjekk styre- og revisortekst når saken er sensitiv eller mangler kontekst.

### AUDITOR_REPORT_MISSING
Revisorberetningen ble ikke funnet tydelig.

### BOARD_REPORT_MISSING
Styrets beretning ble ikke funnet tydelig.

### AMBIGUOUS_REPORT_STRUCTURE
Rapportstrukturen er for uklar til trygg automasjon.

Typiske årsaker:
- uvanlig layout
- tvetydige seksjoner

Hva gjør admin?
- Behandle saken som review-tung og bruk den som læring til senere fixes.

### MANUAL_REVIEW_EXPECTED
Rapporttypen er på forhånd kjent som review-tung.

Hva gjør admin?
- Dette er ikke nødvendigvis en feil, men et planlagt sikkerhetssignal.

### UNKNOWN_FAILURE
Det finnes et review-signal som ikke kan klassifiseres presist ennå.

Hva gjør admin?
- Samle flere detaljer og bruk dette som input til videre taxonomy-forbedring.

## Hvordan dette brukes i PR79

PR79 skal ikke gjette hvilke parser-fikser som er viktigst. Den skal bruke taxonomy-rapporten til å velge:

- hyppigste feilklasser
- alvorligste feilklasser
- feilklasser som rammer sentrale canonical keys
- feilklasser som skaper størst manuell review-byrde

## Hva PR78 bevisst ikke gjør

- PR78 retter ikke extraction-logikk.
- PR78 endrer ikke publish behavior.
- PR78 aktiverer ikke unified i produksjon.
- PR78 endrer ikke production routing.
- PR78 skal gjøre feilene tydelige, ikke skjule usikkerhet.

