"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { listConversations, type ServerConversation } from "@/lib/api/messaging";
import { useAuthStore } from "@/store/auth";
import { timeAgo } from "@/lib/utils-time";

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  const me = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const pathname = usePathname();
  const [conversations, setConversations] = useState<ServerConversation[] | null>(null);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    async function reload() {
      try {
        const list = await listConversations();
        if (!cancelled) setConversations(list);
      } catch {
        /* ignore */
      }
    }
    reload();
    const handle = window.setInterval(reload, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [me, pathname]);

  if (!hydrated) {
    return <div className="flex flex-1" />;
  }

  if (!me) {
    return (
      <main className="flex flex-1 items-center justify-center px-8 py-12">
        <div className="text-center">
          <p className="mb-4 text-sm text-muted-foreground">登录后查看你的私信</p>
          <Link
            href="/login"
            className="inline-block rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            去登录
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="flex flex-1">
      <aside className="w-72 shrink-0 border-r border-border bg-card">
        <div className="sticky top-0 flex h-screen flex-col">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">私信</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              在任何用户主页点「💬 私信」即可开启对话
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {conversations === null ? (
              <div className="px-4 py-10 text-center text-xs text-muted-foreground">加载中…</div>
            ) : conversations.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs text-muted-foreground">
                还没有私信
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {conversations.map((c) => {
                  const active = pathname === `/messages/${c.other_user_id}`;
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/messages/${c.other_user_id}`}
                        className={`flex gap-3 px-4 py-3 transition ${
                          active ? "bg-accent" : "hover:bg-accent/60"
                        }`}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-muted to-muted-foreground/20 text-sm font-semibold text-foreground">
                          {(c.other_username || "?")[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-0.5 flex items-center gap-1.5">
                            <span className="truncate text-sm font-semibold text-foreground">
                              {c.other_username || `user_${c.other_user_id}`}
                            </span>
                            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                              {timeAgo(c.last_message_at)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="line-clamp-1 flex-1 text-xs text-muted-foreground">
                              {c.last_message_excerpt || "—"}
                            </p>
                            {c.unread_count > 0 && (
                              <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                                {c.unread_count}
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

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
