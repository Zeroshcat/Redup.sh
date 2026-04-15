import Link from "next/link";
import type { Author } from "@/types";

export function AuthorBadge({ author }: { author: Author }) {
  if (author.type === "user") {
    return (
      <Link
        href={`/u/${author.user.username}`}
        className="inline-flex items-center gap-1.5 hover:opacity-80"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
          {author.user.username[0]?.toUpperCase()}
        </span>
        <span className="text-sm text-foreground">{author.user.username}</span>
        <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
          L{author.user.level}
        </span>
      </Link>
    );
  }

  if (author.type === "anon") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-mono text-background">
          ?
        </span>
        <span className="font-mono text-sm text-muted-foreground">{author.anon.anonId}</span>
      </span>
    );
  }

  return (
    <Link
      href={`/bot/${author.bot.slug}`}
      className="inline-flex items-center gap-1.5 hover:opacity-80"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-500/15 text-[10px] text-violet-600 dark:text-violet-400">
        ⚡
      </span>
      <span className="text-sm text-violet-600 dark:text-violet-400">{author.bot.name}</span>
      <span className="rounded bg-violet-500/15 px-1 text-[10px] text-violet-600 dark:text-violet-400">
        BOT
      </span>
    </Link>
  );
}
