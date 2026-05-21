-- CreateEnum
CREATE TYPE "IngestionRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- AlterEnum
ALTER TYPE "AdminNotificationType" ADD VALUE 'INGESTION_COMPLETED';

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL,
    "status" "IngestionRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "triggeredBy" TEXT,
    "totalCompanies" INTEGER NOT NULL,
    "totalFilings" INTEGER NOT NULL DEFAULT 0,
    "processedFilings" INTEGER NOT NULL DEFAULT 0,
    "publishedCount" INTEGER NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IngestionRun_status_startedAt_idx" ON "IngestionRun"("status", "startedAt");

