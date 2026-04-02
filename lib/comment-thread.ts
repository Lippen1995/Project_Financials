import { DdCommentSummary } from "@/lib/types";

export type ThreadedCommentNode = DdCommentSummary & {
  replies: ThreadedCommentNode[];
};

export function buildThreadedComments(comments: DdCommentSummary[]): ThreadedCommentNode[] {
  const byId = new Map<string, ThreadedCommentNode>();
  const roots: ThreadedCommentNode[] = [];

  for (const comment of comments) {
    byId.set(comment.id, {
      ...comment,
      replies: [],
    });
  }

  for (const comment of byId.values()) {
    if (comment.parentCommentId) {
      const parent = byId.get(comment.parentCommentId);
      if (parent) {
        parent.replies.push(comment);
        continue;
      }
    }

    roots.push(comment);
  }

  const sortNodes = (nodes: ThreadedCommentNode[]) => {
    nodes.sort(
      (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    );
    for (const node of nodes) {
      sortNodes(node.replies);
    }
  };

  sortNodes(roots);
  return roots;
}
