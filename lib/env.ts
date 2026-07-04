// Next.js loads .env automatically, but standalone tsx scripts (npm run financials:* etc.)
// do not — without this, OPENDATALOADER_* and other config silently fall back to defaults.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file or unsupported runtime; fall through to process.env/defaults.
  }
}

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
  patentstyretBaseUrl: process.env.PATENTSTYRET_BASE_URL ?? "https://api.patentstyret.no",
  patentstyretSubscriptionKey: process.env.PATENTSTYRET_SUBSCRIPTION_KEY ?? "",
  patentstyretOrgNumberParam: process.env.PATENTSTYRET_ORGNUMBER_PARAM ?? "orgNumber",
  statnettGridConnectionsDataUrl: process.env.STATNETT_GRID_CONNECTIONS_DATA_URL ?? "",
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
  opendataloaderEnabled:
    (process.env.OPENDATALOADER_ENABLED ?? "").trim().toLowerCase() === "true",
  opendataloaderMode:
    (process.env.OPENDATALOADER_MODE ?? "local").trim().toLowerCase(),
  opendataloaderHybridBackend:
    process.env.OPENDATALOADER_HYBRID_BACKEND ?? "docling-fast",
  opendataloaderHybridUrl: process.env.OPENDATALOADER_HYBRID_URL ?? "",
  opendataloaderForceOcr:
    (process.env.OPENDATALOADER_FORCE_OCR ?? "").trim().toLowerCase() === "true",
  opendataloaderUseStructTree:
    (process.env.OPENDATALOADER_USE_STRUCT_TREE ?? "").trim().toLowerCase() === "true",
  opendataloaderTimeoutMs: Number(process.env.OPENDATALOADER_TIMEOUT_MS ?? "120000"),
  opendataloaderDualRun:
    (process.env.OPENDATALOADER_DUAL_RUN ?? "").trim().toLowerCase() === "true",
  opendataloaderStoreAnnotatedPdf:
    process.env.OPENDATALOADER_STORE_ANNOTATED_PDF === undefined
      ? true
      : (process.env.OPENDATALOADER_STORE_ANNOTATED_PDF ?? "").trim().toLowerCase() === "true",
  opendataloaderFallbackToLegacy:
    process.env.OPENDATALOADER_FALLBACK_TO_LEGACY === undefined
      ? true
      : (process.env.OPENDATALOADER_FALLBACK_TO_LEGACY ?? "").trim().toLowerCase() === "true",
  opendataloaderAutoPromote:
    (process.env.OPENDATALOADER_AUTO_PROMOTE ?? "").trim().toLowerCase() === "true",
  mlInferenceUrl: process.env.ML_INFERENCE_URL ?? "",
  mlInferenceUnitScaleMode:
    (process.env.ML_INFERENCE_UNIT_SCALE_MODE ?? "apply").trim().toLowerCase(),
  mlInferenceShadowEnabled:
    (process.env.ML_INFERENCE_SHADOW ?? "").trim().toLowerCase() === "true",
  mlInferenceFinancialFactShadowEnabled:
    (process.env.ML_INFERENCE_FINANCIAL_FACT_SHADOW ?? "").trim().toLowerCase() === "true",
  financialsSyncSecret:
    process.env.FINANCIALS_SYNC_SECRET ?? process.env.WORKSPACE_SYNC_SECRET ?? "",
  workspaceSyncSecret: process.env.WORKSPACE_SYNC_SECRET ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  newsSyncSecret: process.env.NEWS_SYNC_SECRET ?? process.env.WORKSPACE_SYNC_SECRET ?? "",
  newsArticleExtractionMode:
    (process.env.NEWS_ARTICLE_EXTRACTION_MODE ?? "auto").trim().toLowerCase(),
  newsArticleExtractionPython:
    process.env.NEWS_ARTICLE_EXTRACTION_PYTHON ?? process.env.PYTHON ?? "python",
  newsArticleExtractionTimeoutMs: Number(process.env.NEWS_ARTICLE_EXTRACTION_TIMEOUT_MS ?? "8000"),
  newsArticleExtractionMaxPerSync: Number(process.env.NEWS_ARTICLE_EXTRACTION_MAX_PER_SYNC ?? "20"),
  newsIntelligenceAlertsEnabled:
    (process.env.NEWS_INTELLIGENCE_ALERTS_ENABLED ?? "").trim().toLowerCase() === "true",
};

export default env;
