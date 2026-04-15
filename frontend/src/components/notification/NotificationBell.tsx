"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type ServerNotification,
} from "@/lib/api/notifications";
import { Skeleton } from "@/components/ui/Skeleton";
import { useStream } from "@/lib/stream";
import { useAuthStore } from "@/store/auth";
import { stripMarkdown } from "@/lib/strip-markdown";
import { timeAgo } from "@/lib/utils-time";

const ICONS: Record<string, string> = {
  reply: "💬",
  like: "👍",
  mention: "@",
  follow: "+",
  system: "📢",
};

const ICON_BG: Record<string, string> = {
  reply: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  like: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  mention: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  follow: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  system: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
};

function notificationHref(n: ServerNotification): string {
  if (n.target_type === "topic" || n.target_type === "post") {
    return n.target_id ? `/topic/${n.target_id}` : "/notifications";
  }
  return "/notifications";
}

export function NotificationBell() {
  const isAuthed = useAuthStore((s) => Boolean(s.user));
  const [items, setItems] = useState<ServerNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Initial fetch — SSE handles subsequent updates in real time.
  useEffect(() => {
    if (!isAuthed) {
      // Auth-state → component-state sync: legitimate reset on logout.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on auth change
      setUnread(0);
      setItems([]);
      setLoaded(false);
      return;
    }
    let cancelled = false;
    getUnreadCount()
      .then((r) => {
        if (!cancelled) setUnread(r.unread);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthed]);

  // Real-time: every push from the server bumps the badge AND, if the
  // dropdown is currently open, prepends the new row into the list.
  useStream(
    {
      "notification.new": (data: unknown) => {
        setUnread((c) => c + 1);
        const n = data as ServerNotification | null;
        if (n && open) {
          setItems((prev) => [n, ...prev].slice(0, 8));
        }
      },
    },
    isAuthed,
  );

  // Lazy-load the recent list the first time the dropdown opens, refresh on
  // every subsequent open so it reflects the latest state.
  useEffect(() => {
    if (!open || !isAuthed) return;
    let cancelled = false;
    listNotifications({ limit: 8 })
      .then((list) => {
        if (cancelled) return;
        setItems(list);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isAuthed]);

  // Click outside to close.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!isAuthed) return null;

  async function markAllRead() {
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch {
      // ignore
    }
  }

  async function markOne(n: ServerNotification) {
    if (n.read) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    setUnread((c) => Math.max(0, c - 1));
    try {
      await markNotificationRead(n.id);
    } catch {
      // ignore — best-effort
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="通知"
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[18px] w-[18px]"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h3 className="text-sm font-semibold text-foreground">通知</h3>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                全部标为已读
              </button>
            )}
          </div>

          {!loaded ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3 px-4 py-3">
                  <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="mb-1.5 h-3 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              没有新通知
            </div>
          ) : (
            <div className="max-h-[400px] divide-y divide-border overflow-y-auto">
              {items.map((n) => (
                <BellRow
                  key={n.id}
                  n={n}
                  onClick={() => {
                    markOne(n);
                    setOpen(false);
                  }}
                />
              ))}
            </div>
          )}

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-4 py-2.5 text-center text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            查看全部通知 →
          </Link>
        </div>
      )}
    </div>
  );
}

function BellRow({ n, onClick }: { n: ServerNotification; onClick: () => void }) {
  const actorName = n.actor_username || "系统";
  const isAnon = n.actor_is_anon;
  const preview = n.preview ? stripMarkdown(n.preview) : null;
  return (
    <Link
      href={notificationHref(n)}
      onClick={onClick}
      className={`flex gap-3 px-4 py-3 transition ${
        n.read ? "hover:bg-accent/60" : "bg-primary/[0.03] hover:bg-accent/60"
      }`}
    >
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${ICON_BG[n.type] ?? "bg-muted"}`}
      >
        {ICONS[n.type] ?? "•"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 text-[11px]">
          <span
            className={`truncate font-semibold ${
              isAnon ? "font-mono text-muted-foreground" : "text-foreground"
            }`}
          >
            {actorName}
          </span>
          <span className="shrink-0 text-muted-foreground">{n.text}</span>
          <span className="ml-auto shrink-0 text-muted-foreground">{timeAgo(n.created_at)}</span>
        </div>
        {preview && (
          <p className="line-clamp-1 text-[11px] text-muted-foreground">{preview}</p>
        )}
      </div>
      {!n.read && <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
    </Link>
  );
}
