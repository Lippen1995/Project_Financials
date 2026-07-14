-- CreateTable
CREATE TABLE "CompanyWebProfile" (
    "orgNumber" VARCHAR(9) NOT NULL,
    "companyName" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "scrapedText" TEXT NOT NULL,
    "businessSummary" TEXT,
    "pagesScraped" INTEGER NOT NULL DEFAULT 0,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reasonedAt" TIMESTAMP(3),
    "provenance" TEXT NOT NULL DEFAULT 'website-scrape',

    CONSTRAINT "CompanyWebProfile_pkey" PRIMARY KEY ("orgNumber")
);

-- CreateIndex
CREATE INDEX "CompanyWebProfile_companyName_idx" ON "CompanyWebProfile"("companyName");
