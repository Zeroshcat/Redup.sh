"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { APIError } from "@/lib/api-client";
import { useStream } from "@/lib/stream";
import { adminDeletePost, adminDeleteTopic } from "@/lib/api/forum";
import {
  adminGetModerationCounts,
  adminListModerationLogs,
  adminResolveModerationLog,
  type ServerModerationLog,
  type Verdict,
} from "@/lib/api/moderation";
import { adminBanUser } from "@/lib/api/users";
import { timeAgo } from "@/lib/utils-time";

const VERDICT_STYLE: Record<Verdict, string> = {
  pass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  block: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
};

const VERDICT_LABEL: Record<Verdict, string> = {
  pass: "通过",
  warn: "警告",
  block: "拦截",
};

export default function AdminModerationPage() {
  const [logs, setLogs] = useState<ServerModerationLog[] | null>(null);
  const [counts, setCounts] = useState<Record<Verdict, number> | null>(null);
  const [filter, setFilter] = useState<Verdict | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function runAction(l: ServerModerationLog, fn: () => Promise<unknown>) {
    if (busyId) return;
    setBusyId(l.id);
    setError(null);
    try {
      await fn();
      await adminResolveModerationLog(l.id);
      await reload();
    } catch (err) {
      if (err instanceof APIError) setError(`${err.message} (req ${err.requestId})`);
      else setError("操作失败");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteTarget(l: ServerModerationLog) {
    if (!l.target_id) return;
    if (!confirm(`确定删除此 ${l.target_type === "topic" ? "主题" : "回帖"}？`)) return;
    await runAction(l, () =>
      l.target_type === "topic"
        ? adminDeleteTopic(l.target_id!)
        : adminDeletePost(l.target_id!),
    );
  }

  async function banAuthor(l: ServerModerationLog) {
    if (!l.actor_user_id) return;
    if (!confirm(`确定封禁 @${l.actor_username ?? l.actor_user_id}？`)) return;
    await runAction(l, () => adminBanUser(l.actor_user_id));
  }

  async function dismiss(l: ServerModerationLog) {
    setBusyId(l.id);
    setError(null);
    try {
      await adminResolveModerationLog(l.id);
      await reload();
    } catch (err) {
      if (err instanceof APIError) setError(`${err.message} (req ${err.requestId})`);
      else setError("操作失败");
    } finally {
      setBusyId(null);
    }
  }
  const [expanded, setExpanded] = useState<number | null>(null);

  async function reload() {
    try {
      const [resp, cs] = await Promise.all([
        adminListModerationLogs(filter === "all" ? undefined : filter, 100),
        adminGetModerationCounts(),
      ]);
      setLogs(resp.items);
      setCounts(cs);
      setError(null);
    } catch (err) {
      if (err instanceof APIError) setError(`${err.message} (req ${err.requestId})`);
      else setError("加载失败");
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Live-push: when the backend flags new warn/block content, prepend it to
  // the visible list and bump the summary counters. We skip entries that
  // don't match the current filter so the filter UI still behaves.
  const handleIncoming = useCallback(
    (log: ServerModerationLog) => {
      setCounts((prev) => {
        const base = prev ?? { pass: 0, warn: 0, block: 0 };
        return { ...base, [log.verdict]: base[log.verdict] + 1 };
      });
      if (filter !== "all" && filter !== log.verdict) return;
      setLogs((prev) => {
        if (!prev) return prev;
        if (prev.some((l) => l.id === log.id)) return prev;
        return [log, ...prev].slice(0, 200);
      });
    },
    [filter],
  );

  const streamHandlers = useMemo(
    () => ({
      "moderation.warn": (d: unknown) => handleIncoming(d as ServerModerationLog),
      "moderation.block": (d: unknown) => handleIncoming(d as ServerModerationLog),
    }),
    [handleIncoming],
  );
  useStream(streamHandlers);

  const list = logs ?? [];
  const c: Record<Verdict, number> = counts ?? { pass: 0, warn: 0, block: 0 };
  const total = c.pass + c.warn + c.block;

  return (
    <>
      <AdminHeader
        title="AI 审核日志"
        subtitle={
          counts
            ? `共 ${total} 次调用 · ${c.pass} 通过 · ${c.warn} 警告 · ${c.block} 拦截`
            : "正在加载…"
        }
      />

      <div className="px-8 py-6">
        <section className="mb-6 grid gap-3 sm:grid-cols-3">
          <StatBlock label="通过" value={c.pass} cls="text-emerald-600 dark:text-emerald-400" />
          <StatBlock label="警告" value={c.warn} cls="text-amber-600 dark:text-amber-400" />
          <StatBlock label="拦截" value={c.block} cls="text-rose-600 dark:text-rose-400" />
        </section>

        <div className="mb-4 flex items-center gap-1 border-b border-border">
          {(["all", "block", "warn", "pass"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`relative px-4 py-2 text-sm font-medium transition ${
                filter === key ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {key === "all" ? "全部" : VERDICT_LABEL[key]}
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
            没有符合条件的审核记录
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
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${VERDICT_STYLE[l.verdict]}`}>
                      {VERDICT_LABEL[l.verdict]}
                    </span>
                    {l.blocked_action && (
                      <span className="shrink-0 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
                        已阻断
                      </span>
                    )}
                    {l.resolved && (
                      <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                        已处理
                      </span>
                    )}
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {l.target_type} · {l.latency_ms}ms
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {l.reason || l.content_excerpt}
                    </span>
                    {l.actor_username && (
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        @{l.actor_username}
                      </span>
                    )}
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {timeAgo(l.created_at)}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="space-y-3 border-t border-border px-4 py-3">
                      {l.reason && (
                        <div>
                          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                            判决理由
                          </div>
                          <div className="rounded bg-muted/40 px-3 py-2 text-xs text-foreground">
                            {l.reason}
                          </div>
                        </div>
                      )}
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                          内容摘要
                        </div>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/40 px-3 py-2 text-[11px] text-foreground">
                          {l.content_excerpt}
                        </pre>
                      </div>
                      <div className="flex flex-wrap gap-4 text-[10px] text-muted-foreground">
                        <span>
                          模型: <span className="font-mono text-foreground">{l.provider} · {l.model}</span>
                        </span>
                        <span>
                          内容指纹:{" "}
                          <span className="font-mono text-foreground">{l.content_hash.slice(0, 12)}…</span>
                        </span>
                        <span>
                          时间:{" "}
                          <span className="font-mono text-foreground">
                            {new Date(l.created_at).toLocaleString("zh-CN")}
                          </span>
                        </span>
                      </div>

                      {!l.resolved && l.verdict !== "pass" && (
                        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                          {l.target_id && (l.target_type === "topic" || l.target_type === "post") && (
                            <>
                              <Link
                                href={`/topic/${l.target_id}`}
                                className="rounded-md border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                              >
                                查看内容
                              </Link>
                              <button
                                type="button"
                                onClick={() => deleteTarget(l)}
                                disabled={busyId === l.id}
                                className="rounded-md border border-rose-500/40 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
                              >
                                删除{l.target_type === "topic" ? "主题" : "回帖"}
                              </button>
                            </>
                          )}
                          {l.actor_user_id > 0 && l.actor_username && (
                            <button
                              type="button"
                              onClick={() => banAuthor(l)}
                              disabled={busyId === l.id}
                              className="rounded-md border border-rose-500/40 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
                            >
                              封禁 @{l.actor_username}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => dismiss(l)}
                            disabled={busyId === l.id}
                            className="ml-auto rounded-md border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
                          >
                            标记已处理
                          </button>
                        </div>
                      )}
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
