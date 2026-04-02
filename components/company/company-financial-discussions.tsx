import { buildThreadedComments, ThreadedCommentNode } from "@/lib/comment-thread";
import { CompanyFinancialStatementDiscussionSummary } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { createFinancialStatementCommentAction } from "@/server/actions/company-dd-comment-actions";

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export function CompanyFinancialDiscussions({
  companySlug,
  roomId,
  roomName,
  discussions,
}: {
  companySlug: string;
  roomId: string;
  roomName: string;
  discussions: CompanyFinancialStatementDiscussionSummary[];
}) {
  function CommentNode({
    discussion,
    comment,
    depth,
  }: {
    discussion: CompanyFinancialStatementDiscussionSummary;
    comment: ThreadedCommentNode;
    depth: number;
  }) {
    return (
      <div className={depth > 0 ? "border-l border-[rgba(15,23,42,0.08)] pl-4" : ""}>
        <div className="rounded-[0.85rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.76)] p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className="font-semibold text-slate-900">{comment.author.name ?? comment.author.email}</span>
            <span>{formatDateTime(comment.createdAt)}</span>
          </div>
          <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{comment.content}</div>
          <form action={createFinancialStatementCommentAction} className="mt-3 space-y-2">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="roomId" value={roomId} />
            <input type="hidden" name="financialStatementId" value={discussion.financialStatementId} />
            <input type="hidden" name="parentCommentId" value={comment.id} />
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
        </div>
        {comment.replies.length > 0 ? (
          <div className="mt-3 space-y-3">
            {comment.replies.map((reply) => (
              <CommentNode
                key={reply.id}
                discussion={discussion}
                comment={reply}
                depth={depth + 1}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (discussions.length === 0) {
    return (
      <div className="rounded-[0.95rem] border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-6 text-sm leading-7 text-slate-600">
        Regnskapskommentarer blir tilgjengelige når regnskapet finnes som lagret, sporbar artefakt i ProjectX.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.72)] p-4">
        <div className="text-[11px] font-semibold uppercase text-slate-500">DD-diskusjon</div>
        <div className="mt-2 text-lg font-semibold text-slate-950">{roomName}</div>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Kommentarene er knyttet til lagrede regnskapsartefakter i valgt DD-rom.
        </p>
      </div>

      {discussions.map((discussion) => (
        <div key={discussion.financialStatementId} className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white p-4">
          {(() => {
            const comments = discussion.thread ? buildThreadedComments(discussion.thread.comments) : [];

            return (
              <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
                <div className="text-base font-semibold text-slate-950">Regnskapsår {discussion.fiscalYear}</div>
              <div className="mt-1 text-sm text-slate-500">
                {discussion.sourceSystem} · {discussion.sourceId} · hentet {formatDate(discussion.fetchedAt)}
              </div>
            </div>
            <div className="rounded-full border border-[rgba(15,23,42,0.1)] bg-[rgba(248,249,250,0.92)] px-3 py-1 text-xs font-semibold uppercase text-slate-600">
              {discussion.thread?.commentCount ?? 0} kommentarer
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {comments.length ? (
              comments.map((comment) => (
                <CommentNode
                  key={comment.id}
                  discussion={discussion}
                  comment={comment}
                  depth={0}
                />
              ))
            ) : (
              <div className="rounded-[0.85rem] border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-3 text-sm leading-6 text-slate-600">
          Ingen kommentarer ennå. Bruk denne flaten til å diskutere regnskapstall, kvalitet og tolkning.
              </div>
            )}
          </div>

          <form action={createFinancialStatementCommentAction} className="mt-4 space-y-3">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="roomId" value={roomId} />
            <input type="hidden" name="financialStatementId" value={discussion.financialStatementId} />
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
              </>
            );
          })()}
        </div>
      ))}
    </div>
  );
}
