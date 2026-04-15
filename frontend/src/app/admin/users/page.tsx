"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { APIError } from "@/lib/api-client";
import {
  adminAdjustCreditScore,
  adminBanUser,
  adminListUsers,
  adminUnbanUser,
  type ServerPublicUser,
} from "@/lib/api/users";
import { timeAgo } from "@/lib/utils-time";

type RoleFilter = "all" | "user" | "trusted" | "admin";
type StatusFilter = "all" | "active" | "banned";

const ERROR_MESSAGES: Record<string, string> = {
  cannot_ban_admin: "无法封禁管理员",
  forbidden: "权限不足",
  unauthorized: "请先登录",
};

function errorMessage(err: unknown): string {
  if (err instanceof APIError) {
    const msg = ERROR_MESSAGES[err.code] ?? err.message;
    return `${msg} (req ${err.requestId})`;
  }
  return "请求失败";
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<ServerPublicUser[] | null>(null);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function reload() {
    try {
      const resp = await adminListUsers({
        search: query || undefined,
        role: roleFilter === "all" ? undefined : roleFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: 100,
      });
      setUsers(resp.items);
      setTotal(resp.total);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, roleFilter, statusFilter]);

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setQuery(searchInput.trim());
  }

  async function adjustCreditScore(u: ServerPublicUser) {
    const raw = prompt(
      `调整 @${u.username} 的信用分\n当前：${u.credit_score} / 100\n请输入有符号的调整值（负数扣分，正数加分）`,
      "-10",
    );
    if (raw === null) return;
    const delta = Number(raw.trim());
    if (!Number.isFinite(delta) || delta === 0) {
      setError("请输入一个非零整数");
      return;
    }
    const reason = prompt("备注（可选，会写入审计日志）", "") ?? "";
    setBusyId(u.id);
    setError(null);
    try {
      const r = await adminAdjustCreditScore(u.id, Math.trunc(delta), reason);
      // Patch the row in place so the admin sees the new score immediately.
      setUsers((prev) =>
        prev?.map((x) =>
          x.id === r.user_id ? { ...x, credit_score: r.credit_score } : x,
        ) ?? null,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleBan(u: ServerPublicUser) {
    const banned = u.status === "banned";
    if (!confirm(banned ? `确定解封 @${u.username} 吗？` : `确定封禁 @${u.username} 吗？`)) {
      return;
    }
    setBusyId(u.id);
    setError(null);
    try {
      if (banned) {
        await adminUnbanUser(u.id);
      } else {
        await adminBanUser(u.id);
      }
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const list = users ?? [];
  const bannedCount = list.filter((u) => u.status === "banned").length;

  return (
    <>
      <AdminHeader
        title="用户管理"
        subtitle={
          users
            ? `共 ${total} 名用户 · 当前页 ${list.length} 名 · ${bannedCount} 名被封禁`
            : "正在加载…"
        }
      />

      <div className="px-8 py-6">
        <form onSubmit={applySearch} className="mb-4 flex items-center gap-3">
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="搜索用户名 / 邮箱…"
            className="w-80 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
          />
          <button
            type="submit"
            className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            搜索
          </button>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
          >
            <option value="all">全部角色</option>
            <option value="user">普通用户</option>
            <option value="trusted">高信用</option>
            <option value="admin">管理员</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
          >
            <option value="all">全部状态</option>
            <option value="active">活跃</option>
            <option value="banned">封禁中</option>
          </select>
        </form>

        {error && (
          <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        {!users && !error ? (
          <div className="text-sm text-muted-foreground">正在加载…</div>
        ) : list.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            没有符合条件的用户
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">用户</th>
                  <th className="px-4 py-2.5 text-left font-medium">等级</th>
                  <th className="px-4 py-2.5 text-left font-medium">信用分</th>
                  <th className="px-4 py-2.5 text-left font-medium">角色</th>
                  <th className="px-4 py-2.5 text-left font-medium">加入时间</th>
                  <th className="px-4 py-2.5 text-left font-medium">状态</th>
                  <th className="px-4 py-2.5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((u) => {
                  const banned = u.status === "banned";
                  const isAdmin = u.role === "admin";
                  return (
                    <tr key={u.id} className="hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-muted to-muted-foreground/20 text-xs font-semibold text-foreground">
                            {u.username[0]?.toUpperCase()}
                          </div>
                          <div>
                            <Link
                              href={`/u/${u.username}`}
                              className="font-medium text-foreground hover:underline"
                            >
                              {u.username}
                            </Link>
                            {u.bio && (
                              <div className="line-clamp-1 text-[11px] text-muted-foreground">
                                {u.bio}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                          L{u.level}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground">
                        {u.credit_score}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{u.role}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {u.joined_at ? timeAgo(u.joined_at) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {banned ? (
                          <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                            封禁中
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            活跃
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <Link
                            href={`/u/${u.username}`}
                            className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            详情
                          </Link>
                          <button
                            type="button"
                            onClick={() => adjustCreditScore(u)}
                            disabled={busyId === u.id}
                            className="rounded px-2 py-1 text-[11px] text-amber-600 hover:bg-amber-500/10 disabled:opacity-40 disabled:hover:bg-transparent dark:text-amber-400"
                          >
                            信用 ±
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleBan(u)}
                            disabled={busyId === u.id || isAdmin}
                            title={isAdmin ? "管理员账号不可封禁" : undefined}
                            className={`rounded px-2 py-1 text-[11px] hover:bg-rose-500/10 disabled:opacity-40 disabled:hover:bg-transparent ${
                              banned
                                ? "text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            {busyId === u.id ? "处理中…" : banned ? "解封" : "封禁"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
