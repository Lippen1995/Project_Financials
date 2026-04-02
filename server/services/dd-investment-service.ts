import {
  DdCompanyProfileField,
  DdDecisionOutcome,
  DdFindingImpact,
  DdFindingSeverity,
  DdFindingStatus,
  DdFindingEvidenceType,
  DdTaskStage,
  DdWorkstream,
  WorkspaceStatus,
  WorkspaceWatchStatus,
} from "@prisma/client";

import {
  DdCommentThreadTargetType,
  DdConclusionSummary,
  DdDecisionLogEntrySummary,
  DdEvidenceContext,
  DdFindingEvidenceSummary,
  DdFindingSummary,
  DdMandateSummary,
} from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { toCommentThreadSummary } from "@/server/services/dd-comment-service";
import { getWorkstreamConfig } from "@/server/services/dd-workflow-service";
import { getUserWorkspaceCapabilities, requireWorkspaceMembership } from "@/server/services/workspace-service";

function trimToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isResolvedFindingStatus(status: DdFindingStatus) {
  return status === "MITIGATED" || status === "ACCEPTED" || status === "CLOSED";
}

async function getAuthorizedRoom(actorUserId: string, roomId: string) {
  const room = await prisma.ddRoom.findUnique({
    where: { id: roomId },
    include: { workspace: true, primaryCompany: true },
  });

  if (!room) {
    throw new Error("DD-rommet finnes ikke.");
  }

  const membership = await requireWorkspaceMembership(actorUserId, room.workspaceId);
  return { room, membership };
}

function ensureActiveRoomMutation(room: { status: "ACTIVE" | "ARCHIVED"; workspace: { status: WorkspaceStatus } }) {
  if (room.workspace.status !== "ACTIVE" || room.status !== "ACTIVE") {
    throw new Error("Dette kan bare oppdateres i aktive rom og aktive workspaces.");
  }
}

async function touchRoom(roomId: string) {
  await prisma.ddRoom.update({
    where: { id: roomId },
    data: { lastActivityAt: new Date() },
  });
}

function toUserSummary(user: { id: string; name: string | null; email: string }) {
  return { userId: user.id, name: user.name, email: user.email };
}

function toMandateSummary(mandate: {
  roomId: string;
  investmentCase: string | null;
  thesis: string | null;
  valueDrivers: string | null;
  keyRisks: string | null;
  timeHorizon: string | null;
  decisionGoal: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string | null; email: string };
  updatedBy: { id: string; name: string | null; email: string };
}): DdMandateSummary {
  return {
    roomId: mandate.roomId,
    investmentCase: mandate.investmentCase,
    thesis: mandate.thesis,
    valueDrivers: mandate.valueDrivers,
    keyRisks: mandate.keyRisks,
    timeHorizon: mandate.timeHorizon,
    decisionGoal: mandate.decisionGoal,
    createdAt: mandate.createdAt,
    updatedAt: mandate.updatedAt,
    createdBy: toUserSummary(mandate.createdBy),
    updatedBy: toUserSummary(mandate.updatedBy),
  };
}

function toEvidenceSummary(evidence: {
  id: string;
  type: DdFindingEvidenceType;
  label: string;
  note: string | null;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date | null;
  normalizedAt: Date | null;
  targetCompanyId: string | null;
  targetFinancialStatementId: string | null;
  targetTaskId: string | null;
  targetFindingId: string | null;
  targetAnnouncementId: string | null;
  targetAnnouncementSourceId: string | null;
  targetAnnouncementSourceSystem: string | null;
  targetAnnouncementPublishedAt: Date | null;
  targetCompanyProfileField: DdCompanyProfileField | null;
  createdAt: Date;
  createdBy: { id: string; name: string | null; email: string };
}): DdFindingEvidenceSummary {
  return {
    id: evidence.id,
    type: evidence.type,
    label: evidence.label,
    note: evidence.note,
    sourceSystem: evidence.sourceSystem,
    sourceEntityType: evidence.sourceEntityType,
    sourceId: evidence.sourceId,
    fetchedAt: evidence.fetchedAt,
    normalizedAt: evidence.normalizedAt,
    targetCompanyId: evidence.targetCompanyId,
    targetFinancialStatementId: evidence.targetFinancialStatementId,
    targetTaskId: evidence.targetTaskId,
    targetFindingId: evidence.targetFindingId,
    targetAnnouncementId: evidence.targetAnnouncementId,
    targetAnnouncementSourceId: evidence.targetAnnouncementSourceId,
    targetAnnouncementSourceSystem: evidence.targetAnnouncementSourceSystem,
    targetAnnouncementPublishedAt: evidence.targetAnnouncementPublishedAt,
    targetCompanyProfileField: evidence.targetCompanyProfileField,
    createdAt: evidence.createdAt,
    createdBy: toUserSummary(evidence.createdBy),
  };
}

function toFindingSummary(finding: {
  id: string;
  roomId: string;
  taskId: string | null;
  title: string;
  description: string | null;
  stage: DdTaskStage;
  workstream: DdWorkstream;
  severity: DdFindingSeverity;
  status: DdFindingStatus;
  impact: DdFindingImpact;
  recommendedAction: string | null;
  isBlocking: boolean;
  dueAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assignee: { id: string; name: string | null; email: string } | null;
  createdBy: { id: string; name: string | null; email: string };
  task: { id: string; title: string } | null;
  evidence: Array<{
    id: string;
    type: DdFindingEvidenceType;
    label: string;
    note: string | null;
    sourceSystem: string;
    sourceEntityType: string;
    sourceId: string;
    fetchedAt: Date | null;
    normalizedAt: Date | null;
    targetCompanyId: string | null;
    targetFinancialStatementId: string | null;
    targetTaskId: string | null;
    targetFindingId: string | null;
    targetAnnouncementId: string | null;
    targetAnnouncementSourceId: string | null;
    targetAnnouncementSourceSystem: string | null;
    targetAnnouncementPublishedAt: Date | null;
    targetCompanyProfileField: DdCompanyProfileField | null;
    createdAt: Date;
    createdBy: { id: string; name: string | null; email: string };
  }>;
  commentThreads: Array<{
    id: string;
    roomId: string;
    targetType: DdCommentThreadTargetType;
    targetFinancialStatementId: string | null;
    targetFinancialMetricKey: string | null;
    targetPostId: string | null;
    targetFindingId: string | null;
    targetTaskId: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdBy: { id: string; name: string | null; email: string };
    comments: Array<{
      id: string;
      threadId: string;
      parentCommentId: string | null;
      content: string;
      createdAt: Date;
      updatedAt: Date;
      author: { id: string; name: string | null; email: string };
    }>;
  }>;
  handoffWatch: { id: string; status: WorkspaceWatchStatus; companyId: string; createdAt: Date } | null;
}): DdFindingSummary {
  const primaryThread = finding.commentThreads[0] ?? null;

  return {
    id: finding.id,
    roomId: finding.roomId,
    taskId: finding.taskId,
    title: finding.title,
    description: finding.description,
    stage: finding.stage,
    workstream: finding.workstream,
    severity: finding.severity,
    status: finding.status,
    impact: finding.impact,
    recommendedAction: finding.recommendedAction,
    isBlocking: finding.isBlocking,
    dueAt: finding.dueAt,
    resolvedAt: finding.resolvedAt,
    createdAt: finding.createdAt,
    updatedAt: finding.updatedAt,
    assignee: finding.assignee ? toUserSummary(finding.assignee) : null,
    createdBy: toUserSummary(finding.createdBy),
    linkedTask: finding.task ? { id: finding.task.id, title: finding.task.title } : null,
    evidence: finding.evidence.map(toEvidenceSummary),
    commentThread: primaryThread ? toCommentThreadSummary(primaryThread) : null,
    handoffWatch: finding.handoffWatch
      ? {
          id: finding.handoffWatch.id,
          status: finding.handoffWatch.status,
          companyId: finding.handoffWatch.companyId,
          createdAt: finding.handoffWatch.createdAt,
        }
      : null,
  };
}

function toConclusionSummary(conclusion: {
  id: string;
  roomId: string;
  investmentCaseSummary: string | null;
  valueDriversSummary: string | null;
  keyRisksSummary: string | null;
  recommendationRationale: string | null;
  monitoringPlan: string | null;
  outcome: DdDecisionOutcome | null;
  isFinal: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string | null; email: string };
  updatedBy: { id: string; name: string | null; email: string };
}): DdConclusionSummary {
  return {
    roomId: conclusion.roomId,
    investmentCaseSummary: conclusion.investmentCaseSummary,
    valueDriversSummary: conclusion.valueDriversSummary,
    keyRisksSummary: conclusion.keyRisksSummary,
    recommendationRationale: conclusion.recommendationRationale,
    monitoringPlan: conclusion.monitoringPlan,
    outcome: conclusion.outcome,
    isFinal: conclusion.isFinal,
    createdAt: conclusion.createdAt,
    updatedAt: conclusion.updatedAt,
    createdBy: toUserSummary(conclusion.createdBy),
    updatedBy: toUserSummary(conclusion.updatedBy),
  };
}

function toDecisionLogSummary(entry: {
  id: string;
  roomId: string;
  conclusionId: string | null;
  outcome: DdDecisionOutcome | null;
  isFinal: boolean;
  investmentCaseSummary: string | null;
  valueDriversSummary: string | null;
  keyRisksSummary: string | null;
  recommendationRationale: string | null;
  monitoringPlan: string | null;
  note: string | null;
  createdAt: Date;
  createdBy: { id: string; name: string | null; email: string };
}): DdDecisionLogEntrySummary {
  return {
    id: entry.id,
    roomId: entry.roomId,
    conclusionId: entry.conclusionId,
    outcome: entry.outcome,
    isFinal: entry.isFinal,
    investmentCaseSummary: entry.investmentCaseSummary,
    valueDriversSummary: entry.valueDriversSummary,
    keyRisksSummary: entry.keyRisksSummary,
    recommendationRationale: entry.recommendationRationale,
    monitoringPlan: entry.monitoringPlan,
    note: entry.note,
    createdAt: entry.createdAt,
    createdBy: toUserSummary(entry.createdBy),
  };
}

export async function getDdMandate(roomId: string): Promise<DdMandateSummary | null> {
  const mandate = await prisma.ddMandate.findUnique({
    where: { roomId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },
    },
  });

  return mandate ? toMandateSummary(mandate) : null;
}

export async function upsertDdMandate(
  actorUserId: string,
  roomId: string,
  input: {
    investmentCase?: string | null;
    thesis?: string | null;
    valueDrivers?: string | null;
    keyRisks?: string | null;
    timeHorizon?: string | null;
    decisionGoal?: string | null;
  },
) {
  const { room } = await getAuthorizedRoom(actorUserId, roomId);
  ensureActiveRoomMutation(room);

  const mandate = await prisma.ddMandate.upsert({
    where: { roomId },
    update: {
      investmentCase: trimToNull(input.investmentCase),
      thesis: trimToNull(input.thesis),
      valueDrivers: trimToNull(input.valueDrivers),
      keyRisks: trimToNull(input.keyRisks),
      timeHorizon: trimToNull(input.timeHorizon),
      decisionGoal: trimToNull(input.decisionGoal),
      updatedByUserId: actorUserId,
    },
    create: {
      roomId,
      investmentCase: trimToNull(input.investmentCase),
      thesis: trimToNull(input.thesis),
      valueDrivers: trimToNull(input.valueDrivers),
      keyRisks: trimToNull(input.keyRisks),
      timeHorizon: trimToNull(input.timeHorizon),
      decisionGoal: trimToNull(input.decisionGoal),
      createdByUserId: actorUserId,
      updatedByUserId: actorUserId,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },
    },
  });

  await touchRoom(roomId);
  return toMandateSummary(mandate);
}

export async function getRoomFindings(roomId: string) {
  const findings = await prisma.ddFinding.findMany({
    where: { roomId },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      task: { select: { id: true, title: true } },
      evidence: {
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ createdAt: "desc" }],
      },
      commentThreads: {
        where: {
          targetType: "FINDING",
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          comments: {
            where: { deletedAt: null },
            include: {
              author: { select: { id: true, name: true, email: true } },
            },
            orderBy: [{ createdAt: "asc" }],
          },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      },
      handoffWatch: { select: { id: true, status: true, companyId: true, createdAt: true } },
    },
    orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
  });

  return findings.map(toFindingSummary);
}

export function buildFindingsSummary(findings: DdFindingSummary[], activeWorkstream: DdWorkstream | null = null) {
  const visibleFindings = activeWorkstream
    ? findings.filter((finding) => finding.workstream === activeWorkstream)
    : findings;

  return {
    items: visibleFindings,
    totalCount: visibleFindings.length,
    openCount: visibleFindings.filter((finding) => finding.status !== "CLOSED").length,
    blockingOpenCount: visibleFindings.filter(
      (finding) => finding.isBlocking && !isResolvedFindingStatus(finding.status),
    ).length,
    criticalOpenCount: visibleFindings.filter(
      (finding) => finding.severity === "CRITICAL" && !isResolvedFindingStatus(finding.status),
    ).length,
    monitoringReadyCount: visibleFindings.filter((finding) => finding.impact === "MONITORING").length,
    activeWorkstream,
  };
}

export async function createDdFinding(
  actorUserId: string,
  roomId: string,
  input: {
    title: string;
    description?: string | null;
    stage: DdTaskStage;
    workstream: DdWorkstream;
    severity?: DdFindingSeverity | null;
    status?: DdFindingStatus | null;
    impact?: DdFindingImpact | null;
    recommendedAction?: string | null;
    isBlocking?: boolean | null;
    dueAt?: Date | null;
    assigneeUserId?: string | null;
    taskId?: string | null;
  },
) {
  const { room } = await getAuthorizedRoom(actorUserId, roomId);
  ensureActiveRoomMutation(room);

  if (input.assigneeUserId) {
    const assigneeMembership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: room.workspaceId,
          userId: input.assigneeUserId,
        },
      },
    });

    if (!assigneeMembership) {
      throw new Error("Valgt ansvarlig ma vare medlem av workspace-et.");
    }
  }

  if (input.taskId) {
    const task = await prisma.ddTask.findUnique({
      where: { id: input.taskId },
      select: { roomId: true },
    });

    if (!task || task.roomId !== roomId) {
      throw new Error("Valgt oppgave horer ikke til dette DD-rommet.");
    }
  }

  const finding = await prisma.ddFinding.create({
    data: {
      roomId,
      taskId: input.taskId ?? null,
      title: input.title.trim(),
      description: trimToNull(input.description),
      stage: input.stage,
      workstream: input.workstream,
      severity: input.severity ?? DdFindingSeverity.MEDIUM,
      status: input.status ?? DdFindingStatus.OPEN,
      impact: input.impact ?? DdFindingImpact.NONE,
      recommendedAction: trimToNull(input.recommendedAction),
      isBlocking: Boolean(input.isBlocking),
      dueAt: input.dueAt ?? null,
      resolvedAt: input.status && isResolvedFindingStatus(input.status) ? new Date() : null,
      assigneeUserId: input.assigneeUserId ?? null,
      createdByUserId: actorUserId,
    },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      task: { select: { id: true, title: true } },
      evidence: {
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      },
      commentThreads: {
        where: {
          targetType: "FINDING",
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          comments: {
            where: { deletedAt: null },
            include: {
              author: { select: { id: true, name: true, email: true } },
            },
            orderBy: [{ createdAt: "asc" }],
          },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      },
      handoffWatch: { select: { id: true, status: true, companyId: true, createdAt: true } },
    },
  });

  await touchRoom(roomId);
  return toFindingSummary(finding);
}

export async function updateDdFinding(
  actorUserId: string,
  findingId: string,
  input: {
    title?: string | null;
    description?: string | null;
    stage?: DdTaskStage;
    workstream?: DdWorkstream;
    severity?: DdFindingSeverity;
    status?: DdFindingStatus;
    impact?: DdFindingImpact;
    recommendedAction?: string | null;
    isBlocking?: boolean;
    dueAt?: Date | null;
    assigneeUserId?: string | null;
    taskId?: string | null;
  },
) {
  const finding = await prisma.ddFinding.findUnique({
    where: { id: findingId },
    include: {
      room: {
        include: {
          workspace: true,
        },
      },
    },
  });

  if (!finding) {
    throw new Error("Funnet finnes ikke.");
  }

  const membership = await requireWorkspaceMembership(actorUserId, finding.room.workspaceId);
  ensureActiveRoomMutation({ status: finding.room.status, workspace: membership.workspace });

  if (input.assigneeUserId) {
    const assigneeMembership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: finding.room.workspaceId,
          userId: input.assigneeUserId,
        },
      },
    });

    if (!assigneeMembership) {
      throw new Error("Valgt ansvarlig ma vare medlem av workspace-et.");
    }
  }

  if (input.taskId) {
    const task = await prisma.ddTask.findUnique({
      where: { id: input.taskId },
      select: { roomId: true },
    });

    if (!task || task.roomId !== finding.roomId) {
      throw new Error("Valgt oppgave horer ikke til dette DD-rommet.");
    }
  }

  const updated = await prisma.ddFinding.update({
    where: { id: findingId },
    data: {
      title: input.title === undefined ? undefined : trimToNull(input.title) ?? finding.title,
      description: input.description === undefined ? undefined : trimToNull(input.description),
      stage: input.stage,
      workstream: input.workstream,
      severity: input.severity,
      status: input.status,
      impact: input.impact,
      recommendedAction: input.recommendedAction === undefined ? undefined : trimToNull(input.recommendedAction),
      isBlocking: input.isBlocking,
      dueAt: input.dueAt === undefined ? undefined : input.dueAt,
      assigneeUserId: input.assigneeUserId === undefined ? undefined : input.assigneeUserId,
      taskId: input.taskId === undefined ? undefined : input.taskId,
      resolvedAt:
        input.status === undefined
          ? undefined
          : isResolvedFindingStatus(input.status)
            ? finding.resolvedAt ?? new Date()
            : null,
    },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      task: { select: { id: true, title: true } },
      evidence: {
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ createdAt: "desc" }],
      },
      commentThreads: {
        where: {
          targetType: "FINDING",
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          comments: {
            where: { deletedAt: null },
            include: {
              author: { select: { id: true, name: true, email: true } },
            },
            orderBy: [{ createdAt: "asc" }],
          },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      },
      handoffWatch: { select: { id: true, status: true, companyId: true, createdAt: true } },
    },
  });

  await touchRoom(finding.roomId);
  return toFindingSummary(updated);
}

export async function getEvidenceContext(roomId: string): Promise<DdEvidenceContext> {
  const room = await prisma.ddRoom.findUnique({
    where: { id: roomId },
    include: { primaryCompany: true },
  });

  if (!room) {
    throw new Error("DD-rommet finnes ikke.");
  }

  const financialStatements = await prisma.financialStatement.findMany({
    where: { companyId: room.primaryCompanyId },
    orderBy: [{ fiscalYear: "desc" }],
    select: {
      id: true,
      fiscalYear: true,
      sourceSystem: true,
      sourceEntityType: true,
      sourceId: true,
      fetchedAt: true,
      normalizedAt: true,
    },
  });

  const company = room.primaryCompany;
  const companyProfileFields: DdEvidenceContext["companyProfileFields"] = [
    { field: "STATUS", label: "Status", value: company.status, sourceSystem: company.sourceSystem, sourceEntityType: company.sourceEntityType, sourceId: company.sourceId, fetchedAt: company.fetchedAt, normalizedAt: company.normalizedAt },
    { field: "LEGAL_FORM", label: "Selskapsform", value: company.legalForm ?? "Ikke tilgjengelig", sourceSystem: company.sourceSystem, sourceEntityType: company.sourceEntityType, sourceId: company.sourceId, fetchedAt: company.fetchedAt, normalizedAt: company.normalizedAt },
    { field: "INDUSTRY_CODE", label: "Naeringskode", value: company.industryCodeId ?? "Ikke tilgjengelig", sourceSystem: company.sourceSystem, sourceEntityType: company.sourceEntityType, sourceId: company.sourceId, fetchedAt: company.fetchedAt, normalizedAt: company.normalizedAt },
    { field: "EMPLOYEE_COUNT", label: "Ansatte", value: company.employeeCount?.toString() ?? "Ikke tilgjengelig", sourceSystem: company.sourceSystem, sourceEntityType: company.sourceEntityType, sourceId: company.sourceId, fetchedAt: company.fetchedAt, normalizedAt: company.normalizedAt },
    { field: "REVENUE", label: "Omsetning", value: company.revenue?.toString() ?? "Ikke tilgjengelig", sourceSystem: company.sourceSystem, sourceEntityType: company.sourceEntityType, sourceId: company.sourceId, fetchedAt: company.fetchedAt, normalizedAt: company.normalizedAt },
    { field: "DESCRIPTION", label: "Beskrivelse", value: company.description ?? "Ikke tilgjengelig", sourceSystem: company.sourceSystem, sourceEntityType: company.sourceEntityType, sourceId: company.sourceId, fetchedAt: company.fetchedAt, normalizedAt: company.normalizedAt },
  ];

  return {
    company: {
      id: company.id,
      name: company.name,
      orgNumber: company.orgNumber,
      sourceSystem: company.sourceSystem,
      sourceEntityType: company.sourceEntityType,
      sourceId: company.sourceId,
      fetchedAt: company.fetchedAt,
      normalizedAt: company.normalizedAt,
    },
    financialStatements,
    companyProfileFields,
  };
}

export async function createDdFindingEvidence(
  actorUserId: string,
  findingId: string,
  input: {
    type: DdFindingEvidenceType;
    note?: string | null;
    companyProfileField?: DdCompanyProfileField | null;
    financialStatementId?: string | null;
    taskId?: string | null;
    findingReferenceId?: string | null;
    announcementId?: string | null;
    announcementSourceId?: string | null;
    announcementSourceSystem?: string | null;
    announcementPublishedAt?: Date | null;
    announcementLabel?: string | null;
  },
) {
  const finding = await prisma.ddFinding.findUnique({
    where: { id: findingId },
    include: {
      room: {
        include: {
          workspace: true,
          primaryCompany: true,
        },
      },
    },
  });

  if (!finding) {
    throw new Error("Funnet finnes ikke.");
  }

  const membership = await requireWorkspaceMembership(actorUserId, finding.room.workspaceId);
  ensureActiveRoomMutation({ status: finding.room.status, workspace: membership.workspace });

  let payload: {
    label: string;
    sourceSystem: string;
    sourceEntityType: string;
    sourceId: string;
    fetchedAt?: Date | null;
    normalizedAt?: Date | null;
    targetCompanyId?: string | null;
    targetFinancialStatementId?: string | null;
    targetTaskId?: string | null;
    targetFindingId?: string | null;
    targetAnnouncementId?: string | null;
    targetAnnouncementSourceId?: string | null;
    targetAnnouncementSourceSystem?: string | null;
    targetAnnouncementPublishedAt?: Date | null;
    targetCompanyProfileField?: DdCompanyProfileField | null;
  } | null = null;

  if (input.type === "COMPANY") {
    payload = {
      label: `${finding.room.primaryCompany.name} (${finding.room.primaryCompany.orgNumber})`,
      sourceSystem: finding.room.primaryCompany.sourceSystem,
      sourceEntityType: finding.room.primaryCompany.sourceEntityType,
      sourceId: finding.room.primaryCompany.sourceId,
      fetchedAt: finding.room.primaryCompany.fetchedAt,
      normalizedAt: finding.room.primaryCompany.normalizedAt,
      targetCompanyId: finding.room.primaryCompanyId,
    };
  } else if (input.type === "COMPANY_PROFILE_FIELD") {
    if (!input.companyProfileField) {
      throw new Error("Velg hvilket selskapsfelt som skal brukes som evidens.");
    }

    const context = await getEvidenceContext(finding.roomId);
    const field = context.companyProfileFields.find((item) => item.field === input.companyProfileField);
    if (!field) {
      throw new Error("Fant ikke valgt selskapsfelt.");
    }

    payload = {
      label: `${field.label}: ${field.value}`,
      sourceSystem: field.sourceSystem,
      sourceEntityType: field.sourceEntityType,
      sourceId: field.sourceId,
      fetchedAt: field.fetchedAt,
      normalizedAt: field.normalizedAt,
      targetCompanyId: finding.room.primaryCompanyId,
      targetCompanyProfileField: field.field,
    };
  } else if (input.type === "FINANCIAL_STATEMENT") {
    if (!input.financialStatementId) {
      throw new Error("Velg et finansregnskap som evidens.");
    }

    const statement = await prisma.financialStatement.findUnique({ where: { id: input.financialStatementId } });
    if (!statement || statement.companyId !== finding.room.primaryCompanyId) {
      throw new Error("Valgt finansregnskap horer ikke til primarselskapet.");
    }

    payload = {
      label: `Arsregnskap ${statement.fiscalYear}`,
      sourceSystem: statement.sourceSystem,
      sourceEntityType: statement.sourceEntityType,
      sourceId: statement.sourceId,
      fetchedAt: statement.fetchedAt,
      normalizedAt: statement.normalizedAt,
      targetFinancialStatementId: statement.id,
    };
  } else if (input.type === "TASK") {
    if (!input.taskId) {
      throw new Error("Velg en oppgave som evidens.");
    }

    const task = await prisma.ddTask.findUnique({
      where: { id: input.taskId },
      select: { id: true, roomId: true, title: true },
    });

    if (!task || task.roomId !== finding.roomId) {
      throw new Error("Valgt oppgave horer ikke til dette rommet.");
    }

    payload = {
      label: `Oppgave: ${task.title}`,
      sourceSystem: "PROJECTX",
      sourceEntityType: "DdTask",
      sourceId: task.id,
      targetTaskId: task.id,
    };
  } else if (input.type === "FINDING") {
    if (!input.findingReferenceId) {
      throw new Error("Velg et funn som evidens.");
    }

    const relatedFinding = await prisma.ddFinding.findUnique({
      where: { id: input.findingReferenceId },
      select: { id: true, roomId: true, title: true },
    });

    if (!relatedFinding || relatedFinding.roomId !== finding.roomId) {
      throw new Error("Valgt funn horer ikke til dette rommet.");
    }

    payload = {
      label: `Funn: ${relatedFinding.title}`,
      sourceSystem: "PROJECTX",
      sourceEntityType: "DdFinding",
      sourceId: relatedFinding.id,
      targetFindingId: relatedFinding.id,
    };
  } else if (input.type === "ANNOUNCEMENT") {
    if (!input.announcementId || !input.announcementSourceSystem || !input.announcementSourceId) {
      throw new Error("Kunngjoring krever announcementId, sourceSystem og sourceId.");
    }

    payload = {
      label: trimToNull(input.announcementLabel) ?? `Kunngjoring ${input.announcementId}`,
      sourceSystem: input.announcementSourceSystem,
      sourceEntityType: "Announcement",
      sourceId: input.announcementSourceId,
      targetAnnouncementId: input.announcementId,
      targetAnnouncementSourceId: input.announcementSourceId,
      targetAnnouncementSourceSystem: input.announcementSourceSystem,
      targetAnnouncementPublishedAt: input.announcementPublishedAt ?? null,
    };
  }

  if (!payload) {
    throw new Error("Ugyldig evidenstype.");
  }

  const evidence = await prisma.ddFindingEvidence.create({
    data: {
      findingId,
      type: input.type,
      label: payload.label,
      note: trimToNull(input.note),
      sourceSystem: payload.sourceSystem,
      sourceEntityType: payload.sourceEntityType,
      sourceId: payload.sourceId,
      fetchedAt: payload.fetchedAt ?? null,
      normalizedAt: payload.normalizedAt ?? null,
      targetCompanyId: payload.targetCompanyId ?? null,
      targetFinancialStatementId: payload.targetFinancialStatementId ?? null,
      targetTaskId: payload.targetTaskId ?? null,
      targetFindingId: payload.targetFindingId ?? null,
      targetAnnouncementId: payload.targetAnnouncementId ?? null,
      targetAnnouncementSourceId: payload.targetAnnouncementSourceId ?? null,
      targetAnnouncementSourceSystem: payload.targetAnnouncementSourceSystem ?? null,
      targetAnnouncementPublishedAt: payload.targetAnnouncementPublishedAt ?? null,
      targetCompanyProfileField: payload.targetCompanyProfileField ?? null,
      createdByUserId: actorUserId,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  await touchRoom(finding.roomId);
  return toEvidenceSummary(evidence);
}

export async function getDdConclusion(roomId: string): Promise<DdConclusionSummary | null> {
  const conclusion = await prisma.ddConclusion.findUnique({
    where: { roomId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },
    },
  });

  return conclusion ? toConclusionSummary(conclusion) : null;
}

export async function getDdDecisionHistory(roomId: string): Promise<DdDecisionLogEntrySummary[]> {
  const entries = await prisma.ddDecisionLogEntry.findMany({
    where: { roomId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 20,
  });

  return entries.map(toDecisionLogSummary);
}

export async function upsertDdConclusion(
  actorUserId: string,
  roomId: string,
  input: {
    investmentCaseSummary?: string | null;
    valueDriversSummary?: string | null;
    keyRisksSummary?: string | null;
    recommendationRationale?: string | null;
    monitoringPlan?: string | null;
    outcome?: DdDecisionOutcome | null;
    isFinal?: boolean | null;
    decisionNote?: string | null;
  },
) {
  const { room } = await getAuthorizedRoom(actorUserId, roomId);
  ensureActiveRoomMutation(room);

  const unresolvedBlockingFindings = await prisma.ddFinding.count({
    where: {
      roomId,
      isBlocking: true,
      status: {
        notIn: [DdFindingStatus.MITIGATED, DdFindingStatus.ACCEPTED, DdFindingStatus.CLOSED],
      },
    },
  });

  if (input.isFinal && unresolvedBlockingFindings > 0) {
    throw new Error("Du kan ikke markere konklusjonen som endelig mens blocker-funn fortsatt er uavklart.");
  }

  const investmentCaseSummary = trimToNull(input.investmentCaseSummary);
  const valueDriversSummary = trimToNull(input.valueDriversSummary);
  const keyRisksSummary = trimToNull(input.keyRisksSummary);
  const recommendationRationale = trimToNull(input.recommendationRationale);
  const monitoringPlan = trimToNull(input.monitoringPlan);
  const decisionNote = trimToNull(input.decisionNote);
  const isFinal = Boolean(input.isFinal);
  const outcome = input.outcome ?? null;

  const conclusion = await prisma.$transaction(async (tx) => {
    const savedConclusion = await tx.ddConclusion.upsert({
      where: { roomId },
      update: {
        investmentCaseSummary,
        valueDriversSummary,
        keyRisksSummary,
        recommendationRationale,
        monitoringPlan,
        outcome,
        isFinal,
        updatedByUserId: actorUserId,
      },
      create: {
        roomId,
        investmentCaseSummary,
        valueDriversSummary,
        keyRisksSummary,
        recommendationRationale,
        monitoringPlan,
        outcome,
        isFinal,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await tx.ddDecisionLogEntry.create({
      data: {
        roomId,
        conclusionId: savedConclusion.id,
        outcome,
        isFinal,
        investmentCaseSummary,
        valueDriversSummary,
        keyRisksSummary,
        recommendationRationale,
        monitoringPlan,
        note: decisionNote,
        createdByUserId: actorUserId,
      },
    });

    return savedConclusion;
  });

  await touchRoom(roomId);
  return toConclusionSummary(conclusion);
}

export async function handoffFindingToWorkspaceWatch(actorUserId: string, findingId: string) {
  const finding = await prisma.ddFinding.findUnique({
    where: { id: findingId },
    include: {
      room: {
        include: {
          workspace: true,
          primaryCompany: { select: { id: true } },
        },
      },
    },
  });

  if (!finding) {
    throw new Error("Funnet finnes ikke.");
  }

  const membership = await requireWorkspaceMembership(actorUserId, finding.room.workspaceId);
  ensureActiveRoomMutation({ status: finding.room.status, workspace: membership.workspace });

  const capabilities = await getUserWorkspaceCapabilities(
    actorUserId,
    membership.role,
    membership.workspace.status,
    membership.workspace.type,
  );
  if (!capabilities.canManageWatches) {
    throw new Error("Du kan ikke opprette abonnementer fra dette workspace-et.");
  }

  if (finding.impact !== DdFindingImpact.MONITORING) {
    throw new Error("Bare funn med monitoring-pavirkning kan handoffes til overvaking.");
  }

  const watch = await prisma.workspaceWatch.upsert({
    where: {
      workspaceId_companyId: {
        workspaceId: finding.room.workspaceId,
        companyId: finding.room.primaryCompany.id,
      },
    },
    update: {
      status: WorkspaceWatchStatus.ACTIVE,
      archivedAt: null,
      watchAnnouncements: true,
      watchFinancialStatements: true,
      watchStatusChanges: true,
    },
    create: {
      workspaceId: finding.room.workspaceId,
      companyId: finding.room.primaryCompany.id,
      status: WorkspaceWatchStatus.ACTIVE,
      watchAnnouncements: true,
      watchFinancialStatements: true,
      watchStatusChanges: true,
    },
    select: { id: true },
  });

  await prisma.ddFinding.update({
    where: { id: findingId },
    data: { handoffWatchId: watch.id },
  });

  await touchRoom(finding.roomId);
  return watch.id;
}

export function getFindingSeverityOptions() {
  return [
    { value: DdFindingSeverity.LOW, label: "Lav" },
    { value: DdFindingSeverity.MEDIUM, label: "Medium" },
    { value: DdFindingSeverity.HIGH, label: "Hoy" },
    { value: DdFindingSeverity.CRITICAL, label: "Kritisk" },
  ];
}

export function getFindingImpactOptions() {
  return [
    { value: DdFindingImpact.NONE, label: "Ingen direkte pavirkning" },
    { value: DdFindingImpact.THESIS_RISK, label: "Case-risiko" },
    { value: DdFindingImpact.VALUATION, label: "Verdsettelse" },
    { value: DdFindingImpact.DOWNSIDE, label: "Nedside" },
    { value: DdFindingImpact.UPSIDE, label: "Oppside" },
    { value: DdFindingImpact.MONITORING, label: "Overvaking" },
    { value: DdFindingImpact.NO_GO, label: "No-go" },
  ];
}

export function getFindingStatusOptions() {
  return [
    { value: DdFindingStatus.OPEN, label: "Apen" },
    { value: DdFindingStatus.IN_REVIEW, label: "Under vurdering" },
    { value: DdFindingStatus.MITIGATED, label: "Mitigert" },
    { value: DdFindingStatus.ACCEPTED, label: "Akseptert" },
    { value: DdFindingStatus.CLOSED, label: "Lukket" },
  ];
}

export function getDecisionOutcomeOptions() {
  return [
    { value: DdDecisionOutcome.INVEST, label: "Invester" },
    { value: DdDecisionOutcome.INVEST_WITH_CONDITIONS, label: "Invester med vilkar" },
    { value: DdDecisionOutcome.WATCH, label: "Sett pa watch" },
    { value: DdDecisionOutcome.PASS, label: "Pass" },
  ];
}

export function getCompanyProfileFieldLabel(field: DdCompanyProfileField) {
  const labels: Record<DdCompanyProfileField, string> = {
    STATUS: "Status",
    LEGAL_FORM: "Selskapsform",
    INDUSTRY_CODE: "Naeringskode",
    EMPLOYEE_COUNT: "Ansatte",
    REVENUE: "Omsetning",
    DESCRIPTION: "Beskrivelse",
  };

  return labels[field];
}

export function getWorkstreamLabel(workstream: DdWorkstream) {
  return getWorkstreamConfig(workstream).label;
}
