# Company financial map — decision map

Status: In implementation. The address contract, reported-financial projection and #4
public-owner boundary are implemented. Publication is intentionally unavailable until a complete
official shareholder-register import exists for a tax year.

Goal: Define a public, account-free map of Norwegian companies and available financial
metrics, based only on official source data. Advertising is a future monetisation layer and
is deliberately not designed until the product and usage model are validated.

Non-negotiables:

- Never assign a legal entity's financials to a business location or subsidiary unless the
  source explicitly supports that attribution.
- Never mix company and consolidated accounts without an explicit scope label.
- Every financial observation carries fiscal period, currency, scope, source and freshness.
- Missing, stale or non-comparable data remains visible as such; it is never estimated into an
  official figure.

## #0: Is the feature feasible with the current product and official sources?

Blocked by: none
Type: Research

### Question

Do Fjord Insight and the official sources provide enough foundation to build the feature?

### Answer

Yes, with material coverage and semantic limits.

- The repository already mirrors the full Brreg main-entity register in `RegistryEntity`, has
  MapLibre, structured latest-year financial ingestion, and a materialised ownership graph.
- Brreg's open financial API exposes key figures from the latest filed annual accounts. The
  restricted API, not available to a private public product, contains broader three-year and
  consolidated-account data. Therefore group figures cannot be assumed available at national
  scale from the open structured endpoint.
- Brreg added an official hierarchical group-structure endpoint on 24 June 2026, but it is not
  selected as the group source for the first version.
- Skatteetaten's shareholder-register extracts remain useful for historical year-end ownership,
  percentages and cross-checks, but are annual, may contain errors or omissions, and share count
  is not always the same thing as control.
- Brreg supplies registered addresses, not map coordinates. Kartverket provides official address
  data and coordinate-backed address lookup, so geocoding is feasible but requires a measured
  matching and coverage pipeline.

Evidence:

- https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html
- https://data.brreg.no/regnskapsregisteret/regnskap/swagger-ui/swagger-ui/index.html
- https://www.kartverket.no/api-og-data/eiendomsdata/apent-tilgjengelige-data-og-tjenester
- https://www.skatteetaten.no/deling/aksjonarregisteret/

## #1: What does one mark on the map represent?

Blocked by: #0
Type: Discuss

### Question

Should the primary map represent legal entities, corporate groups, or physical business
locations?

### Answer

Resolved:

- The default observation is a **legal entity**: one organisation number at its registered
  business address.
- Every legal entity remains individually visible even when it belongs to a group. Its displayed
  financials remain company-scope figures.
- A group member is labelled **“Part of the [ultimate business-group parent name] Group”**. The
  business-group parent is the root of the registered corporate group, not necessarily the
  highest majority shareholder or public owner. This label describes membership only and never
  changes the accounting scope of the displayed figures.
- A separate group view may collapse controlled legal entities to the group parent.
- Operating locations remain a distinct later layer. Never repeat a legal entity's revenue across
  its subunits.

Boundary example: Equinor Energy AS must be labelled **“Part of the Equinor Group”**, not
“Finansdepartement Group”. The ownership-derived traversal must therefore stop at Equinor ASA
instead of following raw majority ownership into a state owner. If the business-group root is
ambiguous, omit the definitive public label.

## #2: What is the location contract and acceptable precision?

Blocked by: #1
Type: Research

### Question

Which address is mapped, how are Kartverket matches scored, and what fallbacks are acceptable
when an exact official address cannot be resolved?

### Answer

Resolved for the first version: use Brreg's registered business address only. Plot an entity only
when its complete normalized address key has exactly one match in the nationwide Kartverket
address extract. Do not substitute postal address, postcode centroid or municipality centroid.
Retain every unplotted entity with an explicit omission reason and expose filter-aware coverage
counts. Exact ENK locations remain privacy-withheld pending a separate assessment.

## #3: What is the comparable financial observation?

Blocked by: #1
Type: Discuss

### Question

Which metrics, fiscal-period rules, accounting scope and quality states are safe to compare on
the map?

### Answer

Resolved for the first version: latest available **company-scope** filing per legal entity, with
fiscal year and currency visible. Initial stored metrics are operating revenue, EBIT, pre-tax
profit, net income, equity and total assets; employees come from the Brreg entity mirror. Rank by
reported revenue descending and keep missing values null rather than zero. An explicit “see
consolidated” switch reads the latest independently available consolidated filing; it never sums
legal-entity accounts or silently changes accounting scope.

## #4: How is current group membership identified and qualified?

Blocked by: #1
Type: Research

### Question

What source precedence, freshness model and conflict policy should determine group parent,
subsidiaries, associates, foreign parents, multiple control claims and cycles?

### Answer

Partially resolved:

- The first version uses the existing Skatteetaten shareholder-register graph materialised in
  `OwnershipEdge`; it does not use Brreg's group-structure endpoint.
- Group membership is ownership-derived for a named tax year, based on shareholdings reported at
  31 December. It must never be described internally as real-time or registered group structure.
- Use the latest **complete** imported tax-year snapshot. Surface the ownership year wherever the
  group label or group view is explained.
- Keep the compact label **“Part of the [group parent] Group”**, accompanied in its tooltip or
  company panel by **“Ownership structure as of 31 December [tax year]”**. The ownership date is
  mandatory and must not be hidden behind account access.
- Control edges remain aggregated across share classes and require more than 50% ownership. Bad or
  incomplete totals, cycles and multiple apparent controlling owners remain conflict states.
- The existing upward traversal cannot ship unchanged because it follows every controlling
  corporate owner to the terminal node. A business-group boundary must stop before states,
  ministries and other owners outside the commercial group.
- A ministry, the state, a municipality, a county municipality or another non-commercial public
  body never forms a group with an AS/ASA it owns. Every such holding is classified as a
  **financial position**, regardless of ownership percentage. It remains visible as dated
  ownership information but is excluded from subsidiary, associated-company, group-parent and
  group-count calculations.
- Preserve the raw owner, target, percentage and source rows. Apply `FINANCIAL_POSITION` in a
  separate group-relationship projection so the source evidence is not destroyed by product
  classification.
- The AS/ASA below that public-owner boundary may still be the parent of its own commercial group.
  For example, the state's stake in Equinor ASA is a financial position, while Equinor ASA remains
  the group parent for Equinor Energy AS and its other controlled companies.
- Equinor Energy AS → Equinor ASA is a required regression fixture. “Finansdepartement Group” is a
  release-blocking failure.
- Brreg freshness research is retained only as a deferred alternative:
  [Brreg group-structure freshness](./research/brreg-group-structure-freshness.md).

### Technical design

1. Keep `ShareholderRegisterHolding` and `OwnershipEdge` as the evidence layer. Percentage bands
   describe ownership size; they are not, by themselves, business-group semantics.
2. Enrich the company mirror with official owner metadata needed for deterministic classification,
   including organisation form and Brreg institutional-sector code. Classification must use
   versioned code lists, never owner-name matching.
3. Build a versioned relationship projection per tax-year snapshot with the kinds
   `GROUP_SUBSIDIARY`, `GROUP_ASSOCIATE`, `FINANCIAL_POSITION`, `MINORITY_POSITION`, `UNKNOWN` and
   `CONFLICT`. Store the raw ownership percentage, rule version, reason code, source identifiers and
   classification timestamps with every projected relationship.
4. Apply the public-owner boundary before percentage rules: when a deterministically classified
   non-commercial public body owns an AS/ASA, project `FINANCIAL_POSITION` regardless of percentage.
   Otherwise, project the agreed percentage-based relationship when the evidence is internally
   consistent. Uncertain or contradictory cases must not receive a group label.
5. Group traversal follows only `GROUP_SUBSIDIARY` relationships upward. It stops at
   `FINANCIAL_POSITION`, `UNKNOWN` and `CONFLICT`. Financial positions remain available in an
   ownership/holdings view but never enter the group tree.
6. Materialise and atomically publish a `GroupMembershipSnapshot` containing tax year, member,
   direct parent, business-group root, depth, path, status, rule version and ownership-as-of date.
   Map requests join against the latest successfully published snapshot instead of recalculating
   chains or reading a partly rebuilt graph.
7. Required gates include Equinor, majority and minority municipal holdings, an ordinary private
   holding company, cycles, multiple apparent controlling owners and broken share totals. No
   public-body node may become a business-group root.

Implementation note (5 August 2026): the schema, versioned classifier, atomic publication pointer,
conflict propagation, exact source-import binding, SSB classification reference, and materialised
membership lookup are implemented. The quantitative edge rebuild and semantic publication share a
single transaction. The read model serves only publications backed by a `COMPLETED` Skatteetaten
import; no partial import is promoted. Brreg entity refreshes use an isolated candidate table and an
atomic swap so classification never reads a half-loaded mirror.

Open: formal boundary rules for private financial sponsors and SPVs, foundations, foreign owners
and ambiguous chains. The public-owner boundary is resolved.

## #11: How is the group view financially de-duplicated?

Blocked by: #3, #4
Type: Discuss

### Question

When the group view collapses legal entities, which official consolidated figures may be shown,
what happens when they are unavailable, and how are double counting and partial coverage avoided?

### Answer

Open. Never present a sum of company accounts as consolidated accounts. Prefer a published
consolidated statement for the resolved group parent; otherwise show unavailable or a separately
named, fully qualified analytical sum with coverage and non-elimination warnings.

## #5: Is national financial coverage sufficient for the promise?

Blocked by: #3, #4
Type: Research

### Question

For each legal form, status, fiscal year and metric, how many active Norwegian entities have
usable coordinates and official figures, and how long/costly is a complete refresh?

### Answer

Partially resolved. The first reported-financial candidate loaded 7,958 latest scope statements
from the reported-only live-view repository. Of these, 5,690 statements for 5,403 entities belong
to the current complete Brreg universe: 5,403 company scope and 287 consolidated scope, containing
32,968 non-null key metrics. A further 2,268 historical statements across 2,264 entities were
excluded because those entities are absent from the current Brreg mirror. This establishes the
current local dataset coverage, not national open-source completeness; metric/year/form coverage
still needs a filter-aware published audit after the group gate is satisfied.

## #6: What serving architecture meets public-map cost and latency targets?

Blocked by: #2, #5
Type: Prototype

### Question

Should the map use PostGIS-generated vector tiles, precomputed tiles/aggregates, or a hybrid?

### Answer

Open. Prototype and benchmark a hybrid: cached municipality/hex aggregates at low zoom and
viewport-bounded entity points at high zoom. Compare PostGIS MVT against precomputed tiles after
hosting and filter requirements are known. The browser must never receive the entire company
universe.

## #7: What interaction model makes scope and uncertainty understandable?

Blocked by: #1, #3, #6
Type: Prototype

### Question

How should users choose metric/year/view, inspect a point, understand clusters, and distinguish
company, group, approximate location, stale data and missing data?

### Answer

Open. Prototype desktop and mobile flows with keyboard-accessible non-map results. The map is a
visual exploration surface, not the only way to access the data.

## #8: How is an anonymous public endpoint protected and measured?

Blocked by: #6, #7
Type: Discuss

### Question

What caching, rate limits, bot controls, telemetry and crawl strategy keep the free feature fast
and affordable without requiring an account?

### Answer

Open. Prefer CDN-cacheable tiles/aggregates, strict bounded queries and anonymous aggregate
telemetry. Public company detail URLs may be indexable; arbitrary map queries and tiles should
not create an unbounded crawl surface.

## #9: What boundary is reserved for future advertising?

Blocked by: #7, #8
Type: Discuss

### Question

Where can advertising later be introduced without influencing rankings, degrading map usability,
or forcing premature tracking choices?

### Answer

Deferred by product decision. For now, reserve clearly separated layout slots and event boundaries
only. Do not choose ad network, targeting, pricing or consent design until the completed product
has real traffic and usage evidence.

## #10: What is the delivery sequence and launch gate?

Blocked by: #2, #3, #4, #5, #6, #7, #8, #11
Type: Discuss

### Question

What phases, acceptance criteria and rollback conditions take the map from data audit to public
release?

### Answer

Open. Expected sequence: semantic contract → coverage audit → geocoding pilot → tile prototype →
entity-map MVP → group mode → accessibility/performance hardening → public launch. Advertising is
outside this delivery sequence.
