"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getUnreadMessageCount } from "@/lib/api/messaging";
import { useStream } from "@/lib/stream";
import { useAuthStore } from "@/store/auth";

export function MessageBell() {
  const isAuthed = useAuthStore((s) => Boolean(s.user));
  const me = useAuthStore((s) => s.user);
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  // Initial fetch on login and whenever we navigate back to /messages
  // (which also means pages where read marks get flushed).
  useEffect(() => {
    if (!isAuthed) {
      setUnread(0);
      return;
    }
    let cancelled = false;
    getUnreadMessageCount()
      .then((r) => {
        if (!cancelled) setUnread(r.unread);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthed, pathname]);

  // Real-time bump when the server pushes a message to us (skip our own
  // sends from other tabs).
  useStream(
    {
      "message.new": (data: unknown) => {
        const d = data as { message?: { sender_id?: number } } | null;
        if (d?.message?.sender_id && d.message.sender_id !== me?.id) {
          setUnread((c) => c + 1);
        }
      },
    },
    isAuthed,
  );

  if (!isAuthed) return null;

  return (
    <Link
      href="/messages"
      aria-label="私信"
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
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
