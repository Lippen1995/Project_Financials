CREATE TABLE "CompanyExposureGraphNode" (
    "id" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyExposureGraphNode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyExposureGraphEdge" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rationale" TEXT,
    "metadata" JSONB,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyExposureGraphEdge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyExposureGraphNode_nodeType_key_key"
ON "CompanyExposureGraphNode"("nodeType", "key");

CREATE INDEX "CompanyExposureGraphNode_nodeType_label_idx"
ON "CompanyExposureGraphNode"("nodeType", "label");

CREATE INDEX "CompanyExposureGraphNode_sourceSystem_sourceEntityType_idx"
ON "CompanyExposureGraphNode"("sourceSystem", "sourceEntityType");

CREATE UNIQUE INDEX "CompanyExposureGraphEdge_companyId_nodeId_relationType_key"
ON "CompanyExposureGraphEdge"("companyId", "nodeId", "relationType");

CREATE INDEX "CompanyExposureGraphEdge_companyId_active_weight_idx"
ON "CompanyExposureGraphEdge"("companyId", "active", "weight" DESC);

CREATE INDEX "CompanyExposureGraphEdge_nodeId_active_weight_idx"
ON "CompanyExposureGraphEdge"("nodeId", "active", "weight" DESC);

CREATE INDEX "CompanyExposureGraphEdge_sourceSystem_sourceEntityType_idx"
ON "CompanyExposureGraphEdge"("sourceSystem", "sourceEntityType");

ALTER TABLE "CompanyExposureGraphEdge"
ADD CONSTRAINT "CompanyExposureGraphEdge_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyExposureGraphEdge"
ADD CONSTRAINT "CompanyExposureGraphEdge_nodeId_fkey"
FOREIGN KEY ("nodeId") REFERENCES "CompanyExposureGraphNode"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
