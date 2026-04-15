"use client";

import { useEffect } from "react";
import { getTopicAuthed } from "@/lib/api/forum";
import { useAuthStore } from "@/store/auth";

export type LikeStateDetail = {
  target: "topic" | "post";
  id: number;
  liked: boolean;
};

export type BookmarkStateDetail = {
  topicId: number;
  bookmarked: boolean;
};

// TopicStateHydrator is the client-only shim that re-fetches the topic
// detail with the logged-in user's token, then broadcasts user-specific
// state (liked / bookmarked) to the interactive buttons via custom events.
//
// Why: the topic page is a server component rendered via fetchTopicDetail,
// which calls apiServer() — no cookies, no Authorization header, so the
// backend sees uid=0 and can't hydrate user_liked / user_bookmarked. The
// fix is to re-fetch the same endpoint from the client (where localStorage
// tokens live) and patch the buttons after mount.
export function TopicStateHydrator({ topicId }: { topicId: number }) {
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const detail = await getTopicAuthed(topicId);
        if (cancelled) return;
        window.dispatchEvent(
          new CustomEvent<LikeStateDetail>("redup:like-state", {
            detail: { target: "topic", id: detail.topic.id, liked: detail.topic.user_liked ?? false },
          }),
        );
        window.dispatchEvent(
          new CustomEvent<BookmarkStateDetail>("redup:bookmark-state", {
            detail: { topicId: detail.topic.id, bookmarked: detail.topic.user_bookmarked ?? false },
          }),
        );
        for (const p of detail.posts ?? []) {
          window.dispatchEvent(
            new CustomEvent<LikeStateDetail>("redup:like-state", {
              detail: { target: "post", id: p.id, liked: p.user_liked ?? false },
            }),
          );
        }
      } catch {
        // Best-effort rehydration — a failure just leaves the SSR state in
        // place, which is exactly what we'd show without this hook anyway.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, topicId]);

  return null;
}
