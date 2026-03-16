const env = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  brregBaseUrl: process.env.BRREG_BASE_URL ?? "https://data.brreg.no/enhetsregisteret/api",
  brregRolesBaseUrl:
    process.env.BRREG_ROLES_BASE_URL ?? "https://data.brreg.no/enhetsregisteret/api",
  ssbKlassBaseUrl: process.env.SSB_KLASS_BASE_URL ?? "https://data.ssb.no/api/klass/v1",
  ssbIndustryClassificationId: process.env.SSB_INDUSTRY_CLASSIFICATION_ID ?? "6",
  cacheHours: Number(process.env.PROJECTX_CACHE_HOURS ?? "24"),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripePriceId: process.env.STRIPE_PRICE_ID ?? "",
};

export default env;
