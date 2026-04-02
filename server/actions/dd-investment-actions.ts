"use server";

import {
  DdCompanyProfileField,
  DdDecisionOutcome,
  DdFindingImpact,
  DdFindingSeverity,
  DdFindingStatus,
  DdFindingEvidenceType,
  DdTaskStage,
  DdWorkstream,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { rethrowIfRedirectError } from "@/lib/redirect-error";
import {
  createDdFinding,
  createDdFindingEvidence,
  handoffFindingToWorkspaceWatch,
  upsertDdConclusion,
  upsertDdMandate,
  updateDdFinding,
} from "@/server/services/dd-investment-service";

const mandateSchema = z.object({
  roomId: z.string().min(1),
  investmentCase: z.string().trim().optional(),
  thesis: z.string().trim().optional(),
  valueDrivers: z.string().trim().optional(),
  keyRisks: z.string().trim().optional(),
  timeHorizon: z.string().trim().optional(),
  decisionGoal: z.string().trim().optional(),
});

const createFindingSchema = z.object({
  roomId: z.string().min(1),
  title: z.string().trim().min(2),
  description: z.string().trim().optional(),
  stage: z.nativeEnum(DdTaskStage),
  workstream: z.nativeEnum(DdWorkstream),
  severity: z.nativeEnum(DdFindingSeverity).optional(),
  status: z.nativeEnum(DdFindingStatus).optional(),
  impact: z.nativeEnum(DdFindingImpact).optional(),
  recommendedAction: z.string().trim().optional(),
  isBlocking: z.string().optional(),
  dueAt: z.string().optional(),
  assigneeUserId: z.string().optional(),
  taskId: z.string().optional(),
});

const updateFindingSchema = z.object({
  findingId: z.string().min(1),
  roomId: z.string().min(1),
  status: z.nativeEnum(DdFindingStatus),
  severity: z.nativeEnum(DdFindingSeverity),
  impact: z.nativeEnum(DdFindingImpact),
  recommendedAction: z.string().trim().optional(),
  isBlocking: z.string().optional(),
});

const evidenceSchema = z.object({
  findingId: z.string().min(1),
  roomId: z.string().min(1),
  type: z.nativeEnum(DdFindingEvidenceType),
  note: z.string().trim().optional(),
  companyProfileField: z.nativeEnum(DdCompanyProfileField).optional(),
  financialStatementId: z.string().optional(),
  taskId: z.string().optional(),
  findingReferenceId: z.string().optional(),
  announcementId: z.string().optional(),
  announcementSourceId: z.string().optional(),
  announcementSourceSystem: z.string().trim().optional(),
  announcementPublishedAt: z.string().optional(),
  announcementLabel: z.string().trim().optional(),
});

const conclusionSchema = z.object({
  roomId: z.string().min(1),
  investmentCaseSummary: z.string().trim().optional(),
  valueDriversSummary: z.string().trim().optional(),
  keyRisksSummary: z.string().trim().optional(),
  recommendationRationale: z.string().trim().optional(),
  monitoringPlan: z.string().trim().optional(),
  decisionNote: z.string().trim().optional(),
  outcome: z.nativeEnum(DdDecisionOutcome).optional(),
  isFinal: z.string().optional(),
});

const handoffSchema = z.object({
  findingId: z.string().min(1),
  roomId: z.string().min(1),
});

function buildRoomUrl(roomId: string, notice?: string, error?: string, workstream?: string | null) {
  const params = new URLSearchParams();
  if (notice) {
    params.set("notice", notice);
  }
  if (error) {
    params.set("error", error);
  }
  if (workstream) {
    params.set("workstream", workstream);
  }
  const query = params.toString();
  return query ? `/dd/${roomId}?${query}` : `/dd/${roomId}`;
}

async function requireAuthenticatedUserId() {
  const session = await safeAuth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }
  return userId;
}

export async function saveDdMandateAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = mandateSchema.parse({
      roomId: formData.get("roomId"),
      investmentCase: formData.get("investmentCase") ?? undefined,
      thesis: formData.get("thesis") ?? undefined,
      valueDrivers: formData.get("valueDrivers") ?? undefined,
      keyRisks: formData.get("keyRisks") ?? undefined,
      timeHorizon: formData.get("timeHorizon") ?? undefined,
      decisionGoal: formData.get("decisionGoal") ?? undefined,
    });

    await upsertDdMandate(userId, values.roomId, values);
    revalidatePath(`/dd/${values.roomId}`);
    redirect(buildRoomUrl(values.roomId, "Mandatet ble lagret.", undefined, String(formData.get("workstream") ?? "") || null) as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const roomId = String(formData.get("roomId") ?? "");
    const workstream = String(formData.get("workstream") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke lagre mandatet.";
    redirect(buildRoomUrl(roomId, undefined, message, workstream || null) as never);
  }
}

export async function createDdFindingAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = createFindingSchema.parse({
      roomId: formData.get("roomId"),
      title: formData.get("title"),
      description: formData.get("description") ?? undefined,
      stage: formData.get("stage"),
      workstream: formData.get("workstream"),
      severity: formData.get("severity") ?? undefined,
      status: formData.get("status") ?? undefined,
      impact: formData.get("impact") ?? undefined,
      recommendedAction: formData.get("recommendedAction") ?? undefined,
      isBlocking: formData.get("isBlocking") ?? undefined,
      dueAt: formData.get("dueAt") ?? undefined,
      assigneeUserId: formData.get("assigneeUserId") ?? undefined,
      taskId: formData.get("taskId") ?? undefined,
    });

    await createDdFinding(userId, values.roomId, {
      ...values,
      isBlocking: values.isBlocking === "on",
      dueAt: values.dueAt ? new Date(values.dueAt) : null,
      assigneeUserId: values.assigneeUserId || null,
      taskId: values.taskId || null,
    });

    revalidatePath(`/dd/${values.roomId}`);
    redirect(buildRoomUrl(values.roomId, "Funnet ble opprettet.", undefined, values.workstream) as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const roomId = String(formData.get("roomId") ?? "");
    const workstream = String(formData.get("workstream") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke opprette funnet.";
    redirect(buildRoomUrl(roomId, undefined, message, workstream || null) as never);
  }
}

export async function updateDdFindingAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = updateFindingSchema.parse({
      findingId: formData.get("findingId"),
      roomId: formData.get("roomId"),
      status: formData.get("status"),
      severity: formData.get("severity"),
      impact: formData.get("impact"),
      recommendedAction: formData.get("recommendedAction") ?? undefined,
      isBlocking: formData.get("isBlocking") ?? undefined,
    });

    await updateDdFinding(userId, values.findingId, {
      status: values.status,
      severity: values.severity,
      impact: values.impact,
      recommendedAction: values.recommendedAction,
      isBlocking: values.isBlocking === "on",
    });

    revalidatePath(`/dd/${values.roomId}`);
    redirect(buildRoomUrl(values.roomId, "Funnet ble oppdatert.", undefined, String(formData.get("workstream") ?? "") || null) as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const roomId = String(formData.get("roomId") ?? "");
    const workstream = String(formData.get("workstream") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke oppdatere funnet.";
    redirect(buildRoomUrl(roomId, undefined, message, workstream || null) as never);
  }
}

export async function addDdFindingEvidenceAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = evidenceSchema.parse({
      findingId: formData.get("findingId"),
      roomId: formData.get("roomId"),
      type: formData.get("type"),
      note: formData.get("note") ?? undefined,
      companyProfileField: formData.get("companyProfileField") ?? undefined,
      financialStatementId: formData.get("financialStatementId") ?? undefined,
      taskId: formData.get("taskId") ?? undefined,
      findingReferenceId: formData.get("findingReferenceId") ?? undefined,
      announcementId: formData.get("announcementId") ?? undefined,
      announcementSourceId: formData.get("announcementSourceId") ?? undefined,
      announcementSourceSystem: formData.get("announcementSourceSystem") ?? undefined,
      announcementPublishedAt: formData.get("announcementPublishedAt") ?? undefined,
      announcementLabel: formData.get("announcementLabel") ?? undefined,
    });

    await createDdFindingEvidence(userId, values.findingId, {
      ...values,
      announcementPublishedAt: values.announcementPublishedAt ? new Date(values.announcementPublishedAt) : null,
    });

    revalidatePath(`/dd/${values.roomId}`);
    redirect(buildRoomUrl(values.roomId, "Evidens ble lagt til.", undefined, String(formData.get("workstream") ?? "") || null) as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const roomId = String(formData.get("roomId") ?? "");
    const workstream = String(formData.get("workstream") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke legge til evidens.";
    redirect(buildRoomUrl(roomId, undefined, message, workstream || null) as never);
  }
}

export async function saveDdConclusionAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = conclusionSchema.parse({
      roomId: formData.get("roomId"),
      investmentCaseSummary: formData.get("investmentCaseSummary") ?? undefined,
      valueDriversSummary: formData.get("valueDriversSummary") ?? undefined,
      keyRisksSummary: formData.get("keyRisksSummary") ?? undefined,
      recommendationRationale: formData.get("recommendationRationale") ?? undefined,
      monitoringPlan: formData.get("monitoringPlan") ?? undefined,
      decisionNote: formData.get("decisionNote") ?? undefined,
      outcome: formData.get("outcome") ?? undefined,
      isFinal: formData.get("isFinal") ?? undefined,
    });

    await upsertDdConclusion(userId, values.roomId, {
      ...values,
      isFinal: values.isFinal === "on",
    });

    revalidatePath(`/dd/${values.roomId}`);
    redirect(buildRoomUrl(values.roomId, "Investeringskonklusjonen ble lagret.", undefined, String(formData.get("workstream") ?? "") || null) as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const roomId = String(formData.get("roomId") ?? "");
    const workstream = String(formData.get("workstream") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke lagre konklusjonen.";
    redirect(buildRoomUrl(roomId, undefined, message, workstream || null) as never);
  }
}

export async function handoffFindingToWatchAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = handoffSchema.parse({
      findingId: formData.get("findingId"),
      roomId: formData.get("roomId"),
    });

    await handoffFindingToWorkspaceWatch(userId, values.findingId);
    revalidatePath(`/dd/${values.roomId}`);
    revalidatePath("/dashboard");
    redirect(buildRoomUrl(values.roomId, "Funnet ble sendt til overvaking.", undefined, String(formData.get("workstream") ?? "") || null) as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const roomId = String(formData.get("roomId") ?? "");
    const workstream = String(formData.get("workstream") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke sende funnet til overvaking.";
    redirect(buildRoomUrl(roomId, undefined, message, workstream || null) as never);
  }
}
