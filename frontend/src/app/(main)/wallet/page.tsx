"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { APIError } from "@/lib/api-client";
import {
  TRANSACTION_LABELS,
  getMyCreditHistory,
  getMyWallet,
  type CreditTransaction,
  type WalletInfo,
} from "@/lib/api/credits";
import { useAuthStore } from "@/store/auth";
import { timeAgo } from "@/lib/utils-time";

export default function WalletPage() {
  const me = useAuthStore((s) => s.user);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [history, setHistory] = useState<CreditTransaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    Promise.all([getMyWallet(), getMyCreditHistory(200)])
      .then(([w, h]) => {
        if (cancelled) return;
        setWallet(w);
        setHistory(h);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof APIError) setError(`${err.message} (req ${err.requestId})`);
        else setError("加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [me]);

  if (!me) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">请先登录后查看钱包</p>
      </main>
    );
  }

  const span =
    wallet && wallet.level_info.next_threshold > wallet.level_info.current_threshold
      ? wallet.level_info.next_threshold - wallet.level_info.current_threshold
      : 0;
  const pct =
    wallet && span > 0
      ? Math.max(0, Math.min(100, Math.round((wallet.level_info.xp_into_level / span) * 100)))
      : 100;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          首页
        </Link>
        <span className="mx-1.5">›</span>
        <span className="text-foreground">我的钱包</span>
      </nav>

      <h1 className="mb-6 text-2xl font-bold text-foreground">我的钱包</h1>

      {error && (
        <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}

      {wallet && (
        <section className="mb-8 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-orange-500/5 p-6">
          <div className="mb-3 flex items-center gap-3">
            <span className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1 text-sm font-bold text-white">
              L{wallet.level_info.level}
            </span>
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">总经验</div>
              <div className="font-mono text-lg font-bold text-foreground">
                {wallet.xp.toLocaleString()} XP
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">可消费余额</div>
              <div className="font-mono text-2xl font-bold text-amber-600 dark:text-amber-400">
                {wallet.credits.toLocaleString()}
              </div>
            </div>
          </div>

          {wallet.level_info.next_level > 0 && (
            <>
              <div className="h-2 w-full overflow-hidden rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                距离 L{wallet.level_info.next_level} 还需{" "}
                <span className="font-mono text-foreground">
                  {wallet.level_info.xp_needed_for_next.toLocaleString()}
                </span>{" "}
                XP（{pct}%）
              </div>
            </>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">流水记录</h2>
        {history === null ? (
          <div className="text-sm text-muted-foreground">加载中…</div>
        ) : history.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            暂无流水记录
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">类型</th>
                  <th className="px-4 py-2.5 text-right font-medium">XP</th>
                  <th className="px-4 py-2.5 text-right font-medium">Credits</th>
                  <th className="px-4 py-2.5 text-right font-medium">余额</th>
                  <th className="px-4 py-2.5 text-left font-medium">备注</th>
                  <th className="px-4 py-2.5 text-right font-medium">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((tx) => (
                  <tr key={tx.id} className="hover:bg-accent/40">
                    <td className="px-4 py-3">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                        {TRANSACTION_LABELS[tx.kind] ?? tx.kind}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono text-xs ${
                        tx.xp_delta > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : tx.xp_delta < 0
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {tx.xp_delta > 0 ? "+" : ""}
                      {tx.xp_delta || "—"}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono text-xs ${
                        tx.credits_delta > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : tx.credits_delta < 0
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {tx.credits_delta > 0 ? "+" : ""}
                      {tx.credits_delta || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-foreground">
                      {tx.balance_after.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{tx.note ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                      <div>{timeAgo(tx.created_at)}</div>
                      <div className="font-mono text-[10px]">
                        {new Date(tx.created_at).toLocaleString("zh-CN")}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
