"use client";

import { LoaderCircle } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { buildThreadedComments, ThreadedCommentNode } from "@/lib/comment-thread";
import { DdCommentThreadSummary, NormalizedAnnouncement } from "@/lib/types";

function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

type AnnouncementDiscussionPanelProps = {
  roomId: string;
  roomName: string;
  announcement: NormalizedAnnouncement | null;
};

export function AnnouncementDiscussionPanel({
  roomId,
  roomName,
  announcement,
}: AnnouncementDiscussionPanelProps) {
  const [thread, setThread] = useState<DdCommentThreadSummary | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [openReplyId, setOpenReplyId] = useState<string | null>(null);

  const commentTree = useMemo(
    () => (thread ? buildThreadedComments(thread.comments) : []),
    [thread],
  );

  useEffect(() => {
    if (!announcement) {
      setThread(null);
      setError(null);
      setContent("");
      setReplyDrafts({});
      setOpenReplyId(null);
      return;
    }

    const activeAnnouncement = announcement;
    let cancelled = false;

    async function loadThread() {
      setLoading(true);
      setError(null);
      setReplyDrafts({});
      setOpenReplyId(null);

      try {
        const params = new URLSearchParams({
          announcementId: activeAnnouncement.id,
          announcementSourceId: activeAnnouncement.sourceId,
          announcementSourceSystem: activeAnnouncement.sourceSystem,
        });

        if (activeAnnouncement.publishedAt) {
          params.set("announcementPublishedAt", new Date(activeAnnouncement.publishedAt).toISOString());
        }

        const response = await fetch(`/api/dd-rooms/${roomId}/announcement-comments?${params.toString()}`);
        const payload = (await response.json()) as { data?: DdCommentThreadSummary | null; error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Kunne ikke hente kommentarer.");
        }

        if (!cancelled) {
          setThread(payload.data ?? null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente kommentarer.");
          setThread(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadThread();

    return () => {
      cancelled = true;
    };
  }, [announcement, roomId]);

  async function submitComment(rawContent: string, parentCommentId?: string | null) {
    if (!announcement || rawContent.trim().length < 2) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/dd-rooms/${roomId}/announcement-comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          announcementId: announcement.id,
          announcementSourceId: announcement.sourceId,
          announcementSourceSystem: announcement.sourceSystem,
          announcementPublishedAt: announcement.publishedAt
            ? new Date(announcement.publishedAt).toISOString()
            : undefined,
          content: rawContent,
          parentCommentId: parentCommentId ?? undefined,
        }),
      });

      const payload = (await response.json()) as { data?: DdCommentThreadSummary; error?: string };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "Kunne ikke lagre kommentaren.");
      }

      setThread(payload.data);
      if (parentCommentId) {
        setReplyDrafts((current) => ({ ...current, [parentCommentId]: "" }));
        setOpenReplyId(null);
      } else {
        setContent("");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Kunne ikke lagre kommentaren.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitComment(content);
  }

  function renderCommentNode(node: ThreadedCommentNode, depth = 0) {
    const replyDraft = replyDrafts[node.id] ?? "";

    return (
      <div key={node.id} className={depth > 0 ? "border-l border-[rgba(15,23,42,0.08)] pl-4" : ""}>
        <div className="rounded-[0.85rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.76)] p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className="font-semibold text-slate-900">{node.author.name ?? node.author.email}</span>
            <span>{formatDateTime(node.createdAt)}</span>
          </div>
          <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{node.content}</div>
          <button
            type="button"
            onClick={() => setOpenReplyId((current) => (current === node.id ? null : node.id))}
            className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#2f5d9f]"
          >
            {openReplyId === node.id ? "Skjul svarfelt" : "Svar"}
          </button>

          {openReplyId === node.id ? (
            <div className="mt-3 space-y-2">
              <textarea
                value={replyDraft}
                onChange={(event) =>
                  setReplyDrafts((current) => ({ ...current, [node.id]: event.target.value }))
                }
                rows={2}
                placeholder="Svar i tråden"
                className="w-full rounded-[0.75rem] border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2 text-sm outline-none focus:border-[#31495f]"
              />
              <button
                type="button"
                disabled={submitting || replyDraft.trim().length < 2}
                onClick={() => void submitComment(replyDraft, node.id)}
                className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2 text-xs font-semibold text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Lagrer..." : "Svar"}
              </button>
            </div>
          ) : null}
        </div>

        {node.replies.length > 0 ? (
          <div className="mt-3 space-y-3">
            {node.replies.map((reply) => renderCommentNode(reply, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  if (!announcement) {
    return (
      <div className="rounded-[0.95rem] border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-4 text-sm leading-6 text-slate-600">
        Velg en kunngjøring for å se og legge til kommentarer i DD-rommet.
      </div>
    );
  }

  return (
    <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white p-4">
      <div className="text-[11px] font-semibold uppercase text-slate-500">DD-diskusjon</div>
      <h4 className="mt-2 text-base font-semibold text-slate-950">{roomName}</h4>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        Kommentarene er knyttet til denne kunngjøringen i valgt DD-rom.
      </p>

      {loading ? (
        <div className="mt-4 flex items-center gap-3 rounded-[0.85rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.72)] p-3 text-sm text-slate-600">
          <LoaderCircle className="size-4 animate-spin text-[#2f5d9f]" />
          Henter kommentarer...
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-[0.85rem] border border-[rgba(146,91,33,0.16)] bg-[rgba(255,246,236,0.9)] p-3 text-sm leading-6 text-[#8a5b21]">
          {error}
        </div>
      ) : null}

      {!loading ? (
        <div className="mt-4 space-y-3">
          {commentTree.length ? (
            commentTree.map((comment) => renderCommentNode(comment))
          ) : (
            <div className="rounded-[0.85rem] border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-3 text-sm leading-6 text-slate-600">
              Ingen kommentarer ennå. Bruk denne flaten til å diskutere betydningen av kunngjøringen i DD-arbeidet.
            </div>
          )}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={3}
          placeholder="Skriv en kommentar"
          className="w-full rounded-[0.85rem] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm outline-none focus:border-[#31495f]"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full border border-[rgba(15,23,42,0.1)] bg-[rgba(248,249,250,0.92)] px-4 py-2 text-sm font-semibold text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Lagrer..." : "Legg til kommentar"}
        </button>
      </form>
    </div>
  );
}
