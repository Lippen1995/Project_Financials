# 24/7 data refresh runbook

This document defines the recurring data work required before Fjord Insight runs as a 24/7 production service.

Code remains the source of truth for implemented schedules. A row marked **Required before go-live** does not have a complete production schedule yet.

## Go-live requirements

Complete these items before enabling continuous production operation:

- [ ] Schedule the Brreg entity, subunit, and role mirrors.
- [ ] Schedule incremental distress updates and periodic full reconciliation.
- [ ] Expand company-event ingestion beyond the current Oslo Børs-only cron.
- [ ] Schedule the NewsWeb issuer registry and company exposure graph.
- [ ] Define the annual shareholder-register import procedure.
- [ ] Add monitoring, alerting, retries, and freshness dashboards for every scheduled job.
- [ ] Document recovery procedures for partial imports and missed schedules.
- [ ] Configure and rotate all cron secrets in the production environment.

## Existing production schedules

The current Vercel configuration invokes four internal routes every hour. Each service may apply its own freshness threshold.

| Dataset or process | Effective cadence | Production status | Notes |
|---|---:|---|---|
| Workspace notifications | Hourly | Scheduled | Checks watched-company announcements, financial statements, company status, and distress-monitor matches. |
| Oslo Børs / NewsWeb company events | Hourly | Scheduled, limited scope | Processes only the `oslobors` source and limits each run to 40 items. |
| Petroleum events | Hourly when stale | Scheduled | Refreshes Havtil and Gassco events. |
| Petroleum market and macro data | Every 12 hours when stale | Scheduled | Refreshes prices, Norwegian exports, and fiscal data. |
| Petroleum core data | Every 24 hours when stale | Scheduled | Refreshes fields, discoveries, licences, facilities, wells, surveys, production, reserves, investments, and publications. |
| Petroleum snapshots | Every 6 hours when stale | Scheduled | Rebuilds fast read models. A core or metrics refresh also triggers a rebuild. |
| Petroleum company exposure | Every 6 hours when stale | Scheduled | Rebuilds company-level petroleum exposure after snapshot changes. |
| Annual-report filing discovery and processing | Hourly | Scheduled | Checks due companies, detects new or revised source documents, and processes pending filings. |

Annual-report company checks use state-dependent delays:

| Processing state | Next check |
|---|---:|
| Failed | 6 hours |
| Manual review | 12 hours |
| Published or normal coverage | 24 hours |

## Required recurring schedules

The repository already contains scripts or services for these processes, but `vercel.json` does not schedule them.

| Dataset or process | Target cadence | Go-live status | Command or service | Dependency and follow-up |
|---|---:|---|---|---|
| Brreg main entities | Daily | **Required before go-live** | `npm run brreg:ingest-entities` | Loads an isolated candidate and atomically replaces the local mirror. Limited/filter runs never publish. Run dependent search and exposure checks after success. |
| Brreg subunits | Daily | **Required before go-live** | `npm run brreg:ingest-subunits` | Refreshes workplace, outlet, and subunit search data. |
| Brreg roles and people-role assignments | Daily | **Required before go-live** | `npm run brreg:ingest-roles` | Refreshes boards, management roles, auditors, accountants, and reverse person lookup. |
| Brreg distress updates | Hourly | **Required before go-live** | `npm run sync:distress` | Uses the Brreg update cursor. Run after entity changes when practical. |
| Brreg distress full reconciliation | Weekly | **Required before go-live** | `npm run sync:distress -- bootstrap` | Repairs missed cursor updates and reconciles the complete candidate inventory. |
| General, authority, macro, and industry news sources | Every 30 minutes | **Required before go-live** | `npm run news:intelligence:sync-sources` | Do not restrict the production run to `oslobors`. Apply per-source limits and backoff. |
| Brreg announcements in company-event intelligence | Hourly | **Required before go-live** | Company-event source sync | Separate from live company-profile requests and workspace watch checks. |
| Internal financial and company-status events | Hourly, after upstream jobs | **Required before go-live** | Company-event source sync | Run after financial and Brreg entity updates. |
| NewsWeb issuer registry | Daily | **Required before go-live** | `npm run news:intelligence:sync-issuers` | Maintains issuer-to-Brreg identity resolution. |
| Company exposure and read-across graph | Daily | **Required before go-live** | `npm run news:intelligence:sync-exposure-graph` | Rebuild after ownership or major registry changes. |
| Shareholder register | On every official annual release | **Required operational procedure** | `npm run import:shareholder-register` | Import only official source files. Record tax year and provenance. |
| Company shareholding snapshots | After shareholder-source updates | **Required operational procedure** | `npm run import:shareholding` | Rebuild materialized ownership data for changed source years. |
| Ownership graph edges and semantic group snapshots | After ownership updates | **Required operational procedure** | `npm run ownership:build-edges` | Publish only from a `COMPLETED` shareholder-register import. The command builds quantitative edges, semantic relationships, and group memberships atomically before company exposure and ultimate-owner rebuilds. |
| Retail chains and franchise memberships | After entity or subunit refresh | **Required operational procedure** | `npm run franchise:discover-chains` | Recompute only from current official registry records. |
| SSB industry and geography classifications | Weekly and on classification-version change | **Required before go-live** | Add a scheduled classification sync | Persist current effective codes and invalidate process-local lookup caches. |

## Request-driven refreshes

These integrations refresh through user or batch traffic. They do not currently require an independent cron, but operations must monitor their cache age and upstream failures.

| Dataset | Current behavior | Production policy |
|---|---|---|
| Brreg company announcements | Fetched live for company profiles | Keep live fetching. The hourly workspace job separately checks watched companies. |
| Statnett grid queue and reservations | Fetched from the public Power BI source for each relevant company request | Monitor latency and upstream schema changes. Add a shared snapshot if traffic makes live fetching unreliable. |
| Patentstyret patents, trademarks, and designs | Read-through cache with `PROJECTX_CACHE_HOURS`, default 24 hours | Keep the 24-hour maximum age. Consider a proactive refresh for watched companies. |
| NVE electricity certificates | Uses the same read-through cache policy | Keep the 24-hour maximum age. Consider a proactive refresh for watched companies. |
| SSB lookups | Fetches codes effective on the current date and keeps process-local lists | The scheduled classification sync above must protect persisted search and filter data from becoming stale. |

## Derived rebuilds after changes

Run these jobs after relevant upstream data or decision logic changes. They do not need a fixed calendar schedule.

| Change | Required rebuild or validation |
|---|---|
| News scoring rules, thresholds, or models | Recalibrate company events and rerun relevance evaluation. |
| Company exposure rules | Rebuild company-event read-across. |
| Ownership imports | After confirming import status `COMPLETED`, rebuild ownership edges, semantic relationships, group memberships, company exposure, and affected ultimate-owner views. Never publish a semantic snapshot from a `PARTIAL` import. |
| Financial extraction parser, mapping, or confidence thresholds | Reprocess affected filings and run published-financial validation. |
| SSB classification version | Refresh the full classification snapshot and rerun affected search/filter mappings. |
| Registry schema or mapping | Run full entity, subunit, and role imports before serving the new schema. |

## Not active

The Finanstilsynet regulatory overlay is not implemented. Do not schedule or display regulatory status until a stable official provider is connected.

When the provider exists, refresh registrations, licence types, and regulatory status daily. Preserve Finanstilsynet as an overlay; never use it to replace Brreg company master data.

## Monitoring and alerting requirements

Every scheduled job must record:

- job name and run identifier
- start time, completion time, and duration
- success, partial success, skipped, or failed status
- source record count, created count, updated count, and rejected count
- source freshness and latest source timestamp
- cursor, ETag, hash, or version used for incremental processing
- retry count and final error category
- downstream rebuild status

Alert operations when:

- an hourly job has no successful run for 2 hours
- a daily job has no successful run for 30 hours
- a weekly reconciliation has no successful run for 9 days
- a source returns no records when the prior successful run returned records
- rejected or failed records exceed the agreed threshold
- a schema, parser, or source contract changes
- a job lease remains active beyond its expected maximum duration

## Safe operating order

Use this order for a full recovery or initial production bootstrap:

1. Import Brreg entities.
2. Import Brreg subunits.
3. Import Brreg roles.
4. Refresh SSB classifications.
5. Bootstrap distress data, then enable incremental updates.
6. Discover and process annual-report filings.
7. Import the latest official shareholder register and verify that the import is `COMPLETED`.
8. Rebuild ownership edges. Verify that relationship and membership publication counts were
   recorded for the exact source import ID and tax year before enabling group labels. If the import remains `PARTIAL`, keep
   the previous complete publication active or leave the feature unavailable.
9. Sync the NewsWeb issuer registry.
10. Rebuild the company exposure graph.
11. Sync all company-event sources and rebuild read-across.
12. Bootstrap petroleum data and rebuild petroleum snapshots.
13. Enable workspace notification processing.

## Source references

- Production cron routes: `vercel.json`
- Petroleum freshness thresholds: `server/services/petroleum-sync-service.ts`
- Annual-report scheduler: `server/services/annual-report-financials-scheduler-service.ts`
- Annual-report coverage timing: `server/services/annual-report-financials-service.ts`
- News source registry: `server/news/news-source-registry.ts`
- Current Oslo Børs-only scheduled route: `app/api/internal/company-event-sync/scheduled/route.ts`
- Workspace notification checks: `server/services/workspace-collaboration-service.ts`
- Brreg full imports: `scripts/ingest-brreg-entities.ts`, `scripts/ingest-brreg-subunits.ts`, and `scripts/ingest-brreg-roles.ts`
- Distress incremental updates: `server/services/distress-analysis-service.ts`
- Request-driven IP and NVE caches: `server/ip/ip-data.ts` and `server/persistence/ip-cache.ts`
- Request-driven Statnett data: `server/services/company-grid-connection-service.ts`
