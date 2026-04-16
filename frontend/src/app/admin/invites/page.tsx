"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { APIError } from "@/lib/api-client";
import {
  adminDeleteInvite,
  adminGenerateInvite,
  adminGetInviteUsages,
  adminListInvites,
  type ServerInviteCode,
  type ServerInviteUsage,
} from "@/lib/api/invite";
import { timeAgo } from "@/lib/utils-time";

export default function AdminInvitesPage() {
  const [invites, setInvites] = useState<ServerInviteCode[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Generate form
  const [maxUses, setMaxUses] = useState(1);
  const [note, setNote] = useState("");
  const [expiresHours, setExpiresHours] = useState(0);

  // Expanded usages
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [usages, setUsages] = useState<ServerInviteUsage[]>([]);

  async function reload() {
    try {
      const r = await adminListInvites();
      setInvites(r.items);
      setTotal(r.total);
      setError(null);
    } catch (err) {
      setError(err instanceof APIError ? err.message : "加载失败");
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function generate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await adminGenerateInvite({
        max_uses: maxUses,
        note: note.trim() || undefined,
        expires_in_hours: expiresHours > 0 ? expiresHours : undefined,
      });
      setNote("");
      await reload();
    } catch (err) {
      setError(err instanceof APIError ? err.message : "生成失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("确定删除这个邀请码？")) return;
    setBusy(true);
    try {
      await adminDeleteInvite(id);
      await reload();
    } catch (err) {
      setError(err instanceof APIError ? err.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  async function toggleUsages(id: number) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    try {
      const items = await adminGetInviteUsages(id);
      setUsages(items);
      setExpandedId(id);
    } catch {
      setUsages([]);
      setExpandedId(id);
    }
  }

  const list = invites ?? [];

  return (
    <>
      <AdminHeader
        title="邀请码管理"
        subtitle={invites ? `共 ${total} 个邀请码` : "加载中…"}
      />

      <div className="px-8 py-6">
        <div className="mb-6 rounded-lg border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">生成新邀请码</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                可用次数
              </label>
              <input
                type="number"
                min={1}
                max={9999}
                value={maxUses}
                onChange={(e) => setMaxUses(Math.max(1, Number(e.target.value) || 1))}
                className="w-24 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                过期（小时，0=不过期）
              </label>
              <input
                type="number"
                min={0}
                value={expiresHours}
                onChange={(e) => setExpiresHours(Math.max(0, Number(e.target.value) || 0))}
                className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[11px] text-muted-foreground">
                备注（可选）
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="如：社区测试邀请"
                maxLength={256}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              />
            </div>
            <button
              type="button"
              onClick={generate}
              disabled={busy}
              className="shrink-0 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "生成中…" : "生成"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        {!invites && !error ? (
          <div className="text-sm text-muted-foreground">加载中…</div>
        ) : list.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            还没有生成任何邀请码
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">邀请码</th>
                  <th className="px-4 py-2.5 text-left font-medium">使用 / 上限</th>
                  <th className="px-4 py-2.5 text-left font-medium">过期</th>
                  <th className="px-4 py-2.5 text-left font-medium">备注</th>
                  <th className="px-4 py-2.5 text-left font-medium">创建时间</th>
                  <th className="px-4 py-2.5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((inv) => {
                  const exhausted = inv.used_count >= inv.max_uses;
                  const expired =
                    inv.expires_at && new Date(inv.expires_at) < new Date();
                  const active = !exhausted && !expired;
                  return (
                    <tr key={inv.id} className="hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(inv.code);
                          }}
                          title="点击复制"
                          className="font-mono text-sm font-semibold text-foreground hover:text-primary"
                        >
                          {inv.code}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <span className={active ? "text-foreground" : "text-muted-foreground"}>
                          {inv.used_count}
                        </span>
                        <span className="text-muted-foreground"> / {inv.max_uses}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {inv.expires_at
                          ? expired
                            ? "已过期"
                            : timeAgo(inv.expires_at) + "后"
                          : "永不"}
                      </td>
                      <td className="max-w-[160px] truncate px-4 py-3 text-xs text-muted-foreground">
                        {inv.note || "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {timeAgo(inv.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => toggleUsages(inv.id)}
                            className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            使用记录
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(inv.id)}
                            disabled={busy}
                            className="rounded px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-500/10 disabled:opacity-40 dark:text-rose-400"
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

            {expandedId && (
              <div className="border-t border-border bg-muted/20 px-6 py-4">
                <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
                  使用记录 — 邀请码 #{expandedId}
                </h4>
                {usages.length === 0 ? (
                  <p className="text-xs text-muted-foreground">暂无使用记录</p>
                ) : (
                  <div className="space-y-1">
                    {usages.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center gap-3 text-xs text-muted-foreground"
                      >
                        <span className="font-medium text-foreground">
                          @{u.username}
                        </span>
                        <span>·</span>
                        <span>{timeAgo(u.redeemed_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
