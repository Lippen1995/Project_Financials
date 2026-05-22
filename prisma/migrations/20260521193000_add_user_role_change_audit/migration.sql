-- CreateTable
CREATE TABLE "UserRoleChangeAudit" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "fromRole" "AppRole" NOT NULL,
    "toRole" "AppRole" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRoleChangeAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserRoleChangeAudit_actorUserId_createdAt_idx" ON "UserRoleChangeAudit"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "UserRoleChangeAudit_targetUserId_createdAt_idx" ON "UserRoleChangeAudit"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "UserRoleChangeAudit_createdAt_idx" ON "UserRoleChangeAudit"("createdAt");

-- AddForeignKey
ALTER TABLE "UserRoleChangeAudit" ADD CONSTRAINT "UserRoleChangeAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoleChangeAudit" ADD CONSTRAINT "UserRoleChangeAudit_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
