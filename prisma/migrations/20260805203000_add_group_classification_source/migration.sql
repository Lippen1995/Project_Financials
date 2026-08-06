ALTER TABLE "GroupRelationshipPublication"
  ADD COLUMN "classificationSourceSystem" TEXT NOT NULL,
  ADD COLUMN "classificationSourceVersion" TEXT NOT NULL,
  ADD COLUMN "classificationSourceReference" TEXT NOT NULL;
