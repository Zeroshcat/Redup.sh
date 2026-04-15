"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { APIError } from "@/lib/api-client";
import {
  adminGetNotificationStats,
  adminListNotifications,
  type NotificationKind,
  type NotificationTypeStat,
  type ServerNotification,
} from "@/lib/api/notifications";
import { timeAgo } from "@/lib/utils-time";

const TYPE_OPTIONS: { value: "" | NotificationKind; label: string }[] = [
  { value: "", label: "全部类型" },
  { value: "reply", label: "回复" },
  { value: "mention", label: "@ 提及" },
  { value: "like", label: "点赞" },
  { value: "follow", label: "关注" },
  { value: "system", label: "系统" },
];

const TYPE_LABEL: Record<NotificationKind, string> = {
  reply: "回复",
  like: "点赞",
  mention: "@ 提及",
  follow: "关注",
  system: "系统",
};

const PAGE_SIZE = 50;

function errorMessage(err: unknown): string {
  if (err instanceof APIError) return `${err.message} (req ${err.requestId})`;
  return "请求失败";
}

export default function AdminNotificationsPage() {
  const [items, setItems] = useState<ServerNotification[] | null>(null);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<NotificationTypeStat[]>([]);
  const [filterType, setFilterType] = useState<"" | NotificationKind>("");
  const [filterRecipient, setFilterRecipient] = useState("");
  const [filterActor, setFilterActor] = useState("");
  const [filterUnread, setFilterUnread] = useState(false);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [listResp, statsResp] = await Promise.all([
        adminListNotifications({
          type: filterType || undefined,
          recipient_id: filterRecipient ? Number(filterRecipient) : undefined,
          actor_id: filterActor ? Number(filterActor) : undefined,
          unread: filterUnread || undefined,
          limit: PAGE_SIZE,
          offset,
        }),
        adminGetNotificationStats(),
      ]);
      setItems(listResp.items);
      setTotal(listResp.total);
      setStats(statsResp.items ?? []);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [filterType, filterRecipient, filterActor, filterUnread, offset]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch whose resolution updates state
    reload();
  }, [reload]);

  const totalCount = stats.reduce((acc, s) => acc + s.count, 0);
  const totalUnread = stats.reduce((acc, s) => acc + s.unread, 0);

  return (
    <>
      <AdminHeader
        title="通知管理"
        subtitle={
          items === null
            ? "加载中…"
            : `${totalCount.toLocaleString()} 条累计 · ${totalUnread.toLocaleString()} 未读`
        }
      />

      <div className="px-8 py-6">
        {error && (
          <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {stats.length === 0 ? (
            <div className="col-span-full text-xs text-muted-foreground">暂无数据</div>
          ) : (
            stats.map((s) => (
              <div key={s.type} className="rounded-xl border border-border bg-card p-4">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {TYPE_LABEL[s.type] ?? s.type}
                </div>
                <div className="mt-1 text-2xl font-bold text-foreground">
                  {s.count.toLocaleString()}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {s.unread.toLocaleString()} 未读
                </div>
              </div>
            ))
          )}
        </section>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value as typeof filterType);
              setOffset(0);
            }}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-ring"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            inputMode="numeric"
            value={filterRecipient}
            onChange={(e) => {
              setFilterRecipient(e.target.value);
              setOffset(0);
            }}
            placeholder="recipient_id"
            className="w-32 rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-ring"
          />
          <input
            type="number"
            inputMode="numeric"
            value={filterActor}
            onChange={(e) => {
              setFilterActor(e.target.value);
              setOffset(0);
            }}
            placeholder="actor_id"
            className="w-28 rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-ring"
          />
          <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground">
            <input
              type="checkbox"
              checked={filterUnread}
              onChange={(e) => {
                setFilterUnread(e.target.checked);
                setOffset(0);
              }}
              className="h-3.5 w-3.5"
            />
            仅未读
          </label>
          <button
            type="button"
            onClick={() => {
              setFilterType("");
              setFilterRecipient("");
              setFilterActor("");
              setFilterUnread(false);
              setOffset(0);
            }}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
          >
            清空筛选
          </button>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-40"
            >
              ← 上一页
            </button>
            <span className="font-mono">
              {total === 0 ? 0 : offset + 1}–{Math.min(total, offset + PAGE_SIZE)} / {total}
            </span>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-40"
            >
              下一页 →
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">收件人</th>
                <th className="px-4 py-2 text-left font-medium">发起人</th>
                <th className="px-4 py-2 text-left font-medium">类型</th>
                <th className="px-4 py-2 text-left font-medium">内容</th>
                <th className="px-4 py-2 text-left font-medium">状态</th>
                <th className="px-4 py-2 text-right font-medium">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items === null ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-xs text-muted-foreground">
                    加载中…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-xs text-muted-foreground">
                    没有符合条件的通知
                  </td>
                </tr>
              ) : (
                items.map((n) => (
                  <tr key={n.id}>
                    <td className="px-4 py-2 font-mono text-xs text-foreground">#{n.recipient_id}</td>
                    <td className="px-4 py-2 text-xs text-foreground">
                      {n.actor_is_anon
                        ? <span className="text-muted-foreground">匿名</span>
                        : n.actor_username
                        ? `@${n.actor_username}`
                        : <span className="text-muted-foreground">#{n.actor_user_id}</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-foreground">
                      {TYPE_LABEL[n.type] ?? n.type}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      <div className="line-clamp-1">{n.text}</div>
                      {n.target_title && (
                        <div className="line-clamp-1 text-[10px] text-muted-foreground/70">
                          → {n.target_title}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {n.read ? (
                        <span className="text-muted-foreground">已读</span>
                      ) : (
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          未读
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                      {timeAgo(n.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
