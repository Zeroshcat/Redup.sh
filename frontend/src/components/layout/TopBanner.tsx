"use client";

import { useEffect, useState } from "react";
import type { AnnouncementLevel, ServerAnnouncement } from "@/lib/api/announcements";

// localStorage key holding the set of dismissed announcement ids. We store
// ids (not content hashes) so an admin who edits a live banner can choose
// to re-show it by deleting + recreating rather than silently pushing to
// users who already clicked dismiss.
const STORAGE_KEY = "redup.announcements.dismissed";

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
    /* quota / private mode — ignore */
  }
}

const LEVEL_STYLE: Record<AnnouncementLevel, string> = {
  info: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300",
  success: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  warning: "bg-amber-500/10 text-amber-800 border-amber-500/30 dark:text-amber-300",
  danger: "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-300",
};

// TopBanner picks the newest active top_banner announcement that this
// browser hasn't dismissed yet and renders it as a strip above the nav.
// Multiple active banners collapse to "show one at a time" — the next one
// appears after the user dismisses the current. This matches what users
// expect from system-wide strips: a firehose of simultaneous strips feels
// broken even when every entry is intentional.
export function TopBanner({ items }: { items: ServerAnnouncement[] }) {
  // Lazy init reads localStorage once on mount. During SSR the window
  // guard inside loadDismissed returns an empty set, so the server-rendered
  // output is "not dismissed" — that's intentional, but to avoid a visible
  // flash of a banner the user already closed we gate the first render on
  // a mounted flag populated via effect.
  const [dismissed, setDismissed] = useState<Set<number>>(() => loadDismissed());
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional client-only hydration gate
    setHydrated(true);
  }, []);

  if (!hydrated || items.length === 0) return null;

  const visible = items.find((a) => !dismissed.has(a.id));
  if (!visible) return null;

  function dismiss() {
    if (!visible) return;
    const next = new Set(dismissed);
    next.add(visible.id);
    setDismissed(next);
    saveDismissed(next);
  }

  return (
    <div
      className={`flex items-center gap-3 border-b px-4 py-2 text-xs ${LEVEL_STYLE[visible.level]}`}
      role="status"
    >
      <span className="font-semibold">{visible.title}</span>
      <span className="min-w-0 flex-1 truncate opacity-80">{visible.content}</span>
      {visible.dismissible && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="关闭"
          className="shrink-0 rounded px-2 py-0.5 text-xs opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
        >
          ✕
        </button>
      )}
    </div>
  );
}
