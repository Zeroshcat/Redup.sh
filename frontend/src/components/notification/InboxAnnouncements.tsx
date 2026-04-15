"use client";

import { useEffect, useState } from "react";
import {
  listActiveAnnouncements,
  type AnnouncementLevel,
  type ServerAnnouncement,
} from "@/lib/api/announcements";

// Per-user dismissal is client-side only (localStorage) so this works for
// anonymous and authed users uniformly, and so we don't need a
// per-user-per-announcement read table on the backend. If a user clears
// their browser state, they'll see the still-active announcements again —
// acceptable for announcement-style broadcasts.
const STORAGE_KEY = "redup.announcements.inbox-dismissed";

function loadDismissed(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x) => typeof x === "number"));
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<number>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

const LEVEL_BADGE: Record<AnnouncementLevel, { cls: string; label: string }> = {
  info: { cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400", label: "信息" },
  success: { cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", label: "成功" },
  warning: { cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400", label: "提醒" },
  danger: { cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400", label: "重要" },
};

// InboxAnnouncements renders placement=inbox announcements as a panel above
// the user's notification list. Each entry is independently dismissable
// (unlike the top banner, which shows one-at-a-time). A consumer of this
// component can omit the header when embedding inside a dropdown.
export function InboxAnnouncements({ showHeader = true }: { showHeader?: boolean }) {
  const [items, setItems] = useState<ServerAnnouncement[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(() => loadDismissed());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only hydration gate + fetch
    setHydrated(true);
    listActiveAnnouncements("inbox")
      .then((resp) => setItems(resp.items ?? []))
      .catch(() => {
        /* silent — inbox announcements are non-critical */
      });
  }, []);

  if (!hydrated) return null;
  const visible = items.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  function dismiss(id: number) {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    saveDismissed(next);
  }

  return (
    <section className="mb-6">
      {showHeader && (
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          系统公告
        </h2>
      )}
      <div className="space-y-2">
        {visible.map((a) => {
          const lv = LEVEL_BADGE[a.level];
          return (
            <div
              key={a.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="mb-1.5 flex items-center gap-2 text-[11px]">
                <span className={`rounded px-1.5 py-0.5 font-medium ${lv.cls}`}>
                  {lv.label}
                </span>
                <span className="text-muted-foreground">系统公告</span>
                {a.dismissible && (
                  <button
                    type="button"
                    onClick={() => dismiss(a.id)}
                    className="ml-auto text-muted-foreground hover:text-foreground"
                    aria-label="关闭"
                  >
                    ✕
                  </button>
                )}
              </div>
              <h3 className="mb-1 text-sm font-semibold text-foreground">{a.title}</h3>
              <p className="whitespace-pre-wrap text-xs text-muted-foreground">{a.content}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
