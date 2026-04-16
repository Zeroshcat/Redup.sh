"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { APIError } from "@/lib/api-client";
import { InboxAnnouncements } from "@/components/notification/InboxAnnouncements";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationKind,
  type ServerNotification,
} from "@/lib/api/notifications";
import { stripMarkdown } from "@/lib/strip-markdown";
import { timeAgo } from "@/lib/utils-time";

type Filter = NotificationKind | "all" | "unread";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "unread", label: "未读" },
  { key: "reply", label: "回复" },
  { key: "mention", label: "@ 提及" },
  { key: "like", label: "点赞" },
  { key: "follow", label: "关注" },
  { key: "system", label: "系统" },
];

const ICONS: Record<NotificationKind, string> = {
  reply: "💬",
  like: "👍",
  mention: "@",
  follow: "+",
  system: "📢",
};

const ICON_BG: Record<NotificationKind, string> = {
  reply: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  like: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  mention: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  follow: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  system: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
};

function notificationHref(n: ServerNotification): string {
  if (n.target_type === "topic" || n.target_type === "post") {
    return n.target_id ? `/topic/${n.target_id}` : "#";
  }
  return "#";
}

export default function NotificationsPage() {
  const [items, setItems] = useState<ServerNotification[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const params: { type?: NotificationKind; unread?: boolean } = {};
      if (filter === "unread") params.unread = true;
      else if (filter !== "all") params.type = filter;
      const list = await listNotifications({ ...params, limit: 100 });
      setItems(list);
      setError(null);
    } catch (err) {
      if (err instanceof APIError) setError(`${err.message} (req ${err.requestId})`);
      else setError("请求失败");
    }
  }, [filter]);

  useEffect(() => {
    reload();
  }, [reload]);

  const list = items ?? [];
  const unreadCount = list.filter((n) => !n.read).length;

  async function markAllRead() {
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev?.map((n) => ({ ...n, read: true })) ?? null);
    } catch (err) {
      if (err instanceof APIError) setError(`${err.message} (req ${err.requestId})`);
    }
  }

  async function markOne(n: ServerNotification) {
    if (n.read) return;
    setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? null);
    try {
      await markNotificationRead(n.id);
    } catch {
      // best-effort; revert if needed (not critical)
    }
  }

  const groups = groupByDay(list);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          首页
        </Link>
        <span className="mx-1.5">›</span>
        <span className="text-foreground">通知中心</span>
      </nav>

      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">通知中心</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {items === null
              ? "正在加载…"
              : unreadCount > 0
              ? `${unreadCount} 条未读`
              : "全部已读"}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            全部标为已读
          </button>
        )}
      </header>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`relative px-3 py-2 text-sm font-medium transition ${
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
              {active && <span className="absolute inset-x-2 -bottom-px h-0.5 bg-primary" />}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}

      <InboxAnnouncements />


      {items === null && !error ? (
        <div className="text-sm text-muted-foreground">正在加载…</div>
      ) : list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-16 text-center">
          <div className="mb-2 text-4xl">🔔</div>
          <p className="text-sm text-muted-foreground">
            {filter === "unread" ? "没有未读通知" : "这里空空如也"}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(({ label, items: groupItems }) => (
            <section key={label}>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
              </h2>
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="divide-y divide-border">
                  {groupItems.map((n) => (
                    <NotificationRow key={n.id} n={n} onClick={() => markOne(n)} />
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function NotificationRow({ n, onClick }: { n: ServerNotification; onClick: () => void }) {
  const actorName = n.actor_username || "系统";
  const isAnon = n.actor_is_anon;
  const preview = n.preview ? stripMarkdown(n.preview) : null;
  const href = notificationHref(n);

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`group flex gap-3 px-4 py-3 transition ${
        n.read ? "hover:bg-accent/60" : "bg-primary/[0.03] hover:bg-accent/60"
      }`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${ICON_BG[n.type]}`}
      >
        {ICONS[n.type]}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-baseline gap-1.5 text-xs">
          <span
            className={`truncate font-semibold ${
              isAnon ? "font-mono text-muted-foreground" : "text-foreground"
            }`}
          >
            {actorName}
          </span>
          <span className="shrink-0 text-muted-foreground">{n.text}</span>
          {n.target_title && (
            <span className="truncate text-muted-foreground">「{n.target_title}」</span>
          )}
          <span className="ml-auto shrink-0 text-muted-foreground">{timeAgo(n.created_at)}</span>
        </div>
        {preview && (
          <p className="line-clamp-1 text-xs leading-relaxed text-muted-foreground">{preview}</p>
        )}
      </div>
      {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
    </Link>
  );
}

function groupByDay(items: ServerNotification[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400_000;

  const groups = new Map<string, ServerNotification[]>();

  for (const n of items) {
    const ts = new Date(n.created_at).getTime();
    let label: string;
    if (ts >= today) label = "今天";
    else if (ts >= yesterday) label = "昨天";
    else {
      const d = new Date(n.created_at);
      label = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(n);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}
