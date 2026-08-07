# Public company map foundation

Status: Complete address and reported-financial candidate implemented; public publication remains
blocked until a complete Skatteetaten group snapshot is available.

## Product contract implemented here

- The mapped object is one Brreg main legal entity (`RegistryEntity`).
- Location is the current Brreg `forretningsadresse` only. `postadresse` is never substituted.
- Coordinates come from Kartverket's official nationwide Matrikkelen address CSV in EPSG:4258.
- A point is accepted only when municipality number, normalized official address name, house
  number, house letter and supplied unit all have exactly one official match.
- Every entity is retained in the map snapshot even when it cannot be plotted. Its explicit
  omission reason drives the coverage denominator and will drive the deferred drill-down list.
- Exact ENK locations are withheld pending the privacy assessment.
- Group labels come only from the published Skatteetaten-derived `GroupMembershipSnapshot`.
  Public financial positions are outside that group traversal.
- Public map financial rows are protected by a database check requiring `valueOrigin =
'reported'`. The build records a `financialDatasetVersion`; publication additionally requires a
  build-specific verification certificate written by the reported-only live-view repository.

## Data flow

1. `npm run brreg:ingest-entities` atomically refreshes the Brreg mirror and prepares exact-match
   components from `forretningsadresse`. A full refresh persists its source identity, compressed
   artifact checksum and byte count, EOF result, unfiltered flag, row count and shared snapshot
   timestamp; map builds reject mirrors that no longer exactly match that evidence. Only a stream
   fetched directly from the configured Brreg endpoint may replace the mirror; `--file` is
   validation-only because local files have no authenticated official-source chain.
2. `npm run kartverket:ingest-addresses` discovers the latest nationwide WGS84 CSV through
   Kartverket's official Atom feed, streams the ZIP, verifies byte count, records SHA-256, and marks
   the immutable extract ready only after a national-size sanity check.
3. `npm run company-map:build` joins the two complete mirrors, reads latest company and
   consolidated statements through the reported-only financial repository, restricts financials
   to entities in the current Brreg universe, attaches the latest published semantic group
   membership, records every omitted entity, and produces a versioned candidate. Add `--publish`
   only after the complete Skatteetaten group publication exists.
4. `CompanyMapPublication` is the single atomic pointer for public readers. Failed or incomplete
   candidates never affect the public endpoints. Database triggers verify snapshot counts, Brreg
   evidence, completed group publication and the reported-financial certificate, then make a
   published build and its entity/financial snapshots immutable.

## Public read surfaces

- `GET /api/company-map/coverage` returns filter-aware location coverage, audited financial
  coverage, explicit with/without counts for the selected financial or employee metric, source
  versions and dates.
- `GET /api/company-map/companies` returns all plotted entities in the filtered universe, with
  reported revenue ordered highest first and entities without revenue ordered by name afterwards.
  It defaults to active AS/ASA, company accounts and NOK; consolidated scope must be requested
  explicitly. `officialAddressId` restricts the result to the complete paginated list at a clicked
  shared address point. Rows with financials contain the other available key metrics and original
  filing provenance/freshness; every row contains employees, exact coordinates, group label and
  the normal company-profile URL.
- `organisationForms=ALL` selects every organisation form; omitted filters default to active
  AS/ASA entities.

Both endpoints are anonymous. They use `no-store` until version-aware cache invalidation exists;
every request rejects a publication whose reported dataset revision is no longer active. Until a
complete candidate has passed the reported-only financial gate and is atomically published, they
return `503` rather than exposing partial, stale or simulated data.

Public ranking and metric coverage are bounded repository/database queries against
`live_financial_statements_v1`; the application never materializes the national financial
population or ranks it in memory. The live statement view is also the sole financial provenance
read surface and remains the only statement view granted to the restricted runtime role.

## First national address audit (6 August 2026)

The first accepted v3 matcher candidate used 1,170,717 current Brreg main entities and the
Kartverket extract `matrikkelen-address-2026-08-01T16:54:35.000Z-epsg4258`, containing 2,566,631
exact street-address points.

For the default active AS/ASA universe:

- eligible entities: 421,112
- exactly plotted entities: 400,256
- unique plotted address points: 204,155
- omitted entities: 20,856
- exact location coverage: 95.0%

The omission breakdown was 8,904 incomplete/invalid business addresses, 8,139 addresses with no
exact Matrikkelen match, 3,758 without a business address, 44 ambiguous exact keys, 10
non-geographic addresses and 1 entity outside Norway. The incomplete/invalid sample was dominated
by Brreg address text without a house number; ranges such as `12-14` remain omitted because they do
not identify one exact official point.

This is address coverage only. The candidate contains zero financial rows and has no public
publication pointer. No group labels were attached because the local Skatteetaten shareholder
register import is `PARTIAL`, so no semantic group snapshot has passed its publication gate.

## Official-only reported-financial candidate audit (6 August 2026)

Candidate `73e4cafc-52af-4347-92b1-884e70fb1d4f` repeated the complete 1,170,717-entity address
population and added the versioned, Brreg-only reported-financial projection. It completed as
`READY`; it was not published because no complete Skatteetaten group publication exists locally.
An earlier candidate was superseded after the audit found legacy `SEED`, review and issuer-IR rows
in the reported source tables; the repository now admits only records whose preserved source system
is `BRREG`.

- plotted entities: 599,335
- address omissions: 571,382
- reported Brreg source statements from the live-view repository: 7,923
- included statements for entities in the current Brreg mirror: 5,685
- included legal entities with financials: 5,400
- included company-scope statements: 5,400
- included consolidated statements: 285
- included non-null key metrics: 32,946
- excluded historical statements outside the current Brreg universe: 2,238 across 2,234 entities

The full-universe address omissions are 29,080 without a business address, 25,965
incomplete/invalid addresses, 125 non-geographic addresses, 18,843 with no exact match, 104
ambiguous exact matches, 43,978 outside Norway and 453,287 privacy-withheld ENK locations. These
counts are stored independently from financial exclusions and are never inferred from what is
visible on the map.

## Browser serving contract

The anonymous MVP uses `/api/company-map/viewport` as a deliberately bounded interim read path.
It returns count-only grid clusters below zoom 9 and official-address points at higher zooms,
never financial aggregates. Responses are capped at 1,000 features by the browser client; when
the cap is reached, the UI discloses the incomplete viewport and asks the user to zoom in. A
composite build/status/coordinate index supports the viewport predicates. This contract prevents the browser
from receiving the full entity universe but does not settle the long-term national tile format.

## Deliberate next steps

- Complete and publish the Skatteetaten group snapshot, run
  `npm run company-map:build -- --publish`, and verify the public pointer without weakening the
  group gate.
- Benchmark the interim indexed viewport endpoint against PostGIS MVT and precomputed vector
  tiles before choosing the production-scale national serving implementation. The browser must
  never receive the full entity universe.
- Add the filter-aware omission drill-down UI on top of the existing coverage reason counts.

Official source references:

- Kartverket Atom feed:
  <https://nedlasting.geonorge.no/geonorge/ATOM-feeds/MatrikkelenAdresse_AtomFeedCSV.xml>
- Kartverket open property/address data:
  <https://www.kartverket.no/api-og-data/eiendomsdata/apent-tilgjengelige-data-og-tjenester>
- Brreg Enhetsregister API documentation:
  <https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html>
