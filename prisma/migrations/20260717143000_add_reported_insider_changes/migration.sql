CREATE TABLE "InsiderTransaction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL DEFAULT 'NEWSWEB',
    "sourceEntityType" TEXT NOT NULL DEFAULT 'primary_insider_transaction',
    "sourceId" TEXT NOT NULL,
    "sourceMessageId" INTEGER NOT NULL,
    "sourceAttachmentId" INTEGER,
    "sourceUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "transactionDate" DATE NOT NULL,
    "action" TEXT NOT NULL,
    "instrumentType" TEXT NOT NULL,
    "isin" TEXT,
    "issuerName" TEXT,
    "reportedShares" BIGINT NOT NULL,
    "price" DECIMAL(24,8),
    "currency" TEXT,
    "venue" TEXT,
    "reportingPartyName" TEXT NOT NULL,
    "reportingPartyOrgNumber" VARCHAR(9),
    "primaryInsiderName" TEXT NOT NULL,
    "primaryInsiderRole" TEXT,
    "postTransactionShares" BIGINT,
    "correctionForMessageId" INTEGER,
    "correctedByMessageId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "parseConfidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "rawPayload" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InsiderTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoleInsiderTransactionAttribution" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "personIdentityKey" TEXT NOT NULL,
    "snapshotTaxYear" INTEGER NOT NULL,
    "direct" BOOLEAN NOT NULL,
    "legalPartyName" TEXT NOT NULL,
    "legalPartyOrgNumber" VARCHAR(9),
    "ownershipFraction" DECIMAL(20,10) NOT NULL,
    "attributedShares" DECIMAL(30,10) NOT NULL,
    "ownershipPath" JSONB,
    "resolutionMethod" TEXT NOT NULL,
    "resolutionConfidence" DOUBLE PRECISION NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoleInsiderTransactionAttribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InsiderTransaction_sourceId_key" ON "InsiderTransaction"("sourceId");
CREATE INDEX "InsiderTransaction_companyId_transactionDate_idx" ON "InsiderTransaction"("companyId", "transactionDate" DESC);
CREATE INDEX "InsiderTransaction_sourceMessageId_idx" ON "InsiderTransaction"("sourceMessageId");
CREATE INDEX "InsiderTransaction_primaryInsiderName_idx" ON "InsiderTransaction"("primaryInsiderName");
CREATE INDEX "InsiderTransaction_reportingPartyOrgNumber_idx" ON "InsiderTransaction"("reportingPartyOrgNumber");
CREATE INDEX "InsiderTransaction_status_transactionDate_idx" ON "InsiderTransaction"("status", "transactionDate" DESC);
CREATE UNIQUE INDEX "RoleInsiderTransactionAttribution_transactionId_personIdentityKey_snapshotTaxYear_key" ON "RoleInsiderTransactionAttribution"("transactionId", "personIdentityKey", "snapshotTaxYear");
CREATE INDEX "RoleInsiderTransactionAttribution_personIdentityKey_snapshotTaxYear_idx" ON "RoleInsiderTransactionAttribution"("personIdentityKey", "snapshotTaxYear");
CREATE INDEX "RoleInsiderTransactionAttribution_snapshotTaxYear_resolutionConfidence_idx" ON "RoleInsiderTransactionAttribution"("snapshotTaxYear", "resolutionConfidence");

ALTER TABLE "InsiderTransaction" ADD CONSTRAINT "InsiderTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InsiderTransaction" ADD CONSTRAINT "InsiderTransaction_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoleInsiderTransactionAttribution" ADD CONSTRAINT "RoleInsiderTransactionAttribution_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "InsiderTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
