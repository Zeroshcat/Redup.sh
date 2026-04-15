"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { APIError } from "@/lib/api-client";
import { useStream } from "@/lib/stream";
import {
  adminDeletePost,
  adminDeleteTopic,
  adminLockTopic,
} from "@/lib/api/forum";
import {
  dismissReport,
  getReportCounts,
  listReports,
  resolveReport,
  type ReportCounts,
  type ReportReason,
  type ReportStatus,
  type ServerReport,
} from "@/lib/api/reports";
import { adminBanUser } from "@/lib/api/users";
import { timeAgo } from "@/lib/utils-time";

type Filter = ReportStatus | "all";

const REASON_LABEL: Record<ReportReason, string> = {
  spam: "垃圾广告",
  harassment: "骚扰辱骂",
  illegal: "违法违规",
  privacy: "隐私泄露",
  other: "其他",
};

const TARGET_LABEL: Record<ServerReport["target_type"], string> = {
  topic: "主题",
  post: "回帖",
  user: "用户",
};

const ERROR_MESSAGES: Record<string, string> = {
  report_already_handled: "该举报已被其他管理员处理",
  cannot_ban_admin: "无法封禁管理员",
  forbidden: "权限不足",
  unauthorized: "请先登录",
};

interface ActionState {
  lockTopic: boolean;
  deleteTarget: boolean;
  banUser: boolean;
  note: string;
  creditScoreDelta: number;
}

const EMPTY_ACTIONS: ActionState = {
  lockTopic: false,
  deleteTarget: false,
  banUser: false,
  note: "",
  creditScoreDelta: 0,
};

function errorMessage(err: unknown): string {
  if (err instanceof APIError) {
    const msg = ERROR_MESSAGES[err.code] ?? err.message;
    return `${msg} (req ${err.requestId})`;
  }
  return "请求失败";
}

export default function AdminReportsPage() {
  const [filter, setFilter] = useState<Filter>("pending");
  const [reports, setReports] = useState<ServerReport[] | null>(null);
  const [counts, setCounts] = useState<ReportCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [actions, setActions] = useState<ActionState>(EMPTY_ACTIONS);

  function startResolve(r: ServerReport) {
    setExpandedId(r.id);
    setActions({ ...EMPTY_ACTIONS });
  }

  function cancelResolve() {
    setExpandedId(null);
    setActions(EMPTY_ACTIONS);
  }

  async function confirmResolve(r: ServerReport) {
    setBusyId(r.id);
    setError(null);
    try {
      // Run side-effect actions before marking resolved so the report log
      // doesn't go green if a downstream call fails.
      if (actions.lockTopic && r.target_type === "topic") {
        await adminLockTopic(r.target_id, true);
      }
      if (actions.deleteTarget) {
        if (r.target_type === "topic") await adminDeleteTopic(r.target_id);
        if (r.target_type === "post") await adminDeletePost(r.target_id);
      }
      if (actions.banUser && r.target_type === "user") {
        await adminBanUser(r.target_id);
      }
      await resolveReport(
        r.id,
        actions.note.trim(),
        Math.trunc(actions.creditScoreDelta) || 0,
      );
      cancelResolve();
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function reload() {
    try {
      const [list, cs] = await Promise.all([listReports(filter), getReportCounts()]);
      setReports(list);
      setCounts(cs);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Live-sync: another admin handling a report should be reflected here
  // without the second admin having to refresh. We also react to brand-new
  // reports so a pending queue stays current while you look at it.
  const applyCreated = useCallback(
    (r: ServerReport) => {
      setCounts((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pending: prev.pending + 1,
          all: prev.all + 1,
        };
      });
      if (filter !== "all" && filter !== "pending") return;
      setReports((prev) => {
        if (!prev) return prev;
        if (prev.some((x) => x.id === r.id)) return prev;
        return [r, ...prev];
      });
    },
    [filter],
  );

  const applyResolved = useCallback(
    (r: ServerReport) => {
      // Counts: one less pending, one more in whatever bucket it landed in.
      setCounts((prev) => {
        if (!prev) return prev;
        const next = { ...prev, pending: Math.max(0, prev.pending - 1) };
        if (r.status === "resolved") next.resolved = prev.resolved + 1;
        else if (r.status === "dismissed") next.dismissed = prev.dismissed + 1;
        return next;
      });
      // If another admin was mid-action on the same report, collapse it —
      // the old expanded drawer no longer reflects reality.
      setExpandedId((cur) => (cur === r.id ? null : cur));
      setReports((prev) => {
        if (!prev) return prev;
        // Under the "pending" filter a resolved row should vanish. Under
        // "resolved"/"dismissed" it should appear if it wasn't there, or
        // update in place. Under "all" we just update in place.
        const idx = prev.findIndex((x) => x.id === r.id);
        if (filter === "pending") {
          return idx >= 0 ? prev.filter((x) => x.id !== r.id) : prev;
        }
        if (filter === "all" || filter === r.status) {
          if (idx >= 0) {
            const next = prev.slice();
            next[idx] = r;
            return next;
          }
          return [r, ...prev];
        }
        // Filter is a different terminal status (resolved filter but this was a dismiss).
        return idx >= 0 ? prev.filter((x) => x.id !== r.id) : prev;
      });
    },
    [filter],
  );

  const streamHandlers = useMemo(
    () => ({
      "report.created": (d: unknown) => applyCreated(d as ServerReport),
      "report.resolved": (d: unknown) => applyResolved(d as ServerReport),
    }),
    [applyCreated, applyResolved],
  );
  useStream(streamHandlers);

  async function handle(id: number, action: "resolve" | "dismiss") {
    setBusyId(id);
    setError(null);
    try {
      if (action === "resolve") {
        await resolveReport(id);
      } else {
        await dismissReport(id);
      }
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function targetHref(r: ServerReport): string {
    switch (r.target_type) {
      case "topic":
      case "post":
        return `/topic/${r.target_id}`;
      case "user":
        return r.target_title ? `/u/${r.target_title.replace(/^@\s*/, "")}` : "#";
      default:
        return "#";
    }
  }

  const c = counts ?? { pending: 0, resolved: 0, dismissed: 0, all: 0 };

  return (
    <>
      <AdminHeader
        title="举报处理"
        subtitle={`${c.pending} 待处理 · ${c.resolved} 已处理 · ${c.dismissed} 已驳回`}
      />

      <div className="px-8 py-6">
        <div className="mb-4 flex items-center gap-1 border-b border-border">
          {(["pending", "resolved", "dismissed", "all"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`relative px-4 py-2 text-sm font-medium transition ${
                filter === key ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {key === "pending"
                ? "待处理"
                : key === "resolved"
                ? "已处理"
                : key === "dismissed"
                ? "已驳回"
                : "全部"}
              <span className="ml-1 font-mono text-[11px] text-muted-foreground">{c[key]}</span>
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

        {!reports && !error && (
          <div className="text-sm text-muted-foreground">正在加载…</div>
        )}

        {reports && reports.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            没有符合条件的举报
          </div>
        ) : (
          <div className="space-y-3">
            {reports?.map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-card p-5">
                <div className="mb-2 flex items-center gap-2 text-xs">
                  <span className="rounded bg-rose-500/15 px-1.5 py-0.5 font-medium text-rose-600 dark:text-rose-400">
                    {REASON_LABEL[r.reason] ?? r.reason}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                    {TARGET_LABEL[r.target_type] ?? r.target_type}
                  </span>
                  <span className="font-mono text-muted-foreground">#{r.id}</span>
                  <span className="ml-auto text-muted-foreground">{timeAgo(r.created_at)}</span>
                </div>

                <div className="mb-3">
                  <div className="mb-0.5 text-[11px] text-muted-foreground">被举报对象</div>
                  <Link
                    href={targetHref(r)}
                    className="text-sm font-medium text-foreground hover:underline"
                  >
                    {r.target_title || `${TARGET_LABEL[r.target_type]} #${r.target_id}`}
                  </Link>
                </div>

                {r.description && (
                  <div className="mb-3 rounded border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    {r.description}
                  </div>
                )}

                <div className="mb-3 text-[11px] text-muted-foreground">
                  举报人：
                  <Link
                    href={`/u/${r.reporter_username}`}
                    className="ml-1 font-medium text-foreground hover:underline"
                  >
                    @{r.reporter_username}
                  </Link>
                  {r.handler_username && (
                    <span className="ml-3">
                      处理人：
                      <Link
                        href={`/u/${r.handler_username}`}
                        className="ml-1 font-medium text-foreground hover:underline"
                      >
                        @{r.handler_username}
                      </Link>
                      {r.handled_at && (
                        <span className="ml-1">· {timeAgo(r.handled_at)}</span>
                      )}
                    </span>
                  )}
                </div>

                {r.status === "pending" ? (
                  expandedId === r.id ? (
                    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4">
                      <div className="mb-3 text-xs font-semibold text-foreground">
                        确认违规 · 选择联动操作
                      </div>
                      <div className="mb-3 space-y-2">
                        {r.target_type === "topic" && (
                          <ActionCheckbox
                            label="锁定该主题"
                            desc="新回复将被禁止，已有内容保留"
                            checked={actions.lockTopic}
                            onChange={(v) => setActions({ ...actions, lockTopic: v })}
                          />
                        )}
                        {(r.target_type === "topic" || r.target_type === "post") && (
                          <ActionCheckbox
                            label={r.target_type === "topic" ? "删除主题" : "删除回帖"}
                            desc="软删除，可在数据库中恢复"
                            checked={actions.deleteTarget}
                            onChange={(v) => setActions({ ...actions, deleteTarget: v })}
                          />
                        )}
                        {r.target_type === "user" && (
                          <ActionCheckbox
                            label="封禁该用户"
                            desc="封禁后此用户在所有帖子的内容会显示『已被封禁』"
                            checked={actions.banUser}
                            onChange={(v) => setActions({ ...actions, banUser: v })}
                          />
                        )}
                      </div>
                      <div className="mb-3 rounded-md border border-border bg-card px-3 py-2">
                        <div className="mb-1 text-[11px] font-medium text-foreground">
                          信用分调整（可选）
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={actions.creditScoreDelta || ""}
                            onChange={(e) =>
                              setActions({
                                ...actions,
                                creditScoreDelta: Number(e.target.value) || 0,
                              })
                            }
                            placeholder="0（不调整）"
                            className="w-24 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:border-ring"
                          />
                          <span className="text-[11px] text-muted-foreground">
                            负数扣分，正数加回 · 范围钳到 [0, 100] · 作用于 {TARGET_LABEL[r.target_type]} 作者
                          </span>
                        </div>
                        <div className="mt-1.5 flex gap-1">
                          {[-20, -10, -5, -1].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() =>
                                setActions({ ...actions, creditScoreDelta: n })
                              }
                              className="rounded border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                      <textarea
                        value={actions.note}
                        onChange={(e) => setActions({ ...actions, note: e.target.value })}
                        rows={2}
                        maxLength={500}
                        placeholder="处理备注（可选，会保存到审计日志）"
                        className="mb-3 w-full rounded-md border border-input bg-background px-3 py-2 text-xs outline-none focus:border-ring"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelResolve}
                          disabled={busyId === r.id}
                          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmResolve(r)}
                          disabled={busyId === r.id}
                          className="rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                        >
                          {busyId === r.id ? "处理中…" : "确认提交"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startResolve(r)}
                        disabled={busyId === r.id}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        确认违规…
                      </button>
                      <button
                        type="button"
                        onClick={() => handle(r.id, "dismiss")}
                        disabled={busyId === r.id}
                        className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
                      >
                        驳回举报
                      </button>
                    </div>
                  )
                ) : (
                  r.resolution_note && (
                    <div className="rounded border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                      处理备注：{r.resolution_note}
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ActionCheckbox({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs hover:bg-accent/40">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5"
      />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-foreground">{label}</div>
        {desc && <div className="mt-0.5 text-[11px] text-muted-foreground">{desc}</div>}
      </div>
    </label>
  );
}
