"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Conversation } from "@/types";
import { stripMarkdown } from "@/lib/strip-markdown";
import { timeAgo } from "@/lib/utils-time";

function participantInitial(c: Conversation) {
  if (c.participant.type === "user") return c.participant.username[0]?.toUpperCase() ?? "?";
  if (c.participant.type === "bot") return "⚡";
  return "R";
}

function participantName(c: Conversation) {
  if (c.participant.type === "user") return c.participant.username;
  if (c.participant.type === "bot") return c.participant.name;
  return c.participant.name;
}

function participantStyle(c: Conversation) {
  if (c.participant.type === "bot") {
    return "bg-gradient-to-br from-violet-400 to-violet-600 text-white";
  }
  if (c.participant.type === "system") {
    return "bg-primary text-primary-foreground";
  }
  return "bg-gradient-to-br from-muted to-muted-foreground/20 text-foreground";
}

export function ConversationList({ conversations }: { conversations: Conversation[] }) {
  const pathname = usePathname();

  return (
    <aside className="w-72 shrink-0 border-r border-border bg-card">
      <div className="sticky top-0 flex h-screen flex-col">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">私信</h2>
            <button
              type="button"
              className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              + 新对话
            </button>
          </div>
          <input
            type="search"
            placeholder="搜索对话…"
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-ring"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-muted-foreground">
              还没有私信
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {conversations.map((c) => {
                const active = pathname === `/messages/${c.id}`;
                const isBot = c.participant.type === "bot";
                const isSystem = c.participant.type === "system";
                return (
                  <li key={c.id}>
                    <Link
                      href={`/messages/${c.id}`}
                      className={`flex gap-3 px-4 py-3 transition ${
                        active ? "bg-accent" : "hover:bg-accent/60"
                      }`}
                    >
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${participantStyle(c)}`}
                      >
                        {participantInitial(c)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex items-center gap-1.5">
                          <span
                            className={`truncate text-sm font-semibold ${
                              isBot
                                ? "text-violet-600 dark:text-violet-400"
                                : "text-foreground"
                            }`}
                          >
                            {participantName(c)}
                          </span>
                          {isBot && (
                            <span className="rounded bg-violet-500/15 px-1 text-[9px] font-medium text-violet-600 dark:text-violet-400">
                              BOT
                            </span>
                          )}
                          {isSystem && (
                            <span className="rounded bg-primary/15 px-1 text-[9px] font-medium text-primary">
                              官方
                            </span>
                          )}
                          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                            {timeAgo(c.lastMessageAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="line-clamp-1 flex-1 text-xs text-muted-foreground">
                            {stripMarkdown(c.lastMessage)}
                          </p>
                          {c.unreadCount > 0 && (
                            <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                              {c.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
