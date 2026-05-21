-- CreateEnum
CREATE TYPE "StatementScope" AS ENUM ('COMPANY', 'CONSOLIDATED');

-- DropIndex
DROP INDEX "AnnualReportNarrative_filingId_sectionKind_key";

-- DropIndex
DROP INDEX "AnnualReportReviewedFact_reviewId_metricKey_key";

-- DropIndex
DROP INDEX "FinancialStatement_companyId_fiscalYear_key";

-- AlterTable
ALTER TABLE "AnnualReportNarrative" ADD COLUMN     "statementScope" "StatementScope" NOT NULL DEFAULT 'COMPANY';

-- AlterTable
ALTER TABLE "AnnualReportReviewedFact" ADD COLUMN     "statementScope" "StatementScope" NOT NULL DEFAULT 'COMPANY';

-- AlterTable
ALTER TABLE "FinancialFact" ADD COLUMN     "statementScope" "StatementScope" NOT NULL DEFAULT 'COMPANY';

-- AlterTable
ALTER TABLE "FinancialStatement" ADD COLUMN     "statementScope" "StatementScope" NOT NULL DEFAULT 'COMPANY';

-- AlterTable
ALTER TABLE "RawFinancialLineItem" ADD COLUMN     "statementScope" "StatementScope" NOT NULL DEFAULT 'COMPANY';

-- CreateIndex
CREATE UNIQUE INDEX "AnnualReportNarrative_filingId_sectionKind_statementScope_key" ON "AnnualReportNarrative"("filingId", "sectionKind", "statementScope");

-- CreateIndex
CREATE UNIQUE INDEX "AnnualReportReviewedFact_reviewId_metricKey_statementScope_key" ON "AnnualReportReviewedFact"("reviewId", "metricKey", "statementScope");

-- CreateIndex
CREATE INDEX "FinancialFact_companyId_fiscalYear_statementScope_idx" ON "FinancialFact"("companyId", "fiscalYear", "statementScope");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialStatement_companyId_fiscalYear_statementScope_key" ON "FinancialStatement"("companyId", "fiscalYear", "statementScope");

