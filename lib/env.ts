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
  skatteetatenShareholdingBaseUrl:
    process.env.SKATTEETATEN_SHAREHOLDING_BASE_URL ??
    "https://api.skatteetaten.no/api/aksjonaerivirksomhet/v1",
  skatteetatenShareholdingPackage: process.env.SKATTEETATEN_SHAREHOLDING_PACKAGE ?? "",
  skatteetatenShareholdingToken: process.env.SKATTEETATEN_SHAREHOLDING_TOKEN ?? "",
  ssbKlassBaseUrl: process.env.SSB_KLASS_BASE_URL ?? "https://data.ssb.no/api/klass/v1",
  ssbIndustryClassificationId: process.env.SSB_INDUSTRY_CLASSIFICATION_ID ?? "6",
  cacheHours: Number(process.env.PROJECTX_CACHE_HOURS ?? "24"),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripePriceId: process.env.STRIPE_PRICE_ID ?? "",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  openAiSearchModel: process.env.OPENAI_SEARCH_MODEL ?? "gpt-5-mini",
};

export default env;
