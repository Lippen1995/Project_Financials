const env = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  dataMode: process.env.PROJECTX_DATA_MODE ?? "mock",
  brregBaseUrl: process.env.BRREG_BASE_URL ?? "https://data.brreg.no/enhetsregisteret/api",
  brregRolesBaseUrl: process.env.BRREG_ROLES_BASE_URL ?? "https://data.brreg.no/enhetsregisteret/api",
  ssbKlassBaseUrl: process.env.SSB_KLASS_BASE_URL ?? "https://data.ssb.no/api/klass/v1",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripePriceId: process.env.STRIPE_PRICE_ID ?? "",
};

export default env;