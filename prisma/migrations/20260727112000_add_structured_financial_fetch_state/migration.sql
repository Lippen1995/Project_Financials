CREATE TABLE "StructuredFinancialFetchState" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "unavailableReason" TEXT,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL,
    "nextCheckAt" TIMESTAMP(3) NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "latestFiscalYear" INTEGER,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StructuredFinancialFetchState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StructuredFinancialFetchState_companyId_key"
ON "StructuredFinancialFetchState"("companyId");

CREATE INDEX "StructuredFinancialFetchState_status_nextCheckAt_idx"
ON "StructuredFinancialFetchState"("status", "nextCheckAt");

CREATE INDEX "StructuredFinancialFetchState_nextCheckAt_idx"
ON "StructuredFinancialFetchState"("nextCheckAt");

ALTER TABLE "StructuredFinancialFetchState"
ADD CONSTRAINT "StructuredFinancialFetchState_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
