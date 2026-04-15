"use client";

import Link from "next/link";
import { useState } from "react";
import type { Conversation, Message } from "@/types";
import { timeAgo } from "@/lib/utils-time";

function formatDayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (ts === today) return "今天";
  if (ts === today - 86400_000) return "昨天";
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function groupByDay(messages: Message[]) {
  const groups: { label: string; items: Message[] }[] = [];
  for (const m of messages) {
    const label = formatDayLabel(m.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(m);
    } else {
      groups.push({ label, items: [m] });
    }
  }
  return groups;
}

export function ConversationThread({ conversation }: { conversation: Conversation }) {
  const [draft, setDraft] = useState("");
  const { participant } = conversation;

  const isBot = participant.type === "bot";
  const isSystem = participant.type === "system";
  const canReply = !isSystem;

  const profileHref =
    participant.type === "user"
      ? `/u/${participant.username}`
      : participant.type === "bot"
      ? `/bot/${participant.slug}`
      : null;

  const name =
    participant.type === "user"
      ? participant.username
      : participant.type === "bot"
      ? participant.name
      : participant.name;

  const subtitle =
    participant.type === "user"
      ? `L${participant.level} · @${participant.username}`
      : participant.type === "bot"
      ? participant.modelInfo
      : "Redup 官方";

  const initial =
    participant.type === "user"
      ? participant.username[0]?.toUpperCase()
      : participant.type === "bot"
      ? "⚡"
      : "R";

  const avatarStyle = isBot
    ? "bg-gradient-to-br from-violet-400 to-violet-600 text-white"
    : isSystem
    ? "bg-primary text-primary-foreground"
    : "bg-gradient-to-br from-muted to-muted-foreground/20 text-foreground";

  const groups = groupByDay(conversation.messages);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-background/80 px-6 py-3 backdrop-blur">
        <div className={`flex h-9 w-9 items-center justify-center rounded-full font-semibold ${avatarStyle}`}>
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {profileHref ? (
              <Link
                href={profileHref}
                className={`truncate text-sm font-semibold hover:underline ${
                  isBot ? "text-violet-600 dark:text-violet-400" : "text-foreground"
                }`}
              >
                {name}
              </Link>
            ) : (
              <span className="truncate text-sm font-semibold text-foreground">{name}</span>
            )}
            {isBot && (
              <span className="rounded bg-violet-500/15 px-1 text-[10px] font-medium text-violet-600 dark:text-violet-400">
                BOT
              </span>
            )}
            {isSystem && (
              <span className="rounded bg-primary/15 px-1 text-[10px] font-medium text-primary">
                官方
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">{subtitle}</div>
        </div>
        <div className="flex items-center gap-1">
          <button className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
            🔕 静音
          </button>
          <button className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
            🚩 举报
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto max-w-2xl space-y-5">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="mb-3 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="space-y-2">
                {group.items.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    isBot={isBot}
                    isSystem={isSystem}
                    participantInitial={initial}
                    avatarStyle={avatarStyle}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {canReply ? (
        <footer className="border-t border-border bg-card px-6 py-3">
          <div className="mx-auto flex max-w-2xl items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={1}
              placeholder={`发送消息给 ${name}…`}
              className="min-h-[40px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
            />
            <button
              type="button"
              disabled={!draft.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              发送
            </button>
          </div>
        </footer>
      ) : (
        <footer className="border-t border-border bg-muted/40 px-6 py-3 text-center text-xs text-muted-foreground">
          🔒 官方系统消息不可回复
        </footer>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  isBot,
  isSystem,
  participantInitial,
  avatarStyle,
}: {
  message: Message;
  isBot: boolean;
  isSystem: boolean;
  participantInitial: string;
  avatarStyle: string;
}) {
  const self = message.fromSelf;

  const bubbleClass = self
    ? "bg-primary text-primary-foreground"
    : isBot
    ? "bg-violet-500/10 text-foreground border border-violet-500/20"
    : isSystem
    ? "bg-muted text-foreground border border-border"
    : "bg-card text-foreground border border-border";

  return (
    <div className={`flex items-end gap-2 ${self ? "flex-row-reverse" : "flex-row"}`}>
      {!self && (
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarStyle}`}
        >
          {participantInitial}
        </div>
      )}
      <div
        className={`flex max-w-[75%] flex-col ${self ? "items-end" : "items-start"}`}
      >
        <div
          className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${bubbleClass}`}
        >
          {message.content}
        </div>
        <span className="mt-0.5 text-[10px] text-muted-foreground">
          {timeAgo(message.createdAt)}
        </span>
      </div>
    </div>
  );
}
