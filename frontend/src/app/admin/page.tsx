"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { APIError } from "@/lib/api-client";
import { getAdminDashboard, type DashboardResponse } from "@/lib/api/dashboard";
import type { BotCallStatus, ServerBotCallLog } from "@/lib/api/bot";
import { useStream } from "@/lib/stream";
import { timeAgo } from "@/lib/utils-time";

const REASON_LABEL: Record<string, string> = {
  spam: "垃圾广告",
  harassment: "骚扰辱骂",
  illegal: "违法违规",
  privacy: "隐私泄露",
  other: "其他",
};

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAdminDashboard()
      .then((resp) => {
        if (!cancelled) setData(resp);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof APIError) setError(`${err.message} (req ${err.requestId})`);
        else setError("加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Live-sync: bot webhook failures arrive over SSE and should appear in
  // the "调用异常" card without requiring the admin to reload. The total
  // count ticks up and the latest failure pushes to the front of the
  // preview list (capped at 5 so the card doesn't grow unbounded).
  const streamHandlers = useMemo(
    () => ({
      "bot.call.failed": (raw: unknown) => {
        const row = raw as ServerBotCallLog;
        setData((prev) => {
          if (!prev) return prev;
          const nextList = [row, ...prev.failed_bot_calls.filter((l) => l.id !== row.id)].slice(0, 5);
          return {
            ...prev,
            counts: {
              ...prev.counts,
              failed_bot_calls: prev.counts.failed_bot_calls + 1,
            },
            failed_bot_calls: nextList,
          };
        });
      },
    }),
    [],
  );
  useStream(streamHandlers);

  const c = data?.counts ?? {
    users: 0,
    topics: 0,
    bots: 0,
    pending_reports: 0,
    pending_bots: 0,
    failed_bot_calls: 0,
  };

  return (
    <>
      <AdminHeader title="Dashboard" subtitle="社区整体运行状态与待处理事项" />

      <div className="px-8 py-6">
        {error && (
          <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="用户" value={c.users} />
          <Metric label="帖子" value={c.topics} />
          <Metric
            label="Bot"
            value={c.bots}
            sub={c.pending_bots > 0 ? `${c.pending_bots} 待审核` : "无待审"}
            highlight={c.pending_bots > 0}
          />
          <Metric
            label="待处理举报"
            value={c.pending_reports}
            sub="需人工审核"
            highlight={c.pending_reports > 0}
          />
        </section>

        <section className="mb-6 grid gap-4 lg:grid-cols-3">
          <QueueCard
            title="待处理举报"
            count={c.pending_reports}
            href="/admin/reports"
            emptyText="当前没有待处理举报"
            loading={!data && !error}
          >
            {(data?.pending_reports ?? []).slice(0, 3).map((r) => (
              <div
                key={r.id}
                className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-1.5 text-[11px]">
                    <span className="rounded bg-rose-500/15 px-1.5 py-0.5 font-medium text-rose-600 dark:text-rose-400">
                      {REASON_LABEL[r.reason] ?? r.reason}
                    </span>
                    <span className="text-muted-foreground">· @{r.reporter_username}</span>
                  </div>
                  <div className="line-clamp-1 text-xs text-foreground">
                    {r.target_title || `#${r.target_id}`}
                  </div>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {timeAgo(r.created_at)}
                </span>
              </div>
            ))}
          </QueueCard>

          <QueueCard
            title="Bot 申请"
            count={c.pending_bots}
            href="/admin/bots"
            emptyText="没有待审核 Bot"
            loading={!data && !error}
          >
            {(data?.pending_bots ?? []).slice(0, 3).map((b) => (
              <div
                key={b.id}
                className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-1.5 text-xs">
                    <span className="font-medium text-foreground">{b.name}</span>
                    {b.owner_username && (
                      <span className="text-muted-foreground">· @{b.owner_username}</span>
                    )}
                  </div>
                  <div className="line-clamp-1 text-[11px] text-muted-foreground">
                    {b.description}
                  </div>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {timeAgo(b.created_at)}
                </span>
              </div>
            ))}
          </QueueCard>

          <QueueCard
            title="Bot 调用异常"
            count={c.failed_bot_calls}
            href="/admin/bot-logs"
            emptyText="近期无异常"
            loading={!data && !error}
          >
            {(data?.failed_bot_calls ?? []).slice(0, 3).map((l) => (
              <div
                key={l.id}
                className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-1.5 text-xs">
                    <span className="font-medium text-foreground">{l.bot_name}</span>
                    <StatusBadge status={l.status} />
                  </div>
                  <div className="line-clamp-1 text-[11px] text-muted-foreground">
                    {l.error_message ?? l.request_summary ?? "—"}
                  </div>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {timeAgo(l.created_at)}
                </span>
              </div>
            ))}
          </QueueCard>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">最近管理操作</h2>
            <Link href="/admin/audit" className="text-xs text-muted-foreground hover:text-foreground">
              查看全部 →
            </Link>
          </div>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">操作员</th>
                  <th className="px-4 py-2 text-left font-medium">动作</th>
                  <th className="px-4 py-2 text-left font-medium">对象</th>
                  <th className="px-4 py-2 text-left font-medium">详情</th>
                  <th className="px-4 py-2 text-right font-medium">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!data && !error ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      正在加载…
                    </td>
                  </tr>
                ) : (data?.recent_audit ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      暂无操作记录
                    </td>
                  </tr>
                ) : (
                  (data?.recent_audit ?? []).map((log) => (
                    <tr key={log.id}>
                      <td className="px-4 py-2.5">
                        {log.actor_username ? (
                          <Link
                            href={`/u/${log.actor_username}`}
                            className="font-medium text-foreground hover:underline"
                          >
                            @{log.actor_username}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">系统</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-foreground">{log.action}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {log.target_label || (log.target_type ? `${log.target_type}#${log.target_id}` : "—")}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{log.detail || "—"}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                        {timeAgo(log.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

function Metric({
  label,
  value,
  sub,
  highlight = false,
}: {
  label: string;
  value: number;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight ? "border-primary/40 bg-primary/5" : "border-border bg-card"
      }`}
    >
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold text-foreground">{value.toLocaleString()}</div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function QueueCard({
  title,
  count,
  href,
  emptyText,
  loading,
  children,
}: {
  title: string;
  count: number;
  href: string;
  emptyText: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {count > 0 && (
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
              {count}
            </span>
          )}
        </div>
        <Link href={href} className="text-xs text-muted-foreground hover:text-foreground">
          处理 →
        </Link>
      </div>
      <div className="px-4 pb-2 pt-1">
        {loading ? (
          <div className="space-y-3 py-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-b-0">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-5/6" />
                </div>
                <Skeleton className="h-3 w-10 shrink-0" />
              </div>
            ))}
          </div>
        ) : count === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">{emptyText}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: BotCallStatus }) {
  const config: Record<BotCallStatus, string> = {
    success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    timeout: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    error: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    blocked: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${config[status]}`}>
      {status}
    </span>
  );
}
