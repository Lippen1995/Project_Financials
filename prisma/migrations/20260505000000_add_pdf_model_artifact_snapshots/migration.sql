-- CreateEnum
CREATE TYPE "PdfModelArtifactKind" AS ENUM ('SHADOW_MODEL_EVALUATION', 'SHADOW_MODEL_ANALYSIS', 'SHADOW_VS_RULE_GATE', 'MODEL_REGISTRY_MANIFEST');

-- CreateEnum
CREATE TYPE "PdfModelArtifactStatus" AS ENUM ('CREATED', 'SUPERSEDED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "PdfModelArtifactSnapshot" (
    "id" TEXT NOT NULL,
    "kind" "PdfModelArtifactKind" NOT NULL,
    "status" "PdfModelArtifactStatus" NOT NULL DEFAULT 'CREATED',
    "modelId" TEXT,
    "modelVersion" TEXT,
    "modelTarget" TEXT,
    "featureSchemaVersion" TEXT,
    "fiscalYear" INTEGER,
    "orgNumber" TEXT,
    "split" TEXT,
    "summary" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "sourceCommand" TEXT,
    "sourceCommitSha" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdfModelArtifactSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PdfModelArtifactSnapshot_kind_createdAt_idx" ON "PdfModelArtifactSnapshot"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "PdfModelArtifactSnapshot_modelId_modelVersion_idx" ON "PdfModelArtifactSnapshot"("modelId", "modelVersion");

-- CreateIndex
CREATE INDEX "PdfModelArtifactSnapshot_fiscalYear_idx" ON "PdfModelArtifactSnapshot"("fiscalYear");

-- CreateIndex
CREATE INDEX "PdfModelArtifactSnapshot_orgNumber_idx" ON "PdfModelArtifactSnapshot"("orgNumber");

-- CreateIndex
CREATE INDEX "PdfModelArtifactSnapshot_status_idx" ON "PdfModelArtifactSnapshot"("status");

-- AddForeignKey
ALTER TABLE "PdfModelArtifactSnapshot" ADD CONSTRAINT "PdfModelArtifactSnapshot_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
