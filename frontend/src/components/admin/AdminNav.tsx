"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminBadges } from "@/components/admin/AdminBadgesProvider";

const NAV_SECTIONS: { title: string; items: { href: string; label: string; icon: string }[] }[] = [
  {
    title: "总览",
    items: [{ href: "/admin", label: "Dashboard", icon: "◐" }],
  },
  {
    title: "站点配置",
    items: [
      { href: "/admin/site", label: "站点设置", icon: "🌐" },
      { href: "/admin/categories", label: "板块管理", icon: "▦" },
      { href: "/admin/announcements", label: "公告管理", icon: "📢" },
      { href: "/admin/content-filter", label: "内容过滤", icon: "🛡" },
    ],
  },
  {
    title: "内容治理",
    items: [
      { href: "/admin/reports", label: "举报处理", icon: "🚩" },
      { href: "/admin/moderation", label: "AI 审核", icon: "🧭" },
      { href: "/admin/topics", label: "帖子管理", icon: "📝" },
      { href: "/admin/notifications", label: "通知管理", icon: "🔔" },
      { href: "/admin/messages", label: "私信管理", icon: "✉️" },
      { href: "/admin/anon-settings", label: "匿名策略", icon: "🎭" },
      { href: "/admin/anon", label: "匿名追溯", icon: "🕵" },
    ],
  },
  {
    title: "用户与 Bot",
    items: [
      { href: "/admin/users", label: "用户管理", icon: "👤" },
      { href: "/admin/roles", label: "角色权限", icon: "🎫" },
      { href: "/admin/invites", label: "邀请码管理", icon: "🎟" },
      { href: "/admin/bots", label: "Bot 审核", icon: "⚡" },
      { href: "/admin/bot-logs", label: "Bot 调用日志", icon: "📋" },
    ],
  },
  {
    title: "系统",
    items: [
      { href: "/admin/credits", label: "积分账本", icon: "💠" },
      { href: "/admin/llm", label: "LLM 集成", icon: "🧠" },
    ],
  },
  {
    title: "审计",
    items: [{ href: "/admin/audit", label: "操作日志", icon: "📜" }],
  },
];

const STATUS_META: Record<
  import("@/lib/stream").ConnectionStatus,
  { color: string; label: string; pulse: boolean }
> = {
  idle: { color: "bg-muted-foreground/40", label: "未连接", pulse: false },
  connecting: { color: "bg-amber-500", label: "连接中…", pulse: true },
  open: { color: "bg-emerald-500", label: "实时同步已连接", pulse: false },
  reconnecting: { color: "bg-amber-500", label: "连接断开，正在重连…", pulse: true },
};

export function AdminNav() {
  const pathname = usePathname();
  const badges = useAdminBadges();
  const badgeFor = (href: string): number => {
    if (href === "/admin/reports") return badges.reportsPending;
    if (href === "/admin/moderation") return badges.moderationPending;
    if (href === "/admin/bot-logs") return badges.botFailuresNew;
    return 0;
  };
  const sm = STATUS_META[badges.streamStatus];

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-card">
      <div className="sticky top-0 flex h-screen flex-col">
        <div className="border-b border-border px-4 py-4">
          <Link href="/admin" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-xs">
              R
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground leading-tight">Redup</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                管理后台
              </div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="mb-4">
              <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </div>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active =
                    item.href === "/admin"
                      ? pathname === "/admin"
                      : pathname.startsWith(item.href);
                  const badge = badgeFor(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${
                          active
                            ? "bg-primary/10 font-medium text-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        }`}
                      >
                        <span className="w-4 text-center">{item.icon}</span>
                        <span className="flex-1">{item.label}</span>
                        {badge > 0 && (
                          // key={badge} remounts the element on every
                          // value change, which restarts the CSS
                          // animation so the badge flashes with each
                          // live increment.
                          <span
                            key={badge}
                            className="ml-auto min-w-[1.25rem] animate-badge-pulse rounded-full bg-rose-500/90 px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-white"
                          >
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="space-y-2 border-t border-border px-4 py-3">
          <div
            className="flex items-center gap-2 text-[11px] text-muted-foreground"
            title={sm.label}
          >
            <span className="relative flex h-2 w-2">
              {sm.pulse && (
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 ${sm.color}`}
                />
              )}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${sm.color}`} />
            </span>
            <span className="truncate">{sm.label}</span>
          </div>
          <Link
            href="/"
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            ← 返回前台
          </Link>
        </div>
      </div>
    </aside>
  );
}
