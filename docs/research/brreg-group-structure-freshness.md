# Brreg group-structure freshness — initial findings

Checked: 2026-08-05

Decision status: Deferred. Fjord Insight will use its existing Skatteetaten ownership graph for
the first company-map version. This note is retained as evidence for a possible later source
comparison, not as the selected implementation direction.

## Finding

The open Brreg group endpoint is useful evidence of the **currently returned registered group
structure**, but its contract is not strong enough to treat it as real-time ownership truth or as
the only source used by Fjord Insight.

## Official-source observations

- Brreg launched `GET /enhetsregisteret/api/konsernstruktur/{orgnr}` on 24 June 2026.
- Each child relationship contains `dato`, documented as the date the information was “registered
  or last updated”. The API does not distinguish those two meanings.
- The root response has no structure-level `updatedAt`, version or snapshot identifier.
- A live response inspected on 5 August 2026 had neither `Last-Modified` nor `ETag`; it explicitly
  disabled HTTP caching.
- The public documentation lists update feeds for entities, subunits and roles, but no dedicated
  update feed or total-stock download for group relationships. It does not promise that an entity
  update event can be used as a complete group-change feed.
- The Equinor Energy AS response correctly roots the registered business group at Equinor ASA,
  rather than continuing through the state's ownership. This validates group-boundary semantics,
  not freshness.

Official references:

- https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html
- https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/openapi.json
- https://data.brreg.no/enhetsregisteret/api/konsernstruktur/990888213
- https://www.skatteetaten.no/deling/aksjonarregisteret/

## Consequence for the product

Do not collapse these different timestamps into one “updated” value:

- **Relationship record date**: the ambiguous Brreg `dato` value.
- **Source observation time**: when Fjord Insight fetched the response.
- **Independent evidence date**: the effective/as-of date from another official source.
- **Normalisation time**: when Fjord Insight mapped the source record.

An old relationship record date is not itself proof of staleness; the relationship may simply be
unchanged. A recent fetch is also not proof that an unregistered transaction has not happened.
Freshness should therefore depend on evidence and conflicts, not just age.

## Recommended evidence states

- **REGISTERED_NO_CONFLICT**: Brreg currently returns the relationship and no newer contradictory
  official evidence is known.
- **CORROBORATED**: Brreg is consistent with another dated official source, such as the latest
  shareholder-register snapshot or a filed annual report.
- **PENDING_CHANGE**: a newer official issuer disclosure or registered transaction signal says a
  change has completed or is pending, but the group register has not caught up.
- **CONFLICT**: official sources disagree about the group root or control relationship.
- **UNKNOWN**: no authoritative group root can be resolved.

Only the first two states may support an unqualified group label. Pending, conflicting and unknown
states require qualified wording or no group label.

## Required validation before implementation

1. Build a stratified sample covering listed groups, private groups, state ownership, foreign
   parents, private-equity ownership, foundations, recent acquisitions, demergers and dissolved
   entities.
2. Compare Brreg relationships with the latest Skatteetaten year-end snapshot and dated filed
   annual-report subsidiary disclosures where available.
3. Add a recent-transaction cohort and measure lag from an official completion disclosure to the
   Brreg group response changing.
4. Measure conflict rate, unresolved-root rate and relationship-date distribution. Do not use age
   alone as the error criterion.
5. Re-fetch the cohort over time to establish observed update behaviour and a safe polling policy.
6. Make Equinor Energy AS → Equinor ASA a permanent regression case, alongside cases expected to
   expose stale, foreign-parent and ownership/group-boundary behaviour.

## Open product decision

Choose whether the normal public label should say “Part of X Group” or the more precise
“Registered as part of X Group”. The latter better communicates what the official evidence
actually establishes.
