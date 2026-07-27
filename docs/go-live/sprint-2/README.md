# Sprint 2 – kontrollsenter

**Status:** Formelt godkjent og lukket av CEO 27. juli 2026

**Planlagt sprintperiode:** 10.–23. august 2026

**Faktisk oppstart:** 27. juli 2026 etter Sprint 1-godkjenningen

**Kostnadsnivå:** K0 – ingen nye eksterne kostnader

**Mål:** Levere reelle, strukturerte nøkkeltall fra Brønnøysundregistrene med
sporbarhet, kontrollert mangelhåndtering og uten PDF-/OCR-avhengighet.

## Status

| ID | Leveranse | Status | Bevis / neste port |
| --- | --- | --- | --- |
| GL-201 | `BrregFinancialsProvider`-kontrakt | Implementert | Frontend får versjonert intern modell og aldri rå strukturert Brreg-respons. |
| GL-202 | Åpent Brreg-API | Teknisk lukket | Stratifisert K0-utvalg kontrollerte 149 reelle virksomheter: 95 ga publiserbare statements, 54 ga ærlige tomtilstander og 0 ga kilde-/kontraktfeil. |
| GL-203 | Normalisering | Implementert | `brreg-structured-annual-accounts@1` har eksplisitt periode, valuta, hel valutaenhet og `unitScale=1`. |
| GL-204 | Sporbarhet | Implementert | Statement og fetch-state har `sourceSystem`, `sourceEntityType`, `sourceId`, `fetchedAt` og `normalizedAt`. |
| GL-205 | Cache og oppdatering | Implementert | Tilgjengelig data caches 24 timer, tomtilstand 7 dager og feil får eksponentiell retry opptil 6 timer. Alle utfall persisteres, og samtidige oppslag dedupliseres per prosess. |
| GL-206 | Tomtilstand | Implementert | Kildebekreftet fravær og bare avviklingsregnskap vises uten tall; ingen PDF-/OCR-fallback. |
| GL-207 | Feilhåndtering | Implementert | 404/410 og ikke støttet oppstillingsplan er ikke-retrybare tomtilstander. Nettverkskall har timeout; transiente feil logges og caches, og siste offisielle snapshot merkes synlig `STALE`. |
| GL-208 | Integrasjonstester | Teknisk lukket lokalt | Provider, mapping, cache/single-flight, timeout, tomtilstand, feiltilstand, offentlig kildeport, rapport og UI-kildebevis er testet. Full suite: 1 906 passerte, 12 hoppet over. |
| GL-209 | OCR-frakobling | Implementert | `BETA_STRUCTURED_FINANCIALS_ONLY=true` er sikker standard; offentlig tjeneste fjerner dokumenter, detaljlinjer og rå payload. |
| GL-210 | Datadekningsrapport | Teknisk lukket | [Closeout-rapporten](./structured-financial-coverage-closeout.md) bruker den deterministiske profilen `sprint-2-closeout-stratified@1` og låser pool og utvalg med SHA-256-fingeravtrykk; første 10-selskapsrapport beholdes som historisk bevis. |

## Datakontrakt

```text
Brreg strukturert API
        ↓
BrregFinancialsProvider
        ↓
brreg-structured-annual-accounts@1
  periode · valuta · enhet · proveniens
        ↓
idempotent FinancialStatement + fetch-state
        ↓
offentlig kildeport
        ↓
reelle nøkkeltall med kilde/dato
eller ærlig tom-/feiltilstand
```

Providergrensen validerer og normaliserer Brreg-responsen før domenelaget.
Fetch-state beholder et sporbart kilderesultat, mens statements bare lagrer
normaliserte `financialValues`, modellversjon, periode, enhet, layoutmetadata
og proveniens. Rå Brreg-respons eksponeres ikke til domene eller frontend.

## Formell godkjenning

CEO godkjente Sprint 2 formelt 27. juli 2026. Godkjenningen lukker sprinten på
K0, beholder åpent Brreg-API som betastandard og flytter host- og
flerinstansbevis til G1/G2. Den åpner planlagt Sprint 3-arbeid, men ikke
offentlig beta eller K1-/K2-kostnader. Se det signerte
[beslutningsgrunnlaget](./closeout-review.md).
