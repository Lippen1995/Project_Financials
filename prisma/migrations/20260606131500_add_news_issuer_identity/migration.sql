CREATE TABLE "NewsIssuerIdentity" (
    "id" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceIssuerId" TEXT NOT NULL,
    "issuerSign" TEXT,
    "symbol" TEXT,
    "issuerName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT,
    "matchMethod" TEXT,
    "matchConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "lastMessagesFetchedAt" TIMESTAMP(3),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsIssuerIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NewsIssuerIdentity_sourceSystem_sourceIssuerId_key"
ON "NewsIssuerIdentity"("sourceSystem", "sourceIssuerId");

CREATE INDEX "NewsIssuerIdentity_companyId_isActive_idx"
ON "NewsIssuerIdentity"("companyId", "isActive");

CREATE INDEX "NewsIssuerIdentity_sourceSystem_isActive_lastMessagesFetchedAt_idx"
ON "NewsIssuerIdentity"("sourceSystem", "isActive", "lastMessagesFetchedAt");

CREATE INDEX "NewsIssuerIdentity_issuerSign_idx"
ON "NewsIssuerIdentity"("issuerSign");

CREATE INDEX "NewsIssuerIdentity_symbol_idx"
ON "NewsIssuerIdentity"("symbol");

ALTER TABLE "NewsIssuerIdentity"
ADD CONSTRAINT "NewsIssuerIdentity_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
