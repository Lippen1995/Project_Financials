-- Enable public publishing of machine-extracted "as reported" line items.
CREATE TYPE "PublishedFinancialLineItemSource" AS ENUM ('MACHINE_EXTRACTION', 'MANUAL_REVIEW');

ALTER TABLE "PublishedFinancialLineItem"
  ALTER COLUMN "metricKey" DROP NOT NULL,
  ADD COLUMN "originalLabel" TEXT,
  ADD COLUMN "originalValue" TEXT,
  ADD COLUMN "parsedValue" BIGINT,
  ADD COLUMN "publicationSource" "PublishedFinancialLineItemSource" NOT NULL DEFAULT 'MANUAL_REVIEW',
  ADD COLUMN "sourceSystem" TEXT,
  ADD COLUMN "sourceEntityType" TEXT,
  ADD COLUMN "sourceId" TEXT,
  ADD COLUMN "sourceExtractionRunId" TEXT,
  ADD COLUMN "extractionRoute" TEXT,
  ADD COLUMN "confidence" DOUBLE PRECISION,
  ADD COLUMN "fetchedAt" TIMESTAMP(3),
  ADD COLUMN "normalizedAt" TIMESTAMP(3);

