"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { APIError } from "@/lib/api-client";
import {
  adminApproveBot,
  adminFeatureBot,
  adminListBots,
  adminRejectBot,
  adminSetBotModerator,
  adminSuspendBot,
  type BotStatus,
  type ServerBot,
} from "@/lib/api/bot";
import { timeAgo } from "@/lib/utils-time";

const STATUS_FILTERS: { key: BotStatus | "all"; label: string }[] = [
  { key: "pending", label: "待审核" },
  { key: "active", label: "已上线" },
  { key: "suspended", label: "已暂停" },
  { key: "rejected", label: "已驳回" },
  { key: "all", label: "全部" },
];

const STATUS_LABEL: Record<BotStatus, { label: string; cls: string }> = {
  pending: { label: "待审核", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  active: { label: "已上线", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  suspended: { label: "已暂停", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  rejected: { label: "已驳回", cls: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400" },
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_status_transition: "当前状态不允许此操作",
  forbidden: "权限不足",
};

function errorMessage(err: unknown): string {
  if (err instanceof APIError) {
    const msg = ERROR_MESSAGES[err.code] ?? err.message;
    return `${msg} (req ${err.requestId})`;
  }
  return "请求失败";
}

export default function AdminBotsPage() {
  const [items, setItems] = useState<ServerBot[] | null>(null);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<BotStatus | "all">("pending");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function reload() {
    try {
      const resp = await adminListBots(filter === "all" ? undefined : filter);
      setItems(resp.items);
      setTotal(resp.total);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function run(id: number, fn: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function approve(b: ServerBot) {
    return run(b.id, () => adminApproveBot(b.id));
  }

  function reject(b: ServerBot) {
    const note = prompt("驳回理由（可选）") ?? "";
    return run(b.id, () => adminRejectBot(b.id, note));
  }

  function suspend(b: ServerBot) {
    const note = prompt("暂停原因（可选）") ?? "";
    return run(b.id, () => adminSuspendBot(b.id, note));
  }

  function toggleFeature(b: ServerBot) {
    return run(b.id, () => adminFeatureBot(b.id, !b.is_featured));
  }

  function toggleModerator(b: ServerBot) {
    return run(b.id, () => adminSetBotModerator(b.id, !b.is_moderator));
  }

  const list = items ?? [];

  return (
    <>
      <AdminHeader
        title="Bot 审核与管理"
        subtitle={items ? `共 ${total} 个 bot · 当前筛选 ${list.length}` : "正在加载…"}
      />

      <div className="px-8 py-6">
        <div className="mb-4 flex items-center gap-1 border-b border-border">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`relative px-4 py-2 text-sm font-medium transition ${
                filter === f.key ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
              {filter === f.key && (
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

        {!items && !error ? (
          <div className="text-sm text-muted-foreground">正在加载…</div>
        ) : list.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            没有符合条件的 Bot
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((b) => {
              const status = STATUS_LABEL[b.status];
              return (
                <div key={b.id} className="rounded-lg border border-border bg-card p-5">
                  <div className="mb-2 flex items-center gap-2 text-xs">
                    <span className={`rounded px-1.5 py-0.5 font-medium ${status.cls}`}>
                      {status.label}
                    </span>
                    {b.is_featured && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-600 dark:text-amber-400">
                        精选
                      </span>
                    )}
                    {b.is_moderator && (
                      <span className="rounded bg-blue-500/15 px-1.5 py-0.5 font-medium text-blue-600 dark:text-blue-400">
                        审核员
                      </span>
                    )}
                    <span className="font-mono text-muted-foreground">@{b.slug}</span>
                    <span className="ml-auto text-muted-foreground">{timeAgo(b.created_at)}</span>
                  </div>

                  <div className="mb-2 flex items-center gap-2">
                    <Link
                      href={`/bot/${b.slug}`}
                      className="text-base font-semibold text-foreground hover:underline"
                    >
                      {b.name}
                    </Link>
                  </div>

                  <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{b.description}</p>

                  <div className="mb-3 grid gap-2 text-[11px] text-muted-foreground md:grid-cols-3">
                    <div>
                      模型：<span className="font-mono text-foreground">{b.model_provider} · {b.model_name}</span>
                    </div>
                    <div>
                      创建者：
                      <Link
                        href={`/u/${b.owner_username}`}
                        className="ml-1 font-medium text-foreground hover:underline"
                      >
                        @{b.owner_username || `user_${b.owner_user_id}`}
                      </Link>
                    </div>
                    <div>
                      调用：<span className="font-mono text-foreground">{b.call_count}</span>
                    </div>
                  </div>

                  {b.rejection_note && (
                    <div className="mb-3 rounded border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                      备注：{b.rejection_note}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {b.status === "pending" && (
                      <>
                        <button
                          type="button"
                          onClick={() => approve(b)}
                          disabled={busyId === b.id}
                          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                        >
                          通过
                        </button>
                        <button
                          type="button"
                          onClick={() => reject(b)}
                          disabled={busyId === b.id}
                          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
                        >
                          驳回
                        </button>
                      </>
                    )}
                    {b.status === "active" && (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleFeature(b)}
                          disabled={busyId === b.id}
                          className={`rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                            b.is_featured
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                              : "border-border bg-card text-muted-foreground hover:bg-accent"
                          }`}
                        >
                          {b.is_featured ? "取消精选" : "设为精选"}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleModerator(b)}
                          disabled={busyId === b.id}
                          title="启用后该 bot 会在每次发帖前被调用对内容打分"
                          className={`rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                            b.is_moderator
                              ? "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                              : "border-border bg-card text-muted-foreground hover:bg-accent"
                          }`}
                        >
                          {b.is_moderator ? "取消审核员" : "设为审核员"}
                        </button>
                        <button
                          type="button"
                          onClick={() => suspend(b)}
                          disabled={busyId === b.id}
                          className="rounded-md border border-rose-500/40 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400"
                        >
                          暂停
                        </button>
                      </>
                    )}
                    {b.status === "suspended" && (
                      <button
                        type="button"
                        onClick={() => approve(b)}
                        disabled={busyId === b.id}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        恢复上线
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
