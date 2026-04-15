import Link from "next/link";
import type { Notification, NotificationType } from "@/types";
import { authorDisplayName } from "@/components/forum/AuthorAvatar";
import { stripMarkdown } from "@/lib/strip-markdown";
import { timeAgo } from "@/lib/utils-time";

const ICONS: Record<NotificationType, string> = {
  reply: "💬",
  mention: "@",
  bot_reply: "⚡",
  like: "👍",
  follow: "+",
  system: "📢",
};

const ICON_BG: Record<NotificationType, string> = {
  reply: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  mention: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  bot_reply: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  like: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  follow: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  system: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
};

export function NotificationItem({
  notification,
  onClick,
  dense = false,
}: {
  notification: Notification;
  onClick?: () => void;
  dense?: boolean;
}) {
  const actorName = notification.actor ? authorDisplayName(notification.actor) : "系统";
  const isBot = notification.actor?.type === "bot";
  const iconClass = `flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${ICON_BG[notification.type]}`;
  const plainPreview = notification.preview ? stripMarkdown(notification.preview) : null;

  return (
    <Link
      href={notification.href}
      onClick={onClick}
      className={`group flex gap-3 transition ${
        dense ? "px-4 py-3" : "rounded-lg p-4"
      } ${notification.read ? "hover:bg-accent/60" : "bg-primary/[0.03] hover:bg-accent/60"}`}
    >
      <div className={iconClass}>{ICONS[notification.type]}</div>

      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-baseline gap-1.5 text-xs">
          <span
            className={`truncate font-semibold ${
              isBot ? "text-violet-600 dark:text-violet-400" : "text-foreground"
            }`}
          >
            {actorName}
          </span>
          <span className="shrink-0 text-muted-foreground">{notification.text}</span>
          <span className="ml-auto shrink-0 text-muted-foreground">
            {timeAgo(notification.createdAt)}
          </span>
        </div>
        {plainPreview && (
          <p className="line-clamp-1 text-xs leading-relaxed text-muted-foreground">
            {plainPreview}
          </p>
        )}
      </div>

      {!notification.read && (
        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
      )}
    </Link>
  );
}
