-- CreateEnum
CREATE TYPE "PdfModelCandidateStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED_FOR_SHADOW', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PdfModelCandidateDecisionType" AS ENUM ('SUBMITTED_FOR_REVIEW', 'APPROVED_FOR_SHADOW', 'REJECTED', 'ARCHIVED', 'COMMENTED');

-- CreateTable
CREATE TABLE "PdfModelCandidate" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "modelTarget" TEXT NOT NULL,
    "algorithm" TEXT,
    "featureSchemaVersion" TEXT,
    "status" "PdfModelCandidateStatus" NOT NULL DEFAULT 'DRAFT',
    "manifestArtifactId" TEXT,
    "gateArtifactId" TEXT,
    "analysisArtifactId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdfModelCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfModelCandidateDecision" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "decisionType" "PdfModelCandidateDecisionType" NOT NULL,
    "note" TEXT,
    "payload" JSONB,
    "decidedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdfModelCandidateDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PdfModelCandidate_modelId_modelVersion_key" ON "PdfModelCandidate"("modelId", "modelVersion");

-- CreateIndex
CREATE INDEX "PdfModelCandidate_status_idx" ON "PdfModelCandidate"("status");

-- CreateIndex
CREATE INDEX "PdfModelCandidate_modelTarget_idx" ON "PdfModelCandidate"("modelTarget");

-- CreateIndex
CREATE INDEX "PdfModelCandidateDecision_candidateId_createdAt_idx" ON "PdfModelCandidateDecision"("candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "PdfModelCandidateDecision_decisionType_idx" ON "PdfModelCandidateDecision"("decisionType");

-- AddForeignKey
ALTER TABLE "PdfModelCandidate" ADD CONSTRAINT "PdfModelCandidate_manifestArtifactId_fkey" FOREIGN KEY ("manifestArtifactId") REFERENCES "PdfModelArtifactSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfModelCandidate" ADD CONSTRAINT "PdfModelCandidate_gateArtifactId_fkey" FOREIGN KEY ("gateArtifactId") REFERENCES "PdfModelArtifactSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfModelCandidate" ADD CONSTRAINT "PdfModelCandidate_analysisArtifactId_fkey" FOREIGN KEY ("analysisArtifactId") REFERENCES "PdfModelArtifactSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfModelCandidate" ADD CONSTRAINT "PdfModelCandidate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfModelCandidateDecision" ADD CONSTRAINT "PdfModelCandidateDecision_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "PdfModelCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfModelCandidateDecision" ADD CONSTRAINT "PdfModelCandidateDecision_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
