"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { APIError } from "@/lib/api-client";
import { adminSearchAnonAudit, type AnonAuditRow } from "@/lib/api/anon";
import { timeAgo } from "@/lib/utils-time";

export default function AdminAnonAuditPage() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AnonAuditRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await adminSearchAnonAudit(q);
      setRows(resp.items ?? []);
    } catch (err) {
      if (err instanceof APIError) setError(`${err.message} (req ${err.requestId})`);
      else setError("查询失败");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load: empty query shows most recent mappings. Every subsequent
  // search is user-initiated (Enter or the 查询 button) because the backend
  // writes an audit row per call — we must not fire on every keystroke.
  useEffect(() => {
    runSearch("");
  }, [runSearch]);

  function submit() {
    runSearch(query.trim());
  }

  const list = rows ?? [];

  return (
    <>
      <AdminHeader
        title="匿名追溯"
        subtitle="通过匿名 ID 或帖子查询真实账号 · 仅管理员可见"
      />

      <div className="px-8 py-6">
        <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-700 dark:text-amber-300">
          ⚠ <strong>审计提醒</strong>：本页的所有查询都会被记录到操作审计日志中，带真实查询人。匿名区承诺「前台匿名、后台可控」，不等于可以随意反查——请确认每次查询都有合理的审核理由。
        </div>

        <div className="mb-5 rounded-lg border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">追溯查询</h2>
          <div className="flex gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder="输入匿名 ID、用户名、帖子 ID 或标题关键词…留空显示最近记录"
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:border-ring"
            />
            <button
              type="button"
              onClick={submit}
              disabled={loading}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "查询中…" : "查询"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            提示：Redup 的匿名 ID 由 <span className="font-mono">(topic_id, user_id) → snowflake</span> 映射生成，同一用户在不同帖子里的 ID 不同。此处通过后端 <span className="font-mono">anonymous_audit_logs</span> 表查询而非反算。
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">匿名 ID</th>
                <th className="px-4 py-2.5 text-left font-medium">真实账号</th>
                <th className="px-4 py-2.5 text-left font-medium">帖子</th>
                <th className="px-4 py-2.5 text-left font-medium">发言数</th>
                <th className="px-4 py-2.5 text-left font-medium">首次</th>
                <th className="px-4 py-2.5 text-left font-medium">最后</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows === null ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    正在加载…
                  </td>
                </tr>
              ) : list.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    没有匹配记录
                  </td>
                </tr>
              ) : (
                list.map((r) => (
                  <tr key={`${r.anon_id}-${r.topic_id}-${r.user_id}`} className="hover:bg-accent/40">
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{r.anon_id}</td>
                    <td className="px-4 py-3">
                      {r.real_username ? (
                        <Link
                          href={`/u/${r.real_username}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          @{r.real_username}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">#{r.user_id}（已删除）</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/topic/${r.topic_id}`}
                        className="line-clamp-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        #{r.topic_id} {r.topic_title || "（已删除）"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{r.post_count}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {timeAgo(r.first_seen)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {timeAgo(r.last_seen)}
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
