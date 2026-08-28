CREATE TABLE "BackgroundJobRun" (
    "id" TEXT NOT NULL,
    "jobKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "claimedCount" INTEGER NOT NULL DEFAULT 0,
    "succeededCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackgroundJobRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BackgroundJobRun_jobKey_startedAt_idx"
ON "BackgroundJobRun"("jobKey", "startedAt" DESC);

CREATE INDEX "BackgroundJobRun_status_startedAt_idx"
ON "BackgroundJobRun"("status", "startedAt");
