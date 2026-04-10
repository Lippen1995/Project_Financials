const env = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  brregBaseUrl: process.env.BRREG_BASE_URL ?? "https://data.brreg.no/enhetsregisteret/api",
  brregRolesBaseUrl:
    process.env.BRREG_ROLES_BASE_URL ?? "https://data.brreg.no/enhetsregisteret/api",
  brregCompanyLookupBaseUrl:
    process.env.BRREG_COMPANY_LOOKUP_BASE_URL ?? "https://virksomhet.brreg.no/nb/oppslag/enheter",
  brregAnnouncementsBaseUrl:
    process.env.BRREG_ANNOUNCEMENTS_BASE_URL ?? "https://w2.brreg.no/kunngjoring",
  brregFinancialsBaseUrl:
    process.env.BRREG_FINANCIALS_BASE_URL ?? "https://data.brreg.no/regnskapsregisteret/regnskap",
  sodirFactmapsBaseUrl:
    process.env.SODIR_FACTMAPS_BASE_URL ?? "https://factmaps.sodir.no/api/rest/services",
  havtilBaseUrl: process.env.HAVTIL_BASE_URL ?? "https://www.havtil.no",
  gasscoUmmBaseUrl: process.env.GASSCO_UMM_BASE_URL ?? "https://umm.gassco.no",
  skatteetatenShareholdingBaseUrl:
    process.env.SKATTEETATEN_SHAREHOLDING_BASE_URL ??
    "https://api.skatteetaten.no/api/aksjonaerivirksomhet/v1",
  skatteetatenShareholdingPackage: process.env.SKATTEETATEN_SHAREHOLDING_PACKAGE ?? "",
  skatteetatenShareholdingToken: process.env.SKATTEETATEN_SHAREHOLDING_TOKEN ?? "",
  ssbKlassBaseUrl: process.env.SSB_KLASS_BASE_URL ?? "https://data.ssb.no/api/klass/v1",
  ssbPxwebBaseUrl: process.env.SSB_PXWEB_BASE_URL ?? "https://data.ssb.no/api/v0/no/table",
  ssbPetroleumExportTableId: process.env.SSB_PETROLEUM_EXPORT_TABLE_ID ?? "",
  ssbPetroleumInvestmentTableId: process.env.SSB_PETROLEUM_INVESTMENT_TABLE_ID ?? "",
  eiaBaseUrl: process.env.EIA_BASE_URL ?? "https://api.eia.gov/v2",
  eiaApiKey: process.env.EIA_API_KEY ?? "",
  ssbIndustryClassificationId: process.env.SSB_INDUSTRY_CLASSIFICATION_ID ?? "6",
  cacheHours: Number(process.env.PROJECTX_CACHE_HOURS ?? "24"),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripePriceId: process.env.STRIPE_PRICE_ID ?? "",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  openAiSearchModel: process.env.OPENAI_SEARCH_MODEL ?? "gpt-5-mini",
  workspaceSyncSecret: process.env.WORKSPACE_SYNC_SECRET ?? "",
};

export default env;
