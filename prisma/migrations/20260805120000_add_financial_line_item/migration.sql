-- CreateTable
CREATE TABLE "FinancialLineItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "statementScope" "StatementScope" NOT NULL DEFAULT 'COMPANY',
    "statementType" "FinancialFactStatementType" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "metricKey" TEXT,
    "value" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'NOK',
    "unitScale" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialLineItem_metricKey_idx" ON "FinancialLineItem"("metricKey");

-- CreateIndex
CREATE INDEX "FinancialLineItem_companyId_fiscalYear_statementScope_idx" ON "FinancialLineItem"("companyId", "fiscalYear", "statementScope");

-- CreateIndex
CREATE INDEX "FinancialLineItem_metricKey_sourceLabel_idx" ON "FinancialLineItem"("metricKey", "sourceLabel");

-- CreateIndex
CREATE INDEX "FinancialLineItem_sourceSystem_sourceEntityType_idx" ON "FinancialLineItem"("sourceSystem", "sourceEntityType");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialLineItem_companyId_fiscalYear_statementScope_sourc_key" ON "FinancialLineItem"("companyId", "fiscalYear", "statementScope", "sourceKey");

-- AddForeignKey
ALTER TABLE "FinancialLineItem" ADD CONSTRAINT "FinancialLineItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

