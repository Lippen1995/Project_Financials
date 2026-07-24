# GL-011 – leveranseestimat og kapabilitetsbacklog

**Status:** Godkjent planleggingsbaseline gjennom GL-012

**Dato:** 22. juli 2026

**Kapasitetsforutsetning:** 70 effektive utviklingstimer per uke fordelt på minst to koordinerte arbeidsstrømmer, godkjent av Simen Lippestad (CEO) 22. juli 2026. Dette tilsvarer normalt omtrent 80–90 bemannede timer per uke når koordinering og øvrig arbeid tas med.

## Estimat

| Arbeidspakke | Omfang | Estimat |
| --- | --- | ---: |
| WP-01 Analysefundament | Analyse-/samtalemodell, tilgang, retensjonskroker, API-kontrakter | 35–50 t |
| WP-02 Univers og datatilgang | Felles `CompanyUniverseQuery`, datakatalog, batchverktøy, dekningsflagg og proveniensretting | 55–80 t |
| WP-03 Beregning og rangering | Finansielle beregninger, sammenligning, scoring, bransjeaggregater og versjonering | 65–95 t |
| WP-04 Arbeidslister og sammenligning | Longlist/shortlist/sourcing-/peer-lister, batchlagring, kriteriespor og sammenligningsread-model | 55–80 t |
| WP-05 Njord som dynamisk analytiker | Varig kontekst, plan, dynamiske verktøy, batchbruk, kilde-/beregningsspor og kontrollert delresultat | 70–105 t |
| WP-06 Tre arbeidsflyter | M&A-, sourcing- og konkurrent-/bransjeflyt fra formål til lagret resultat | 70–110 t |
| WP-07 Kvalitet, sikkerhet og måling | Evalueringssett, rate/kostvern, KPI-instrumentering, personverntester og E2E | 70–100 t |
| WP-08 OCR-bevis og releasegrunnlag | Strukturert finanskontrakt, UI-tomtilstand, anti-fallback-test og dokumentasjon | 25–40 t |
| **Totalt** |  | **445–660 t** |

Ved 70 effektive timer per uke tilsvarer estimatet omtrent 6,4–9,4 utviklingsuker. Planleggingsbaselinen er fortsatt 540 timer, eller omtrent 7,7 uker. Perioden 27. juli–29. september gir omtrent 650 effektive timer og dekker derfor nesten øvre estimat, men har svært liten reserve. Estimatet inkluderer implementering, review og testing, men ikke ventetid på betalt Brreg-leveranse, juridisk rådgivning eller andre eksterne avhengigheter.

## Foreslått kalenderbaseline

| Fase | Periode | Resultat |
| --- | --- | --- |
| Fundament og sikkerhet | 27. juli–9. august | Analyseobjekt, datakatalog, autorisasjonsmønster og repeterbar releaseprosess |
| Data, univers og beregning | 10.–23. august | Strukturert finansløp, universspørring, batchverktøy, beregning, rangering og proveniens |
| Analysegrunnlag og Njord | 24. august–6. september | Arbeidslister, sammenligning, varig kontekst, dynamisk verktøyvalg og kostvern |
| Staging og arbeidsflyter | 7.–20. september | Tre integrerte arbeidsflyter med ekte modell, kildegrunnlag og lagret resultat |
| Evaluering, hardening og G2 | 21.–29. september | Evalueringssett, KPI-er, E2E, OCR-bevis, release-/rollbackøvelse og go/no-go |
| **Målsatt lukket beta** | **30. september 2026** | 12 primærbrukere inviteres dersom G2 er bestått |

Måldatoen forutsetter at avhengigheter låses tidlig og at arbeid som ikke deler kritisk tilstand kjøres parallelt. Hvis levert kapasitet faller under 60 effektive utviklingstimer per uke i to sammenhengende uker, skal CEO gjennomføre en obligatorisk datorevisjon. Omfanget skal ikke reduseres til et selskapsoppslag for å beholde datoen.

## Avhengighetsordnet backlog

| ID | Leveranse | Avhenger av | Ferdig når |
| --- | --- | --- | --- |
| BF-001 | `Analysis`, `AnalysisMessage`, kriterier og resultatmodell | Personvernramme | Formål, plan, univers, beregning, konklusjon og oppfølging kan lagres med workspace-tilgang |
| BF-002 | Autorisert datakatalog og verktøykontrakt | ADR-0001 | Hvert betadomene har kilde, proveniens, authZ, input/output-type, grenser og tomtilstand |
| BF-003 | `CompanyUniverseQuery` | BF-002 | UI og Njord bruker samme versjonerte spørring over register, geografi og tilgjengelige domener |
| BF-004 | Proveniensretting | BF-002 | Records brukt i betaresultater kan spores til kilde/snapshot/import og normaliseringstid |
| BF-005 | Batch-dossierverktøy | BF-002, BF-003 | Njord kan hente autoriserte finanser, eierskap, roller, hendelser og dokumentstatus for et avgrenset univers uten N+1-modellkall |
| BF-006 | Deterministisk beregningsmotor | BF-003, BF-005 | Filtre, beregninger, aggregater og rangeringer er versjonerte, reproduserbare og null-sikre |
| BF-007 | Arbeidslister og batchlagring | BF-001, BF-003 | Longlist, shortlist, sourcingliste og peer-univers lagres med kriterier og inklusjonsgrunn |
| BF-008 | Sammenligningsread-model | BF-006, BF-007 | Valgte selskaper vises med felles perioder, dekning, kilder og beregningsgrunnlag |
| BF-009 | Njord-kontekst og plan | BF-001, BF-002 | Oppfølgingsspørsmål viderefører mål, kriterier, tidligere verktøyutfall og brukerens beslutninger |
| BF-010 | Njord-proveniens og svarport | BF-004, BF-005, BF-009 | Ugrunnede selskapsfakta/tall blokkeres eller merkes; kilder og beregninger vises i UI |
| BF-011 | M&A-arbeidsflyt | BF-006–BF-010 | Formål → univers → analyse/rangering → sammenligning → lagret shortlist fungerer |
| BF-012 | Sourcing-arbeidsflyt | BF-006–BF-010 | Målprofil → univers → analyse/rangering → validering → lagret arbeidsliste fungerer |
| BF-013 | Konkurrent-/bransjeflyt | BF-006–BF-010 | Univers → sammenligning/aggregat → Njord-analyse → lagret konklusjon fungerer |
| BF-014 | Njord-evaluering og kostvern | BF-005, BF-009, BF-010 | Evalueringssett, faktastøtte, sikkerhet, rate limit, dagstak og kostnadstak består |
| BF-015 | KPI- og researchinstrumentering | Personvernramme, BF-001, BF-011–013 | Fullføring, tid, nytt funn og oppfølging kan måles etter låst protokoll |
| BF-016 | OCR-uavhengighetsbevis | Strukturert finansløp | Kontrakt-, service-, API- og UI-test viser strukturert kilde eller ærlig tomtilstand uten PDF/OCR-fallback |
| BF-017 | Tre ende-til-ende-betatester | BF-011–BF-016 | Hver arbeidsflyt består med reelle/offisielle data og dokumenterte tomtilstander |

## Kritisk sekvens

```text
Personvern + ADR-0001
        ↓
BF-001 analysemodell + BF-002 datakatalog
        ↓
BF-003 univers + BF-005 batchverktøy
        ↓
BF-006 beregning + BF-007 arbeidslister
        ↓
BF-009/010 Njord-kontekst og proveniens
        ↓
BF-011/012/013 arbeidsflyter
        ↓
BF-014/015/016 evaluering, KPI og OCR-bevis
        ↓
BF-017 E2E → G2
```

## Estimatusikkerhet

- Betalt/historisk Brreg-data kan redusere datagap, men skaper ny provider-, mapping-, lisens- og kostnadsjobb.
- Dagens store service- og frontendfiler øker integrasjonsrisikoen.
- Njords dynamiske tilgang øker evalueringsmatrisen sammenlignet med faste verktøysekvenser.
- Eksterne data- og modellfeil krever delresultat, retry og kostkontroll.
- Personvernvalg for analyse- og samtalelagring ligger på kritisk sti.

Estimatet skal revideres etter at BF-001–BF-003 er ferdige og igjen før G1. Endringer logges; 30. september behandles som mål under G2, ikke som en ubetinget lanseringsforpliktelse. Ved kapasitetsbrudd etter regelen over skal datoen vurderes før teamet tar inn mer arbeid eller reduserer kvalitetsportene.
