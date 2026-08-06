# Public company map foundation

Status: Address and publication foundation implemented; public map publication remains blocked
until a complete national snapshot also contains reported-only financial rows.

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
3. `npm run company-map:build` joins the two complete mirrors, attaches the latest published
   semantic group membership, records every omitted entity, and produces a versioned candidate.
4. `CompanyMapPublication` is the single atomic pointer for public readers. Failed or incomplete
   candidates never affect the public endpoints. Database triggers verify snapshot counts, Brreg
   evidence, completed group publication and the reported-financial certificate, then make a
   published build and its entity/financial snapshots immutable.

## Public read surfaces

- `GET /api/company-map/coverage` returns filter-aware location coverage plus source versions and
  dates. Financial coverage remains explicitly unavailable until it is connected through the
  reported-only live-view repository.
- `organisationForms=ALL` selects every organisation form; omitted filters default to active
  AS/ASA entities.

The endpoint is anonymous and CDN-cacheable. Until a complete candidate has passed the
reported-only financial gate and is atomically published, they return `503` rather than exposing
partial, stale or simulated data.

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

## Deliberate next steps

- Connect `CompanyMapFinancialSnapshot` to the versioned reported-only financial live view and
  populate the latest company and, where actually filed, consolidated scope independently.
- Add the public publication command and go-live gates after the full national coverage audit.
- Benchmark PostGIS MVT against precomputed vector tiles before choosing the national serving
  implementation. The browser must not receive the full entity universe.
- Build the accessible map/list interface after the tile contract is fixed. Low-zoom clusters
  will show counts only; they will not sum company financials.
- Add the omission drill-down list with the ordered company list once reported revenue ordering
  is available through the same live-view repository.

Official source references:

- Kartverket Atom feed:
  <https://nedlasting.geonorge.no/geonorge/ATOM-feeds/MatrikkelenAdresse_AtomFeedCSV.xml>
- Kartverket open property/address data:
  <https://www.kartverket.no/api-og-data/eiendomsdata/apent-tilgjengelige-data-og-tjenester>
- Brreg Enhetsregister API documentation:
  <https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html>
