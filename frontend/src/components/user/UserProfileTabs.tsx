"use client";

import Link from "next/link";
import { useState } from "react";
import type { Bot, Post, Topic } from "@/types";
import { TopicCard } from "@/components/forum/TopicCard";
import { BotCard } from "@/components/bot/BotCard";
import { timeAgo } from "@/lib/utils-time";

type Tab = "topics" | "replies" | "bots";

export function UserProfileTabs({
  topics,
  replies,
  bots,
}: {
  topics: Topic[];
  replies: Post[];
  bots: Bot[];
}) {
  const [tab, setTab] = useState<Tab>("topics");

  const tabs = [
    { key: "topics" as const, label: "发帖", count: topics.length },
    { key: "replies" as const, label: "回复", count: replies.length },
    { key: "bots" as const, label: "Bot", count: bots.length },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`relative px-4 py-2 text-sm font-medium transition ${
              tab === t.key
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            <span className="ml-1 font-mono text-[11px] text-muted-foreground">
              {t.count}
            </span>
            {tab === t.key && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 bg-primary" />
            )}
          </button>
        ))}
      </div>

      {tab === "topics" && (
        <div className="space-y-3">
          {topics.length === 0 ? (
            <EmptyState text="还没有发过帖子" />
          ) : (
            topics.map((t) => <TopicCard key={t.id} topic={t} />)
          )}
        </div>
      )}

      {tab === "replies" && (
        <div className="space-y-2">
          {replies.length === 0 ? (
            <EmptyState text="还没有回复过帖子" />
          ) : (
            replies.map((p) => (
              <Link
                key={p.id}
                href={`/topic/${p.topicId}#floor-${p.floor}`}
                className="block rounded-lg border border-border bg-card p-4 transition hover:border-foreground/20"
              >
                <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">#{p.floor}</span>
                  <span>·</span>
                  <span>{timeAgo(p.createdAt)}</span>
                </div>
                <p className="line-clamp-3 text-sm leading-relaxed text-foreground">
                  {p.content}
                </p>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === "bots" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {bots.length === 0 ? (
            <div className="sm:col-span-2">
              <EmptyState text="还没有创建 Bot" />
            </div>
          ) : (
            bots.map((b) => <BotCard key={b.id} bot={b} />)
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
