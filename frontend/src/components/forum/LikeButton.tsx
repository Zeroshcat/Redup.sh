"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toggleTopicLike, togglePostLike } from "@/lib/api/forum";
import { APIError } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";

type Target = "topic" | "post";

export function LikeButton({
  target,
  id,
  initialLiked = false,
  initialCount,
  size = "sm",
}: {
  target: Target;
  id: number;
  initialLiked?: boolean;
  initialCount: number;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (!user) {
      router.push("/login");
      return;
    }
    if (loading) return;

    // Optimistic update
    const prevLiked = liked;
    const prevCount = count;
    setLiked(!liked);
    setCount(liked ? count - 1 : count + 1);
    setLoading(true);

    try {
      const fn = target === "topic" ? toggleTopicLike : togglePostLike;
      const result = await fn(id);
      setLiked(result.liked);
      setCount(result.count);
    } catch (err) {
      // Rollback
      setLiked(prevLiked);
      setCount(prevCount);
      if (err instanceof APIError) {
        console.warn("like failed:", err.code, err.requestId);
      }
    } finally {
      setLoading(false);
    }
  }

  const isSm = size === "sm";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-1 transition ${
        isSm ? "text-xs" : "text-sm"
      } ${
        liked
          ? "text-rose-500 dark:text-rose-400"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <span className={liked ? "" : "opacity-70"}>{liked ? "❤" : "♡"}</span>
      <span>{count}</span>
    </button>
  );
}
