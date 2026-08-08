import type { FinancialSourceAccessRegistration } from "@/lib/financial-source-access-inventory";

/**
 * Exact baseline registrations, not an allowlist. Anything except explicit
 * ingest or migration access is debt that blocks FI-SIM activation.
 */
export const financialSourceAccessRegistrations = [
  {
    path: "scripts/bootstrap-metric-aliases-from-fasit.ts",
    sources: ["PublishedFinancialLineItem"],
    classification: "source-maintenance",
    rationale: "Offline maintenance reads reviewer-published source lines.",
  },
  {
    path: "scripts/build-anchored-unit-scale-dataset.ts",
    sources: ["FinancialStatement"],
    classification: "source-maintenance",
    rationale: "Offline evaluation dataset construction reads reported source statements.",
  },
  {
    path: "scripts/flag-canica-suspect-values.ts",
    sources: ["PublishedFinancialLineItem"],
    classification: "source-maintenance",
    rationale: "One-off source quality inspection for reviewer-published lines.",
  },
  {
    path: "scripts/ingest-structured-financials.ts",
    sources: ["FinancialStatement"],
    classification: "source-ingest",
    rationale:
      "Brreg structured ingest reads stored statements to select parent companies for a konsern backfill.",
  },
  {
    path: "scripts/report-structured-financial-coverage.ts",
    sources: ["FinancialStatement"],
    classification: "source-observability",
    rationale: "Ingest coverage reporting intentionally observes source records.",
  },
  {
    path: "scripts/verify-fi-sim-foundation.ts",
    sources: ["FinancialStatement", "FinancialLineItem"],
    classification: "source-migration",
    rationale: "Disposable-database migration verification creates an explicit reported anchor.",
  },
  {
    path: "server/financials/published-financials-reader.ts",
    sources: ["FinancialStatement", "PublishedFinancialLineItem"],
    classification: "temporary-runtime-reader",
    rationale:
      "Public company financials no longer imports this module; remove it after its remaining legacy callers migrate in F4.",
  },
  {
    path: "server/persistence/company-repository.ts",
    sources: ["FinancialStatement"],
    classification: "temporary-runtime-reader",
    rationale: "Split the permitted source writer from cached runtime reads in F4.",
  },
  {
    path: "server/services/admin-hub-service.ts",
    sources: ["FinancialStatement"],
    classification: "source-observability",
    rationale: "Admin source-health metrics intentionally inspect reported ingestion.",
  },
  {
    path: "server/services/canonical-key-service.ts",
    sources: ["FinancialLineItem"],
    classification: "source-admin",
    rationale: "Reported canonical-key administration intentionally updates source mapping.",
  },
  {
    path: "server/services/dd-comment-service.ts",
    sources: ["FinancialStatement"],
    classification: "temporary-runtime-reader",
    rationale: "Reported statement FK validation remains direct until live IDs land in F4.",
  },
  {
    path: "server/services/financial-line-item-service.ts",
    sources: ["FinancialLineItem", "FinancialStatement"],
    classification: "source-ingest",
    rationale: "Structured statement projection is an explicit reported ingest job.",
  },
  {
    path: "server/services/presentation-node-service.ts",
    sources: ["FinancialLineItem"],
    classification: "temporary-runtime-reader",
    rationale: "Move presentation mapping reads to the active mapping repository in F5.",
  },
  {
    path: "server/services/structured-financials-service.ts",
    sources: ["FinancialStatement"],
    classification: "source-ingest",
    rationale: "Brreg structured ingest intentionally reads and writes reported statements.",
  },
] satisfies readonly FinancialSourceAccessRegistration[];
