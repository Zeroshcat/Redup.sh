"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getMyWallet, type WalletInfo } from "@/lib/api/credits";
import { useAuthStore } from "@/store/auth";

interface Props {
  // Profile page passes the username being viewed; widget only shows the
  // private wallet (credits + history link) when the viewer is the same user.
  ownerUsername: string;
  publicLevel: number;
  publicXP: number;
}

export function WalletWidget({ ownerUsername, publicLevel, publicXP }: Props) {
  const me = useAuthStore((s) => s.user);
  const isSelf = me?.username === ownerUsername;
  const [wallet, setWallet] = useState<WalletInfo | null>(null);

  useEffect(() => {
    if (!isSelf) return;
    let cancelled = false;
    getMyWallet()
      .then((w) => {
        if (!cancelled) setWallet(w);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isSelf]);

  // For self: trust the wallet endpoint (it carries level_info).
  // For others: derive a coarse % from public level + xp using a uniform
  // assumption (we don't have access to thresholds client-side without a
  // separate fetch). We display the level + total XP only.
  const xp = wallet?.xp ?? publicXP;
  const level = wallet?.level_info.level ?? publicLevel;

  const showProgress = !!wallet && wallet.level_info.next_level > 0;
  const span =
    wallet && wallet.level_info.next_threshold > wallet.level_info.current_threshold
      ? wallet.level_info.next_threshold - wallet.level_info.current_threshold
      : 0;
  const pct =
    wallet && span > 0
      ? Math.max(0, Math.min(100, Math.round((wallet.level_info.xp_into_level / span) * 100)))
      : 100;

  return (
    <div className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.04] to-orange-500/[0.04] p-4">
      <div className="mb-2 flex items-center gap-3">
        <span className="inline-flex h-7 items-center rounded-md bg-gradient-to-r from-amber-500 to-orange-500 px-2.5 text-xs font-bold text-white shadow-sm">
          L{level}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">总经验</div>
          <div className="font-mono text-sm font-semibold text-foreground">
            {xp.toLocaleString()} XP
          </div>
        </div>
        {isSelf && wallet && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">余额</div>
            <div className="font-mono text-sm font-semibold text-amber-600 dark:text-amber-400">
              ✦ {wallet.credits.toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {showProgress && (
        <>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              距 L{wallet!.level_info.next_level} 还差{" "}
              <span className="font-mono text-foreground">
                {wallet!.level_info.xp_needed_for_next.toLocaleString()}
              </span>{" "}
              XP
            </span>
            {isSelf && (
              <Link href="/wallet" className="hover:text-foreground">
                查看流水 →
              </Link>
            )}
          </div>
        </>
      )}

      {!isSelf && (
        <div className="text-[10px] text-muted-foreground">
          公开数据 · 余额仅自己可见
        </div>
      )}
    </div>
  );
}
