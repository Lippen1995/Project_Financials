DELETE FROM "GroupMembershipSnapshot" membership
USING "GroupRelationshipPublication" publication
WHERE membership."buildId" = publication."buildId"
  AND publication."sourceImportStatus" IS DISTINCT FROM 'COMPLETED'::"ShareholderRegisterImportStatus";

DELETE FROM "GroupRelationshipSnapshot" relationship
USING "GroupRelationshipPublication" publication
WHERE relationship."buildId" = publication."buildId"
  AND publication."sourceImportStatus" IS DISTINCT FROM 'COMPLETED'::"ShareholderRegisterImportStatus";

DELETE FROM "GroupRelationshipPublication"
WHERE "sourceImportStatus" IS DISTINCT FROM 'COMPLETED'::"ShareholderRegisterImportStatus";
