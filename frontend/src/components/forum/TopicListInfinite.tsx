"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Topic } from "@/types";
import { TopicCard } from "./TopicCard";
import { adaptTopic } from "@/lib/api/forum-adapter";
import { listTopics, type ListTopicsParams } from "@/lib/api/forum";

type QueryKey = Omit<ListTopicsParams, "limit" | "offset">;

// PAGE_SIZE is the per-request cap sent to /api/topics. The server enforces
// its own cap (100) so any value here above that will be silently clipped.
const PAGE_SIZE = 20;

export function TopicListInfinite({
  initialTopics,
  query,
}: {
  initialTopics: Topic[];
  query: QueryKey;
}) {
  const [topics, setTopics] = useState<Topic[]>(initialTopics);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(initialTopics.length < PAGE_SIZE);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset if the outer query (sort / category) changes — Next's re-render of
  // the server parent passes a new initialTopics array; we re-seed from it.
  useEffect(() => {
    setTopics(initialTopics);
    setDone(initialTopics.length < PAGE_SIZE);
    setError(null);
  }, [initialTopics]);

  const loadMore = useCallback(async () => {
    if (loading || done) return;
    setLoading(true);
    setError(null);
    try {
      const next = await listTopics({
        ...query,
        limit: PAGE_SIZE,
        offset: topics.length,
      });
      const mapped = next.map(adaptTopic);
      setTopics((prev) => [...prev, ...mapped]);
      if (mapped.length < PAGE_SIZE) setDone(true);
    } catch {
      setError("加载失败，点击重试");
    } finally {
      setLoading(false);
    }
  }, [loading, done, query, topics.length]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || done) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, done]);

  return (
    <>
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {topics.map((t) => (
          <TopicCard key={t.id} topic={t} />
        ))}
      </div>
      <div ref={sentinelRef} className="py-6 text-center text-xs text-muted-foreground">
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            加载中…
          </span>
        ) : error ? (
          <button
            type="button"
            onClick={loadMore}
            className="rounded-md border border-border bg-card px-3 py-1 hover:bg-accent"
          >
            {error}
          </button>
        ) : done ? (
          topics.length > 0 ? "— 到底了 —" : null
        ) : null}
      </div>
    </>
  );
}
