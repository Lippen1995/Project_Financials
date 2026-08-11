-- CreateTable
CREATE TABLE "HealthScoreModel" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isFallback" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthScoreModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthScoreModelIndustryRule" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "nacePrefix" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthScoreModelIndustryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthScoreModelAudit" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeState" JSONB,
    "afterState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthScoreModelAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthScoreModel_key_key" ON "HealthScoreModel"("key");

-- CreateIndex
CREATE INDEX "HealthScoreModel_active_key_idx" ON "HealthScoreModel"("active", "key");

-- CreateIndex
CREATE UNIQUE INDEX "HealthScoreModelIndustryRule_nacePrefix_key" ON "HealthScoreModelIndustryRule"("nacePrefix");

-- CreateIndex
CREATE INDEX "HealthScoreModelIndustryRule_modelId_idx" ON "HealthScoreModelIndustryRule"("modelId");

-- CreateIndex
CREATE INDEX "HealthScoreModelAudit_modelKey_createdAt_idx" ON "HealthScoreModelAudit"("modelKey", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "HealthScoreModelAudit_actorUserId_createdAt_idx" ON "HealthScoreModelAudit"("actorUserId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "HealthScoreModel" ADD CONSTRAINT "HealthScoreModel_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthScoreModelIndustryRule" ADD CONSTRAINT "HealthScoreModelIndustryRule_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "HealthScoreModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthScoreModelAudit" ADD CONSTRAINT "HealthScoreModelAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
