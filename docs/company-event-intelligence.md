# Company Event Intelligence

Fjord Insight har to nyhetssystemer i overgangsperioden:

- Legacy `NewsArticle` / `NewsArticleCompany`, som fortsatt driver eksisterende nyhetsliste og skal holdes stabil.
- Ny `CompanyEvent`-arkitektur, som normaliserer kildedokumenter, signaler, hendelser, evidens, eksponeringer, alerts og feedback.

Målet er å vise investorrelevante hendelser, ikke bare artikler. Flere kilder kan støtte samme hendelse, og samme hendelse kan påvirke flere selskaper direkte eller indirekte.

## Arkitektur

Flyten er:

1. `NewsSource`: registrert kilde med type, språk, kvalitet og metadata.
2. `SourceDocument`: normalisert dokument fra RSS, NewsWeb, Brreg, interne finansielle signaler eller legacy backfill.
3. `NewsSignal`: maskinlesbare signaler, for eksempel selskapstreff.
4. `CompanyEvent`: kanonisk hendelse med `eventFingerprint`, `eventType`, score og metadata.
5. `CompanyEventEvidence`: kildedokumenter som støtter hendelsen.
6. `CompanyEventExposure`: direkte eller indirekte påvirkning på selskaper.
7. `CompanyEventFeedback`: bruker/admin-feedback for senere kalibrering.

Legacy-modellene slettes ikke. De er kompatibilitetslag til ny pipeline er fullt validert.

## Kilder

Første versjon støtter:

- RSS/Atom-kilder via source registry.
- NewsWeb som primær markedskilde når data finnes.
- Brreg-kunngjøringer som interne/offisielle dokumenter.
- Interne finansielle og statusbaserte dokumenter fra persistert data.
- Legacy `NewsArticle` via backfill-script.

Alle records skal være sporbare til source system, URL, external id eller intern entity id.

## Scoring

Investorverdi beregnes deterministisk i `server/news/company-event-scoring.ts`.

Score-komponenter:

- entity confidence
- materiality
- source credibility
- financial impact
- strategic impact
- risk impact
- novelty
- timeliness
- user relevance
- evidence strength
- low-signal penalty
- duplicate penalty

Legacy backfill begrenser `investorValueScore` til maks 65 for å unngå at gamle svake koblinger får for høy prioritet.

## Read-Across

`server/news/company-exposure-rules.ts` lager konservative indirekte eksponeringer.

Støttede exposure-typer:

- `direct`
- `sector`
- `petroleum`
- `commodity`
- `regulatory`
- `value_chain`

Reglene krever støtte fra næringskode, petroleumseksponering, kilde-/sektortags eller relevant event-type. Brede sektorlikheter alene skal ikke være nok. Dette er laget for å unngå støy som for eksempel forbrukerelektronikk-M&A på olje/gass-selskaper.

## Alert Policy

Workspace-varsler fra Company Events er feature-flagget:

```env
NEWS_INTELLIGENCE_ALERTS_ENABLED="false"
```

Når flagget er aktivt, lager workspace sync `COMPANY_EVENT_NEW` for aktive watchlist-selskaper når:

- `investorValueScore >= 55`
- `exposureScore >= 0.7`
- eventen er nyere enn watch-baseline
- dedupeKey per `watch:event:exposureType` ikke finnes

Legacy-varsler for kunngjøringer, regnskap, status og monitorer beholdes.

## Feedback Loop

Feedback API:

```http
POST /api/company-events/:eventId/feedback
GET /api/company-events/:eventId/feedback
```

Støttede actions:

- `relevant`
- `not_relevant`
- `wrong_company`
- `wrong_event_type`
- `duplicate`
- `too_high_score`
- `too_low_score`
- `important_for_watchlist`
- `dismissed`
- `corrected_event_type`
- `corrected_direction`
- `corrected_score_bucket`

Feedback lagres med både konkret `action` og grov `label`. Admin og financial reviewer kan markere events som `DISMISSED` eller `DUPLICATE`; vanlige brukere påvirker ikke global event-status.

## Operasjonelle Scripts

Synk kilder:

```bash
npm run news:intelligence:sync-sources
```

Evaluer kvalitet:

```bash
npm run news:intelligence:evaluate -- --json --limit=500
```

Backfill legacy nyheter:

```bash
npm run news:intelligence:backfill-legacy -- --dry-run --limit=500
npm run news:intelligence:backfill-legacy -- --limit=500
```

Backfill er idempotent for `SourceDocument`, `CompanyEvent`, `CompanyEventEvidence` og `CompanyEventExposure`. `NewsSignal` dedupliseres per dokument, selskap og detector version.

## Kjente Begrensninger

- Pipeline bruker heuristikk, ikke lærende modell ennå.
- Read-across er konservativ og vil heller gi få enn for mange indirekte koblinger.
- Legacy backfill mangler full original feature-evidens og merkes derfor som medium confidence.
- Workspace event alerts er av som default til kvaliteten er validert med evaluering og feedback.
- Kildeutvalg og premium media-dekning må utvides videre.

## Neste Forbedringer

- Admin UI for event review og feedbackkø.
- Håndmerket evalueringssett per sektor.
- Bedre peer-graf basert på næringskode, størrelse, geografi og marked.
- Batch rescore når scoring- eller exposure-regler endres.
- Lokal lærende modell som bruker lagrede features, evidence og feedback.
