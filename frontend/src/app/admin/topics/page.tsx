"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { APIError } from "@/lib/api-client";
import {
  adminDeleteTopic,
  adminFeatureTopic,
  adminLockTopic,
  adminPinTopic,
  listCategories,
  listTopics,
  type ServerCategory,
  type ServerTopic,
} from "@/lib/api/forum";
import { PinBadge } from "@/components/forum/PinBadge";
import { timeAgo } from "@/lib/utils-time";

type StatusFilter = "all" | "pinned" | "featured" | "locked";

const PIN_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "不置顶" },
  { value: 1, label: "板块置顶" },
  { value: 2, label: "区置顶" },
  { value: 3, label: "全站置顶" },
];

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "权限不足",
  unauthorized: "请先登录",
  not_found: "帖子不存在或已被删除",
};

function errorMessage(err: unknown): string {
  if (err instanceof APIError) {
    const msg = ERROR_MESSAGES[err.code] ?? err.message;
    return `${msg} (req ${err.requestId})`;
  }
  return "请求失败";
}

export default function AdminTopicsPage() {
  const [topics, setTopics] = useState<ServerTopic[] | null>(null);
  const [categories, setCategories] = useState<ServerCategory[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function reload() {
    try {
      const list = await listTopics({
        category: categoryFilter === "all" ? undefined : categoryFilter,
        sort: "latest",
        limit: 100,
      });
      setTopics(list);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    listCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter]);

  async function runAction(id: number, fn: () => Promise<unknown>) {
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

  function setPinLevel(t: ServerTopic, level: number) {
    return runAction(t.id, () => adminPinTopic(t.id, level, t.pin_weight));
  }

  function setPinWeight(t: ServerTopic, weight: number) {
    return runAction(t.id, () => adminPinTopic(t.id, t.pin_level, weight));
  }

  function toggleFeature(t: ServerTopic) {
    return runAction(t.id, () => adminFeatureTopic(t.id, !t.is_featured));
  }

  function toggleLock(t: ServerTopic) {
    return runAction(t.id, () => adminLockTopic(t.id, !t.is_locked));
  }

  async function remove(t: ServerTopic) {
    if (!confirm(`确定删除「${t.title}」？该操作不可在前台恢复。`)) return;
    return runAction(t.id, () => adminDeleteTopic(t.id));
  }

  const list = topics ?? [];
  const filtered = list.filter((t) => {
    switch (statusFilter) {
      case "pinned":
        return t.pin_level > 0;
      case "featured":
        return t.is_featured;
      case "locked":
        return t.is_locked;
      default:
        return true;
    }
  });

  return (
    <>
      <AdminHeader
        title="帖子管理"
        subtitle={topics ? `共 ${list.length} 个帖子 · 当前筛选 ${filtered.length}` : "正在加载…"}
        actions={
          <>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value="all">全部板块</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value="all">全部状态</option>
              <option value="pinned">置顶</option>
              <option value="featured">精华</option>
              <option value="locked">锁定</option>
            </select>
          </>
        }
      />

      <div className="px-8 py-6">
        {error && (
          <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        {!topics && !error ? (
          <div className="text-sm text-muted-foreground">正在加载…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            没有符合条件的帖子
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">标题</th>
                  <th className="px-4 py-2.5 text-left font-medium">板块</th>
                  <th className="px-4 py-2.5 text-left font-medium">作者</th>
                  <th className="px-4 py-2.5 text-left font-medium">回复</th>
                  <th className="px-4 py-2.5 text-left font-medium">状态</th>
                  <th className="px-4 py-2.5 text-left font-medium">最后活动</th>
                  <th className="px-4 py-2.5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((t) => {
                  const isAnon = t.is_anon;
                  const authorName = isAnon
                    ? t.anon_id || `Anon-${t.id}`
                    : t.user?.username || `user_${t.user_id}`;
                  return (
                    <tr key={t.id} className="hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <Link
                          href={`/topic/${t.id}`}
                          className="line-clamp-1 font-medium text-foreground hover:underline"
                        >
                          {t.title}
                        </Link>
                        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                          #{t.id}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground">
                          {t.category_slug ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isAnon ? (
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {authorName}
                          </span>
                        ) : (
                          <Link
                            href={`/u/${authorName}`}
                            className="text-xs text-foreground hover:underline"
                          >
                            {authorName}
                          </Link>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {t.reply_count}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <PinBadge level={t.pin_level} />
                          {t.pin_level > 0 && t.pin_weight !== 0 && (
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                              w{t.pin_weight}
                            </span>
                          )}
                          {t.is_featured && (
                            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                              精华
                            </span>
                          )}
                          {t.is_locked && (
                            <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-400">
                              锁定
                            </span>
                          )}
                          {t.pin_level === 0 && !t.is_featured && !t.is_locked && (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {timeAgo(t.last_post_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1">
                          <select
                            value={t.pin_level}
                            onChange={(e) => setPinLevel(t, Number(e.target.value))}
                            disabled={busyId === t.id}
                            className="rounded border border-input bg-background px-1 py-0.5 text-[11px] outline-none focus:border-ring disabled:opacity-50"
                          >
                            {PIN_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          {t.pin_level > 0 && (
                            <input
                              type="number"
                              defaultValue={t.pin_weight}
                              onBlur={(e) => {
                                const v = Number(e.target.value);
                                if (v !== t.pin_weight) setPinWeight(t, v);
                              }}
                              disabled={busyId === t.id}
                              title="同级权重，从大到小排"
                              className="w-12 rounded border border-input bg-background px-1 py-0.5 font-mono text-[11px] outline-none focus:border-ring disabled:opacity-50"
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => toggleFeature(t)}
                            disabled={busyId === t.id}
                            className={`rounded px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-50 ${
                              t.is_featured
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {t.is_featured ? "取消精华" : "精华"}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleLock(t)}
                            disabled={busyId === t.id}
                            className={`rounded px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-50 ${
                              t.is_locked
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {t.is_locked ? "解锁" : "锁定"}
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(t)}
                            disabled={busyId === t.id}
                            className="rounded px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400"
                          >
                            删除
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
