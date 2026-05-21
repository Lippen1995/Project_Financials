-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AppRole" AS ENUM ('USER', 'ADMIN', 'FINANCIAL_REVIEWER');

-- CreateEnum
CREATE TYPE "AnnualReportReviewDecisionType" AS ENUM ('ACCEPTED', 'CORRECTED', 'REJECTED', 'REPROCESS_REQUESTED', 'UNREADABLE', 'PUBLISHED_FROM_REVIEW');

-- CreateEnum
CREATE TYPE "ReviewedFactCorrectionSource" AS ENUM ('ACCEPTED_MACHINE', 'MANUAL_CORRECTION');

-- CreateEnum
CREATE TYPE "PdfTrainingLabelType" AS ENUM ('DOCUMENT_CLASS', 'PAGE_SECTION', 'UNIT_SCALE', 'YEAR_COLUMN', 'FACT_VALUE', 'STATEMENT_ROW', 'BOARD_REPORT_TEXT', 'AUDITOR_REPORT_TEXT', 'AUDITOR_OPINION', 'PARSER_ROUTE', 'FAILURE_REASON', 'WIDE_NUMBER_RECONSTRUCTION');

-- CreateEnum
CREATE TYPE "UnifiedExtractionReviewFeedbackAction" AS ENUM ('ACCEPT_MACHINE_EXTRACTION', 'REJECT_MACHINE_EXTRACTION', 'MARK_NEEDS_REVIEW', 'CORRECT_LINE_ITEM', 'CORRECT_SECTION_CLASSIFICATION', 'CORRECT_UNIT_SCALE', 'CORRECT_CANONICAL_KEY', 'CORRECT_PROVENANCE');

-- CreateEnum
CREATE TYPE "UnifiedExtractionReviewTargetType" AS ENUM ('FULL_EXTRACTION', 'FINANCIAL_LINE_ITEM', 'NARRATIVE_SECTION', 'UNIT_SCALE', 'CANONICAL_KEY', 'PROVENANCE', 'CHECK');

-- CreateEnum
CREATE TYPE "PdfDecisionGoldSetStatus" AS ENUM ('CANDIDATE', 'APPROVED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "PdfDecisionGoldSetReason" AS ENUM ('LOW_RISK_FAILED', 'HIGH_RISK_SUCCEEDED', 'MANUAL_CORRECTION', 'UNREADABLE', 'REPROCESS_REQUESTED', 'BALANCE_MISMATCH', 'ROUTE_MISMATCH', 'OCR_RISK', 'REPRESENTATIVE_SAMPLE', 'OTHER');

-- CreateEnum
CREATE TYPE "PdfModelArtifactKind" AS ENUM ('SHADOW_MODEL_EVALUATION', 'SHADOW_MODEL_ANALYSIS', 'SHADOW_VS_RULE_GATE', 'MODEL_REGISTRY_MANIFEST', 'PARSER_ROUTE_SHADOW_EXECUTION', 'PARSER_ROUTE_RECOMMENDATION_V2', 'PARSER_ROUTE_CANARY_PREVIEW', 'UNIFIED_PARSER_DOCUMENT', 'UNIFIED_FINANCIAL_EXTRACTION', 'UNIFIED_NARRATIVE_EXTRACTION', 'LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON', 'UNIFIED_EXTRACTION_CONFIDENCE_GATE');

-- CreateEnum
CREATE TYPE "PdfModelArtifactStatus" AS ENUM ('CREATED', 'SUPERSEDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PdfModelCandidateStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED_FOR_SHADOW', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PdfModelCandidateDecisionType" AS ENUM ('SUBMITTED_FOR_REVIEW', 'APPROVED_FOR_SHADOW', 'REJECTED', 'ARCHIVED', 'COMMENTED');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'DISSOLVED', 'BANKRUPT');

-- CreateEnum
CREATE TYPE "DistressStatus" AS ENUM ('RECONSTRUCTION', 'BANKRUPTCY', 'LIQUIDATION', 'FORCED_PROCESS', 'FOREIGN_INSOLVENCY', 'OTHER_DISTRESS');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('BUSINESS', 'POSTAL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('FREE', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "WorkspaceType" AS ENUM ('PERSONAL', 'TEAM');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkspaceMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "WorkspaceInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "DdRoomStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DdTaskStage" AS ENUM ('COLLECTION', 'COMPANY_UNDERSTANDING', 'MANAGEMENT_OWNERSHIP', 'FINANCIAL_REVIEW', 'LEGAL_REGULATORY', 'RISK_ASSESSMENT', 'CONCLUSION');

-- CreateEnum
CREATE TYPE "DdTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE');

-- CreateEnum
CREATE TYPE "DdTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "DdWorkstream" AS ENUM ('FINANCIAL', 'COMMERCIAL', 'LEGAL', 'OPERATIONAL', 'REGULATORY', 'ESG');

-- CreateEnum
CREATE TYPE "DdFindingSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DdFindingStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'MITIGATED', 'ACCEPTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DdFindingImpact" AS ENUM ('NONE', 'THESIS_RISK', 'VALUATION', 'DOWNSIDE', 'UPSIDE', 'MONITORING', 'NO_GO');

-- CreateEnum
CREATE TYPE "DdFindingEvidenceType" AS ENUM ('COMPANY', 'ANNOUNCEMENT', 'FINANCIAL_STATEMENT', 'COMPANY_PROFILE_FIELD', 'TASK', 'FINDING', 'PETROLEUM_ENTITY', 'PETROLEUM_EVENT', 'PETROLEUM_SERIES');

-- CreateEnum
CREATE TYPE "DdCompanyProfileField" AS ENUM ('STATUS', 'LEGAL_FORM', 'INDUSTRY_CODE', 'EMPLOYEE_COUNT', 'REVENUE', 'DESCRIPTION');

-- CreateEnum
CREATE TYPE "DdDecisionOutcome" AS ENUM ('INVEST', 'INVEST_WITH_CONDITIONS', 'WATCH', 'PASS');

-- CreateEnum
CREATE TYPE "DdCommentThreadTargetType" AS ENUM ('ROOM_POST', 'ANNOUNCEMENT', 'FINANCIAL_STATEMENT', 'FINDING', 'TASK');

-- CreateEnum
CREATE TYPE "WorkspaceWatchStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkspaceNotificationType" AS ENUM ('ANNOUNCEMENT_NEW', 'FINANCIAL_STATEMENT_NEW', 'COMPANY_STATUS_CHANGED', 'DISTRESS_MATCH');

-- CreateEnum
CREATE TYPE "AdminNotificationType" AS ENUM ('CALIBRATION_PROPOSED', 'PATTERN_DETECTED', 'TRAINING_MILESTONE', 'ENGINE_PROMOTION_OBSERVED');

-- CreateEnum
CREATE TYPE "AdminNotificationStatus" AS ENUM ('UNREAD', 'READ', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ConfidenceThresholdStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'RETIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WorkspaceMonitorStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ShareholderType" AS ENUM ('PERSON', 'COMPANY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ShareholdingSourceSystem" AS ENUM ('SKATTEETATEN_CSV', 'SKATTEETATEN_API');

-- CreateEnum
CREATE TYPE "ShareholdingImportStatus" AS ENUM ('COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "ShareholdingGraphNodeType" AS ENUM ('COMPANY', 'PERSON', 'COMPANY_SHAREHOLDER', 'UNKNOWN_SHAREHOLDER');

-- CreateEnum
CREATE TYPE "PetroleumEntityType" AS ENUM ('FIELD', 'DISCOVERY', 'LICENCE', 'FACILITY', 'TUF', 'SURVEY', 'WELLBORE');

-- CreateEnum
CREATE TYPE "PetroleumWatchEntityType" AS ENUM ('FIELD', 'DISCOVERY', 'LICENCE', 'FACILITY', 'TUF', 'OPERATOR', 'COMPANY_EXPOSURE');

-- CreateEnum
CREATE TYPE "AnnualReportFilingStatus" AS ENUM ('DISCOVERED', 'DOWNLOADED', 'PROCESSING', 'PREFLIGHTED', 'EXTRACTED', 'VALIDATED', 'PUBLISHED', 'FAILED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "AnnualReportReviewStatus" AS ENUM ('PENDING_REVIEW', 'ACCEPTED', 'REJECTED', 'REPROCESS_REQUESTED', 'RESOLVED_BY_NEW_RUN');

-- CreateEnum
CREATE TYPE "AnnualReportArtifactType" AS ENUM ('PDF', 'PAGE_IMAGE', 'OCR_TEXT', 'OCR_TSV', 'TABLE_JSON', 'EXTRACTION_JSON', 'NORMALIZED_JSON', 'PREFLIGHT_JSON', 'CLASSIFICATION_JSON', 'DOCUMENT_JSON', 'DOCUMENT_MARKDOWN', 'ANNOTATED_PDF', 'DOCUMENT_NORMALIZED_JSON', 'EXTRACTION_COMPARISON_JSON', 'STRUCTURED_DOCUMENT_JSON', 'PDF_DECISION_JSON');

-- CreateEnum
CREATE TYPE "FinancialExtractionRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "FinancialFactStatementType" AS ENUM ('INCOME_STATEMENT', 'BALANCE_SHEET', 'CASH_FLOW', 'NOTE');

-- CreateEnum
CREATE TYPE "FinancialValidationSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "CompanyFinancialCoverageStatus" AS ENUM ('UNCHECKED', 'DISCOVERED', 'PARTIAL', 'PUBLISHED', 'FAILED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "FinancialStatementQualityStatus" AS ENUM ('HIGH_CONFIDENCE', 'LOW_CONFIDENCE', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "FinancialStatementSourcePrecedence" AS ENUM ('MACHINE_READABLE', 'STATUTORY_NOK', 'SUPPLEMENTARY_NOK_THOUSANDS', 'NOTE_DERIVED');

-- CreateEnum
CREATE TYPE "ExtractionPatternErrorClass" AS ENUM ('UNIT_SCALE_MISS', 'OCR_NOISE', 'MISSING_VALUE', 'WRONG_PAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "ExtractionPatternReportStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MlTaskType" AS ENUM ('UNIT_SCALE_CLASSIFIER', 'PAGE_TYPE_CLASSIFIER', 'YEAR_COLUMN_DETECTOR', 'OTHER');

-- CreateEnum
CREATE TYPE "MlModelStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'RETIRED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "passwordHash" TEXT,
    "image" TEXT,
    "lastWorkspaceId" TEXT,
    "appRole" "AppRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'FREE',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WorkspaceType" NOT NULL,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "personalOwnerId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceInvitation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "WorkspaceMemberRole" NOT NULL DEFAULT 'MEMBER',
    "token" TEXT NOT NULL,
    "status" "WorkspaceInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "invitedByUserId" TEXT NOT NULL,
    "acceptedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "orgNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalForm" TEXT,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusObservedAt" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3),
    "foundedAt" TIMESTAMP(3),
    "website" TEXT,
    "employeeCount" INTEGER,
    "revenue" INTEGER,
    "operatingProfit" INTEGER,
    "netIncome" INTEGER,
    "equity" INTEGER,
    "description" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "industryCodeId" TEXT,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyDistressProfile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "distressStatus" "DistressStatus" NOT NULL,
    "statusStartedAt" TIMESTAMP(3),
    "statusObservedAt" TIMESTAMP(3) NOT NULL,
    "daysInStatus" INTEGER,
    "bankruptcyDate" TIMESTAMP(3),
    "liquidationDate" TIMESTAMP(3),
    "forcedProcessDate" TIMESTAMP(3),
    "reconstructionDate" TIMESTAMP(3),
    "foreignInsolvencyDate" TIMESTAMP(3),
    "lastAnnouncementPublishedAt" TIMESTAMP(3),
    "lastAnnouncementTitle" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyDistressProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistressFinancialSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "distressStatus" "DistressStatus" NOT NULL,
    "daysInStatus" INTEGER,
    "industryCode" TEXT,
    "sectorCode" TEXT,
    "sectorLabel" TEXT,
    "lastReportedYear" INTEGER,
    "revenue" BIGINT,
    "ebit" BIGINT,
    "netIncome" BIGINT,
    "equityRatio" DECIMAL(8,2),
    "assets" BIGINT,
    "interestBearingDebt" BIGINT,
    "distressScore" INTEGER,
    "scoreVersion" TEXT,
    "dataCoverage" TEXT,
    "sourceSystem" TEXT,
    "sourceEntityType" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistressFinancialSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistressSyncState" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "lastUpdateId" INTEGER,
    "lastRunAt" TIMESTAMP(3),
    "lastBootstrapAt" TIMESTAMP(3),
    "etag" TEXT,
    "lastModified" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistressSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineJobLease" (
    "id" TEXT NOT NULL,
    "jobKey" TEXT NOT NULL,
    "leaseOwner" TEXT NOT NULL,
    "leaseAcquiredAt" TIMESTAMP(3) NOT NULL,
    "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
    "lastHeartbeatAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineJobLease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "birthYear" INTEGER,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isBoardRole" BOOLEAN NOT NULL DEFAULT false,
    "fromDate" TIMESTAMP(3),
    "toDate" TIMESTAMP(3),
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialStatement" (
    "id" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NOK',
    "revenue" BIGINT,
    "operatingProfit" BIGINT,
    "netIncome" BIGINT,
    "equity" BIGINT,
    "assets" BIGINT,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "sourceFilingId" TEXT,
    "sourceExtractionRunId" TEXT,
    "qualityStatus" "FinancialStatementQualityStatus" NOT NULL DEFAULT 'MANUAL_REVIEW',
    "qualityScore" DOUBLE PRECISION,
    "unitScale" INTEGER,
    "sourcePrecedence" "FinancialStatementSourcePrecedence",
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "FinancialStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnualReportFiling" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceDiscoveryKey" TEXT NOT NULL,
    "sourceIdempotencyKey" TEXT NOT NULL,
    "sourceDocumentHash" TEXT,
    "sourceDocumentType" TEXT NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL,
    "downloadedAt" TIMESTAMP(3),
    "processingStartedAt" TIMESTAMP(3),
    "preflightedAt" TIMESTAMP(3),
    "extractedAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "publishedSnapshotAt" TIMESTAMP(3),
    "manualReviewAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "status" "AnnualReportFilingStatus" NOT NULL DEFAULT 'DISCOVERED',
    "unitHints" JSONB,
    "metadata" JSONB,
    "parserVersionLastTried" TEXT,
    "lastError" TEXT,
    "isLatestForFiscalYear" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnualReportFiling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnualReportArtifact" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "artifactType" "AnnualReportArtifactType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnualReportArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialExtractionRun" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "documentEngine" TEXT,
    "documentEngineVersion" TEXT,
    "documentEngineMode" TEXT,
    "ocrEngine" TEXT,
    "ocrLanguage" TEXT,
    "status" "FinancialExtractionRunStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "confidenceScore" DOUBLE PRECISION,
    "validationScore" DOUBLE PRECISION,
    "metricsCoverage" JSONB,
    "errorMessage" TEXT,
    "rawSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialExtractionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialFact" (
    "id" TEXT NOT NULL,
    "extractionRunId" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "statementType" "FinancialFactStatementType" NOT NULL,
    "metricKey" TEXT NOT NULL,
    "rawLabel" TEXT,
    "normalizedLabel" TEXT,
    "value" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'NOK',
    "unitScale" INTEGER NOT NULL DEFAULT 1,
    "sourcePage" INTEGER,
    "sourceSection" TEXT,
    "sourceRowText" TEXT,
    "noteReference" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "isDerived" BOOLEAN NOT NULL DEFAULT false,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialValidationIssue" (
    "id" TEXT NOT NULL,
    "extractionRunId" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "severity" "FinancialValidationSeverity" NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "expectedValue" BIGINT,
    "actualValue" BIGINT,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialValidationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawFinancialLineItem" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "extractionRunId" TEXT,
    "companyId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "statementType" "FinancialFactStatementType" NOT NULL,
    "originalLabel" TEXT NOT NULL,
    "originalValue" TEXT NOT NULL,
    "parsedValue" BIGINT,
    "canonicalKey" TEXT,
    "unitScale" INTEGER NOT NULL DEFAULT 1,
    "sourcePage" INTEGER,
    "rowIndex" INTEGER,
    "extractionRoute" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawFinancialLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyFinancialCoverage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "latestDiscoveredFiscalYear" INTEGER,
    "latestDownloadedFiscalYear" INTEGER,
    "latestPublishedFiscalYear" INTEGER,
    "lastCheckedAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "coverageStatus" "CompanyFinancialCoverageStatus" NOT NULL DEFAULT 'UNCHECKED',
    "latestSuccessfulFilingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyFinancialCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnualReportReview" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "extractionRunId" TEXT,
    "companyId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "status" "AnnualReportReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "qualityScore" DOUBLE PRECISION,
    "sourcePrecedenceAttempted" TEXT,
    "blockingIssueCount" INTEGER NOT NULL DEFAULT 0,
    "blockingRuleCodes" TEXT[],
    "pageReferences" INTEGER[],
    "latestActionNote" TEXT,
    "reviewPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "AnnualReportReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnualReportReviewDecision" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "extractionRunId" TEXT,
    "companyId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "reviewerUserId" TEXT NOT NULL,
    "decisionType" "AnnualReportReviewDecisionType" NOT NULL,
    "beforePayload" JSONB,
    "afterPayload" JSONB,
    "correctionNotes" TEXT,
    "validationPassed" BOOLEAN,
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnualReportReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfTrainingLabel" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "extractionRunId" TEXT,
    "reviewId" TEXT,
    "reviewerUserId" TEXT NOT NULL,
    "labelType" "PdfTrainingLabelType" NOT NULL,
    "targetRef" JSONB,
    "proposedValue" JSONB,
    "acceptedValue" JSONB,
    "sourcePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdfTrainingLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnifiedExtractionReviewFeedback" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "orgNumber" TEXT,
    "fiscalYear" INTEGER,
    "reviewerUserId" TEXT NOT NULL,
    "confidenceGateArtifactId" TEXT,
    "sourceArtifactIds" JSONB,
    "action" "UnifiedExtractionReviewFeedbackAction" NOT NULL,
    "targetType" "UnifiedExtractionReviewTargetType" NOT NULL,
    "targetRef" JSONB,
    "proposedValue" JSONB,
    "acceptedValue" JSONB,
    "reason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnifiedExtractionReviewFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfDecisionGoldSetItem" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "extractionRunId" TEXT,
    "orgNumber" TEXT,
    "fiscalYear" INTEGER,
    "status" "PdfDecisionGoldSetStatus" NOT NULL DEFAULT 'CANDIDATE',
    "reason" "PdfDecisionGoldSetReason" NOT NULL DEFAULT 'OTHER',
    "note" TEXT,
    "decisionRoute" TEXT,
    "riskLevel" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "outcome" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ADMIN',
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdfDecisionGoldSetItem_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "PdfModelCandidate" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "modelTarget" TEXT NOT NULL,
    "algorithm" TEXT,
    "featureSchemaVersion" TEXT,
    "status" "PdfModelCandidateStatus" NOT NULL DEFAULT 'DRAFT',
    "manifestArtifactId" TEXT,
    "gateArtifactId" TEXT,
    "analysisArtifactId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdfModelCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfModelCandidateDecision" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "decisionType" "PdfModelCandidateDecisionType" NOT NULL,
    "note" TEXT,
    "payload" JSONB,
    "decidedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdfModelCandidateDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnualReportReviewedFact" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "extractionRunId" TEXT,
    "companyId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "metricKey" TEXT NOT NULL,
    "statementType" "FinancialFactStatementType" NOT NULL,
    "value" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'NOK',
    "unitScale" INTEGER NOT NULL DEFAULT 1,
    "sourcePage" INTEGER,
    "rawLabel" TEXT,
    "correctionSource" "ReviewedFactCorrectionSource" NOT NULL,
    "reviewerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnualReportReviewedFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "type" "AddressType" NOT NULL DEFAULT 'BUSINESS',
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "postalCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "country" TEXT NOT NULL DEFAULT 'NO',
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumSyncState" (
    "key" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "status" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumSyncState_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PetroleumCompanyLink" (
    "id" TEXT NOT NULL,
    "npdCompanyId" INTEGER NOT NULL,
    "companyName" TEXT NOT NULL,
    "orgNumber" TEXT,
    "factPageUrl" TEXT,
    "activeOnNcsCurrent" BOOLEAN,
    "activeOnNcsFormer" BOOLEAN,
    "licenceOperatorCurrent" BOOLEAN,
    "licenceLicenseeCurrent" BOOLEAN,
    "tufOperatorCurrent" BOOLEAN,
    "tufPartnerCurrent" BOOLEAN,
    "linkedCompanyOrgNumber" TEXT,
    "linkedCompanySlug" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumCompanyLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumField" (
    "id" TEXT NOT NULL,
    "npdId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "activityStatus" TEXT,
    "discoveryYear" INTEGER,
    "ownerKind" TEXT,
    "ownerName" TEXT,
    "operatorCompanyName" TEXT,
    "operatorNpdCompanyId" INTEGER,
    "operatorOrgNumber" TEXT,
    "operatorCompanySlug" TEXT,
    "mainSupplyBase" TEXT,
    "hydrocarbonType" TEXT,
    "mainArea" TEXT,
    "discoveryWellboreName" TEXT,
    "factPageUrl" TEXT,
    "factMapUrl" TEXT,
    "geometry" JSONB,
    "bbox" JSONB,
    "centroid" JSONB,
    "operatorHistory" JSONB,
    "licensees" JSONB,
    "ownerHistory" JSONB,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumDiscovery" (
    "id" TEXT NOT NULL,
    "npdId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "activityStatus" TEXT,
    "discoveryYear" INTEGER,
    "ownerKind" TEXT,
    "ownerName" TEXT,
    "operatorCompanyName" TEXT,
    "operatorNpdCompanyId" INTEGER,
    "operatorOrgNumber" TEXT,
    "operatorCompanySlug" TEXT,
    "hydrocarbonType" TEXT,
    "areaName" TEXT,
    "relatedFieldName" TEXT,
    "relatedFieldNpdId" INTEGER,
    "factPageUrl" TEXT,
    "factMapUrl" TEXT,
    "geometry" JSONB,
    "bbox" JSONB,
    "centroid" JSONB,
    "operatorHistory" JSONB,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumDiscovery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumLicence" (
    "id" TEXT NOT NULL,
    "npdId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "licensingActivityName" TEXT,
    "status" TEXT,
    "active" BOOLEAN,
    "stratigraphical" TEXT,
    "currentPhase" TEXT,
    "mainArea" TEXT,
    "operatorCompanyName" TEXT,
    "operatorNpdCompanyId" INTEGER,
    "operatorOrgNumber" TEXT,
    "operatorCompanySlug" TEXT,
    "grantedAt" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "originalAreaSqKm" DOUBLE PRECISION,
    "currentAreaSqKm" DOUBLE PRECISION,
    "factPageUrl" TEXT,
    "factMapUrl" TEXT,
    "geometry" JSONB,
    "bbox" JSONB,
    "centroid" JSONB,
    "licensees" JSONB,
    "transfers" JSONB,
    "registerMessages" JSONB,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumLicence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumFacility" (
    "id" TEXT NOT NULL,
    "npdId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fixedOrMoveable" TEXT,
    "kind" TEXT,
    "phase" TEXT,
    "functions" TEXT,
    "waterDepth" DOUBLE PRECISION,
    "designLifetime" INTEGER,
    "startupDate" TIMESTAMP(3),
    "belongsToName" TEXT,
    "belongsToKind" TEXT,
    "currentOperatorName" TEXT,
    "currentOperatorNpdId" INTEGER,
    "currentOperatorOrgNumber" TEXT,
    "currentOperatorSlug" TEXT,
    "factPageUrl" TEXT,
    "factMapUrl" TEXT,
    "geometry" JSONB,
    "bbox" JSONB,
    "centroid" JSONB,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumFacility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumTuf" (
    "id" TEXT NOT NULL,
    "npdId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currentPhase" TEXT,
    "mainGroupingName" TEXT,
    "medium" TEXT,
    "belongsToName" TEXT,
    "belongsToNpdId" INTEGER,
    "operatorCompanyName" TEXT,
    "operatorNpdCompanyId" INTEGER,
    "operatorOrgNumber" TEXT,
    "operatorCompanySlug" TEXT,
    "fromFacilityName" TEXT,
    "toFacilityName" TEXT,
    "dimensionInch" DOUBLE PRECISION,
    "waterDepth" DOUBLE PRECISION,
    "factPageUrl" TEXT,
    "factMapUrl" TEXT,
    "geometry" JSONB,
    "bbox" JSONB,
    "centroid" JSONB,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumTuf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumSurvey" (
    "id" TEXT NOT NULL,
    "npdId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "category" TEXT,
    "mainType" TEXT,
    "subType" TEXT,
    "geographicalArea" TEXT,
    "companyName" TEXT,
    "companyNpdId" INTEGER,
    "startedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "plannedFromDate" TIMESTAMP(3),
    "plannedToDate" TIMESTAMP(3),
    "factPageUrl" TEXT,
    "geometry" JSONB,
    "bbox" JSONB,
    "centroid" JSONB,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumWellbore" (
    "id" TEXT NOT NULL,
    "npdId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "wellName" TEXT,
    "drillingOperatorName" TEXT,
    "drillingOperatorNpdCompanyId" INTEGER,
    "drillingOperatorOrgNumber" TEXT,
    "drillingOperatorSlug" TEXT,
    "productionLicence" TEXT,
    "purpose" TEXT,
    "status" TEXT,
    "content" TEXT,
    "wellType" TEXT,
    "entryDate" TIMESTAMP(3),
    "completionDate" TIMESTAMP(3),
    "fieldName" TEXT,
    "discoveryName" TEXT,
    "drillPermit" TEXT,
    "totalDepth" DOUBLE PRECISION,
    "finalVerticalDepth" DOUBLE PRECISION,
    "waterDepth" DOUBLE PRECISION,
    "mainArea" TEXT,
    "drillingFacility" TEXT,
    "productionFacility" TEXT,
    "licensingActivity" TEXT,
    "factPageUrl" TEXT,
    "geometry" JSONB,
    "bbox" JSONB,
    "centroid" JSONB,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumWellbore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumProductionPoint" (
    "id" TEXT NOT NULL,
    "entityType" "PetroleumEntityType" NOT NULL,
    "entityNpdId" INTEGER NOT NULL,
    "entityName" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "period" TEXT,
    "oilNetMillSm3" DOUBLE PRECISION,
    "gasNetBillSm3" DOUBLE PRECISION,
    "condensateNetMillSm3" DOUBLE PRECISION,
    "nglNetMillSm3" DOUBLE PRECISION,
    "oeNetMillSm3" DOUBLE PRECISION,
    "producedWaterMillSm3" DOUBLE PRECISION,
    "investmentsMillNok" DOUBLE PRECISION,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumProductionPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumReserveSnapshot" (
    "id" TEXT NOT NULL,
    "entityType" "PetroleumEntityType" NOT NULL,
    "entityNpdId" INTEGER NOT NULL,
    "entityName" TEXT NOT NULL,
    "updatedAtSource" TIMESTAMP(3),
    "recoverableOil" DOUBLE PRECISION,
    "recoverableGas" DOUBLE PRECISION,
    "recoverableNgl" DOUBLE PRECISION,
    "recoverableCondensate" DOUBLE PRECISION,
    "recoverableOe" DOUBLE PRECISION,
    "remainingOil" DOUBLE PRECISION,
    "remainingGas" DOUBLE PRECISION,
    "remainingNgl" DOUBLE PRECISION,
    "remainingCondensate" DOUBLE PRECISION,
    "remainingOe" DOUBLE PRECISION,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumReserveSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumInvestmentSnapshot" (
    "id" TEXT NOT NULL,
    "entityType" "PetroleumEntityType" NOT NULL,
    "entityNpdId" INTEGER NOT NULL,
    "entityName" TEXT NOT NULL,
    "expectedFutureInvestmentMillNok" INTEGER,
    "fixedYear" INTEGER,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumInvestmentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumFieldSnapshot" (
    "id" TEXT NOT NULL,
    "fieldNpdId" INTEGER NOT NULL,
    "fieldSlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" TEXT,
    "status" TEXT,
    "hcType" TEXT,
    "operatorNpdCompanyId" INTEGER,
    "operatorName" TEXT,
    "operatorOrgNumber" TEXT,
    "operatorSlug" TEXT,
    "licenseeCompanyIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "latestAnnualOe" DOUBLE PRECISION,
    "latestMonthlyOe" DOUBLE PRECISION,
    "latestSelectedProductionOil" DOUBLE PRECISION,
    "latestSelectedProductionGas" DOUBLE PRECISION,
    "latestSelectedProductionLiquids" DOUBLE PRECISION,
    "latestSelectedProductionOe" DOUBLE PRECISION,
    "remainingOe" DOUBLE PRECISION,
    "recoverableOe" DOUBLE PRECISION,
    "expectedFutureInvestmentNok" BIGINT,
    "yoyYtdDeltaPercent" DOUBLE PRECISION,
    "currentMonthDeltaPercent" DOUBLE PRECISION,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumFieldSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumLicenceSnapshot" (
    "id" TEXT NOT NULL,
    "licenceNpdId" INTEGER NOT NULL,
    "licenceSlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" TEXT,
    "status" TEXT,
    "active" BOOLEAN,
    "currentPhase" TEXT,
    "operatorNpdCompanyId" INTEGER,
    "operatorName" TEXT,
    "operatorOrgNumber" TEXT,
    "operatorSlug" TEXT,
    "licenseeCompanyIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "currentAreaSqKm" DOUBLE PRECISION,
    "originalAreaSqKm" DOUBLE PRECISION,
    "transferCount" INTEGER NOT NULL DEFAULT 0,
    "licenseeCount" INTEGER NOT NULL DEFAULT 0,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumLicenceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumOperatorSnapshot" (
    "id" TEXT NOT NULL,
    "npdCompanyId" INTEGER NOT NULL,
    "operatorName" TEXT NOT NULL,
    "orgNumber" TEXT,
    "slug" TEXT,
    "fieldCount" INTEGER NOT NULL DEFAULT 0,
    "licenceCount" INTEGER NOT NULL DEFAULT 0,
    "discoveryCount" INTEGER NOT NULL DEFAULT 0,
    "facilityCount" INTEGER NOT NULL DEFAULT 0,
    "latestProductionOe" DOUBLE PRECISION,
    "remainingOe" DOUBLE PRECISION,
    "expectedFutureInvestmentNok" BIGINT,
    "mainAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mainHydrocarbonTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumOperatorSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumAreaSnapshot" (
    "id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "fieldCount" INTEGER NOT NULL DEFAULT 0,
    "licenceCount" INTEGER NOT NULL DEFAULT 0,
    "operatorCount" INTEGER NOT NULL DEFAULT 0,
    "latestProductionOe" DOUBLE PRECISION,
    "remainingOe" DOUBLE PRECISION,
    "expectedFutureInvestmentNok" BIGINT,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumAreaSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumMapFeatureSnapshot" (
    "id" TEXT NOT NULL,
    "layerId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityNpdId" INTEGER NOT NULL,
    "entitySlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "area" TEXT,
    "hcType" TEXT,
    "operatorNpdCompanyId" INTEGER,
    "operatorName" TEXT,
    "operatorOrgNumber" TEXT,
    "operatorSlug" TEXT,
    "relatedFieldName" TEXT,
    "latestProductionOe" DOUBLE PRECISION,
    "latestProductionOil" DOUBLE PRECISION,
    "latestProductionGas" DOUBLE PRECISION,
    "latestProductionLiquids" DOUBLE PRECISION,
    "remainingOe" DOUBLE PRECISION,
    "expectedFutureInvestmentNok" BIGINT,
    "productionYoYPercent" DOUBLE PRECISION,
    "currentAreaSqKm" DOUBLE PRECISION,
    "transferCount" INTEGER,
    "facilityKind" TEXT,
    "category" TEXT,
    "subType" TEXT,
    "companyName" TEXT,
    "surveyYear" INTEGER,
    "startedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "plannedFromDate" TIMESTAMP(3),
    "plannedToDate" TIMESTAMP(3),
    "wellType" TEXT,
    "purpose" TEXT,
    "waterDepth" DOUBLE PRECISION,
    "totalDepth" DOUBLE PRECISION,
    "detailUrl" TEXT,
    "factPageUrl" TEXT,
    "factMapUrl" TEXT,
    "geometry" JSONB NOT NULL,
    "bbox" JSONB,
    "centroid" JSONB,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumMapFeatureSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumForecastSnapshot" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "publishedAt" TIMESTAMP(3),
    "horizonLabel" TEXT,
    "appliesToProduct" TEXT,
    "forecastScopeLabel" TEXT,
    "trendLabel" TEXT,
    "declineRatePercent" DOUBLE PRECISION,
    "investmentLevelNok" BIGINT,
    "detailUrl" TEXT,
    "backgroundDataUrl" TEXT,
    "keyPoints" JSONB,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumForecastSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumPublicationSnapshot" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "publishedAt" TIMESTAMP(3),
    "detailUrl" TEXT NOT NULL,
    "backgroundDataUrl" TEXT,
    "pdfUrl" TEXT,
    "sheetNames" JSONB,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumPublicationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumEvent" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "publishedAt" TIMESTAMP(3),
    "detailUrl" TEXT,
    "entityType" "PetroleumEntityType",
    "entityNpdId" INTEGER,
    "entityName" TEXT,
    "relatedCompanyName" TEXT,
    "relatedCompanyOrgNumber" TEXT,
    "relatedCompanySlug" TEXT,
    "geometry" JSONB,
    "centroid" JSONB,
    "tags" JSONB,
    "metrics" JSONB,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumMarketSeries" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "region" TEXT,
    "countryCode" TEXT,
    "product" TEXT,
    "unit" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumMarketSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumMarketObservation" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "observationDate" TIMESTAMP(3) NOT NULL,
    "year" INTEGER,
    "month" INTEGER,
    "quarter" INTEGER,
    "value" DECIMAL(20,6),
    "valueText" TEXT,
    "metadata" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumMarketObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumFiscalRegimeSnapshot" (
    "id" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "taxRate" DECIMAL(8,4),
    "specialTaxRate" DECIMAL(8,4),
    "normPriceReference" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "detailUrl" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumFiscalRegimeSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumCompanyExposureSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "npdCompanyId" INTEGER,
    "operatorFieldCount" INTEGER NOT NULL DEFAULT 0,
    "licenceCount" INTEGER NOT NULL DEFAULT 0,
    "operatedProductionOe" DOUBLE PRECISION,
    "attributableProductionOe" DOUBLE PRECISION,
    "remainingReservesOe" DOUBLE PRECISION,
    "expectedFutureInvestmentNok" BIGINT,
    "mainAreas" JSONB,
    "metadata" JSONB,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetroleumCompanyExposureSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetroleumWorkspaceWatch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "entityType" "PetroleumWatchEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityNpdId" INTEGER,
    "status" "WorkspaceWatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastObservedEventAt" TIMESTAMP(3),
    "metadata" JSONB,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT,

    CONSTRAINT "PetroleumWorkspaceWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndustryCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "level" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,

    CONSTRAINT "IndustryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DdRoom" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "primaryCompanyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "DdRoomStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DdRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DdTask" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "stage" "DdTaskStage" NOT NULL,
    "workstream" "DdWorkstream",
    "status" "DdTaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "DdTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "assigneeUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DdTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DdMandate" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "investmentCase" TEXT,
    "thesis" TEXT,
    "valueDrivers" TEXT,
    "keyRisks" TEXT,
    "timeHorizon" TEXT,
    "decisionGoal" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DdMandate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DdFinding" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "taskId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "stage" "DdTaskStage" NOT NULL,
    "workstream" "DdWorkstream" NOT NULL,
    "severity" "DdFindingSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "DdFindingStatus" NOT NULL DEFAULT 'OPEN',
    "impact" "DdFindingImpact" NOT NULL DEFAULT 'NONE',
    "recommendedAction" TEXT,
    "isBlocking" BOOLEAN NOT NULL DEFAULT false,
    "dueAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "assigneeUserId" TEXT,
    "handoffWatchId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DdFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DdFindingEvidence" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "type" "DdFindingEvidenceType" NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3),
    "normalizedAt" TIMESTAMP(3),
    "targetCompanyId" TEXT,
    "targetFinancialStatementId" TEXT,
    "targetTaskId" TEXT,
    "targetFindingId" TEXT,
    "targetAnnouncementId" TEXT,
    "targetAnnouncementSourceId" TEXT,
    "targetAnnouncementSourceSystem" TEXT,
    "targetAnnouncementPublishedAt" TIMESTAMP(3),
    "targetCompanyProfileField" "DdCompanyProfileField",
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DdFindingEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DdConclusion" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "investmentCaseSummary" TEXT,
    "valueDriversSummary" TEXT,
    "keyRisksSummary" TEXT,
    "recommendationRationale" TEXT,
    "monitoringPlan" TEXT,
    "outcome" "DdDecisionOutcome",
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DdConclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DdDecisionLogEntry" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "conclusionId" TEXT,
    "outcome" "DdDecisionOutcome",
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "investmentCaseSummary" TEXT,
    "valueDriversSummary" TEXT,
    "keyRisksSummary" TEXT,
    "recommendationRationale" TEXT,
    "monitoringPlan" TEXT,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DdDecisionLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DdPost" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DdPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DdCommentThread" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "targetType" "DdCommentThreadTargetType" NOT NULL,
    "targetCompanyId" TEXT,
    "targetAnnouncementId" TEXT,
    "targetAnnouncementSourceId" TEXT,
    "targetAnnouncementSourceSystem" TEXT,
    "targetAnnouncementPublishedAt" TIMESTAMP(3),
    "targetFinancialStatementId" TEXT,
    "targetFinancialMetricKey" TEXT,
    "targetPostId" TEXT,
    "targetFindingId" TEXT,
    "targetTaskId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DdCommentThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DdComment" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "parentCommentId" TEXT,
    "content" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DdComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceWatch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "WorkspaceWatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "watchAnnouncements" BOOLEAN NOT NULL DEFAULT true,
    "watchFinancialStatements" BOOLEAN NOT NULL DEFAULT true,
    "watchStatusChanges" BOOLEAN NOT NULL DEFAULT true,
    "lastAnnouncementPublishedAt" TIMESTAMP(3),
    "lastFinancialStatementYear" INTEGER,
    "lastObservedCompanyStatus" "CompanyStatus",
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceNotification" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "WorkspaceNotificationType" NOT NULL,
    "watchId" TEXT,
    "companyId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "WorkspaceNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMonitor" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WorkspaceMonitorStatus" NOT NULL DEFAULT 'ACTIVE',
    "industryCodePrefix" TEXT,
    "minEmployees" INTEGER,
    "maxEmployees" INTEGER,
    "minRevenue" INTEGER,
    "maxRevenue" INTEGER,
    "companyStatus" "CompanyStatus",
    "minimumDaysInStatus" INTEGER,
    "unsupportedReason" TEXT,
    "lastEvaluatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMonitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareholdingRawSource" (
    "id" TEXT NOT NULL,
    "companyOrgNumber" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "sourceSystem" "ShareholdingSourceSystem" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL,
    "rawText" TEXT NOT NULL,
    "parsedRowCount" INTEGER,
    "status" "ShareholdingImportStatus" NOT NULL DEFAULT 'COMPLETED',
    "sourceMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareholdingRawSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareholdingSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "totalShares" BIGINT,
    "sourceSystem" "ShareholdingSourceSystem" NOT NULL,
    "sourceImportedAt" TIMESTAMP(3) NOT NULL,
    "shareholderCount" INTEGER NOT NULL DEFAULT 0,
    "latestAvailableYear" INTEGER,
    "dataQualityNote" TEXT,
    "graphVersion" TEXT,
    "graphPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "rawSourceId" TEXT,

    CONSTRAINT "ShareholdingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shareholder" (
    "id" TEXT NOT NULL,
    "type" "ShareholderType" NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "birthYear" INTEGER,
    "postalCode" TEXT,
    "postalPlace" TEXT,
    "externalIdentifier" TEXT,
    "fingerprint" TEXT NOT NULL,
    "linkedCompanyId" TEXT,
    "matchConfidence" DECIMAL(5,4),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shareholder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ownership" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "shareholderId" TEXT NOT NULL,
    "shareClass" TEXT,
    "numberOfShares" BIGINT NOT NULL,
    "ownershipPercent" DECIMAL(12,8),
    "ownershipBasis" TEXT,
    "dataQualityNote" TEXT,
    "isDirect" BOOLEAN NOT NULL DEFAULT true,
    "sourceRowKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ownership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareholdingImportError" (
    "id" TEXT NOT NULL,
    "rawSourceId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareholdingImportError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareholdingGraphNode" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "type" "ShareholdingGraphNodeType" NOT NULL,
    "label" TEXT NOT NULL,
    "metadata" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareholdingGraphNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareholdingGraphEdge" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "edgeKey" TEXT NOT NULL,
    "sourceNodeKey" TEXT NOT NULL,
    "targetNodeKey" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL DEFAULT 'OWNS',
    "percent" DECIMAL(12,8),
    "shares" BIGINT,
    "shareClass" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareholdingGraphEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "AnnualReportNarrative" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "sectionKind" TEXT NOT NULL,
    "title" TEXT,
    "textPreview" TEXT NOT NULL,
    "fullText" TEXT NOT NULL,
    "pageStart" INTEGER,
    "pageEnd" INTEGER,
    "confidence" DOUBLE PRECISION NOT NULL,
    "provenance" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnualReportNarrative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsArticle" (
    "id" TEXT NOT NULL,
    "guid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "url" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsArticleRelevance" (
    "id" TEXT NOT NULL,
    "newsArticleId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "directScore" DOUBLE PRECISION NOT NULL,
    "sectorScore" DOUBLE PRECISION NOT NULL,
    "macroScore" DOUBLE PRECISION NOT NULL,
    "competitorScore" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT,
    "tags" TEXT[],
    "scoredBy" TEXT NOT NULL,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsArticleRelevance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsArticleCompany" (
    "newsArticleId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "matchScore" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "NewsArticleCompany_pkey" PRIMARY KEY ("newsArticleId","companyId")
);

-- CreateTable
CREATE TABLE "AdminNotification" (
    "id" TEXT NOT NULL,
    "type" "AdminNotificationType" NOT NULL,
    "recipientRole" "AppRole" NOT NULL,
    "recipientUserId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkPath" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" "AdminNotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),

    CONSTRAINT "AdminNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfidenceThresholdVersion" (
    "id" TEXT NOT NULL,
    "version" SERIAL NOT NULL,
    "status" "ConfidenceThresholdStatus" NOT NULL DEFAULT 'PROPOSED',
    "configBlob" JSONB NOT NULL,
    "derivedFromReport" JSONB,
    "impactEstimate" JSONB,
    "summary" TEXT,
    "notes" TEXT,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "appliedByUserId" TEXT,
    "retiredAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectedByUserId" TEXT,
    "rejectionReason" TEXT,

    CONSTRAINT "ConfidenceThresholdVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionPatternReport" (
    "id" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ExtractionPatternReportStatus" NOT NULL DEFAULT 'ACTIVE',
    "totalCorrections" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "ExtractionPatternReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionPattern" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "metricKey" TEXT,
    "ruleCode" TEXT,
    "errorClass" "ExtractionPatternErrorClass" NOT NULL,
    "occurrenceCount" INTEGER NOT NULL,
    "severityScore" DOUBLE PRECISION NOT NULL,
    "affectedFilings" TEXT[],
    "suggestedFix" TEXT,

    CONSTRAINT "ExtractionPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MlModelVersion" (
    "id" TEXT NOT NULL,
    "taskType" "MlTaskType" NOT NULL,
    "taskVersion" INTEGER NOT NULL,
    "status" "MlModelStatus" NOT NULL DEFAULT 'PROPOSED',
    "algorithm" TEXT NOT NULL,
    "binaryPath" TEXT NOT NULL,
    "evaluationMetrics" JSONB,
    "trainingDataSnapshot" JSONB,
    "summary" TEXT,
    "notes" TEXT,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "appliedByUserId" TEXT,
    "retiredAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectedByUserId" TEXT,
    "rejectionReason" TEXT,

    CONSTRAINT "MlModelVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_personalOwnerId_key" ON "Workspace"("personalOwnerId");

-- CreateIndex
CREATE INDEX "Workspace_status_type_idx" ON "Workspace"("status", "type");

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_role_idx" ON "WorkspaceMember"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvitation_token_key" ON "WorkspaceInvitation"("token");

-- CreateIndex
CREATE INDEX "WorkspaceInvitation_workspaceId_status_idx" ON "WorkspaceInvitation"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "WorkspaceInvitation_email_status_idx" ON "WorkspaceInvitation"("email", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Company_orgNumber_key" ON "Company"("orgNumber");

-- CreateIndex
CREATE INDEX "Company_name_idx" ON "Company"("name");

-- CreateIndex
CREATE INDEX "Company_orgNumber_idx" ON "Company"("orgNumber");

-- CreateIndex
CREATE INDEX "Company_status_idx" ON "Company"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyDistressProfile_companyId_key" ON "CompanyDistressProfile"("companyId");

-- CreateIndex
CREATE INDEX "CompanyDistressProfile_distressStatus_daysInStatus_idx" ON "CompanyDistressProfile"("distressStatus", "daysInStatus");

-- CreateIndex
CREATE INDEX "CompanyDistressProfile_statusStartedAt_idx" ON "CompanyDistressProfile"("statusStartedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DistressFinancialSnapshot_companyId_key" ON "DistressFinancialSnapshot"("companyId");

-- CreateIndex
CREATE INDEX "DistressFinancialSnapshot_distressStatus_daysInStatus_idx" ON "DistressFinancialSnapshot"("distressStatus", "daysInStatus");

-- CreateIndex
CREATE INDEX "DistressFinancialSnapshot_sectorCode_lastReportedYear_idx" ON "DistressFinancialSnapshot"("sectorCode", "lastReportedYear");

-- CreateIndex
CREATE UNIQUE INDEX "DistressSyncState_key_key" ON "DistressSyncState"("key");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineJobLease_jobKey_key" ON "PipelineJobLease"("jobKey");

-- CreateIndex
CREATE INDEX "PipelineJobLease_jobKey_leaseExpiresAt_idx" ON "PipelineJobLease"("jobKey", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "Role_companyId_title_idx" ON "Role"("companyId", "title");

-- CreateIndex
CREATE INDEX "FinancialStatement_companyId_fiscalYear_idx" ON "FinancialStatement"("companyId", "fiscalYear");

-- CreateIndex
CREATE INDEX "FinancialStatement_sourceFilingId_idx" ON "FinancialStatement"("sourceFilingId");

-- CreateIndex
CREATE INDEX "FinancialStatement_sourceExtractionRunId_idx" ON "FinancialStatement"("sourceExtractionRunId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialStatement_companyId_fiscalYear_key" ON "FinancialStatement"("companyId", "fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "AnnualReportFiling_sourceIdempotencyKey_key" ON "AnnualReportFiling"("sourceIdempotencyKey");

-- CreateIndex
CREATE INDEX "AnnualReportFiling_companyId_fiscalYear_idx" ON "AnnualReportFiling"("companyId", "fiscalYear");

-- CreateIndex
CREATE INDEX "AnnualReportFiling_companyId_status_discoveredAt_idx" ON "AnnualReportFiling"("companyId", "status", "discoveredAt");

-- CreateIndex
CREATE INDEX "AnnualReportFiling_companyId_isLatestForFiscalYear_idx" ON "AnnualReportFiling"("companyId", "isLatestForFiscalYear");

-- CreateIndex
CREATE INDEX "AnnualReportFiling_companyId_fiscalYear_sourceDiscoveryKey__idx" ON "AnnualReportFiling"("companyId", "fiscalYear", "sourceDiscoveryKey", "discoveredAt");

-- CreateIndex
CREATE INDEX "AnnualReportArtifact_filingId_artifactType_idx" ON "AnnualReportArtifact"("filingId", "artifactType");

-- CreateIndex
CREATE INDEX "AnnualReportArtifact_storageKey_idx" ON "AnnualReportArtifact"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "AnnualReportArtifact_filingId_artifactType_checksum_key" ON "AnnualReportArtifact"("filingId", "artifactType", "checksum");

-- CreateIndex
CREATE INDEX "FinancialExtractionRun_filingId_status_startedAt_idx" ON "FinancialExtractionRun"("filingId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "FinancialExtractionRun_companyId_startedAt_idx" ON "FinancialExtractionRun"("companyId", "startedAt");

-- CreateIndex
CREATE INDEX "FinancialFact_extractionRunId_metricKey_idx" ON "FinancialFact"("extractionRunId", "metricKey");

-- CreateIndex
CREATE INDEX "FinancialFact_companyId_fiscalYear_metricKey_idx" ON "FinancialFact"("companyId", "fiscalYear", "metricKey");

-- CreateIndex
CREATE INDEX "FinancialFact_filingId_statementType_idx" ON "FinancialFact"("filingId", "statementType");

-- CreateIndex
CREATE INDEX "FinancialValidationIssue_extractionRunId_severity_idx" ON "FinancialValidationIssue"("extractionRunId", "severity");

-- CreateIndex
CREATE INDEX "FinancialValidationIssue_companyId_fiscalYear_severity_idx" ON "FinancialValidationIssue"("companyId", "fiscalYear", "severity");

-- CreateIndex
CREATE INDEX "FinancialValidationIssue_filingId_severity_idx" ON "FinancialValidationIssue"("filingId", "severity");

-- CreateIndex
CREATE INDEX "RawFinancialLineItem_filingId_statementType_idx" ON "RawFinancialLineItem"("filingId", "statementType");

-- CreateIndex
CREATE INDEX "RawFinancialLineItem_companyId_fiscalYear_idx" ON "RawFinancialLineItem"("companyId", "fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyFinancialCoverage_companyId_key" ON "CompanyFinancialCoverage"("companyId");

-- CreateIndex
CREATE INDEX "CompanyFinancialCoverage_coverageStatus_nextCheckAt_idx" ON "CompanyFinancialCoverage"("coverageStatus", "nextCheckAt");

-- CreateIndex
CREATE INDEX "CompanyFinancialCoverage_latestPublishedFiscalYear_idx" ON "CompanyFinancialCoverage"("latestPublishedFiscalYear");

-- CreateIndex
CREATE INDEX "AnnualReportReview_status_updatedAt_idx" ON "AnnualReportReview"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "AnnualReportReview_companyId_status_idx" ON "AnnualReportReview"("companyId", "status");

-- CreateIndex
CREATE INDEX "AnnualReportReview_fiscalYear_status_idx" ON "AnnualReportReview"("fiscalYear", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AnnualReportReview_filingId_extractionRunId_key" ON "AnnualReportReview"("filingId", "extractionRunId");

-- CreateIndex
CREATE INDEX "AnnualReportReviewDecision_reviewId_createdAt_idx" ON "AnnualReportReviewDecision"("reviewId", "createdAt");

-- CreateIndex
CREATE INDEX "AnnualReportReviewDecision_filingId_createdAt_idx" ON "AnnualReportReviewDecision"("filingId", "createdAt");

-- CreateIndex
CREATE INDEX "AnnualReportReviewDecision_reviewerUserId_createdAt_idx" ON "AnnualReportReviewDecision"("reviewerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PdfTrainingLabel_filingId_labelType_idx" ON "PdfTrainingLabel"("filingId", "labelType");

-- CreateIndex
CREATE INDEX "PdfTrainingLabel_extractionRunId_labelType_idx" ON "PdfTrainingLabel"("extractionRunId", "labelType");

-- CreateIndex
CREATE INDEX "PdfTrainingLabel_reviewerUserId_createdAt_idx" ON "PdfTrainingLabel"("reviewerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "UnifiedExtractionReviewFeedback_filingId_createdAt_idx" ON "UnifiedExtractionReviewFeedback"("filingId", "createdAt");

-- CreateIndex
CREATE INDEX "UnifiedExtractionReviewFeedback_orgNumber_fiscalYear_create_idx" ON "UnifiedExtractionReviewFeedback"("orgNumber", "fiscalYear", "createdAt");

-- CreateIndex
CREATE INDEX "UnifiedExtractionReviewFeedback_reviewerUserId_createdAt_idx" ON "UnifiedExtractionReviewFeedback"("reviewerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "UnifiedExtractionReviewFeedback_action_createdAt_idx" ON "UnifiedExtractionReviewFeedback"("action", "createdAt");

-- CreateIndex
CREATE INDEX "UnifiedExtractionReviewFeedback_targetType_createdAt_idx" ON "UnifiedExtractionReviewFeedback"("targetType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PdfDecisionGoldSetItem_filingId_key" ON "PdfDecisionGoldSetItem"("filingId");

-- CreateIndex
CREATE INDEX "PdfDecisionGoldSetItem_status_idx" ON "PdfDecisionGoldSetItem"("status");

-- CreateIndex
CREATE INDEX "PdfDecisionGoldSetItem_reason_idx" ON "PdfDecisionGoldSetItem"("reason");

-- CreateIndex
CREATE INDEX "PdfDecisionGoldSetItem_orgNumber_fiscalYear_idx" ON "PdfDecisionGoldSetItem"("orgNumber", "fiscalYear");

-- CreateIndex
CREATE INDEX "PdfDecisionGoldSetItem_decisionRoute_riskLevel_idx" ON "PdfDecisionGoldSetItem"("decisionRoute", "riskLevel");

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

-- CreateIndex
CREATE INDEX "PdfModelCandidate_status_idx" ON "PdfModelCandidate"("status");

-- CreateIndex
CREATE INDEX "PdfModelCandidate_modelTarget_idx" ON "PdfModelCandidate"("modelTarget");

-- CreateIndex
CREATE UNIQUE INDEX "PdfModelCandidate_modelId_modelVersion_key" ON "PdfModelCandidate"("modelId", "modelVersion");

-- CreateIndex
CREATE INDEX "PdfModelCandidateDecision_candidateId_createdAt_idx" ON "PdfModelCandidateDecision"("candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "PdfModelCandidateDecision_decisionType_idx" ON "PdfModelCandidateDecision"("decisionType");

-- CreateIndex
CREATE INDEX "AnnualReportReviewedFact_reviewId_metricKey_idx" ON "AnnualReportReviewedFact"("reviewId", "metricKey");

-- CreateIndex
CREATE INDEX "AnnualReportReviewedFact_companyId_fiscalYear_metricKey_idx" ON "AnnualReportReviewedFact"("companyId", "fiscalYear", "metricKey");

-- CreateIndex
CREATE UNIQUE INDEX "AnnualReportReviewedFact_reviewId_metricKey_key" ON "AnnualReportReviewedFact"("reviewId", "metricKey");

-- CreateIndex
CREATE INDEX "Address_city_idx" ON "Address"("city");

-- CreateIndex
CREATE INDEX "Address_region_idx" ON "Address"("region");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumCompanyLink_npdCompanyId_key" ON "PetroleumCompanyLink"("npdCompanyId");

-- CreateIndex
CREATE INDEX "PetroleumCompanyLink_orgNumber_idx" ON "PetroleumCompanyLink"("orgNumber");

-- CreateIndex
CREATE INDEX "PetroleumCompanyLink_linkedCompanyOrgNumber_idx" ON "PetroleumCompanyLink"("linkedCompanyOrgNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumField_npdId_key" ON "PetroleumField"("npdId");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumField_slug_key" ON "PetroleumField"("slug");

-- CreateIndex
CREATE INDEX "PetroleumField_activityStatus_idx" ON "PetroleumField"("activityStatus");

-- CreateIndex
CREATE INDEX "PetroleumField_mainArea_idx" ON "PetroleumField"("mainArea");

-- CreateIndex
CREATE INDEX "PetroleumField_operatorNpdCompanyId_idx" ON "PetroleumField"("operatorNpdCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumDiscovery_npdId_key" ON "PetroleumDiscovery"("npdId");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumDiscovery_slug_key" ON "PetroleumDiscovery"("slug");

-- CreateIndex
CREATE INDEX "PetroleumDiscovery_activityStatus_idx" ON "PetroleumDiscovery"("activityStatus");

-- CreateIndex
CREATE INDEX "PetroleumDiscovery_areaName_idx" ON "PetroleumDiscovery"("areaName");

-- CreateIndex
CREATE INDEX "PetroleumDiscovery_operatorNpdCompanyId_idx" ON "PetroleumDiscovery"("operatorNpdCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumLicence_npdId_key" ON "PetroleumLicence"("npdId");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumLicence_slug_key" ON "PetroleumLicence"("slug");

-- CreateIndex
CREATE INDEX "PetroleumLicence_status_idx" ON "PetroleumLicence"("status");

-- CreateIndex
CREATE INDEX "PetroleumLicence_mainArea_idx" ON "PetroleumLicence"("mainArea");

-- CreateIndex
CREATE INDEX "PetroleumLicence_operatorNpdCompanyId_idx" ON "PetroleumLicence"("operatorNpdCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumFacility_npdId_key" ON "PetroleumFacility"("npdId");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumFacility_slug_key" ON "PetroleumFacility"("slug");

-- CreateIndex
CREATE INDEX "PetroleumFacility_phase_idx" ON "PetroleumFacility"("phase");

-- CreateIndex
CREATE INDEX "PetroleumFacility_belongsToName_idx" ON "PetroleumFacility"("belongsToName");

-- CreateIndex
CREATE INDEX "PetroleumFacility_currentOperatorNpdId_idx" ON "PetroleumFacility"("currentOperatorNpdId");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumTuf_npdId_key" ON "PetroleumTuf"("npdId");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumTuf_slug_key" ON "PetroleumTuf"("slug");

-- CreateIndex
CREATE INDEX "PetroleumTuf_currentPhase_idx" ON "PetroleumTuf"("currentPhase");

-- CreateIndex
CREATE INDEX "PetroleumTuf_operatorNpdCompanyId_idx" ON "PetroleumTuf"("operatorNpdCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumSurvey_npdId_key" ON "PetroleumSurvey"("npdId");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumSurvey_slug_key" ON "PetroleumSurvey"("slug");

-- CreateIndex
CREATE INDEX "PetroleumSurvey_status_idx" ON "PetroleumSurvey"("status");

-- CreateIndex
CREATE INDEX "PetroleumSurvey_mainType_idx" ON "PetroleumSurvey"("mainType");

-- CreateIndex
CREATE INDEX "PetroleumSurvey_companyNpdId_idx" ON "PetroleumSurvey"("companyNpdId");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumWellbore_npdId_key" ON "PetroleumWellbore"("npdId");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumWellbore_slug_key" ON "PetroleumWellbore"("slug");

-- CreateIndex
CREATE INDEX "PetroleumWellbore_status_idx" ON "PetroleumWellbore"("status");

-- CreateIndex
CREATE INDEX "PetroleumWellbore_purpose_idx" ON "PetroleumWellbore"("purpose");

-- CreateIndex
CREATE INDEX "PetroleumWellbore_mainArea_idx" ON "PetroleumWellbore"("mainArea");

-- CreateIndex
CREATE INDEX "PetroleumWellbore_drillingOperatorNpdCompanyId_idx" ON "PetroleumWellbore"("drillingOperatorNpdCompanyId");

-- CreateIndex
CREATE INDEX "PetroleumProductionPoint_entityType_entityNpdId_year_month_idx" ON "PetroleumProductionPoint"("entityType", "entityNpdId", "year", "month");

-- CreateIndex
CREATE INDEX "PetroleumProductionPoint_entityType_entityNpdId_period_year_idx" ON "PetroleumProductionPoint"("entityType", "entityNpdId", "period", "year", "month");

-- CreateIndex
CREATE INDEX "PetroleumProductionPoint_entityType_year_idx" ON "PetroleumProductionPoint"("entityType", "year");

-- CreateIndex
CREATE INDEX "PetroleumReserveSnapshot_entityType_remainingOe_idx" ON "PetroleumReserveSnapshot"("entityType", "remainingOe");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumReserveSnapshot_entityType_entityNpdId_key" ON "PetroleumReserveSnapshot"("entityType", "entityNpdId");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumInvestmentSnapshot_entityType_entityNpdId_key" ON "PetroleumInvestmentSnapshot"("entityType", "entityNpdId");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumFieldSnapshot_fieldNpdId_key" ON "PetroleumFieldSnapshot"("fieldNpdId");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumFieldSnapshot_fieldSlug_key" ON "PetroleumFieldSnapshot"("fieldSlug");

-- CreateIndex
CREATE INDEX "PetroleumFieldSnapshot_area_idx" ON "PetroleumFieldSnapshot"("area");

-- CreateIndex
CREATE INDEX "PetroleumFieldSnapshot_status_idx" ON "PetroleumFieldSnapshot"("status");

-- CreateIndex
CREATE INDEX "PetroleumFieldSnapshot_hcType_idx" ON "PetroleumFieldSnapshot"("hcType");

-- CreateIndex
CREATE INDEX "PetroleumFieldSnapshot_operatorNpdCompanyId_idx" ON "PetroleumFieldSnapshot"("operatorNpdCompanyId");

-- CreateIndex
CREATE INDEX "PetroleumFieldSnapshot_operatorOrgNumber_idx" ON "PetroleumFieldSnapshot"("operatorOrgNumber");

-- CreateIndex
CREATE INDEX "PetroleumFieldSnapshot_latestAnnualOe_idx" ON "PetroleumFieldSnapshot"("latestAnnualOe");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumLicenceSnapshot_licenceNpdId_key" ON "PetroleumLicenceSnapshot"("licenceNpdId");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumLicenceSnapshot_licenceSlug_key" ON "PetroleumLicenceSnapshot"("licenceSlug");

-- CreateIndex
CREATE INDEX "PetroleumLicenceSnapshot_area_idx" ON "PetroleumLicenceSnapshot"("area");

-- CreateIndex
CREATE INDEX "PetroleumLicenceSnapshot_status_idx" ON "PetroleumLicenceSnapshot"("status");

-- CreateIndex
CREATE INDEX "PetroleumLicenceSnapshot_currentPhase_idx" ON "PetroleumLicenceSnapshot"("currentPhase");

-- CreateIndex
CREATE INDEX "PetroleumLicenceSnapshot_operatorNpdCompanyId_idx" ON "PetroleumLicenceSnapshot"("operatorNpdCompanyId");

-- CreateIndex
CREATE INDEX "PetroleumLicenceSnapshot_operatorOrgNumber_idx" ON "PetroleumLicenceSnapshot"("operatorOrgNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumOperatorSnapshot_npdCompanyId_key" ON "PetroleumOperatorSnapshot"("npdCompanyId");

-- CreateIndex
CREATE INDEX "PetroleumOperatorSnapshot_orgNumber_idx" ON "PetroleumOperatorSnapshot"("orgNumber");

-- CreateIndex
CREATE INDEX "PetroleumOperatorSnapshot_slug_idx" ON "PetroleumOperatorSnapshot"("slug");

-- CreateIndex
CREATE INDEX "PetroleumOperatorSnapshot_latestProductionOe_idx" ON "PetroleumOperatorSnapshot"("latestProductionOe");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumAreaSnapshot_area_key" ON "PetroleumAreaSnapshot"("area");

-- CreateIndex
CREATE INDEX "PetroleumMapFeatureSnapshot_layerId_idx" ON "PetroleumMapFeatureSnapshot"("layerId");

-- CreateIndex
CREATE INDEX "PetroleumMapFeatureSnapshot_layerId_status_idx" ON "PetroleumMapFeatureSnapshot"("layerId", "status");

-- CreateIndex
CREATE INDEX "PetroleumMapFeatureSnapshot_layerId_area_idx" ON "PetroleumMapFeatureSnapshot"("layerId", "area");

-- CreateIndex
CREATE INDEX "PetroleumMapFeatureSnapshot_layerId_operatorNpdCompanyId_idx" ON "PetroleumMapFeatureSnapshot"("layerId", "operatorNpdCompanyId");

-- CreateIndex
CREATE INDEX "PetroleumMapFeatureSnapshot_layerId_hcType_idx" ON "PetroleumMapFeatureSnapshot"("layerId", "hcType");

-- CreateIndex
CREATE INDEX "PetroleumMapFeatureSnapshot_layerId_surveyYear_idx" ON "PetroleumMapFeatureSnapshot"("layerId", "surveyYear");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumMapFeatureSnapshot_entityType_entityNpdId_key" ON "PetroleumMapFeatureSnapshot"("entityType", "entityNpdId");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumForecastSnapshot_externalId_key" ON "PetroleumForecastSnapshot"("externalId");

-- CreateIndex
CREATE INDEX "PetroleumForecastSnapshot_publishedAt_idx" ON "PetroleumForecastSnapshot"("publishedAt");

-- CreateIndex
CREATE INDEX "PetroleumForecastSnapshot_scope_publishedAt_idx" ON "PetroleumForecastSnapshot"("scope", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumPublicationSnapshot_externalId_key" ON "PetroleumPublicationSnapshot"("externalId");

-- CreateIndex
CREATE INDEX "PetroleumPublicationSnapshot_category_publishedAt_idx" ON "PetroleumPublicationSnapshot"("category", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumEvent_externalId_key" ON "PetroleumEvent"("externalId");

-- CreateIndex
CREATE INDEX "PetroleumEvent_source_eventType_publishedAt_idx" ON "PetroleumEvent"("source", "eventType", "publishedAt");

-- CreateIndex
CREATE INDEX "PetroleumEvent_entityType_entityNpdId_idx" ON "PetroleumEvent"("entityType", "entityNpdId");

-- CreateIndex
CREATE INDEX "PetroleumEvent_relatedCompanyOrgNumber_idx" ON "PetroleumEvent"("relatedCompanyOrgNumber");

-- CreateIndex
CREATE INDEX "PetroleumEvent_relatedCompanySlug_idx" ON "PetroleumEvent"("relatedCompanySlug");

-- CreateIndex
CREATE INDEX "PetroleumEvent_publishedAt_idx" ON "PetroleumEvent"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumMarketSeries_slug_key" ON "PetroleumMarketSeries"("slug");

-- CreateIndex
CREATE INDEX "PetroleumMarketSeries_category_idx" ON "PetroleumMarketSeries"("category");

-- CreateIndex
CREATE INDEX "PetroleumMarketSeries_region_idx" ON "PetroleumMarketSeries"("region");

-- CreateIndex
CREATE INDEX "PetroleumMarketSeries_product_idx" ON "PetroleumMarketSeries"("product");

-- CreateIndex
CREATE INDEX "PetroleumMarketSeries_sourceSystem_idx" ON "PetroleumMarketSeries"("sourceSystem");

-- CreateIndex
CREATE INDEX "PetroleumMarketObservation_seriesId_observationDate_idx" ON "PetroleumMarketObservation"("seriesId", "observationDate");

-- CreateIndex
CREATE INDEX "PetroleumMarketObservation_year_month_idx" ON "PetroleumMarketObservation"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumMarketObservation_seriesId_observationDate_key" ON "PetroleumMarketObservation"("seriesId", "observationDate");

-- CreateIndex
CREATE INDEX "PetroleumFiscalRegimeSnapshot_jurisdiction_effectiveDate_idx" ON "PetroleumFiscalRegimeSnapshot"("jurisdiction", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumCompanyExposureSnapshot_companyId_key" ON "PetroleumCompanyExposureSnapshot"("companyId");

-- CreateIndex
CREATE INDEX "PetroleumCompanyExposureSnapshot_npdCompanyId_idx" ON "PetroleumCompanyExposureSnapshot"("npdCompanyId");

-- CreateIndex
CREATE INDEX "PetroleumWorkspaceWatch_workspaceId_status_idx" ON "PetroleumWorkspaceWatch"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PetroleumWorkspaceWatch_workspaceId_entityType_entityId_key" ON "PetroleumWorkspaceWatch"("workspaceId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "IndustryCode_code_key" ON "IndustryCode"("code");

-- CreateIndex
CREATE INDEX "DdRoom_workspaceId_status_idx" ON "DdRoom"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "DdRoom_primaryCompanyId_status_idx" ON "DdRoom"("primaryCompanyId", "status");

-- CreateIndex
CREATE INDEX "DdTask_roomId_stage_status_idx" ON "DdTask"("roomId", "stage", "status");

-- CreateIndex
CREATE INDEX "DdTask_assigneeUserId_status_idx" ON "DdTask"("assigneeUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DdMandate_roomId_key" ON "DdMandate"("roomId");

-- CreateIndex
CREATE INDEX "DdFinding_roomId_stage_workstream_idx" ON "DdFinding"("roomId", "stage", "workstream");

-- CreateIndex
CREATE INDEX "DdFinding_roomId_status_severity_idx" ON "DdFinding"("roomId", "status", "severity");

-- CreateIndex
CREATE INDEX "DdFinding_assigneeUserId_status_idx" ON "DdFinding"("assigneeUserId", "status");

-- CreateIndex
CREATE INDEX "DdFindingEvidence_findingId_type_idx" ON "DdFindingEvidence"("findingId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "DdConclusion_roomId_key" ON "DdConclusion"("roomId");

-- CreateIndex
CREATE INDEX "DdDecisionLogEntry_roomId_createdAt_idx" ON "DdDecisionLogEntry"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "DdDecisionLogEntry_conclusionId_createdAt_idx" ON "DdDecisionLogEntry"("conclusionId", "createdAt");

-- CreateIndex
CREATE INDEX "DdPost_roomId_createdAt_idx" ON "DdPost"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "DdPost_authorUserId_createdAt_idx" ON "DdPost"("authorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "DdCommentThread_roomId_targetType_idx" ON "DdCommentThread"("roomId", "targetType");

-- CreateIndex
CREATE INDEX "DdCommentThread_targetCompanyId_targetType_idx" ON "DdCommentThread"("targetCompanyId", "targetType");

-- CreateIndex
CREATE INDEX "DdCommentThread_targetFinancialStatementId_targetFinancialM_idx" ON "DdCommentThread"("targetFinancialStatementId", "targetFinancialMetricKey", "targetType");

-- CreateIndex
CREATE INDEX "DdComment_threadId_createdAt_idx" ON "DdComment"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "DdComment_authorUserId_createdAt_idx" ON "DdComment"("authorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkspaceWatch_workspaceId_status_idx" ON "WorkspaceWatch"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceWatch_workspaceId_companyId_key" ON "WorkspaceWatch"("workspaceId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceNotification_dedupeKey_key" ON "WorkspaceNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "WorkspaceNotification_workspaceId_readAt_createdAt_idx" ON "WorkspaceNotification"("workspaceId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "WorkspaceNotification_companyId_type_idx" ON "WorkspaceNotification"("companyId", "type");

-- CreateIndex
CREATE INDEX "WorkspaceMonitor_workspaceId_status_idx" ON "WorkspaceMonitor"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ShareholdingRawSource_companyOrgNumber_taxYear_idx" ON "ShareholdingRawSource"("companyOrgNumber", "taxYear");

-- CreateIndex
CREATE UNIQUE INDEX "ShareholdingRawSource_companyOrgNumber_taxYear_sourceSystem_key" ON "ShareholdingRawSource"("companyOrgNumber", "taxYear", "sourceSystem", "checksum");

-- CreateIndex
CREATE UNIQUE INDEX "ShareholdingSnapshot_rawSourceId_key" ON "ShareholdingSnapshot"("rawSourceId");

-- CreateIndex
CREATE INDEX "ShareholdingSnapshot_companyId_taxYear_idx" ON "ShareholdingSnapshot"("companyId", "taxYear");

-- CreateIndex
CREATE UNIQUE INDEX "ShareholdingSnapshot_companyId_taxYear_sourceSystem_key" ON "ShareholdingSnapshot"("companyId", "taxYear", "sourceSystem");

-- CreateIndex
CREATE UNIQUE INDEX "Shareholder_fingerprint_key" ON "Shareholder"("fingerprint");

-- CreateIndex
CREATE INDEX "Shareholder_normalizedName_idx" ON "Shareholder"("normalizedName");

-- CreateIndex
CREATE INDEX "Shareholder_externalIdentifier_idx" ON "Shareholder"("externalIdentifier");

-- CreateIndex
CREATE INDEX "Ownership_snapshotId_ownershipPercent_idx" ON "Ownership"("snapshotId", "ownershipPercent");

-- CreateIndex
CREATE UNIQUE INDEX "Ownership_snapshotId_sourceRowKey_key" ON "Ownership"("snapshotId", "sourceRowKey");

-- CreateIndex
CREATE INDEX "ShareholdingImportError_rawSourceId_stage_idx" ON "ShareholdingImportError"("rawSourceId", "stage");

-- CreateIndex
CREATE INDEX "ShareholdingGraphNode_snapshotId_sortOrder_idx" ON "ShareholdingGraphNode"("snapshotId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ShareholdingGraphNode_snapshotId_nodeKey_key" ON "ShareholdingGraphNode"("snapshotId", "nodeKey");

-- CreateIndex
CREATE INDEX "ShareholdingGraphEdge_snapshotId_sortOrder_idx" ON "ShareholdingGraphEdge"("snapshotId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ShareholdingGraphEdge_snapshotId_edgeKey_key" ON "ShareholdingGraphEdge"("snapshotId", "edgeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "AnnualReportNarrative_companyId_fiscalYear_idx" ON "AnnualReportNarrative"("companyId", "fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "AnnualReportNarrative_filingId_sectionKind_key" ON "AnnualReportNarrative"("filingId", "sectionKind");

-- CreateIndex
CREATE UNIQUE INDEX "NewsArticle_guid_key" ON "NewsArticle"("guid");

-- CreateIndex
CREATE INDEX "NewsArticle_publishedAt_idx" ON "NewsArticle"("publishedAt" DESC);

-- CreateIndex
CREATE INDEX "NewsArticle_source_idx" ON "NewsArticle"("source");

-- CreateIndex
CREATE INDEX "NewsArticleRelevance_companyId_totalScore_idx" ON "NewsArticleRelevance"("companyId", "totalScore" DESC);

-- CreateIndex
CREATE INDEX "NewsArticleRelevance_companyId_scoredAt_idx" ON "NewsArticleRelevance"("companyId", "scoredAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "NewsArticleRelevance_newsArticleId_companyId_key" ON "NewsArticleRelevance"("newsArticleId", "companyId");

-- CreateIndex
CREATE INDEX "NewsArticleCompany_companyId_idx" ON "NewsArticleCompany"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminNotification_dedupeKey_key" ON "AdminNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "AdminNotification_recipientRole_status_createdAt_idx" ON "AdminNotification"("recipientRole", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AdminNotification_recipientUserId_status_idx" ON "AdminNotification"("recipientUserId", "status");

-- CreateIndex
CREATE INDEX "AdminNotification_type_createdAt_idx" ON "AdminNotification"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConfidenceThresholdVersion_version_key" ON "ConfidenceThresholdVersion"("version");

-- CreateIndex
CREATE INDEX "ConfidenceThresholdVersion_status_version_idx" ON "ConfidenceThresholdVersion"("status", "version");

-- CreateIndex
CREATE INDEX "ConfidenceThresholdVersion_proposedAt_idx" ON "ConfidenceThresholdVersion"("proposedAt");

-- CreateIndex
CREATE INDEX "ExtractionPatternReport_status_generatedAt_idx" ON "ExtractionPatternReport"("status", "generatedAt");

-- CreateIndex
CREATE INDEX "ExtractionPatternReport_generatedAt_idx" ON "ExtractionPatternReport"("generatedAt");

-- CreateIndex
CREATE INDEX "ExtractionPattern_reportId_idx" ON "ExtractionPattern"("reportId");

-- CreateIndex
CREATE INDEX "ExtractionPattern_errorClass_occurrenceCount_idx" ON "ExtractionPattern"("errorClass", "occurrenceCount");

-- CreateIndex
CREATE INDEX "MlModelVersion_taskType_status_idx" ON "MlModelVersion"("taskType", "status");

-- CreateIndex
CREATE INDEX "MlModelVersion_proposedAt_idx" ON "MlModelVersion"("proposedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MlModelVersion_taskType_taskVersion_key" ON "MlModelVersion"("taskType", "taskVersion");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_lastWorkspaceId_fkey" FOREIGN KEY ("lastWorkspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_personalOwnerId_fkey" FOREIGN KEY ("personalOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_industryCodeId_fkey" FOREIGN KEY ("industryCodeId") REFERENCES "IndustryCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDistressProfile" ADD CONSTRAINT "CompanyDistressProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistressFinancialSnapshot" ADD CONSTRAINT "DistressFinancialSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialStatement" ADD CONSTRAINT "FinancialStatement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialStatement" ADD CONSTRAINT "FinancialStatement_sourceFilingId_fkey" FOREIGN KEY ("sourceFilingId") REFERENCES "AnnualReportFiling"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialStatement" ADD CONSTRAINT "FinancialStatement_sourceExtractionRunId_fkey" FOREIGN KEY ("sourceExtractionRunId") REFERENCES "FinancialExtractionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualReportFiling" ADD CONSTRAINT "AnnualReportFiling_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualReportArtifact" ADD CONSTRAINT "AnnualReportArtifact_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "AnnualReportFiling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialExtractionRun" ADD CONSTRAINT "FinancialExtractionRun_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "AnnualReportFiling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialExtractionRun" ADD CONSTRAINT "FinancialExtractionRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialFact" ADD CONSTRAINT "FinancialFact_extractionRunId_fkey" FOREIGN KEY ("extractionRunId") REFERENCES "FinancialExtractionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialFact" ADD CONSTRAINT "FinancialFact_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "AnnualReportFiling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialFact" ADD CONSTRAINT "FinancialFact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialValidationIssue" ADD CONSTRAINT "FinancialValidationIssue_extractionRunId_fkey" FOREIGN KEY ("extractionRunId") REFERENCES "FinancialExtractionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialValidationIssue" ADD CONSTRAINT "FinancialValidationIssue_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "AnnualReportFiling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialValidationIssue" ADD CONSTRAINT "FinancialValidationIssue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawFinancialLineItem" ADD CONSTRAINT "RawFinancialLineItem_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "AnnualReportFiling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawFinancialLineItem" ADD CONSTRAINT "RawFinancialLineItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyFinancialCoverage" ADD CONSTRAINT "CompanyFinancialCoverage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyFinancialCoverage" ADD CONSTRAINT "CompanyFinancialCoverage_latestSuccessfulFilingId_fkey" FOREIGN KEY ("latestSuccessfulFilingId") REFERENCES "AnnualReportFiling"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualReportReview" ADD CONSTRAINT "AnnualReportReview_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "AnnualReportFiling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualReportReview" ADD CONSTRAINT "AnnualReportReview_extractionRunId_fkey" FOREIGN KEY ("extractionRunId") REFERENCES "FinancialExtractionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualReportReview" ADD CONSTRAINT "AnnualReportReview_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualReportReviewDecision" ADD CONSTRAINT "AnnualReportReviewDecision_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "AnnualReportReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualReportReviewDecision" ADD CONSTRAINT "AnnualReportReviewDecision_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfTrainingLabel" ADD CONSTRAINT "PdfTrainingLabel_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedExtractionReviewFeedback" ADD CONSTRAINT "UnifiedExtractionReviewFeedback_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfDecisionGoldSetItem" ADD CONSTRAINT "PdfDecisionGoldSetItem_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "AnnualReportFiling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfDecisionGoldSetItem" ADD CONSTRAINT "PdfDecisionGoldSetItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfDecisionGoldSetItem" ADD CONSTRAINT "PdfDecisionGoldSetItem_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfModelArtifactSnapshot" ADD CONSTRAINT "PdfModelArtifactSnapshot_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfModelCandidate" ADD CONSTRAINT "PdfModelCandidate_manifestArtifactId_fkey" FOREIGN KEY ("manifestArtifactId") REFERENCES "PdfModelArtifactSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfModelCandidate" ADD CONSTRAINT "PdfModelCandidate_gateArtifactId_fkey" FOREIGN KEY ("gateArtifactId") REFERENCES "PdfModelArtifactSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfModelCandidate" ADD CONSTRAINT "PdfModelCandidate_analysisArtifactId_fkey" FOREIGN KEY ("analysisArtifactId") REFERENCES "PdfModelArtifactSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfModelCandidate" ADD CONSTRAINT "PdfModelCandidate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfModelCandidateDecision" ADD CONSTRAINT "PdfModelCandidateDecision_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "PdfModelCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfModelCandidateDecision" ADD CONSTRAINT "PdfModelCandidateDecision_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualReportReviewedFact" ADD CONSTRAINT "AnnualReportReviewedFact_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "AnnualReportReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualReportReviewedFact" ADD CONSTRAINT "AnnualReportReviewedFact_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "AnnualReportFiling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualReportReviewedFact" ADD CONSTRAINT "AnnualReportReviewedFact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualReportReviewedFact" ADD CONSTRAINT "AnnualReportReviewedFact_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetroleumMarketObservation" ADD CONSTRAINT "PetroleumMarketObservation_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "PetroleumMarketSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetroleumCompanyExposureSnapshot" ADD CONSTRAINT "PetroleumCompanyExposureSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetroleumWorkspaceWatch" ADD CONSTRAINT "PetroleumWorkspaceWatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetroleumWorkspaceWatch" ADD CONSTRAINT "PetroleumWorkspaceWatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdRoom" ADD CONSTRAINT "DdRoom_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdRoom" ADD CONSTRAINT "DdRoom_primaryCompanyId_fkey" FOREIGN KEY ("primaryCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdTask" ADD CONSTRAINT "DdTask_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "DdRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdTask" ADD CONSTRAINT "DdTask_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdTask" ADD CONSTRAINT "DdTask_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdMandate" ADD CONSTRAINT "DdMandate_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "DdRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdMandate" ADD CONSTRAINT "DdMandate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdMandate" ADD CONSTRAINT "DdMandate_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdFinding" ADD CONSTRAINT "DdFinding_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "DdRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdFinding" ADD CONSTRAINT "DdFinding_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DdTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdFinding" ADD CONSTRAINT "DdFinding_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdFinding" ADD CONSTRAINT "DdFinding_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdFinding" ADD CONSTRAINT "DdFinding_handoffWatchId_fkey" FOREIGN KEY ("handoffWatchId") REFERENCES "WorkspaceWatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdFindingEvidence" ADD CONSTRAINT "DdFindingEvidence_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "DdFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdFindingEvidence" ADD CONSTRAINT "DdFindingEvidence_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdFindingEvidence" ADD CONSTRAINT "DdFindingEvidence_targetFinancialStatementId_fkey" FOREIGN KEY ("targetFinancialStatementId") REFERENCES "FinancialStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdFindingEvidence" ADD CONSTRAINT "DdFindingEvidence_targetTaskId_fkey" FOREIGN KEY ("targetTaskId") REFERENCES "DdTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdFindingEvidence" ADD CONSTRAINT "DdFindingEvidence_targetFindingId_fkey" FOREIGN KEY ("targetFindingId") REFERENCES "DdFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdFindingEvidence" ADD CONSTRAINT "DdFindingEvidence_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdConclusion" ADD CONSTRAINT "DdConclusion_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "DdRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdConclusion" ADD CONSTRAINT "DdConclusion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdConclusion" ADD CONSTRAINT "DdConclusion_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdDecisionLogEntry" ADD CONSTRAINT "DdDecisionLogEntry_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "DdRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdDecisionLogEntry" ADD CONSTRAINT "DdDecisionLogEntry_conclusionId_fkey" FOREIGN KEY ("conclusionId") REFERENCES "DdConclusion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdDecisionLogEntry" ADD CONSTRAINT "DdDecisionLogEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdPost" ADD CONSTRAINT "DdPost_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "DdRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdPost" ADD CONSTRAINT "DdPost_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdCommentThread" ADD CONSTRAINT "DdCommentThread_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "DdRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdCommentThread" ADD CONSTRAINT "DdCommentThread_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdCommentThread" ADD CONSTRAINT "DdCommentThread_targetFinancialStatementId_fkey" FOREIGN KEY ("targetFinancialStatementId") REFERENCES "FinancialStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdCommentThread" ADD CONSTRAINT "DdCommentThread_targetPostId_fkey" FOREIGN KEY ("targetPostId") REFERENCES "DdPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdCommentThread" ADD CONSTRAINT "DdCommentThread_targetFindingId_fkey" FOREIGN KEY ("targetFindingId") REFERENCES "DdFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdCommentThread" ADD CONSTRAINT "DdCommentThread_targetTaskId_fkey" FOREIGN KEY ("targetTaskId") REFERENCES "DdTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdCommentThread" ADD CONSTRAINT "DdCommentThread_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdComment" ADD CONSTRAINT "DdComment_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DdCommentThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdComment" ADD CONSTRAINT "DdComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DdComment" ADD CONSTRAINT "DdComment_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "DdComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceWatch" ADD CONSTRAINT "WorkspaceWatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceWatch" ADD CONSTRAINT "WorkspaceWatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceNotification" ADD CONSTRAINT "WorkspaceNotification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceNotification" ADD CONSTRAINT "WorkspaceNotification_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "WorkspaceWatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceNotification" ADD CONSTRAINT "WorkspaceNotification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMonitor" ADD CONSTRAINT "WorkspaceMonitor_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareholdingSnapshot" ADD CONSTRAINT "ShareholdingSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareholdingSnapshot" ADD CONSTRAINT "ShareholdingSnapshot_rawSourceId_fkey" FOREIGN KEY ("rawSourceId") REFERENCES "ShareholdingRawSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shareholder" ADD CONSTRAINT "Shareholder_linkedCompanyId_fkey" FOREIGN KEY ("linkedCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ownership" ADD CONSTRAINT "Ownership_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ShareholdingSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ownership" ADD CONSTRAINT "Ownership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ownership" ADD CONSTRAINT "Ownership_shareholderId_fkey" FOREIGN KEY ("shareholderId") REFERENCES "Shareholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareholdingImportError" ADD CONSTRAINT "ShareholdingImportError_rawSourceId_fkey" FOREIGN KEY ("rawSourceId") REFERENCES "ShareholdingRawSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareholdingGraphNode" ADD CONSTRAINT "ShareholdingGraphNode_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ShareholdingSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareholdingGraphEdge" ADD CONSTRAINT "ShareholdingGraphEdge_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ShareholdingSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualReportNarrative" ADD CONSTRAINT "AnnualReportNarrative_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "AnnualReportFiling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualReportNarrative" ADD CONSTRAINT "AnnualReportNarrative_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsArticleRelevance" ADD CONSTRAINT "NewsArticleRelevance_newsArticleId_fkey" FOREIGN KEY ("newsArticleId") REFERENCES "NewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsArticleRelevance" ADD CONSTRAINT "NewsArticleRelevance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsArticleCompany" ADD CONSTRAINT "NewsArticleCompany_newsArticleId_fkey" FOREIGN KEY ("newsArticleId") REFERENCES "NewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsArticleCompany" ADD CONSTRAINT "NewsArticleCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminNotification" ADD CONSTRAINT "AdminNotification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfidenceThresholdVersion" ADD CONSTRAINT "ConfidenceThresholdVersion_appliedByUserId_fkey" FOREIGN KEY ("appliedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfidenceThresholdVersion" ADD CONSTRAINT "ConfidenceThresholdVersion_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionPattern" ADD CONSTRAINT "ExtractionPattern_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ExtractionPatternReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MlModelVersion" ADD CONSTRAINT "MlModelVersion_appliedByUserId_fkey" FOREIGN KEY ("appliedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MlModelVersion" ADD CONSTRAINT "MlModelVersion_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

