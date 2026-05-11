# Go/no-go readiness for unified annual-report extraction

Denne guiden beskriver hvordan vi vurderer om unified annual-report extraction er klar til å gå videre til neste steg i roadmapen.

## Hva PR80 gjør

PR80 forbedrer ikke selve ekstraksjonen. Den samler evidens fra:

- PR76 manual review round
- PR77 calibration report
- PR78 failure taxonomy
- PR79 extraction fix summary
- siste persisted gold-set shadow batch

Målet er å gi en ærlig beslutning:

- `GO`
- `CONDITIONAL_GO`
- `NO_GO`

## Hva rapporten vurderer

Readiness-rapporten vurderer blant annet:

- om gold-set er representativt nok
- om manual review-runden faktisk er gjennomført
- om artifact-dekningen har kritiske hull
- om vi kjenner høyalvorlige false auto-pass-saker
- om unit-scale ambiguity blokkeres eller sendes til review
- om resultatregnskap og balanse blir funnet eller trygt reviewet
- om toppfeilene har en tydelig utbedringsplan
- om shadow batch kjører uten runtime-blokkere
- om legacy fortsatt er publish-safe source of truth
- om unified fortsatt er shadow-only

## Hvordan score tolkes

### GO

Brukes bare når:

- ingen readiness-kriterier er blokkert
- nødvendig evidens finnes
- publish safety er uendret
- unified fortsatt er shadow-only

`GO` betyr ikke at unified kan brukes i produksjon direkte. Det betyr bare at vi kan gå videre til neste kontrollsteg i roadmapen, som readiness workflow/CI guard og shadow-only canary-forberedelser.

### CONDITIONAL_GO

Brukes når:

- det ikke finnes en hard blokkering
- men det fortsatt finnes viktige varsler, usikkerhet eller manglende evidens

`CONDITIONAL_GO` betyr at videre arbeid kan forberedes, men ikke behandles som grønt lys for senere go-live-steg.

### NO_GO

Brukes når ett eller flere sentrale kriterier feiler, for eksempel:

- manual review er ikke gjennomført
- gold-set har for store coverage-hull
- shadow batch har runtime-blokkere eller mange skips
- kritiske artifacts mangler
- publish safety er svekket

`NO_GO` betyr at PR81 og PR82 ikke bør behandles som klare for videreføring før blokkeringene er lukket.

## Hvordan du kjører rapporten

Generer rapporten med:

```bash
npm run financials:generate-go-no-go-readiness
```

Persisted output lagres under:

- `output/benchmarks/annual-report-go-no-go-readiness/latest.json`
- `output/benchmarks/annual-report-go-no-go-readiness/latest.md`

## Hvordan admin bør bruke rapporten

1. Se først på beslutningen: `GO`, `CONDITIONAL_GO` eller `NO_GO`.
2. Les blokkeringene før du ser på roadmapen videre.
3. Kontroller om manual review-runden faktisk er lukket.
4. Kontroller om artifact-mangler og runtime-problemer fortsatt finnes.
5. Bruk anbefalingene som inngangskrav til PR81 og PR82.

## Hva PR80 bevisst ikke gjør

PR80:

- endrer ikke extraction logic
- endrer ikke confidence thresholds
- aktiverer ikke unified i produksjon
- endrer ikke publish behavior
- endrer ikke production routing

Legacy er fortsatt publish-safe source of truth. Unified er fortsatt shadow/evaluation-only.
