import {
  DdFinding,
  DdTaskPriority,
  DdTaskStage,
  DdTaskStatus,
  DdWorkstream,
  WorkspaceStatus,
} from "@prisma/client";

import {
  DdCommentThreadTargetType,
  DdFindingSummary,
  DdTaskSummary,
  DdWorkflowStageSummary,
  DdWorkstreamSummary,
} from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { toCommentThreadSummary } from "@/server/services/dd-comment-service";
import { requireWorkspaceMembership } from "@/server/services/workspace-service";

const WORKFLOW_STAGE_CONFIG: Array<{
  stage: DdTaskStage;
  label: string;
  description: string;
  order: number;
}> = [
  {
    stage: DdTaskStage.COLLECTION,
    label: "Innsamling",
    description: "Samle grunnleggende dokumenter, registre og datakilder for caset.",
    order: 1,
  },
  {
    stage: DdTaskStage.COMPANY_UNDERSTANDING,
    label: "Selskapsforstaelse",
    description: "Bygg felles forstaelse av virksomhet, marked, struktur og historikk.",
    order: 2,
  },
  {
    stage: DdTaskStage.MANAGEMENT_OWNERSHIP,
    label: "Ledelse og eierskap",
    description: "Vurder ledelse, styre, nokkelpersoner og eierskapsbilde.",
    order: 3,
  },
  {
    stage: DdTaskStage.FINANCIAL_REVIEW,
    label: "Regnskap og likviditet",
    description: "Ga gjennom regnskapstall, kapitalbinding, marginer og likviditet.",
    order: 4,
  },
  {
    stage: DdTaskStage.LEGAL_REGULATORY,
    label: "Juridisk og regulatorisk",
    description: "Kartlegg juridiske forhold, kontrakter, kunngjoringer og regulatoriske signaler.",
    order: 5,
  },
  {
    stage: DdTaskStage.RISK_ASSESSMENT,
    label: "Risikovurdering",
    description: "Samle funn, avklar blokkere og vurder viktigste risikodrivere.",
    order: 6,
  },
  {
    stage: DdTaskStage.CONCLUSION,
    label: "Konklusjon",
    description: "Oppsummer beslutningsgrunnlag, anbefaling og apne sporsmal.",
    order: 7,
  },
];

const WORKSTREAM_CONFIG: Array<{
  workstream: DdWorkstream;
  label: string;
  description: string;
  order: number;
}> = [
  {
    workstream: DdWorkstream.FINANCIAL,
    label: "Finansiell",
    description: "Regnskap, kontantstrom, kapitalbehov og verdsettelse.",
    order: 1,
  },
  {
    workstream: DdWorkstream.COMMERCIAL,
    label: "Kommersiell",
    description: "Marked, kunder, konkurransekraft og investeringscase.",
    order: 2,
  },
  {
    workstream: DdWorkstream.LEGAL,
    label: "Juridisk",
    description: "Avtaler, tvister, rettigheter og formelle forpliktelser.",
    order: 3,
  },
  {
    workstream: DdWorkstream.OPERATIONAL,
    label: "Operasjonell",
    description: "Drift, leveranse, organisering og gjennomforingsevne.",
    order: 4,
  },
  {
    workstream: DdWorkstream.REGULATORY,
    label: "Regulatorisk",
    description: "Tilsyn, rapportering, statusendringer og myndighetsforhold.",
    order: 5,
  },
  {
    workstream: DdWorkstream.ESG,
    label: "ESG",
    description: "Miljo, styring, samfunnsansvar og baerekraftsrisiko.",
    order: 6,
  },
];

const TASK_STATUS_ORDER: Record<DdTaskStatus, number> = {
  TODO: 1,
  IN_PROGRESS: 2,
  BLOCKED: 3,
  DONE: 4,
};

export function inferWorkstreamFromStage(stage: DdTaskStage): DdWorkstream {
  if (stage === DdTaskStage.FINANCIAL_REVIEW) {
    return DdWorkstream.FINANCIAL;
  }

  if (stage === DdTaskStage.LEGAL_REGULATORY) {
    return DdWorkstream.REGULATORY;
  }

  if (stage === DdTaskStage.MANAGEMENT_OWNERSHIP) {
    return DdWorkstream.OPERATIONAL;
  }

  if (stage === DdTaskStage.RISK_ASSESSMENT || stage === DdTaskStage.CONCLUSION) {
    return DdWorkstream.COMMERCIAL;
  }

  return DdWorkstream.COMMERCIAL;
}

function toTaskSummary(task: {
  id: string;
  roomId: string;
  title: string;
  description: string | null;
  stage: DdTaskStage;
  workstream: DdWorkstream | null;
  status: DdTaskStatus;
  priority: DdTaskPriority;
  dueAt: Date | null;
  completedAt: Date | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  assignee: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  };
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
    createdBy: {
      id: string;
      name: string | null;
      email: string;
    };
    comments: Array<{
      id: string;
      threadId: string;
      parentCommentId: string | null;
      content: string;
      createdAt: Date;
      updatedAt: Date;
      author: {
        id: string;
        name: string | null;
        email: string;
      };
    }>;
  }>;
}): DdTaskSummary {
  const primaryThread = task.commentThreads[0] ?? null;

  return {
    id: task.id,
    roomId: task.roomId,
    title: task.title,
    description: task.description,
    stage: task.stage,
    workstream: task.workstream ?? inferWorkstreamFromStage(task.stage),
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt,
    completedAt: task.completedAt,
    sortOrder: task.sortOrder,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    assignee: task.assignee
      ? {
          userId: task.assignee.id,
          name: task.assignee.name,
          email: task.assignee.email,
        }
      : null,
    createdBy: {
      userId: task.createdBy.id,
      name: task.createdBy.name,
      email: task.createdBy.email,
    },
    commentThread: primaryThread ? toCommentThreadSummary(primaryThread) : null,
  };
}

export function buildWorkflowSummary(
  tasks: DdTaskSummary[],
  findings: DdFindingSummary[] = [],
  activeWorkstream: DdWorkstream | null = null,
) {
  const visibleTasks = activeWorkstream ? tasks.filter((task) => task.workstream === activeWorkstream) : tasks;

  const stages: DdWorkflowStageSummary[] = WORKFLOW_STAGE_CONFIG.map((config) => {
    const stageTasks = visibleTasks
      .filter((task) => task.stage === config.stage)
      .sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }

        if (left.status !== right.status) {
          return TASK_STATUS_ORDER[left.status] - TASK_STATUS_ORDER[right.status];
        }

        return left.createdAt.getTime() - right.createdAt.getTime();
      });

    const totalTasks = stageTasks.length;
    const completedTasks = stageTasks.filter((task) => task.status === "DONE").length;
    const activeTasks = stageTasks.filter((task) => task.status === "IN_PROGRESS").length;
    const blockedTasks = stageTasks.filter((task) => task.status === "BLOCKED").length;

    return {
      stage: config.stage,
      label: config.label,
      description: config.description,
      order: config.order,
      totalTasks,
      completedTasks,
      activeTasks,
      blockedTasks,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      tasks: stageTasks,
    };
  });

  const workstreams: DdWorkstreamSummary[] = WORKSTREAM_CONFIG.map((config) => {
    const workstreamTasks = tasks.filter((task) => task.workstream === config.workstream);
    const workstreamFindings = findings.filter((finding) => finding.workstream === config.workstream);

    return {
      workstream: config.workstream,
      label: config.label,
      description: config.description,
      order: config.order,
      taskCount: workstreamTasks.length,
      openFindingCount: workstreamFindings.filter((finding) => finding.status !== "CLOSED").length,
      blockingFindingCount: workstreamFindings.filter(
        (finding) => finding.isBlocking && finding.status !== "CLOSED",
      ).length,
    };
  });

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.status === "DONE").length;

  return {
    stages,
    workstreams,
    totalTasks,
    completedTasks,
    completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    activeWorkstream,
  };
}

export async function getRoomWorkflowTasks(roomId: string) {
  const tasks = await prisma.ddTask.findMany({
    where: {
      roomId,
    },
    include: {
      assignee: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      commentThreads: {
        where: {
          targetType: "TASK",
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          comments: {
            where: {
              deletedAt: null,
            },
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
            orderBy: [{ createdAt: "asc" }],
          },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      },
    },
    orderBy: [{ stage: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return tasks.map(toTaskSummary);
}

export async function createDdTask(
  actorUserId: string,
  roomId: string,
  input: {
    title: string;
    description?: string | null;
    stage: DdTaskStage;
    workstream?: DdWorkstream | null;
    priority?: DdTaskPriority | null;
    dueAt?: Date | null;
    assigneeUserId?: string | null;
  },
) {
  const room = await prisma.ddRoom.findUnique({
    where: {
      id: roomId,
    },
    include: {
      workspace: true,
    },
  });

  if (!room) {
    throw new Error("DD-rommet finnes ikke.");
  }

  const membership = await requireWorkspaceMembership(actorUserId, room.workspaceId);
  if (membership.workspace.status !== WorkspaceStatus.ACTIVE || room.status !== "ACTIVE") {
    throw new Error("Oppgaver kan bare opprettes i aktive rom og workspaces.");
  }

  const assigneeUserId = input.assigneeUserId ?? null;
  if (assigneeUserId) {
    const assigneeMembership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: room.workspaceId,
          userId: assigneeUserId,
        },
      },
    });

    if (!assigneeMembership) {
      throw new Error("Valgt ansvarlig ma vare medlem av workspace-et.");
    }
  }

  const sortOrderAggregate = await prisma.ddTask.aggregate({
    where: {
      roomId,
      stage: input.stage,
    },
    _max: {
      sortOrder: true,
    },
  });

  const task = await prisma.ddTask.create({
    data: {
      roomId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      stage: input.stage,
      workstream: input.workstream ?? inferWorkstreamFromStage(input.stage),
      priority: input.priority ?? DdTaskPriority.MEDIUM,
      dueAt: input.dueAt ?? null,
      assigneeUserId,
      createdByUserId: actorUserId,
      sortOrder: (sortOrderAggregate._max.sortOrder ?? -1) + 1,
    },
  });

  await prisma.ddRoom.update({
    where: {
      id: roomId,
    },
    data: {
      lastActivityAt: new Date(),
    },
  });

  return task;
}

export async function updateDdTaskStatus(actorUserId: string, taskId: string, status: DdTaskStatus) {
  const task = await prisma.ddTask.findUnique({
    where: {
      id: taskId,
    },
    include: {
      room: true,
    },
  });

  if (!task) {
    throw new Error("Oppgaven finnes ikke.");
  }

  const membership = await requireWorkspaceMembership(actorUserId, task.room.workspaceId);
  if (membership.workspace.status !== WorkspaceStatus.ACTIVE || task.room.status !== "ACTIVE") {
    throw new Error("Oppgaver i arkiverte rom eller workspaces kan ikke oppdateres.");
  }

  await prisma.ddTask.update({
    where: {
      id: taskId,
    },
    data: {
      status,
      completedAt: status === DdTaskStatus.DONE ? new Date() : null,
    },
  });

  await prisma.ddRoom.update({
    where: {
      id: task.roomId,
    },
    data: {
      lastActivityAt: new Date(),
    },
  });

  return task.roomId;
}

export function getWorkflowStageOptions() {
  return WORKFLOW_STAGE_CONFIG.map((config) => ({
    value: config.stage,
    label: config.label,
    description: config.description,
    order: config.order,
  }));
}

export function getWorkstreamOptions() {
  return WORKSTREAM_CONFIG.map((config) => ({
    value: config.workstream,
    label: config.label,
    description: config.description,
    order: config.order,
  }));
}

export function getWorkstreamConfig(workstream: DdWorkstream) {
  return WORKSTREAM_CONFIG.find((item) => item.workstream === workstream) ?? WORKSTREAM_CONFIG[0];
}

export function getStageConfig(stage: DdTaskStage) {
  return WORKFLOW_STAGE_CONFIG.find((item) => item.stage === stage) ?? WORKFLOW_STAGE_CONFIG[0];
}

export function countOpenFindings(findings: DdFinding[]) {
  return findings.filter((finding) => finding.status !== "CLOSED").length;
}
