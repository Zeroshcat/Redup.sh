"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TopicCard } from "@/components/forum/TopicCard";
import { APIError } from "@/lib/api-client";
import { getFeed } from "@/lib/api/forum";
import { adaptTopic } from "@/lib/api/forum-adapter";
import { useAuthStore } from "@/store/auth";
import type { Topic } from "@/types";

export default function FeedPage() {
  const me = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    getFeed(50)
      .then((items) => {
        if (cancelled) return;
        setTopics(items.map(adaptTopic));
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof APIError) setError(`${err.message} (req ${err.requestId})`);
        else setError("加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [me]);

  if (!hydrated) {
    return null;
  }

  if (!me) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 text-center">
        <p className="mb-4 text-sm text-muted-foreground">
          登录后查看你关注的人发布的最新主题
        </p>
        <Link
          href="/login"
          className="inline-block rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          去登录
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          首页
        </Link>
        <span className="mx-1.5">›</span>
        <span className="text-foreground">关注动态</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">关注动态</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          你关注的用户最近发布的主题，按时间倒序
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}

      {topics === null && !error ? (
        <div className="text-sm text-muted-foreground">正在加载…</div>
      ) : topics && topics.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
          <div className="mb-2 text-4xl">📭</div>
          <p className="mb-2 text-sm text-foreground">还没有动态</p>
          <p className="text-xs text-muted-foreground">
            去用户主页关注一些活跃用户，他们的新主题会出现在这里
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {topics?.map((t) => <TopicCard key={t.id} topic={t} />)}
        </div>
      )}
    </main>
  );
}
