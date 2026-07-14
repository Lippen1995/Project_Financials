CREATE TABLE "AiSearchUsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "reservedTokens" INTEGER NOT NULL,
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "usageTokens" INTEGER NOT NULL DEFAULT 0,
    "sourceSystem" TEXT,
    "sourceEntityType" TEXT,
    "sourceId" TEXT,
    "fetchedAt" TIMESTAMP(3),
    "normalizedAt" TIMESTAMP(3),
    "occurredAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSearchUsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiSearchUsageEvent_userId_occurredAt_idx"
ON "AiSearchUsageEvent"("userId", "occurredAt" DESC);

CREATE INDEX "AiSearchUsageEvent_status_expiresAt_idx"
ON "AiSearchUsageEvent"("status", "expiresAt");

ALTER TABLE "AiSearchUsageEvent"
ADD CONSTRAINT "AiSearchUsageEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CompanySearchEvent_searchedAt_idx"
ON "CompanySearchEvent"("searchedAt");
