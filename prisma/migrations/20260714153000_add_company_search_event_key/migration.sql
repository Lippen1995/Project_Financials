ALTER TABLE "CompanySearchEvent" ADD COLUMN "eventKey" TEXT;

CREATE UNIQUE INDEX "CompanySearchEvent_userId_eventKey_key"
ON "CompanySearchEvent"("userId", "eventKey");
