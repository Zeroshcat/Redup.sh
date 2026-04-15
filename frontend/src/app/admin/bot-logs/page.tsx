"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { APIError } from "@/lib/api-client";
import {
  adminGetBotLogStats,
  adminListBotLogs,
  type BotCallStatus,
  type ServerBotCallLog,
} from "@/lib/api/bot";
import { timeAgo } from "@/lib/utils-time";

const STATUS_STYLE: Record<BotCallStatus, string> = {
  success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  timeout: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  error: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  blocked: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
};

const STATUS_LABEL: Record<BotCallStatus, string> = {
  success: "成功",
  timeout: "超时",
  error: "错误",
  blocked: "拦截",
};

export default function AdminBotLogsPage() {
  const [logs, setLogs] = useState<ServerBotCallLog[] | null>(null);
  const [stats, setStats] = useState<Record<BotCallStatus, number> | null>(null);
  const [filter, setFilter] = useState<BotCallStatus | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  async function reload() {
    try {
      const [resp, st] = await Promise.all([
        adminListBotLogs({ status: filter === "all" ? undefined : filter, limit: 100 }),
        adminGetBotLogStats(),
      ]);
      setLogs(resp.items);
      setStats(st);
      setError(null);
    } catch (err) {
      if (err instanceof APIError) setError(`${err.message} (req ${err.requestId})`);
      else setError("请求失败");
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const list = logs ?? [];
  const safeStats: Record<BotCallStatus, number> = stats ?? {
    success: 0,
    timeout: 0,
    error: 0,
    blocked: 0,
  };
  const total = safeStats.success + safeStats.timeout + safeStats.error + safeStats.blocked;
  const successRate = total > 0 ? Math.round((safeStats.success / total) * 100) : 0;

  const successLogs = list.filter((l) => l.status === "success");
  const avgLatency =
    successLogs.length > 0
      ? Math.round(successLogs.reduce((s, l) => s + l.latency_ms, 0) / successLogs.length)
      : 0;

  return (
    <>
      <AdminHeader
        title="Bot 调用日志"
        subtitle={
          stats
            ? `共 ${total} 次调用 · 成功率 ${successRate}% · 当前页平均耗时 ${avgLatency}ms`
            : "正在加载…"
        }
      />

      <div className="px-8 py-6">
        <section className="mb-6 grid gap-3 sm:grid-cols-4">
          <StatBlock label="成功" value={safeStats.success} cls="text-emerald-600 dark:text-emerald-400" />
          <StatBlock label="超时" value={safeStats.timeout} cls="text-amber-600 dark:text-amber-400" />
          <StatBlock label="错误" value={safeStats.error} cls="text-rose-600 dark:text-rose-400" />
          <StatBlock label="拦截" value={safeStats.blocked} cls="text-zinc-600 dark:text-zinc-400" />
        </section>

        <div className="mb-4 flex items-center gap-1 border-b border-border">
          {(["all", "success", "timeout", "error", "blocked"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`relative px-4 py-2 text-sm font-medium transition ${
                filter === key ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {key === "all" ? "全部" : STATUS_LABEL[key]}
              {filter === key && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 bg-primary" />
              )}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        {!logs && !error ? (
          <div className="text-sm text-muted-foreground">正在加载…</div>
        ) : list.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            没有符合条件的调用记录
          </div>
        ) : (
          <div className="space-y-2">
            {list.map((l) => {
              const isOpen = expanded === l.id;
              return (
                <div key={l.id} className="rounded-lg border border-border bg-card">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : l.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/40"
                  >
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[l.status]}`}>
                      {STATUS_LABEL[l.status]}
                    </span>
                    <Link
                      href={`/bot/${l.bot_slug}`}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 font-semibold text-violet-600 hover:underline dark:text-violet-400"
                    >
                      @{l.bot_slug}
                    </Link>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {l.latency_ms}ms
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {l.topic_title || `topic #${l.topic_id}`}
                    </span>
                    {l.trigger_username && (
                      <Link
                        href={`/u/${l.trigger_username}`}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        @{l.trigger_username}
                      </Link>
                    )}
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {timeAgo(l.created_at)}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="space-y-3 border-t border-border px-4 py-3">
                      {l.error_message && (
                        <div>
                          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                            错误
                          </div>
                          <pre className="whitespace-pre-wrap rounded bg-rose-500/10 px-3 py-2 text-[11px] text-rose-600 dark:text-rose-400">
                            {l.error_message}
                          </pre>
                        </div>
                      )}
                      {l.request_summary && (
                        <div>
                          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                            Prompt
                          </div>
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/40 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                            {l.request_summary}
                          </pre>
                        </div>
                      )}
                      {l.response_summary && (
                        <div>
                          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                            Reply
                          </div>
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/40 px-3 py-2 text-[11px] text-foreground">
                            {l.response_summary}
                          </pre>
                        </div>
                      )}
                      <div className="flex gap-4 text-[10px] text-muted-foreground">
                        <span>
                          Bot: <span className="font-mono text-foreground">{l.bot_name}</span>
                        </span>
                        <span>
                          Topic:{" "}
                          <Link
                            href={`/topic/${l.topic_id}`}
                            className="font-mono text-foreground hover:underline"
                          >
                            #{l.topic_id}
                          </Link>
                        </span>
                        <span>
                          时间：
                          <span className="font-mono text-foreground">
                            {new Date(l.created_at).toLocaleString("zh-CN")}
                          </span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function StatBlock({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className={`text-2xl font-bold ${cls}`}>{value.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
