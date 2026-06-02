-- CreateTable
CREATE TABLE "NewsSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "baseUrl" TEXT,
    "rssUrl" TEXT,
    "apiUrl" TEXT,
    "language" TEXT,
    "country" TEXT,
    "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT,
    "canonicalUrl" TEXT NOT NULL,
    "originalUrl" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "bodyText" TEXT,
    "language" TEXT,
    "publishedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "normalizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentHash" TEXT,
    "documentFingerprint" TEXT,
    "sourcePayload" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsSignal" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "companyId" TEXT,
    "signalType" TEXT NOT NULL,
    "subtype" TEXT,
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valueScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "direction" TEXT,
    "horizon" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidence" JSONB,
    "detectorVersion" TEXT NOT NULL DEFAULT 'company-event-v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "eventFingerprint" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "eventDate" TIMESTAMP(3),
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "investorValueScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "noveltyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "severityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "engineVersion" TEXT NOT NULL DEFAULT 'company-event-v1',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyEventEvidence" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "relevanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "excerpt" TEXT,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "featureSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyEventEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyEventExposure" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "exposureType" TEXT NOT NULL,
    "exposureScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rationale" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyEventExposure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyEventFeedback" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "label" "NewsFeedbackLabel" NOT NULL,
    "notes" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyEventFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewsSource_sourceType_status_idx" ON "NewsSource"("sourceType", "status");

-- CreateIndex
CREATE INDEX "NewsSource_qualityScore_idx" ON "NewsSource"("qualityScore");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocument_sourceId_externalId_key" ON "SourceDocument"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "SourceDocument_sourceId_publishedAt_idx" ON "SourceDocument"("sourceId", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "SourceDocument_canonicalUrl_idx" ON "SourceDocument"("canonicalUrl");

-- CreateIndex
CREATE INDEX "SourceDocument_contentHash_idx" ON "SourceDocument"("contentHash");

-- CreateIndex
CREATE INDEX "SourceDocument_documentFingerprint_idx" ON "SourceDocument"("documentFingerprint");

-- CreateIndex
CREATE INDEX "NewsSignal_documentId_idx" ON "NewsSignal"("documentId");

-- CreateIndex
CREATE INDEX "NewsSignal_companyId_signalType_idx" ON "NewsSignal"("companyId", "signalType");

-- CreateIndex
CREATE INDEX "NewsSignal_signalType_valueScore_idx" ON "NewsSignal"("signalType", "valueScore" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyEvent_companyId_eventFingerprint_key" ON "CompanyEvent"("companyId", "eventFingerprint");

-- CreateIndex
CREATE INDEX "CompanyEvent_companyId_investorValueScore_idx" ON "CompanyEvent"("companyId", "investorValueScore" DESC);

-- CreateIndex
CREATE INDEX "CompanyEvent_companyId_lastSeen_idx" ON "CompanyEvent"("companyId", "lastSeen" DESC);

-- CreateIndex
CREATE INDEX "CompanyEvent_eventType_lastSeen_idx" ON "CompanyEvent"("eventType", "lastSeen" DESC);

-- CreateIndex
CREATE INDEX "CompanyEvent_status_lastSeen_idx" ON "CompanyEvent"("status", "lastSeen" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyEventEvidence_eventId_documentId_key" ON "CompanyEventEvidence"("eventId", "documentId");

-- CreateIndex
CREATE INDEX "CompanyEventEvidence_documentId_idx" ON "CompanyEventEvidence"("documentId");

-- CreateIndex
CREATE INDEX "CompanyEventEvidence_eventId_relevanceScore_idx" ON "CompanyEventEvidence"("eventId", "relevanceScore" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyEventExposure_eventId_companyId_exposureType_key" ON "CompanyEventExposure"("eventId", "companyId", "exposureType");

-- CreateIndex
CREATE INDEX "CompanyEventExposure_companyId_exposureScore_idx" ON "CompanyEventExposure"("companyId", "exposureScore" DESC);

-- CreateIndex
CREATE INDEX "CompanyEventExposure_eventId_idx" ON "CompanyEventExposure"("eventId");

-- CreateIndex
CREATE INDEX "CompanyEventFeedback_eventId_reviewedAt_idx" ON "CompanyEventFeedback"("eventId", "reviewedAt" DESC);

-- CreateIndex
CREATE INDEX "CompanyEventFeedback_userId_reviewedAt_idx" ON "CompanyEventFeedback"("userId", "reviewedAt" DESC);

-- CreateIndex
CREATE INDEX "CompanyEventFeedback_workspaceId_reviewedAt_idx" ON "CompanyEventFeedback"("workspaceId", "reviewedAt" DESC);

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "NewsSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsSignal" ADD CONSTRAINT "NewsSignal_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsSignal" ADD CONSTRAINT "NewsSignal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEvent" ADD CONSTRAINT "CompanyEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEventEvidence" ADD CONSTRAINT "CompanyEventEvidence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CompanyEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEventEvidence" ADD CONSTRAINT "CompanyEventEvidence_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEventExposure" ADD CONSTRAINT "CompanyEventExposure_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CompanyEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEventExposure" ADD CONSTRAINT "CompanyEventExposure_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEventFeedback" ADD CONSTRAINT "CompanyEventFeedback_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CompanyEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEventFeedback" ADD CONSTRAINT "CompanyEventFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEventFeedback" ADD CONSTRAINT "CompanyEventFeedback_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
