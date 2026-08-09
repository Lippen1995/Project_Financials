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
    path: "scripts/rehearse-gl-511-teardown.ts",
    sources: ["FinancialStatement", "FinancialLineItem"],
    classification: "source-migration",
    rationale:
      "The GL-511 teardown rehearsal builds a reported core in a disposable database so the removal has something real to leave behind.",
  },
  {
    path: "scripts/verify-fi-sim-foundation.ts",
    sources: ["FinancialStatement", "FinancialLineItem"],
    classification: "source-migration",
    rationale: "Disposable-database migration verification creates an explicit reported anchor.",
  },
  {
    path: "server/persistence/company-repository.ts",
    sources: ["FinancialStatement"],
    classification: "source-ingest",
    rationale:
      "Reported statement upsert only. The cached runtime reads that shared this module were removed; search ranking now reads the live dataset through company-search-financials-reader.",
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
    path: "server/services/financial-line-item-service.ts",
    sources: ["FinancialLineItem", "FinancialStatement"],
    classification: "source-ingest",
    rationale: "Structured statement projection is an explicit reported ingest job.",
  },
  {
    path: "server/services/structured-financials-service.ts",
    sources: ["FinancialStatement"],
    classification: "source-ingest",
    rationale: "Brreg structured ingest intentionally reads and writes reported statements.",
  },
] satisfies readonly FinancialSourceAccessRegistration[];
