"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { logout as apiLogout } from "@/lib/api/auth";
import { getMyWallet, type WalletInfo } from "@/lib/api/credits";
import { useAuthStore } from "@/store/auth";

const MENU_ITEMS = [
  { href: "/u/{username}", label: "个人主页", icon: "👤" },
  { href: "/u/{username}?tab=bots", label: "我的 Bot", icon: "⚡" },
  { href: "/wallet", label: "我的钱包", icon: "✦" },
  { href: "/messages", label: "私信", icon: "💬" },
  { href: "/notifications", label: "通知中心", icon: "🔔" },
  { href: "/settings", label: "设置", icon: "⚙" },
];

const ADMIN_ITEM = { href: "/admin", label: "管理后台", icon: "◐" };

export function UserMenu() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const clearStore = useAuthStore((s) => s.clear);
  const [open, setOpen] = useState(false);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) {
      setWallet(null);
      return;
    }
    let cancelled = false;
    getMyWallet()
      .then((w) => {
        if (!cancelled) setWallet(w);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function handleLogout() {
    setOpen(false);
    await apiLogout();
    clearStore();
    router.push("/");
  }

  // Avoid layout flash: render nothing until store hydrated from localStorage
  if (!hydrated) {
    return <div className="h-8 w-8" />;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-1">
        <Link href="/login">
          <Button variant="ghost" size="sm">登录</Button>
        </Link>
        <Link href="/register">
          <Button size="sm">注册</Button>
        </Link>
      </div>
    );
  }

  const isAdmin = user.role === "admin";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="用户菜单"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-muted to-muted-foreground/20 text-sm font-semibold text-foreground transition hover:ring-2 hover:ring-primary/30"
      >
        {user.username[0]?.toUpperCase()}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-56 overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
          <div className="border-b border-border px-3 py-3">
            <Link
              href={`/u/${user.username}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 hover:opacity-80"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-muted to-muted-foreground/20 font-semibold text-foreground">
                {user.username[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 truncate text-sm font-semibold text-foreground">
                  {user.username}
                  <span className="rounded bg-gradient-to-r from-amber-500 to-orange-500 px-1 text-[10px] font-mono text-white">
                    L{wallet?.level_info.level ?? user.level}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <span>@{user.username}</span>
                  {wallet && (
                    <span className="text-amber-600 dark:text-amber-400">
                      ✦ {wallet.credits.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </div>

          <nav className="py-1">
            {MENU_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href.replace("{username}", user.username)}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent"
              >
                <span className="w-4 text-center text-muted-foreground">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>

          {isAdmin && (
            <div className="border-t border-border py-1">
              <Link
                href={ADMIN_ITEM.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent"
              >
                <span className="w-4 text-center text-muted-foreground">{ADMIN_ITEM.icon}</span>
                {ADMIN_ITEM.label}
                <span className="ml-auto rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  ADMIN
                </span>
              </Link>
            </div>
          )}

          <div className="border-t border-border py-1">
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
            >
              <span className="w-4 text-center">↪</span>
              退出登录
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
