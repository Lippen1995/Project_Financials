export type RequestPathNetworkEntry = {
  capability: string;
  requestReadPath: string[];
  backgroundPopulationPath: string[];
  missingDataBehavior: string;
};

export const REQUEST_PATH_NETWORK_INVENTORY: RequestPathNetworkEntry[] = [
  {
    capability: "Brreg-kunngjøringer",
    requestReadPath: ["server/services/company-announcement-read-service.ts"],
    backgroundPopulationPath: [
      "server/services/company-announcement-sync-service.ts",
      "app/api/internal/company-announcements/scheduled/route.ts",
    ],
    missingDataBehavior: "Oppretter PENDING-rad og viser ikke lastet ennå.",
  },
  {
    capability: "SSB Klass",
    requestReadPath: ["server/registry/ssb-classification-repository.ts"],
    backgroundPopulationPath: [
      "server/services/ssb-classification-sync-service.ts",
      "app/api/internal/ssb-classifications/scheduled/route.ts",
    ],
    missingDataBehavior: "Tomt lokalt treff uten nettverksfallback.",
  },
  {
    capability: "Premium AI-søk",
    requestReadPath: [
      "app/api/ai-search/route.ts",
      "app/api/ai-search/[jobId]/route.ts",
    ],
    backgroundPopulationPath: [
      "server/services/ai-search-job-service.ts",
      "app/api/internal/ai-search-jobs/scheduled/route.ts",
    ],
    missingDataBehavior: "Premiumbrukeren får en jobb-ID og klienten poller lagret resultat.",
  },
  {
    capability: "Søkeintensjon og scope",
    requestReadPath: [
      "server/services/company-service.ts",
      "server/services/dashboard-search-routing-service.ts",
    ],
    backgroundPopulationPath: ["server/services/ai-search-job-service.ts"],
    missingDataBehavior: "Deterministisk databasesøk brukes mens AI-jobben behandles.",
  },
  {
    capability: "Selskapsprofilens sekundærkilder",
    requestReadPath: [
      "server/ownership/group-employee-service.ts",
      "server/shareholdings/shareholding-service.ts",
      "server/services/company-grid-connection-service.ts",
      "server/ip/ip-data.ts",
      "server/services/news-aggregator-service.ts",
    ],
    backgroundPopulationPath: [
      "app/api/internal/news-sync/scheduled/route.ts",
      "app/api/internal/company-event-sync/scheduled/route.ts",
    ],
    missingDataBehavior: "Lagrede data eller ærlig tomtilstand; ingen read-through.",
  },
];
