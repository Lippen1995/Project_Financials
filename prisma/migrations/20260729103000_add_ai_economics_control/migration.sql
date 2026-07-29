CREATE TYPE "AiRevenueAllocationMode" AS ENUM (
  'COST_PLUS',
  'FIXED_PER_SUBSCRIBER',
  'REVENUE_SHARE'
);

CREATE TYPE "AiUsageCategory" AS ENUM (
  'CUSTOMER',
  'INTERNAL_ADMIN',
  'INTERNAL_REVIEWER'
);

CREATE TABLE "AiEconomicsSettings" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "runtimeEnabled" BOOLEAN NOT NULL DEFAULT false,
  "billingCurrency" TEXT NOT NULL,
  "exchangeRateNok" DECIMAL(12,6) NOT NULL,
  "fxRiskBufferBps" INTEGER NOT NULL,
  "inputPricePerMillion" DECIMAL(14,6) NOT NULL,
  "cachedInputPricePerMillion" DECIMAL(14,6) NOT NULL,
  "outputPricePerMillion" DECIMAL(14,6) NOT NULL,
  "globalMonthlyBudgetNok" DECIMAL(14,2) NOT NULL,
  "requestCostLimitNok" DECIMAL(14,4) NOT NULL,
  "dailyRequestLimit" INTEGER NOT NULL,
  "internalMonthlyTokenAllowance" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiEconomicsSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiSubscriptionPlanEconomics" (
  "id" TEXT NOT NULL,
  "planKey" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "monthlyPriceNok" DECIMAL(14,2) NOT NULL,
  "includedAiUsageTokens" INTEGER NOT NULL,
  "includedAiCostNok" DECIMAL(14,2) NOT NULL,
  "allocationMode" "AiRevenueAllocationMode" NOT NULL,
  "costPlusMarkupBps" INTEGER NOT NULL DEFAULT 0,
  "fixedAiAllocationNokPerSubscriber" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "revenueShareBps" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSubscriptionPlanEconomics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiEconomicsChangeAudit" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityKey" TEXT NOT NULL,
  "beforeState" JSONB,
  "afterState" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiEconomicsChangeAudit_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AiSearchUsageEvent"
ADD COLUMN "usageCategory" "AiUsageCategory",
ADD COLUMN "appRoleAtUsage" "AppRole",
ADD COLUMN "subscriptionPlanAtUsage" TEXT,
ADD COLUMN "subscriptionStatusAtUsage" "SubscriptionStatus",
ADD COLUMN "settingsVersion" INTEGER,
ADD COLUMN "providerCurrency" TEXT,
ADD COLUMN "providerCostAmount" DECIMAL(14,6),
ADD COLUMN "exchangeRateNok" DECIMAL(12,6),
ADD COLUMN "fxRiskBufferBps" INTEGER,
ADD COLUMN "budgetedCostNok" DECIMAL(12,4);

CREATE UNIQUE INDEX "AiSubscriptionPlanEconomics_planKey_key"
ON "AiSubscriptionPlanEconomics"("planKey");
CREATE INDEX "AiSubscriptionPlanEconomics_active_planKey_idx"
ON "AiSubscriptionPlanEconomics"("active", "planKey");
CREATE INDEX "AiEconomicsChangeAudit_entityType_entityKey_createdAt_idx"
ON "AiEconomicsChangeAudit"("entityType", "entityKey", "createdAt" DESC);
CREATE INDEX "AiEconomicsChangeAudit_actorUserId_createdAt_idx"
ON "AiEconomicsChangeAudit"("actorUserId", "createdAt" DESC);
CREATE INDEX "AiSearchUsageEvent_usageCategory_occurredAt_idx"
ON "AiSearchUsageEvent"("usageCategory", "occurredAt" DESC);
CREATE INDEX "AiSearchUsageEvent_subscriptionPlanAtUsage_occurredAt_idx"
ON "AiSearchUsageEvent"("subscriptionPlanAtUsage", "occurredAt" DESC);

ALTER TABLE "AiEconomicsSettings"
ADD CONSTRAINT "AiEconomicsSettings_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiSubscriptionPlanEconomics"
ADD CONSTRAINT "AiSubscriptionPlanEconomics_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiEconomicsChangeAudit"
ADD CONSTRAINT "AiEconomicsChangeAudit_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
