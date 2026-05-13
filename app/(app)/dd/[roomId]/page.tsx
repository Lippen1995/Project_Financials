import Link from "next/link";
import { DdWorkstream } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

import { Card } from "@/components/ui/card";
import { safeAuth } from "@/lib/auth";
import { buildThreadedComments, ThreadedCommentNode } from "@/lib/comment-thread";
import { DdCommentThreadSummary, DdFindingEvidenceSummary } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import {
  createDdFindingCommentAction,
  createDdTaskCommentAction,
} from "@/server/actions/dd-comment-actions";
import { createDdPostAction, createDdPostCommentAction } from "@/server/actions/dd-post-actions";
import {
  addDdFindingEvidenceAction,
  createDdFindingAction,
  handoffFindingToWatchAction,
  saveDdConclusionAction,
  saveDdMandateAction,
  updateDdFindingAction,
} from "@/server/actions/dd-investment-actions";
import { archiveDdRoomAction, reopenDdRoomAction } from "@/server/actions/dd-room-actions";
import { createDdTaskAction, updateDdTaskStatusAction } from "@/server/actions/dd-task-actions";
import {
  getCompanyProfileFieldLabel,
  getDecisionOutcomeOptions,
  getFindingImpactOptions,
  getFindingSeverityOptions,
  getFindingStatusOptions,
  getWorkstreamLabel,
} from "@/server/services/dd-investment-service";
import { getDdRoomDetail } from "@/server/services/dd-room-service";
import { getWorkflowStageOptions, getWorkstreamOptions } from "@/server/services/dd-workflow-service";

type DdHref = `/dd/${string}` | `/dd/${string}?workstream=${string}`;

function badge(text: string, className = "border-[rgba(15,23,42,0.1)] bg-white text-slate-600") {
  return <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${className}`}>{text}</span>;
}

function filterHref(roomId: string, workstream: string | null): DdHref {
  return (workstream ? `/dd/${roomId}?workstream=${workstream}` : `/dd/${roomId}`) as DdHref;
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function buildCompanyProfileHref(companyOrgNumber: string, roomId: string, tab?: string) {
  const params = new URLSearchParams();
  params.set("ddRoom", roomId);
  if (tab) {
    params.set("tab", tab);
  }
  return `/companies/${companyOrgNumber}?${params.toString()}`;
}

function buildEvidenceHref(
  evidence: DdFindingEvidenceSummary,
  companyOrgNumber: string,
  roomId: string,
) {
  if (evidence.type === "COMPANY" || evidence.type === "COMPANY_PROFILE_FIELD") {
    return buildCompanyProfileHref(companyOrgNumber, roomId);
  }

  if (evidence.type === "FINANCIAL_STATEMENT") {
    return buildCompanyProfileHref(companyOrgNumber, roomId, "regnskap");
  }

  if (evidence.type === "ANNOUNCEMENT") {
    return buildCompanyProfileHref(companyOrgNumber, roomId, "kunngjoringer");
  }

  if (evidence.type === "TASK" && evidence.targetTaskId) {
    return `/dd/${roomId}#task-${evidence.targetTaskId}`;
  }

  if (evidence.type === "FINDING" && evidence.targetFindingId) {
    return `/dd/${roomId}#finding-${evidence.targetFindingId}`;
  }

  return null;
}

function CommentThreadSection({
  thread,
  canEdit,
  roomId,
  workstream,
  targetFieldName,
  targetId,
  action,
}: {
  thread?: DdCommentThreadSummary | null;
  canEdit: boolean;
  roomId: string;
  workstream?: string | null;
  targetFieldName: "taskId" | "findingId" | "postId";
  targetId: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const comments = thread ? buildThreadedComments(thread.comments) : [];

  function CommentNode({ comment, depth }: { comment: ThreadedCommentNode; depth: number }) {
    return (
      <div className={depth > 0 ? "border-l border-[rgba(15,23,42,0.08)] pl-4" : ""}>
        <div className="rounded-[0.85rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.76)] p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className="font-semibold text-slate-900">{comment.author.name ?? comment.author.email}</span>
            <span>{formatDateTime(comment.createdAt)}</span>
          </div>
          <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{comment.content}</div>
          {canEdit ? (
            <form action={action} className="mt-3 space-y-2">
              <input type="hidden" name="roomId" value={roomId} />
              <input type="hidden" name={targetFieldName} value={targetId} />
              <input type="hidden" name="parentCommentId" value={comment.id} />
              <input type="hidden" name="workstream" value={workstream ?? ""} />
              <textarea
                name="content"
                rows={2}
                required
                placeholder="Svar i tråden"
                className="w-full rounded-[0.75rem] border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2 text-sm outline-none focus:border-[#31495f]"
              />
              <button
                type="submit"
                className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2 text-xs font-semibold text-slate-800"
              >
                Svar
              </button>
            </form>
          ) : null}
        </div>
        {comment.replies.length > 0 ? (
          <div className="mt-3 space-y-3">
            {comment.replies.map((reply) => (
              <CommentNode key={reply.id} comment={reply} depth={depth + 1} />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-[0.9rem] border border-[rgba(15,23,42,0.08)] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900">Diskusjon</div>
        <div className="text-xs uppercase tracking-[0.08em] text-slate-500">
          {thread?.commentCount ?? 0} kommentarer
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {comments.length ? (
          comments.map((comment) => <CommentNode key={comment.id} comment={comment} depth={0} />)
        ) : (
          <div className="rounded-[0.85rem] border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-3 text-sm text-slate-600">
            Ingen kommentarer ennå. Bruk denne flaten til avklaringer, vurderinger og oppfølging på akkurat dette objektet.
          </div>
        )}
      </div>
      {canEdit ? (
        <form action={action} className="mt-4 space-y-3">
          <input type="hidden" name="roomId" value={roomId} />
          <input type="hidden" name={targetFieldName} value={targetId} />
          <input type="hidden" name="workstream" value={workstream ?? ""} />
          <textarea
            name="content"
            rows={3}
            required
            placeholder="Skriv en kommentar"
            className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]"
          />
          <button
            type="submit"
            className="rounded-full border border-[rgba(15,23,42,0.1)] bg-[rgba(248,249,250,0.92)] px-4 py-2 text-sm font-semibold text-slate-800"
          >
            Legg til kommentar
          </button>
        </form>
      ) : null}
    </div>
  );
}

export default async function DdRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await safeAuth();
  if (!session?.user?.id) redirect("/login");

  const { roomId } = await params;
  const query = await searchParams;
  const notice = typeof query.notice === "string" ? query.notice : null;
  const error = typeof query.error === "string" ? query.error : null;
  const workstreamParam = typeof query.workstream === "string" ? query.workstream : null;
  const activeWorkstream =
    workstreamParam && Object.values(DdWorkstream).includes(workstreamParam as DdWorkstream)
      ? (workstreamParam as DdWorkstream)
      : null;

  const detail = await getDdRoomDetail(session.user.id, roomId, activeWorkstream);
  if (!detail) notFound();

  const canEdit = detail.workspace.status === "ACTIVE" && detail.room.status === "ACTIVE";
  const statusAction = detail.room.status === "ACTIVE" ? archiveDdRoomAction : reopenDdRoomAction;
  const stageOptions = getWorkflowStageOptions();
  const workstreamOptions = getWorkstreamOptions();
  const severityOptions = getFindingSeverityOptions();
  const statusOptions = getFindingStatusOptions();
  const impactOptions = getFindingImpactOptions();
  const outcomeOptions = getDecisionOutcomeOptions();
  const tasks = detail.workflow.stages.flatMap((stage) => stage.tasks);

  return (
    <main className="space-y-6 pb-10">
      <section className="grid gap-0 border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.78)] xl:grid-cols-[minmax(0,1.35fr),360px]">
        <div className="p-8">
          <div className="flex flex-wrap items-center gap-2">
            {badge("Investerings-DD")}
            {badge(detail.room.status === "ACTIVE" ? "Aktiv" : "Arkivert", "border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.9)] text-slate-500")}
            {detail.mandate ? badge("Scoped", "border-emerald-200 bg-emerald-50 text-emerald-700") : badge("Ikke scoped", "border-amber-200 bg-amber-50 text-amber-700")}
          </div>
          <h1 className="editorial-display mt-5 max-w-4xl text-[3rem] leading-[0.98] text-slate-950 sm:text-[4rem]">{detail.room.name}</h1>
          <p className="mt-4 max-w-3xl text-[1.02rem] leading-8 text-slate-600">
            {detail.room.description ?? "Rommet er satt opp for investerings-DD med mandat, arbeidsstrommer, funn, evidens og konklusjon i samme arbeidsflate."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/companies/${detail.room.primaryCompany.orgNumber}?ddRoom=${detail.room.id}`} className="rounded-full bg-[#162233] px-4 py-2 text-sm font-semibold text-white hover:bg-[#223246]">Apne selskapsprofil</Link>
            <Link href={`/dashboard?workspace=${detail.workspace.id}`} className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-[rgba(15,23,42,0.18)] hover:text-slate-950">Tilbake til dashboard</Link>
            {detail.workspace.capabilities.canManageWorkspace ? (
              <form action={statusAction}>
                <input type="hidden" name="roomId" value={detail.room.id} />
                <button type="submit" className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-[rgba(15,23,42,0.18)] hover:text-slate-950">
                  {detail.room.status === "ACTIVE" ? "Arkiver rom" : "Gjenapne rom"}
                </button>
              </form>
            ) : null}
          </div>
        </div>
        <aside className="border-t border-[rgba(15,23,42,0.08)] bg-[#192536] p-8 text-white xl:border-l xl:border-t-0">
          <div className="text-[11px] font-semibold uppercase text-white/60">Kontekst</div>
          <div className="mt-4 text-[1.45rem] font-semibold leading-tight">{detail.room.primaryCompany.name}</div>
          <p className="mt-4 text-sm leading-7 text-white/76">Org.nr {detail.room.primaryCompany.orgNumber}</p>
          <div className="mt-5 rounded-[1rem] border border-white/10 bg-white/10 p-4 text-sm leading-6 text-white/82">
            {detail.workspace.type} · {detail.workspace.role} · {detail.workspace.members.length} medlemmer
          </div>
        </aside>
      </section>

      {notice ? <div className="rounded-[1rem] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">{notice}</div> : null}
      {error ? <div className="rounded-[1rem] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">{error}</div> : null}

      <Card>
        <div className="flex flex-wrap gap-2">
          <Link href={filterHref(detail.room.id, null)} className={`rounded-full border px-4 py-2 text-sm font-semibold ${!detail.workflow.activeWorkstream ? "border-[#162233] bg-[#162233] text-white" : "border-[rgba(15,23,42,0.1)] bg-white text-slate-700"}`}>Alle</Link>
          {detail.workflow.workstreams.map((item) => (
            <Link key={item.workstream} href={filterHref(detail.room.id, item.workstream)} className={`rounded-full border px-4 py-2 text-sm font-semibold ${detail.workflow.activeWorkstream === item.workstream ? "border-[#162233] bg-[#162233] text-white" : "border-[rgba(15,23,42,0.1)] bg-white text-slate-700"}`}>
              {item.label} · {item.taskCount} oppg / {item.openFindingCount} funn
            </Link>
          ))}
        </div>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr),360px]">
        <div className="space-y-6">
          <Card>
            <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
              <div className="text-[11px] font-semibold uppercase text-slate-500">DD-mandat</div>
              <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Mandat og investment thesis</h2>
            </div>
            {canEdit ? (
              <form action={saveDdMandateAction} className="mt-6 space-y-4">
                <input type="hidden" name="roomId" value={detail.room.id} />
                <input type="hidden" name="workstream" value={detail.workflow.activeWorkstream ?? ""} />
                <textarea name="investmentCase" defaultValue={detail.mandate?.investmentCase ?? ""} rows={2} placeholder="Investeringscase" className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                <textarea name="thesis" defaultValue={detail.mandate?.thesis ?? ""} rows={2} placeholder="Hypotese" className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                <div className="grid gap-4 md:grid-cols-2">
                  <textarea name="valueDrivers" defaultValue={detail.mandate?.valueDrivers ?? ""} rows={3} placeholder="Verdidrivere" className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                  <textarea name="keyRisks" defaultValue={detail.mandate?.keyRisks ?? ""} rows={3} placeholder="Sentrale risikoer" className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <input name="timeHorizon" defaultValue={detail.mandate?.timeHorizon ?? ""} placeholder="Tidshorisont" className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                  <input name="decisionGoal" defaultValue={detail.mandate?.decisionGoal ?? ""} placeholder="Onsket utfall" className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                </div>
                <button type="submit" className="rounded-full bg-[#162233] px-5 py-3 text-sm font-semibold text-white hover:bg-[#223246]">Lagre mandat</button>
              </form>
            ) : <div className="mt-5 text-sm text-slate-600">Mandatet kan bare oppdateres i aktive rom.</div>}
          </Card>

          <Card>
            <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
              <div className="text-[11px] font-semibold uppercase text-slate-500">Rompågående</div>
              <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Poster og fri diskusjon</h2>
            </div>
            <div className="mt-6 space-y-4">
              {detail.posts.items.length === 0 ? (
                <div className="rounded-[0.95rem] border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-4 text-sm text-slate-600">
                  Ingen romposter enda. Bruk innlegg til korte statusoppdateringer, avklaringer og diskusjoner som ikke hører hjemme på et spesifikt funn eller en bestemt oppgave.
                </div>
              ) : (
                detail.posts.items.map((post) => (
                  <div key={post.id} className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.76)] p-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                      <span className="font-semibold text-slate-950">{post.author.name ?? post.author.email}</span>
                      <span>{formatDateTime(post.createdAt)}</span>
                    </div>
                    <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{post.content}</div>
                    <div className="mt-4">
                      <CommentThreadSection
                        thread={post.commentThread}
                        canEdit={canEdit}
                        roomId={detail.room.id}
                        workstream={detail.workflow.activeWorkstream}
                        targetFieldName="postId"
                        targetId={post.id}
                        action={createDdPostCommentAction}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
              <div className="text-[11px] font-semibold uppercase text-slate-500">Workflow og funn</div>
              <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Progresjon og findings log</h2>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.76)] p-4"><div className="text-[11px] font-semibold uppercase text-slate-500">Progresjon</div><div className="mt-2 text-2xl font-semibold text-slate-950">{detail.workflow.completionRate}%</div></div>
              <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.76)] p-4"><div className="text-[11px] font-semibold uppercase text-slate-500">Apne funn</div><div className="mt-2 text-2xl font-semibold text-slate-950">{detail.findings.openCount}</div></div>
              <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.76)] p-4"><div className="text-[11px] font-semibold uppercase text-slate-500">Blocking</div><div className="mt-2 text-2xl font-semibold text-slate-950">{detail.findings.blockingOpenCount}</div></div>
              <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.76)] p-4"><div className="text-[11px] font-semibold uppercase text-slate-500">Monitoring</div><div className="mt-2 text-2xl font-semibold text-slate-950">{detail.findings.monitoringReadyCount}</div></div>
            </div>
          </Card>

          <Card>
            <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
              <div className="text-[11px] font-semibold uppercase text-slate-500">Oppgaver</div>
              <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Arbeid per steg</h2>
            </div>
            <div className="mt-6 space-y-6">
              {detail.workflow.stages.map((stage) => (
                <section key={stage.stage} className="space-y-3">
                  <div className="flex items-center justify-between gap-3 border-b border-[rgba(15,23,42,0.08)] pb-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-500">Steg {stage.order}</div>
                      <div className="mt-1 font-semibold text-slate-950">{stage.label}</div>
                    </div>
                    <div className="text-sm text-slate-500">{stage.completedTasks}/{stage.totalTasks} ferdige</div>
                  </div>
                  {stage.tasks.length === 0 ? (
                    <div className="rounded-[0.95rem] border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-4 text-sm text-slate-600">
                      Ingen oppgaver i dette steget for valgt arbeidsstrom.
                    </div>
                  ) : (
                    stage.tasks.map((task) => (
                      <div id={`task-${task.id}`} key={task.id} className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.76)] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap gap-2">
                              {badge(task.status)}
                              {badge(getWorkstreamLabel(task.workstream), "border-[rgba(15,23,42,0.1)] bg-white text-slate-600")}
                            </div>
                            <div className="mt-2 font-semibold text-slate-950">{task.title}</div>
                            {task.description ? <div className="mt-1 text-sm leading-6 text-slate-600">{task.description}</div> : null}
                          </div>
                          {canEdit ? (
                            <form action={updateDdTaskStatusAction} className="flex gap-2">
                              <input type="hidden" name="taskId" value={task.id} />
                              <input type="hidden" name="roomId" value={detail.room.id} />
                              <input type="hidden" name="workstream" value={detail.workflow.activeWorkstream ?? ""} />
                              <select name="status" defaultValue={task.status} className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2 text-sm outline-none focus:border-[#31495f]">
                                <option value="TODO">Todo</option>
                                <option value="IN_PROGRESS">Paagar</option>
                                <option value="BLOCKED">Blokkert</option>
                                <option value="DONE">Ferdig</option>
                              </select>
                              <button type="submit" className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2 text-sm font-semibold text-slate-700">Oppdater</button>
                            </form>
                          ) : null}
                        </div>
                        <div className="mt-3 text-sm text-slate-500">
                          {task.assignee?.name ?? task.assignee?.email ?? "Ingen ansvarlig"} · oppdatert {formatDate(task.updatedAt)}
                        </div>
                        <div className="mt-4">
                          <CommentThreadSection
                            thread={task.commentThread}
                            canEdit={canEdit}
                            roomId={detail.room.id}
                            workstream={detail.workflow.activeWorkstream}
                            targetFieldName="taskId"
                            targetId={task.id}
                            action={createDdTaskCommentAction}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </section>
              ))}
            </div>
          </Card>

          <Card>
            <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
              <div className="text-[11px] font-semibold uppercase text-slate-500">Findings log</div>
              <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Funn og evidens</h2>
            </div>
            <div className="mt-6 space-y-4">
              {detail.findings.items.length === 0 ? (
                <div className="rounded-[0.95rem] border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-4 text-sm text-slate-600">
                  Ingen funn registrert for valgt arbeidsstrom.
                </div>
              ) : (
                detail.findings.items.map((finding) => (
                  <div id={`finding-${finding.id}`} key={finding.id} className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.76)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap gap-2">
                          {badge(finding.severity)}
                          {badge(finding.status)}
                          {badge(getWorkstreamLabel(finding.workstream))}
                          {finding.isBlocking ? badge("Blocking", "border-rose-300 bg-rose-50 text-rose-700") : null}
                        </div>
                        <div className="mt-2 font-semibold text-slate-950">{finding.title}</div>
                        <div className="mt-1 text-sm text-slate-500">{finding.impact}</div>
                        {finding.description ? <div className="mt-2 text-sm leading-6 text-slate-600">{finding.description}</div> : null}
                      </div>
                      {canEdit ? (
                        <form action={updateDdFindingAction} className="grid gap-2">
                          <input type="hidden" name="findingId" value={finding.id} />
                          <input type="hidden" name="roomId" value={detail.room.id} />
                          <input type="hidden" name="workstream" value={detail.workflow.activeWorkstream ?? ""} />
                          <select name="status" defaultValue={finding.status} className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2 text-sm outline-none focus:border-[#31495f]">
                            {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                          </select>
                          <select name="severity" defaultValue={finding.severity} className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2 text-sm outline-none focus:border-[#31495f]">
                            {severityOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                          </select>
                          <select name="impact" defaultValue={finding.impact} className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2 text-sm outline-none focus:border-[#31495f]">
                            {impactOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                          </select>
                          <input name="recommendedAction" defaultValue={finding.recommendedAction ?? ""} placeholder="Anbefalt tiltak" className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2 text-sm outline-none focus:border-[#31495f]" />
                          <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="isBlocking" defaultChecked={finding.isBlocking} className="h-4 w-4" /> Blocking</label>
                          <button type="submit" className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2 text-sm font-semibold text-slate-700">Oppdater funn</button>
                        </form>
                      ) : null}
                    </div>
                    <div className="mt-4 space-y-3">
                      {finding.evidence.map((evidence) => (
                        <div key={evidence.id} className="rounded-[0.85rem] border border-[rgba(15,23,42,0.08)] bg-white p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-950">{evidence.label}</div>
                              <div className="mt-1 text-sm text-slate-500">{evidence.sourceSystem} · {evidence.sourceEntityType} · {evidence.sourceId}</div>
                              {evidence.note ? (
                                <div className="mt-2 text-sm leading-6 text-slate-600">{evidence.note}</div>
                              ) : null}
                            </div>
                            {buildEvidenceHref(evidence, detail.room.primaryCompany.orgNumber, detail.room.id) ? (
                              <a
                                href={buildEvidenceHref(evidence, detail.room.primaryCompany.orgNumber, detail.room.id) as string}
                                className="rounded-full border border-[rgba(15,23,42,0.1)] bg-[rgba(248,249,250,0.92)] px-3 py-2 text-xs font-semibold text-slate-700"
                              >
                                Apne kilde
                              </a>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                    {canEdit ? (
                      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr),auto]">
                        <form action={addDdFindingEvidenceAction} className="grid gap-3 rounded-[0.85rem] border border-[rgba(15,23,42,0.08)] bg-white p-3">
                          <input type="hidden" name="findingId" value={finding.id} />
                          <input type="hidden" name="roomId" value={detail.room.id} />
                          <input type="hidden" name="workstream" value={detail.workflow.activeWorkstream ?? ""} />
                          <select name="type" defaultValue="COMPANY" className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]">
                            <option value="COMPANY">Selskap</option>
                            <option value="COMPANY_PROFILE_FIELD">Selskapsfelt</option>
                            <option value="FINANCIAL_STATEMENT">Finansregnskap</option>
                            <option value="TASK">Oppgave</option>
                            <option value="FINDING">Funn</option>
                            <option value="ANNOUNCEMENT">Kunngjøring</option>
                          </select>
                          <select name="companyProfileField" defaultValue="" className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]">
                            <option value="">Velg selskapsfelt ved behov</option>
                            {detail.evidenceContext.companyProfileFields.map((field) => <option key={field.field} value={field.field}>{getCompanyProfileFieldLabel(field.field)}</option>)}
                          </select>
                          <select name="financialStatementId" defaultValue="" className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]">
                            <option value="">Velg finansregnskap ved behov</option>
                            {detail.evidenceContext.financialStatements.map((statement) => <option key={statement.id} value={statement.id}>{statement.fiscalYear}</option>)}
                          </select>
                          <select name="taskId" defaultValue="" className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]">
                            <option value="">Velg oppgave ved behov</option>
                            {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                          </select>
                          <select name="findingReferenceId" defaultValue="" className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]">
                            <option value="">Velg funn ved behov</option>
                            {detail.findings.items.filter((item) => item.id !== finding.id).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                          </select>
                          <input name="announcementLabel" placeholder="Kunngjøringstittel" className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                          <div className="grid gap-3 md:grid-cols-3">
                            <input name="announcementId" placeholder="Kunngjørings-ID" className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                            <input name="announcementSourceSystem" placeholder="Source system" className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                            <input name="announcementSourceId" placeholder="Source ID" className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                          </div>
                          <textarea name="note" rows={2} placeholder="Kort notat om evidensen" className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                          <button type="submit" className="rounded-full border border-[rgba(15,23,42,0.1)] bg-[rgba(248,249,250,0.92)] px-4 py-2 text-sm font-semibold text-slate-800">Legg til evidens</button>
                        </form>
                        {finding.impact === "MONITORING" ? (
                          <form action={handoffFindingToWatchAction} className="self-start">
                            <input type="hidden" name="findingId" value={finding.id} />
                            <input type="hidden" name="roomId" value={detail.room.id} />
                            <input type="hidden" name="workstream" value={detail.workflow.activeWorkstream ?? ""} />
                            <button type="submit" className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                              {finding.handoffWatch ? "Apen overvaking" : "Send til overvaking"}
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mt-4">
                      <CommentThreadSection
                        thread={finding.commentThread}
                        canEdit={canEdit}
                        roomId={detail.room.id}
                        workstream={detail.workflow.activeWorkstream}
                        targetFieldName="findingId"
                        targetId={finding.id}
                        action={createDdFindingCommentAction}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
              <div className="text-[11px] font-semibold uppercase text-slate-500">Investeringskonklusjon</div>
              <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Anbefalt utfall</h2>
            </div>
            {canEdit ? (
              <form action={saveDdConclusionAction} className="mt-6 space-y-4">
                <input type="hidden" name="roomId" value={detail.room.id} />
                <input type="hidden" name="workstream" value={detail.workflow.activeWorkstream ?? ""} />
                <textarea name="investmentCaseSummary" defaultValue={detail.conclusion?.investmentCaseSummary ?? ""} rows={2} placeholder="Investeringscase i kortform" className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                <div className="grid gap-4 md:grid-cols-2">
                  <textarea name="valueDriversSummary" defaultValue={detail.conclusion?.valueDriversSummary ?? ""} rows={3} placeholder="Verdidrivere" className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                  <textarea name="keyRisksSummary" defaultValue={detail.conclusion?.keyRisksSummary ?? ""} rows={3} placeholder="Risikoer" className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                </div>
                <textarea name="recommendationRationale" defaultValue={detail.conclusion?.recommendationRationale ?? ""} rows={3} placeholder="Rasjonale" className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                <textarea name="monitoringPlan" defaultValue={detail.conclusion?.monitoringPlan ?? ""} rows={2} placeholder="Hva ma overvakes videre" className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                <textarea name="decisionNote" rows={2} placeholder="Hva endret seg i vurderingen denne gangen?" className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                <select name="outcome" defaultValue={detail.conclusion?.outcome ?? ""} className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]">
                  <option value="">Velg utfall</option>
                  {outcomeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="isFinal" defaultChecked={Boolean(detail.conclusion?.isFinal)} className="h-4 w-4" /> Marker som endelig konklusjon</label>
                <button type="submit" className="rounded-full bg-[#162233] px-5 py-3 text-sm font-semibold text-white hover:bg-[#223246]">Lagre konklusjon</button>
              </form>
            ) : <div className="mt-5 text-sm text-slate-600">Konklusjonen kan bare oppdateres i aktive rom.</div>}
            {detail.decisionHistory.length > 0 ? (
              <div className="mt-6 border-t border-[rgba(15,23,42,0.08)] pt-6">
                <div className="text-[11px] font-semibold uppercase text-slate-500">Beslutningshistorikk</div>
                <div className="mt-4 space-y-3">
                  {detail.decisionHistory.map((entry) => (
                    <div key={entry.id} className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.76)] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {entry.outcome ? badge(entry.outcome) : null}
                        {entry.isFinal
                          ? badge("Endelig", "border-emerald-200 bg-emerald-50 text-emerald-700")
                          : badge("Utkast", "border-[rgba(15,23,42,0.1)] bg-white text-slate-600")}
                      </div>
                      <div className="mt-3 text-sm font-semibold text-slate-950">
                        {entry.createdBy.name ?? entry.createdBy.email} · {formatDateTime(entry.createdAt)}
                      </div>
                      {entry.note ? (
                        <div className="mt-2 text-sm leading-6 text-slate-700">{entry.note}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-[#F8FAFC]">
            <div className="text-[11px] font-semibold uppercase text-slate-500">Nytt arbeid</div>
            <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Poster, oppgave og funn</h2>
            {canEdit ? (
              <div className="mt-5 space-y-4">
                <form action={createDdPostAction} className="space-y-3 rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white p-4">
                  <input type="hidden" name="roomId" value={detail.room.id} />
                  <input type="hidden" name="workstream" value={detail.workflow.activeWorkstream ?? ""} />
                  <textarea name="content" rows={4} required placeholder="Skriv et rominnlegg til teamet" className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                  <button type="submit" className="w-full rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:border-[rgba(15,23,42,0.2)]">
                    Publiser innlegg
                  </button>
                </form>
                <form action={createDdTaskAction} className="space-y-3 rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white p-4">
                  <input type="hidden" name="roomId" value={detail.room.id} />
                  <input name="title" required placeholder="Ny oppgave" className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                  <textarea name="description" rows={2} placeholder="Beskrivelse" className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select name="stage" defaultValue={stageOptions[0]?.value} className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]">{stageOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                    <select name="workstream" defaultValue={detail.workflow.activeWorkstream ?? workstreamOptions[0]?.value} className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]">{workstreamOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                  </div>
                  <button type="submit" className="w-full rounded-full bg-[#162233] px-5 py-3 text-sm font-semibold text-white hover:bg-[#223246]">Opprett oppgave</button>
                </form>
                <form action={createDdFindingAction} className="space-y-3 rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white p-4">
                  <input type="hidden" name="roomId" value={detail.room.id} />
                  <input name="title" required placeholder="Nytt funn" className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                  <textarea name="description" rows={3} placeholder="Hva fant dere, og hvorfor betyr det noe?" className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select name="stage" defaultValue={stageOptions[0]?.value} className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]">{stageOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                    <select name="workstream" defaultValue={detail.workflow.activeWorkstream ?? workstreamOptions[0]?.value} className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]">{workstreamOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select name="severity" defaultValue="MEDIUM" className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]">{severityOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                    <select name="impact" defaultValue="NONE" className="rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]">{impactOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                  </div>
                  <select name="taskId" defaultValue="" className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]"><option value="">Ingen oppgavekobling</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select>
                  <textarea name="recommendedAction" rows={2} placeholder="Anbefalt tiltak" className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]" />
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="isBlocking" className="h-4 w-4" /> Marker som blocker</label>
                  <button type="submit" className="w-full rounded-full bg-[#162233] px-5 py-3 text-sm font-semibold text-white hover:bg-[#223246]">Opprett funn</button>
                </form>
              </div>
            ) : <div className="mt-5 text-sm text-slate-600">Nye oppgaver og funn kan bare opprettes i aktive rom.</div>}
          </Card>

          <Card>
            <div className="text-[11px] font-semibold uppercase text-slate-500">Kildespor</div>
            <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Tilgjengelig evidensgrunnlag</h2>
            <div className="mt-5 space-y-3">
              <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.76)] p-4">
                <div className="font-semibold text-slate-950">{detail.evidenceContext.company.name}</div>
                <div className="mt-1 text-sm text-slate-500">{detail.evidenceContext.company.sourceSystem} · {detail.evidenceContext.company.sourceId}</div>
              </div>
              {detail.evidenceContext.companyProfileFields.map((field) => (
                <div key={field.field} className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.76)] p-4">
                  <div className="font-semibold text-slate-950">{getCompanyProfileFieldLabel(field.field)}</div>
                  <div className="mt-1 text-sm leading-6 text-slate-600">{field.value}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="text-[11px] font-semibold uppercase text-slate-500">Aktivitet</div>
            <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Siste hendelser i rommet</h2>
            <div className="mt-5 space-y-3">
              {detail.activity.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.76)] p-4"
                >
                  <div className="font-semibold text-slate-950">{item.actorLabel}</div>
                  <div className="mt-1 text-sm leading-6 text-slate-600">{item.message}</div>
                  <div className="mt-2 text-xs uppercase tracking-[0.08em] text-slate-500">
                    {formatDateTime(item.occurredAt)}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="text-[11px] font-semibold uppercase text-slate-500">Medlemmer</div>
            <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">Hvem har tilgang</h2>
            <div className="mt-5 space-y-3">
              {detail.workspace.members.map((member) => (
                <div key={member.id} className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.76)] p-4">
                  <div className="font-semibold text-slate-950">{member.name ?? member.email}{member.isCurrentUser ? " (deg)" : ""}</div>
                  <div className="mt-1 text-sm leading-6 text-slate-600">{member.email} · {member.role} · medlem siden {formatDate(member.joinedAt)}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>
    </main>
  );
}
