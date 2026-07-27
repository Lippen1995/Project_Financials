# Sprint 2 – kontrollsenter

**Status:** Pågår; startet 27. juli 2026

**Planlagt sprintperiode:** 10.–23. august 2026

**Faktisk oppstart:** 27. juli 2026 etter Sprint 1-godkjenningen

**Kostnadsnivå:** K0 – ingen nye eksterne kostnader

**Mål:** Levere reelle, strukturerte nøkkeltall fra Brønnøysundregistrene med
sporbarhet, kontrollert mangelhåndtering og uten PDF-/OCR-avhengighet.

## Status

| ID | Leveranse | Status | Bevis / neste port |
| --- | --- | --- | --- |
| GL-201 | `BrregFinancialsProvider`-kontrakt | Implementert | Frontend får versjonert intern modell og aldri rå strukturert Brreg-respons. |
| GL-202 | Åpent Brreg-API | Implementert, første livebevis | Første K0-batch kontrollerte 10 reelle virksomheter: 8 ga publiserbare statements, 2 ga ærlige tomtilstander. |
| GL-203 | Normalisering | Implementert | `brreg-structured-annual-accounts@1` har eksplisitt periode, valuta, hel valutaenhet og `unitScale=1`. |
| GL-204 | Sporbarhet | Implementert | Statement og fetch-state har `sourceSystem`, `sourceEntityType`, `sourceId`, `fetchedAt` og `normalizedAt`. |
| GL-205 | Cache og oppdatering | Implementert | Tilgjengelig data caches 24 timer, tomtilstand 7 dager og feil får eksponentiell retry opptil 6 timer. Alle utfall persisteres, og samtidige oppslag dedupliseres per prosess. |
| GL-206 | Tomtilstand | Implementert | Kildebekreftet fravær og bare avviklingsregnskap vises uten tall; ingen PDF-/OCR-fallback. |
| GL-207 | Feilhåndtering | Implementert | 404/410 og ikke støttet oppstillingsplan er ikke-retrybare tomtilstander. Nettverkskall har timeout; transiente feil logges og caches, og siste offisielle snapshot merkes synlig `STALE`. |
| GL-208 | Integrasjonstester | Implementert lokalt | Provider, mapping, cache/single-flight, timeout, tomtilstand, feiltilstand, offentlig kildeport, rapport og UI-kildebevis er testet. Full suite: 1 899 passerte, 12 hoppet over. |
| GL-209 | OCR-frakobling | Implementert | `BETA_STRUCTURED_FINANCIALS_ONLY=true` er sikker standard; offentlig tjeneste fjerner dokumenter, detaljlinjer og rå payload. |
| GL-210 | Datadekningsrapport | Første rapport klar | [Første rapport](./structured-financial-coverage.md) er reproduserbar med `npm run financials:report-structured-coverage`. Utvalget på 10 er et teknisk livebevis, ikke representativ markedsdekning. |

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

## Gjenstående før teknisk closeout

1. Kjør en bredere, dokumentert dekningsmåling over et beslutningsrelevant
   utvalg uten å hevde representativitet utover utvalget.
2. Verifiser read-through og tomtilstand i produksjonslikt miljø. Lokal
   read-through er kontrollert mot reell, cachet Brreg-data.
3. Legg frem resultat og restrisiko for CEO; teknisk implementasjon er ikke det
   samme som formell Sprint 2-godkjenning.
