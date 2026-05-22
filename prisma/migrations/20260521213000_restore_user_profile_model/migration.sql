-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "profileImageUrl" TEXT,
    "professionalBio" TEXT,
    "jobTitle" TEXT,
    "employerName" TEXT,
    "employerOrgNumber" TEXT,
    "employerLogoUrl" TEXT,
    "employerSector" TEXT,
    "employerMatchedCompanyId" TEXT,
    "isStudent" BOOLEAN NOT NULL DEFAULT false,
    "universityName" TEXT,
    "degree" TEXT,
    "studyFocus" TEXT,
    "graduationYear" INTEGER,
    "internshipInterest" TEXT,
    "workEmail" TEXT,
    "phoneNumber" TEXT,
    "countryOfOrigin" TEXT,
    "countryOfWork" TEXT,
    "currentLocation" TEXT,
    "linkedinProfileUrl" TEXT,
    "linkedinConnected" BOOLEAN NOT NULL DEFAULT false,
    "linkedinProviderAccountId" TEXT,
    "profileCompletenessScore" INTEGER NOT NULL DEFAULT 0,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "onboardingCompletedAt" TIMESTAMP(3),
    "onboardingStep" INTEGER NOT NULL DEFAULT 1,
    "expertiseAreas" JSONB,
    "sectorsOfInterest" JSONB,
    "education" JSONB,
    "careerHistory" JSONB,
    "fieldSources" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE INDEX "UserProfile_employerMatchedCompanyId_idx" ON "UserProfile"("employerMatchedCompanyId");

-- CreateIndex
CREATE INDEX "UserProfile_onboardingCompleted_onboardingStep_idx" ON "UserProfile"("onboardingCompleted", "onboardingStep");

-- CreateIndex
CREATE INDEX "UserProfile_linkedinConnected_idx" ON "UserProfile"("linkedinConnected");

-- AddForeignKey
ALTER TABLE "UserProfile"
ADD CONSTRAINT "UserProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile"
ADD CONSTRAINT "UserProfile_employerMatchedCompanyId_fkey"
FOREIGN KEY ("employerMatchedCompanyId") REFERENCES "Company"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
