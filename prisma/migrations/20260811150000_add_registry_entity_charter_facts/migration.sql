-- Brreg's enhet representation already carries the full "nøkkelopplysninger" block
-- (stiftelsesdato, vedtekter, kapital, historiske navn). Mirror it so the company profile
-- can render it without an on-demand call to the live Brreg API.
ALTER TABLE "RegistryEntity"
  ADD COLUMN "foundedAt" TIMESTAMP(3),
  ADD COLUMN "statutesDate" TIMESTAMP(3),
  ADD COLUMN "statutoryPurpose" TEXT,
  ADD COLUMN "activityDescription" TEXT,
  ADD COLUMN "languageForm" TEXT,
  ADD COLUMN "vatRegistered" BOOLEAN,
  ADD COLUMN "registeredInBusinessRegister" BOOLEAN,
  ADD COLUMN "businessRegisterRegisteredAt" TIMESTAMP(3),
  ADD COLUMN "lastSubmittedAnnualReportYear" INTEGER,
  ADD COLUMN "capitalType" TEXT,
  ADD COLUMN "shareCapital" DECIMAL(20,2),
  ADD COLUMN "shareCapitalCurrency" TEXT,
  ADD COLUMN "shareCount" BIGINT,
  ADD COLUMN "shareCapitalRegisteredAt" TIMESTAMP(3),
  ADD COLUMN "previousNames" JSONB;
