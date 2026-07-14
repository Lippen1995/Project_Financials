CREATE TABLE "CompanySearchEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'companies',
    "industryCode" TEXT,
    "city" TEXT,
    "legalForm" TEXT,
    "companyStatus" TEXT,
    "revenueClass" TEXT,
    "aiAssisted" BOOLEAN NOT NULL DEFAULT false,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "succeeded" BOOLEAN NOT NULL DEFAULT true,
    "sectors" JSONB NOT NULL DEFAULT '[]',
    "searchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanySearchEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompanySearchEvent_userId_searchedAt_idx"
ON "CompanySearchEvent"("userId", "searchedAt" DESC);

CREATE INDEX "CompanySearchEvent_userId_query_idx"
ON "CompanySearchEvent"("userId", "query");

CREATE INDEX "CompanySearchEvent_userId_revenueClass_idx"
ON "CompanySearchEvent"("userId", "revenueClass");

ALTER TABLE "CompanySearchEvent"
ADD CONSTRAINT "CompanySearchEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
