"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toggleBookmark } from "@/lib/api/forum";
import { APIError } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";

export function BookmarkButton({
  topicId,
  initialBookmarked = false,
}: {
  topicId: number;
  initialBookmarked?: boolean;
}) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (!user) {
      router.push("/login");
      return;
    }
    if (loading) return;

    const prev = bookmarked;
    setBookmarked(!bookmarked);
    setLoading(true);

    try {
      const result = await toggleBookmark(topicId);
      setBookmarked(result.bookmarked);
    } catch (err) {
      setBookmarked(prev);
      if (err instanceof APIError) {
        console.warn("bookmark failed:", err.code, err.requestId);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-1 text-xs transition ${
        bookmarked
          ? "text-amber-500 dark:text-amber-400"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <span>{bookmarked ? "★" : "☆"}</span>
      <span>{bookmarked ? "已收藏" : "收藏"}</span>
    </button>
  );
}
