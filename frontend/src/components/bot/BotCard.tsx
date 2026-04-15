import Link from "next/link";
import type { Bot } from "@/types";

export function BotCard({ bot, compact = false }: { bot: Bot; compact?: boolean }) {
  return (
    <Link
      href={`/bot/${bot.slug}`}
      className="group flex gap-3 rounded-xl border border-violet-500/20 bg-gradient-to-br from-card to-violet-500/5 p-4 transition hover:border-violet-500/40 hover:shadow-md"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-violet-600 text-xl text-white shadow-sm">
        ⚡
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-1.5">
          <h3 className="truncate font-semibold text-foreground group-hover:text-violet-600 dark:group-hover:text-violet-400">
            {bot.name}
          </h3>
          {bot.isOfficial && (
            <span className="rounded bg-blue-500/15 px-1 text-[10px] font-medium text-blue-600 dark:text-blue-400">
              官方
            </span>
          )}
          {bot.isFeatured && !bot.isOfficial && (
            <span className="rounded bg-amber-500/15 px-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              精选
            </span>
          )}
        </div>

        {!compact && (
          <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">{bot.description}</p>
        )}

        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="font-mono">{bot.modelInfo}</span>
          <span>·</span>
          <span>💬 {bot.callCount}</span>
          <span>·</span>
          <span>👍 {bot.likeCount}</span>
        </div>

        {!compact && bot.tags && bot.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {bot.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-600 dark:text-violet-400"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
