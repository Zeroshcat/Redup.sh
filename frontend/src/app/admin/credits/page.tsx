"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { APIError } from "@/lib/api-client";
import {
  adminAdjustCredits,
  adminGetCreditStats,
  adminGetUserWallet,
  adminListCreditTransactions,
  TRANSACTION_LABELS,
  type CreditTransaction,
  type KindStat,
  type WalletInfo,
} from "@/lib/api/credits";
import { timeAgo } from "@/lib/utils-time";

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "全部类型" },
  { value: "signup_bonus", label: "注册礼包" },
  { value: "topic_reward", label: "发主题" },
  { value: "post_reward", label: "发回帖" },
  { value: "like_received", label: "收到赞" },
  { value: "violation_penalty", label: "违规处罚" },
  { value: "translation", label: "翻译消费" },
  { value: "admin_adjust", label: "管理员调整" },
];

const PAGE_SIZE = 50;

function errorMessage(err: unknown): string {
  if (err instanceof APIError) return `${err.message} (req ${err.requestId})`;
  return "请求失败";
}

function formatDelta(n: number): string {
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : String(n);
}

function deltaClass(n: number): string {
  if (n === 0) return "text-muted-foreground";
  return n > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
}

export default function AdminCreditsPage() {
  const [transactions, setTransactions] = useState<CreditTransaction[] | null>(null);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<KindStat[]>([]);
  const [filterUserID, setFilterUserID] = useState("");
  const [filterKind, setFilterKind] = useState("");
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const userId = filterUserID ? Number(filterUserID) : undefined;
      const [txResp, statsResp] = await Promise.all([
        adminListCreditTransactions({
          user_id: userId,
          kind: filterKind || undefined,
          limit: PAGE_SIZE,
          offset,
        }),
        adminGetCreditStats(),
      ]);
      setTransactions(txResp.items);
      setTotal(txResp.total);
      setStats(statsResp.items ?? []);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [filterUserID, filterKind, offset]);

  useEffect(() => {
    reload();
  }, [reload]);

  const totalCreditsAwarded = stats.reduce((acc, s) => acc + Math.max(0, s.credits_delta), 0);
  const totalCreditsBurned = stats.reduce((acc, s) => acc + Math.min(0, s.credits_delta), 0);
  const totalXP = stats.reduce((acc, s) => acc + s.xp_delta, 0);

  return (
    <>
      <AdminHeader
        title="积分账本"
        subtitle={transactions === null ? "加载中…" : `${total.toLocaleString()} 条交易`}
        actions={
          <button
            type="button"
            onClick={() => setAdjustOpen(true)}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            手动调整
          </button>
        }
      />

      <div className="px-8 py-6">
        {error && (
          <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="累计发放（credits）" value={totalCreditsAwarded.toLocaleString()} accent="text-emerald-600 dark:text-emerald-400" />
          <StatCard label="累计消费/处罚（credits）" value={totalCreditsBurned.toLocaleString()} accent="text-rose-600 dark:text-rose-400" />
          <StatCard label="累计 XP" value={totalXP.toLocaleString()} accent="text-blue-600 dark:text-blue-400" />
          <StatCard label="类型" value={String(stats.length)} accent="text-muted-foreground" />
        </section>

        <section className="mb-6 overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-2 text-xs font-semibold text-foreground">
            按类型聚合
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">类型</th>
                <th className="px-4 py-2 text-right font-medium">次数</th>
                <th className="px-4 py-2 text-right font-medium">XP 合计</th>
                <th className="px-4 py-2 text-right font-medium">Credits 合计</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stats.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    {transactions === null ? "加载中…" : "暂无数据"}
                  </td>
                </tr>
              ) : (
                stats.map((s) => (
                  <tr key={s.kind}>
                    <td className="px-4 py-2 text-foreground">
                      {TRANSACTION_LABELS[s.kind] ?? s.kind}
                      <span className="ml-2 font-mono text-[10px] text-muted-foreground">{s.kind}</span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-foreground">{s.count.toLocaleString()}</td>
                    <td className={`px-4 py-2 text-right font-mono text-xs ${deltaClass(s.xp_delta)}`}>
                      {formatDelta(s.xp_delta)}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono text-xs ${deltaClass(s.credits_delta)}`}>
                      {formatDelta(s.credits_delta)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              value={filterUserID}
              onChange={(e) => {
                setFilterUserID(e.target.value);
                setOffset(0);
              }}
              placeholder="user_id"
              className="w-32 rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-ring"
            />
            <select
              value={filterKind}
              onChange={(e) => {
                setFilterKind(e.target.value);
                setOffset(0);
              }}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-ring"
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setFilterUserID("");
                setFilterKind("");
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
                  <th className="px-4 py-2 text-left font-medium">用户</th>
                  <th className="px-4 py-2 text-left font-medium">类型</th>
                  <th className="px-4 py-2 text-right font-medium">ΔXP</th>
                  <th className="px-4 py-2 text-right font-medium">Δcredits</th>
                  <th className="px-4 py-2 text-right font-medium">余额</th>
                  <th className="px-4 py-2 text-left font-medium">备注</th>
                  <th className="px-4 py-2 text-right font-medium">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transactions === null ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-xs text-muted-foreground">
                      加载中…
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-xs text-muted-foreground">
                      没有符合条件的交易
                    </td>
                  </tr>
                ) : (
                  transactions.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-2 font-mono text-xs text-foreground">#{t.user_id}</td>
                      <td className="px-4 py-2 text-xs text-foreground">
                        {TRANSACTION_LABELS[t.kind] ?? t.kind}
                      </td>
                      <td className={`px-4 py-2 text-right font-mono text-xs ${deltaClass(t.xp_delta)}`}>
                        {formatDelta(t.xp_delta)}
                      </td>
                      <td className={`px-4 py-2 text-right font-mono text-xs ${deltaClass(t.credits_delta)}`}>
                        {formatDelta(t.credits_delta)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                        {t.balance_after}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{t.note || "—"}</td>
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                        {timeAgo(t.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {adjustOpen && (
        <AdjustModal
          busy={busy}
          onClose={() => setAdjustOpen(false)}
          onSubmit={async (input) => {
            setBusy(true);
            setError(null);
            try {
              await adminAdjustCredits(input);
              setAdjustOpen(false);
              await reload();
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent}`}>{value}</div>
    </div>
  );
}

function AdjustModal({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: { user_id: number; xp_delta: number; credits_delta: number; note: string }) => void;
}) {
  const [userId, setUserId] = useState("");
  const [xp, setXp] = useState("");
  const [cr, setCr] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<WalletInfo | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  async function loadPreview() {
    setLookupError(null);
    setPreview(null);
    const id = Number(userId);
    if (!id) return;
    try {
      const w = await adminGetUserWallet(id);
      setPreview(w);
    } catch (err) {
      setLookupError(errorMessage(err));
    }
  }

  function submit() {
    const id = Number(userId);
    const xpDelta = Number(xp || 0);
    const crDelta = Number(cr || 0);
    if (!id || (xpDelta === 0 && crDelta === 0)) return;
    onSubmit({ user_id: id, xp_delta: xpDelta, credits_delta: crDelta, note });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <h3 className="mb-4 text-base font-semibold text-foreground">手动调整积分</h3>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">用户 ID</label>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="user_id"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              />
              <button
                type="button"
                onClick={loadPreview}
                disabled={!userId}
                className="rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-40"
              >
                查询余额
              </button>
            </div>
            {lookupError && (
              <div className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{lookupError}</div>
            )}
            {preview && (
              <div className="mt-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                当前：credits <span className="font-mono text-foreground">{preview.credits}</span>{" "}
                · XP <span className="font-mono text-foreground">{preview.xp}</span> · Lv{" "}
                <span className="font-mono text-foreground">{preview.level_info.level}</span>
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">ΔXP</label>
              <input
                type="number"
                value={xp}
                onChange={(e) => setXp(e.target.value)}
                placeholder="例如 100 或 -50"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">Δcredits</label>
              <input
                type="number"
                value={cr}
                onChange={(e) => setCr(e.target.value)}
                placeholder="例如 100 或 -50"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">备注（必填）</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="例如：补偿因系统 bug 丢失的翻译额度"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs outline-none focus:border-ring"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              写清原因，会写入账本并连带记录执行的管理员。
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={
              busy ||
              !userId ||
              !note.trim() ||
              (Number(xp || 0) === 0 && Number(cr || 0) === 0)
            }
            className="rounded-md bg-primary px-5 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "执行中…" : "确认调整"}
          </button>
        </div>
      </div>
    </div>
  );
}
